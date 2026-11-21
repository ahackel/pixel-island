// Turntable check: does every hairstyle, hat, top and bottom look like one object turning?
// Draws each item in the five drawn views (the mirrored ones are copies by construction) in the
// parts colours, measures it against the body without it, and flags views that disagree.
// Usage: node scripts/turntable-check.mjs [--all] [--json out.json]. Exits with 1 if any item fails;
// each failure names the view, so it can be handed back to the model as is.
import { createServer } from 'vite';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(root + p);
const { lookOf, defaultState } = await load('engine/character/character.ts');
const { drawCharacter, PART_COLORS: C, SPRITE_W: W, SPRITE_H: H } = await load('engine/core/puppet.ts');
const { AUTHORED } = await load('engine/core/poses.ts');
const { CATALOG } = await load('engine/character/catalog.ts');
const { HAIR_STYLES } = await load('engine/character/base.ts');

const VIEWS = { front: 4, diagF: 0, side: 7, diagB: 3, back: 6 };
const pose = AUTHORED.idle.frames[0];
const T = { // calibrated on the catalog of November 2026
  topDelta: 1,        // item top row, relative to the bare head top, may move at most 1 px between views
  bottomDelta: 3,     // lowest row (brim / hair ends / hem) relative to bare body: max spread
  areaRatio: 0.5,     // smallest view area / largest view area
  overhang: 0.45,     // spread of (item width / bare head width) across views
  turntable: 1,       // diagonal width must lie within [min(front,side)-1, max(front,side)+1]
  sideFront: [0.55, 1.15], // side width / front width
  symmetry: 0.2,      // front/back: share of item pixels whose mirror pixel is not item
  palette: 0.15,      // a colour with >= this share in one view must exist in every other view (> 3 px)
  stepArea: 1.4,      // adjacent-view area ratio may deviate from the slot median by at most x1.4
  stepRows: 2,        // adjacent-view lowest-row change may deviate from the slot median by at most 2 rows
  profile: 1.5,       // front and back top outline: mean difference in rows
};

function state(ch) {
  const s = defaultState(); s.wear = 0;
  Object.assign(s, ch.state ?? {}); Object.assign(s.worn, ch.worn ?? {});
  return s;
}
/**
 * An item's mask in one view. `cols` limits where its lowest row is read: for a hat, over the head
 * only, so knot tails hanging behind it are not taken for its brim.
 */
function measure(look, facing, colors, cols) {
  const parts = drawCharacter(look, pose, facing, { parts: true });
  const normal = drawCharacter(look, pose, facing);
  let top = H, bottom = -1, left = W, right = -1, area = 0, asym = 0;
  const hist = {};
  const tops = Array(W).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!colors.includes(parts.get(x, y))) continue;
    area++; top = Math.min(top, y); left = Math.min(left, x); right = Math.max(right, x);
    if (!cols || (x >= cols[0] && x <= cols[1])) bottom = Math.max(bottom, y);
    if (tops[x] < 0) tops[x] = y;
    if (!colors.includes(parts.get(W - x, y))) asym++; // the mirror axis lies between columns 31 and 32 (see Sprite.mirrored)
    const c = normal.get(x, y); if (c) hist[c] = (hist[c] ?? 0) + 1;
  }
  // The top outline in eight bins across the item, relative to its highest row.
  const profile = Array.from({ length: 8 }, (_, i) => {
    const xs = tops.slice(left, right + 1).filter((_, k) => Math.floor((k * 8) / (right - left + 1)) === i).filter((v) => v >= 0);
    return xs.length ? Math.min(...xs) - top : 0;
  });
  return { top, bottom, left, right, width: area ? right - left + 1 : 0, area, asym: area ? asym / area : 0, hist, profile };
}

const items = [];
const plain = { hat: null, tool: null };
// A hairstyle given as one shape is consistent by construction: a crest is narrow face on and a
// ponytail hidden from the front because that is the shape. Only the colour and missing-view rules apply.
for (const id of [...HAIR_STYLES.map((s) => s.id), ...CATALOG.filter((e) => e.slot === 'hair').map((e) => e.id)])
  items.push({ name: `hair ${id}`, state: { hair: id, frame: 'f' }, worn: plain, colors: [C.hair, C.behind], bare: { hair: null }, shell: CATALOG.find((e) => e.id === id)?.format === 'shell' });
for (const e of CATALOG.filter((e) => e.slot === 'hat'))
  items.push({ name: `hat ${e.id}`, state: { hair: 'short' }, worn: { hat: e.id, tool: null }, colors: [C.hat], slot: 'hat' });
for (const e of CATALOG.filter((e) => e.slot === 'top' || e.slot === 'bottom'))
  items.push({ name: `${e.slot} ${e.id}`, state: { frame: 'f', build: 'thin' }, worn: { hat: null, tool: null, [e.slot]: e.id }, colors: [C.clothes], cloth: true });

const results = [];
for (const it of items) {
  const look = lookOf(state(it));
  const bare = { ...look, items: look.items.filter((i) => i.slot !== 'hair' && i.slot !== 'hat') };
  const m = {}, ref = {};
  for (const [v, f] of Object.entries(VIEWS)) {
    ref[v] = measure(bare, f, it.cloth ? [C.torso, C.legs] : [C.head, C.ear]); // the body under the item
    m[v] = measure(look, f, it.colors, it.slot === 'hat' ? [ref[v].left, ref[v].right] : undefined);
  }
  const V = Object.keys(VIEWS), spread = (fn) => { const a = V.map(fn); return Math.max(...a) - Math.min(...a); };
  const fails = [];
  const tops = V.map((v) => m[v].top - ref[v].top), bots = V.map((v) => m[v].bottom - ref[v].bottom);
  const areas = V.map((v) => m[v].area), over = V.map((v) => m[v].width / ref[v].width);
  if (Math.min(...areas) === 0) fails.push(`missing in ${V.filter((v) => !m[v].area).join(',')}`);
  else {
    if (!it.shell && !it.cloth && spread((v) => m[v].top - ref[v].top) > T.topDelta) fails.push(`top row ${tops.join('/')}`);
    if (!it.shell && Math.max(...over) - Math.min(...over) > T.overhang) fails.push(`width/head ${over.map((o) => o.toFixed(2)).join('/')}`);
    for (const [d, a, b] of it.shell ? [] : [['diagF', 'front', 'side'], ['diagB', 'back', 'side']]) {
      const lo = Math.min(m[a].width, m[b].width) - T.turntable, hi = Math.max(m[a].width, m[b].width) + T.turntable;
      if (m[d].width < lo || m[d].width > hi) fails.push(`turntable ${d} w${m[d].width} not in ${lo}..${hi}`);
    }
    if (!it.cloth && !it.shell) {
      const d = m.front.profile.reduce((s, p, i) => s + Math.abs(p - m.back.profile[i]), 0) / 8;
      if (d > T.profile) fails.push(`top outline front ${m.front.profile.join('')} vs back ${m.back.profile.join('')}`);
    }
    for (const v of ['front', 'back']) if (m[v].asym > T.symmetry) fails.push(`~asym ${v} ${(m[v].asym * 100).toFixed(0)}%`);
    // palette: dominant colours present everywhere
    for (const v of V) for (const [c, n] of Object.entries(m[v].hist)) {
      if (n / m[v].area < T.palette || n <= 3) continue;
      const missing = V.filter((w) => !m[w].hist[c]);
      if (missing.length) fails.push(`colour ${c} (${v} ${Math.round(100 * n / m[v].area)}%) absent in ${missing.join(',')}`);
    }
  }
  results.push({ shell: it.shell, name: it.name, slot: it.name.split(' ')[0], areas, bots, m: Object.fromEntries(V.map((v) => [v, { ...m[v], hist: undefined }])), tops, bots, fails });
}

// Turntable steps: going round front→diagF→side→diagB→back, each step's change should match what is
// typical for the slot (catalog median), so one view that jumps stands out even when absolute sizes differ.
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
const STEPS = ['front→dF', 'dF→side', 'side→dB', 'dB→back'];
for (const slot of new Set(results.map((r) => r.slot))) {
  const rs = results.filter((r) => r.slot === slot && !r.shell && r.areas.every(Boolean));
  // A median of fewer items says nothing about what is typical.
  if (rs.length < 4) continue;
  for (let i = 0; i < 4; i++) {
    const mArea = median(rs.map((r) => Math.log(r.areas[i + 1] / r.areas[i])));
    const mBot = median(rs.map((r) => r.bots[i + 1] - r.bots[i]));
    for (const r of rs) {
      const da = Math.log(r.areas[i + 1] / r.areas[i]) - mArea, db = r.bots[i + 1] - r.bots[i] - mBot;
      if (Math.abs(da) > Math.log(T.stepArea)) r.fails.push(`area step ${STEPS[i]} x${Math.exp(da).toFixed(2)} vs typical`);
      if (Math.abs(db) > T.stepRows) r.fails.push(`bottom step ${STEPS[i]} ${db > 0 ? '+' : ''}${db} rows vs typical`);
    }
  }
}
const all = process.argv.includes('--all');
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('item', 42), pad('w F/dF/S/dB/B', 18), pad('area F/dF/S/dB/B', 22), pad('top', 12), pad('bottom', 14), 'flags');
for (const r of results) {
  if (!all && !r.fails.length) continue;
  const V = Object.keys(VIEWS);
  console.log(pad(r.name, 42), pad(V.map((v) => r.m[v].width).join('/'), 18), pad(V.map((v) => r.m[v].area).join('/'), 22), pad(r.tops.join('/'), 12), pad(r.bots.join('/'), 14), r.fails.join('; '));
}
const bad = results.filter((r) => r.fails.some((f) => f[0] !== '~'));
console.log(`\n${bad.length} of ${results.length} items flagged`);
const kinds = {}; for (const r of bad) for (const f of r.fails) { const k = f.split(' ').slice(0, f.includes('step') ? 2 : 1).join(' '); kinds[k] = (kinds[k] ?? 0) + 1; }
console.log('by rule:', kinds);
const j = process.argv.indexOf('--json'); if (j > 0) (await import('node:fs')).writeFileSync(process.argv[j + 1], JSON.stringify(results, null, 1));
await server.close();
process.exitCode = bad.length ? 1 : 0;
