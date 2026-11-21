// Draws characters in the parts colours (every part flat in a colour of its own) from all eight
// sides through their clips, and reports what looks broken: an arm in pieces or not joined to the
// body, a tool out of the hand, clothes floating off the body, hair or a hat over the face, hair floating off the head, a head off
// the body, hair or a hat that vanishes in one view, ears that show in some views and not in others. Usage:
//   node scripts/parts-check.mjs [sheet.png]
// With a path, the failing frames are drawn there in the parts colours, each next to its normal drawing.
import { createServer } from 'vite';
import { writeSheet } from './sheet.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const load = (path) => server.ssrLoadModule(root + path);
const { lookOf, defaultState } = await load('engine/character/character.ts');
const { drawCharacter, PART_COLORS, SPRITE_W, SPRITE_H } = await load('engine/core/puppet.ts');
const { AUTHORED } = await load('engine/core/poses.ts');
const { CATALOG } = await load('engine/character/catalog.ts');
const { HAIR_STYLES } = await load('engine/character/base.ts');

const C = PART_COLORS;
const FACINGS = [0, 1, 2, 3, 4, 5, 6, 7];

// Characters: the default survivor with each hairstyle, each hat, each tool, and the builds and shapes.
const characters = [];
const plain = { hat: null, tool: null };
for (const hair of [...HAIR_STYLES.map((s) => s.id), ...CATALOG.filter((e) => e.slot === 'hair').map((e) => e.id)]) {
  // A hairstyle given as one shape may be narrow face on (a crest): that is its shape, not a lost view.
  characters.push({ name: `hair ${hair}`, state: { hair, frame: 'f' }, worn: plain, clips: ['idle', 'walk', 'look'], shell: CATALOG.find((e) => e.id === hair)?.format === 'shell' });
}
for (const e of CATALOG.filter((e) => e.slot === 'hat')) {
  characters.push({ name: `hat ${e.id}`, state: { hair: 'recipe-hair-loose-0' }, worn: { hat: e.id, tool: null }, clips: ['idle', 'walk', 'look'] });
  characters.push({ name: `hat ${e.id} short hair`, state: { hair: 'short' }, worn: { hat: e.id, tool: null }, clips: ['idle'] });
}
for (const e of CATALOG.filter((e) => e.slot === 'top' || e.slot === 'bottom')) {
  characters.push({ name: `${e.slot} ${e.id}`, state: { frame: 'f', build: 'thin' }, worn: { hat: null, tool: null, [e.slot]: e.id }, clips: ['idle', 'walk'] });
}
for (const e of CATALOG.filter((e) => e.slot === 'tool')) characters.push({ name: `tool ${e.id}`, worn: { hat: null, tool: e.id }, clips: ['idle', 'walk', 'run', 'wave', 'use', 'sit'] });
for (const build of ['thin', 'slim', 'sturdy']) {
  for (const frame of ['m', 'f']) characters.push({ name: `body ${build} ${frame}`, state: { build, frame }, worn: plain, clips: ['idle', 'walk', 'run', 'wave', 'use', 'sit', 'look'] });
}

const at = (s, x, y) => (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H ? null : s.get(x, y));
const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
/** Groups of touching pixels whose colour is in `colors`. */
function groups(s, colors) {
  const seen = new Set();
  const out = [];
  for (let y = 0; y < SPRITE_H; y++) for (let x = 0; x < SPRITE_W; x++) {
    if (seen.has(y * SPRITE_W + x) || !colors.includes(at(s, x, y))) continue;
    const group = [];
    const todo = [[x, y]];
    seen.add(y * SPRITE_W + x);
    while (todo.length) {
      const [px, py] = todo.pop();
      group.push([px, py]);
      for (const [dx, dy] of N8) {
        const nx = px + dx, ny = py + dy;
        if (seen.has(ny * SPRITE_W + nx) || !colors.includes(at(s, nx, ny))) continue;
        seen.add(ny * SPRITE_W + nx);
        todo.push([nx, ny]);
      }
    }
    out.push(group);
  }
  return out;
}
const touches = (s, group, colors) => group.some(([x, y]) => N8.some(([dx, dy]) => colors.includes(at(s, x + dx, y + dy))));
const count = (s, color) => s.pixels.filter((c) => c === color).length;

const problems = new Map();
const failing = [];
function report(kind, where, normal, parts) {
  if (!problems.has(kind)) problems.set(kind, []);
  const list = problems.get(kind);
  list.push(where);
  if (list.length <= 4) failing.push([normal, parts]);
}

const BODY = [C.torso, C.clothes];
for (const ch of characters) {
  const state = defaultState();
  state.wear = 0;
  Object.assign(state, ch.state ?? {});
  Object.assign(state.worn, ch.worn ?? {});
  const look = lookOf(state);
  const bare = { ...look, items: look.items.filter((i) => i.slot !== 'hair' && i.slot !== 'hat') };
  for (const clipId of ch.clips) {
    const clip = AUTHORED[clipId];
    clip.frames.forEach((pose, n) => {
      const face = clip.faces?.[n];
      const seenAreas = {};
      const earsSeen = {};
      for (const facing of FACINGS) {
        const where = `${ch.name} · ${clipId} ${n} · facing ${facing}`;
        const options = { face, swing: clip.swing, parts: true };
        const parts = drawCharacter(look, pose, facing, options);
        const normal = () => drawCharacter(look, pose, facing, { face, swing: clip.swing });
        // Arms: every visible piece is joined to the body.
        for (const arm of [C.workArm, C.freeArm]) {
          for (const g of groups(parts, [arm])) {
            // Long hair over the shoulders hides where the arm joins, which is fine; the head is not.
            // A tool's shaft drawn across an arm cuts it in two; that piece still looks held.
            if (g.length >= 2 && !touches(parts, g, [...BODY, C.hair, C.behind, C.tool])) report('arm piece not joined to the body', where, normal(), parts);
          }
        }
        // A tool is in the working hand, or comes out from behind what hides the hand: the body,
        // the head or the other arm swinging past; or it rests on the legs.
        if (count(parts, C.tool) && !groups(parts, [C.tool]).some((g) => touches(parts, g, [C.workArm, C.freeArm, ...BODY, C.legs, C.head, C.ear, C.hair]))) report('tool not in the hand', where, normal(), parts);
        // The head sits on the body.
        if (!pose.lie && !groups(parts, [C.head, C.ear, C.face, C.hair, C.hat, C.behind, C.beard]).some((g) => touches(parts, g, [...BODY, C.workArm, C.freeArm]))) report('head not joined to the body', where, normal(), parts);
        // Hair and hats hang together with the head.
        for (const g of groups(parts, [C.hair, C.hat, C.behind])) {
          if (g.length >= 2 && !touches(parts, g, [C.head, C.ear, C.face, ...BODY, C.workArm, C.freeArm, C.tool, C.beard])) report('hair or hat floating off the head', where, normal(), parts);
        }
        // Clothes hang together with the body.
        for (const g of groups(parts, [C.clothes])) {
          if (!touches(parts, g, [C.torso, C.legs, C.workArm, C.freeArm, C.head, C.ear, C.hair, C.behind])) report('clothes floating off the body', where, normal(), parts);
        }
        // Nothing worn on the head covers the face.
        const shown = count(drawCharacter(bare, pose, facing, options), C.face);
        if (count(parts, C.face) < shown) {
          const bareParts = drawCharacter(bare, pose, facing, options);
          let covered = false;
          for (let p = 0; p < parts.pixels.length; p++) if (bareParts.pixels[p] === C.face && [C.hair, C.hat, C.behind].includes(parts.pixels[p])) covered = true;
          if (covered) report('hair or hat over the face', where, normal(), parts);
        }
        if (clipId === 'idle' && n === 0) earsSeen[facing] = count(parts, C.ear);
        if (clipId === 'idle' && n === 0) seenAreas[facing] = count(parts, C.hair) + count(parts, C.hat) + count(parts, C.behind);
      }
      // Hair and hats keep their size round the turn: no view loses most of it.
      if (clipId === 'idle' && n === 0) {
        const diagonal = seenAreas[0];
        for (const facing of FACINGS) {
          if (/^(hair|hat) /.test(ch.name) && Object.values(earsSeen).some(Boolean) && !earsSeen[facing]) report('ears show in some views but not in this one', `${ch.name} · facing ${facing}: ears ${FACINGS.map((f) => earsSeen[f]).join(' ')}`, drawCharacter(look, pose, facing), drawCharacter(look, pose, facing, { parts: true }));
          if (!ch.shell && diagonal > 20 && seenAreas[facing] < diagonal * 0.6) report('hair or hat mostly gone in one view', `${ch.name} · facing ${facing}: ${seenAreas[facing]} of ${diagonal} pixels`, drawCharacter(look, pose, facing), drawCharacter(look, pose, facing, { parts: true }));
        }
      }
    });
  }
}

let total = 0;
for (const [kind, list] of problems) {
  total += list.length;
  console.log(`${kind}: ${list.length}`);
  for (const w of list.slice(0, 8)) console.log(`  ${w}`);
  if (list.length > 8) console.log(`  … and ${list.length - 8} more`);
}
console.log(total ? `${total} problems in ${characters.length} characters` : `no problems in ${characters.length} characters`);
if (process.argv[2] && failing.length) {
  const rows = [];
  for (let i = 0; i < failing.length; i += 6) rows.push(failing.slice(i, i + 6).flat());
  writeSheet(process.argv[2], rows, 4);
}
await server.close();
