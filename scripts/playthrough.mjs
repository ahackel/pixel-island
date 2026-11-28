// Plays the first island's whole tutorial in a real browser, from the first coconut to setting sail on the raft, through
// the game's own handlers (the dev server's test hook, `window.__test`, set at the end of src/main.ts), and fails with the
// game's state where it gets stuck. It checks what the unit tests cannot: that main.ts reports each goal, that every
// step of the story can be done with what the story gives, and that the ending is reached.
//
//   npm run playthrough            (needs Playwright with a Chromium; it starts the dev server itself)
//
// It runs on a fake clock (Playwright's `page.clock`) that the script advances itself, with drawing turned off, so the game's
// rules run as fast as the machine can step them instead of in real time: the whole tutorial takes well under a minute.
//
// It is deterministic: the game plays with a fixed seed (`?seed=`; what is left to chance in play), the page's own
// Math.random is seeded too (looks only: sparks, idle fidgets), and the clock is stopped before the page loads, so not
// a frame runs on real time. The same code plays the same game every run, step for step (each step logs a fingerprint
// of the game's state to compare), so one run after a change is enough.
//
//   SEED=7 npm run playthrough        another fixed seed (the default is 1); a failure says which seed to play again
//   SEED=random npm run playthrough   a new seed (printed); `npm run playthrough:hunt` plays many at once, to find bugs
//   TRACE=file, TRACE_WAITS=file      the state after each step, or a fingerprint at every clock step and hook call: to
//                                     find where two runs of one seed part, if they ever do again
// A few things are done by hand instead of by walking, because they will not wait: a fish and a crab are reached by
// standing next to them (`place`), and hunger and energy are topped up now and then (`fill`), as the FULL cheat does.
// Everything else is a tap, a bag action, sleeping or building, as the player does it.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('The playthrough needs Playwright (npm i -D playwright, or NODE_PATH to a global one).'); process.exit(2); }
const { createServer } = await import('vite');
const SEED = process.env.SEED === 'random' ? Math.floor(Math.random() * 1e9) : Number(process.env.SEED ?? 1);
if (!Number.isInteger(SEED) || SEED < 0 || SEED > 999999999) { console.error(`SEED must be a whole number up to 999999999, or "random" (got ${process.env.SEED}).`); process.exit(2); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, logLevel: 'error', server: { port: 8351, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
// The page's Math.random from the seed too (mulberry32), before any of its scripts run.
await page.addInitScript((seed) => {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}, SEED ^ 0x1b873593);
const errors = [];
page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

/** A call into the page that fails, rather than waits for ever, if the game has frozen. */
const within = (promise, ms, what) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what}: the page stopped answering (the game froze?)`)), ms))]);
const T = async (fn, ...args) => {
  const out = await within(page.evaluate(([f, a]) => window.__test[f](...a), [fn, args]), 15000, fn);
  if (fn !== 'state') await traceWait(`${fn} ${JSON.stringify(args)}`);
  return out;
};
const S = () => T('state');
const realWait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Lets `ms` of the game's time go by (the fake clock runs the game's timers and frames up to then). */
/** TRACE_WAITS=file: every clock step and hook call with the frame count and a fingerprint of the state, to find the very moment two runs part. */
const traceWait = async (line) => {
  if (!process.env.TRACE_WAITS) return;
  const s = await page.evaluate(() => window.__test?.state() ?? null);
  (await import('node:fs')).appendFileSync(process.env.TRACE_WAITS, `${line} frames ${s?.frames} state ${s ? fingerprint(s) : '-'}\n`);
};
const wait = async (ms) => {
  await traceWait(`wait ${ms}`);
  return within(page.clock.runFor(ms), 60000, 'the clock');
};
const t0 = Date.now();
const log = (msg) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s] ${msg}`);

async function fail(msg) {
  let state = '(no state)';
  try {
    const { beach, ...rest } = await S();
    state = JSON.stringify(rest);
    await T('draw', true);
    await wait(200);
    await page.screenshot({ path: path.join(root, 'playthrough-failure.png') });
  } catch { /* the page is gone */ }
  console.error(`\nFAILED (seed ${SEED}): ${msg}\n${state}\n${errors.length ? `\nBrowser errors:\n${errors.join('\n')}` : ''}\n(screenshot: playthrough-failure.png; play it again with SEED=${SEED} npm run playthrough)`);
  await Promise.race([Promise.allSettled([browser.close(), server.close()]), realWait(5000)]);
  process.exit(1);
}

/** Lets the game's time go by, a little at a time, until `cond(state)`; fails with `what` if `ms` of game time pass first. */
async function until(what, cond, ms = 20000) {
  for (let waited = 0; ; waited += 100) {
    const s = await S();
    if (cond(s)) return s;
    if (waited >= ms) await fail(`timed out waiting for ${what} (${ms / 1000} s of the game's time)`);
    await wait(100);
  }
}
/** Puts away every thought in the story box (the game stands still while one is up), until two seconds go by with none. */
async function settle() {
  let quiet = 0;
  for (let n = 0; n < 80 && quiet < 8; n++) {
    const s = await S();
    if (s.telling) { quiet = 0; await T('dismiss'); await wait(100); } else { quiet++; await wait(250); }
  }
}
const idle = async (what) => { await until(`${what}: the walk to end`, (s) => !s.walking && !s.sleeping); await settle(); return S(); };
const lying = (s, item) => s.lying.filter((l) => l.item === item);
const dist = (a, b) => Math.hypot(a.i - b.i, a.j - b.j);
const count = (s, item) => s.bag.filter((i) => i === item).length;
/**
 * Taps `spot`, `up` pixels over the ground, as the player would: first, if the survivor's body covers that point on the
 * screen (a tap there would sit them down), they step to an open spot nearby from where it can be walked to, as a player
 * would tap a part of it that shows. `within`: how far from it they may stand (for a fish or a crab, in reach).
 */
async function tapAt(spot, up = 0, within = 2.8) {
  if (await T('covers', spot.i, spot.j, up)) {
    const s = await S();
    const offsets = [];
    for (const r of [within * 0.6, within]) for (let a = 0; a < 8; a++) offsets.push([r * Math.cos((a * Math.PI) / 4 + 0.4), r * Math.sin((a * Math.PI) / 4 + 0.4)]);
    for (const [di, dj] of offsets) {
      if (!(await T('free', spot.i + di, spot.j + dj, spot))) continue;
      await T('place', spot.i + di, spot.j + dj);
      if (!(await T('covers', spot.i, spot.j, up))) break;
      await T('place', s.at.i, s.at.j);
    }
  }
  await T('tap', spot.i, spot.j, up);
}
/** Taps the nearest `item` lying on the ground (not any that `skip` says no to) until it is in the bag. */
async function pickUp(item, skip = () => false) {
  const seen = [];
  for (let tries = 0; tries < 5; tries++) {
    const s = await S();
    // A thing lying close to others may be taken in their place (a tap takes the first thing in reach), so lone ones first.
    const lone = (l) => !s.lying.some((o) => o !== l && dist(o, l) < 1.3);
    const spots = lying(s, item).filter((l) => !skip(l)).sort((a, b) => Number(lone(b)) - Number(lone(a)) || dist(a, s.at) - dist(b, s.at));
    if (!spots.length) await fail(`no ${item} lying anywhere to pick up`);
    const before = count(s, item);
    const had = [...s.bag];
    if (tries > 0 && !lone(spots[Math.min(tries, spots.length - 1)])) await clearAround(spots[Math.min(tries, spots.length - 1)], 1.2, spots[Math.min(tries, spots.length - 1)]);
    await T('hold', null);
    await tapAt(spots[Math.min(tries, spots.length - 1)]);
    await idle(`picking up ${item}`);
    if (count(await S(), item) > before) return;
    const now = await S();
    const by = s.lying.filter((l) => dist(l, spots[Math.min(tries, spots.length - 1)]) < 1.2).map((l) => `${l.item}@${l.i},${l.j}`).join(' ');
    // Whatever a tap took in its place (a neighbour in reach) goes out onto the sand again, out of the way.
    const taken = [...now.bag];
    for (const it of had) { const k = taken.indexOf(it); if (k >= 0) taken.splice(k, 1); }
    await dump(taken);
    const target = spots[Math.min(tries, spots.length - 1)];
    seen.push(`tapped ${item} at ${target.i},${target.j}; survivor at ${now.at.i},${now.at.j}; bag ${now.bag.join(',')}; lying within 1.2 m before: ${by}; crates ${now.crates.map((c) => `${c.item}@${c.i},${c.j}`).join(' ')}; thought: ${await page.$eval('.bubble', (b) => (b.hidden ? '' : b.getAttribute('aria-label'))).catch(() => '')}`);
  }
  await fail(`could not pick up ${item}; after each try the bag and thought were:\n  ${seen.join('\n  ')}`);
}
let dumps = 0;
/** Drags things out of the bag onto the sand far from the work (the beach corner furthest from the hut), so they do not lie where they would take the taps meant for other things; and back. */
async function dump(items) {
  if (!items.length) return;
  const s = await S();
  // Each dump to another spot of the far beach, so the things do not lie in one pile (a tap takes the first in reach).
  const far = [...s.beach].sort((a, b) => dist(b, s.hut) - dist(a, s.hut)).slice(0, 40);
  // Never where something lies already, or a later tap there takes either.
  const clear = far.filter((b) => !s.lying.some((l) => dist(l, { i: b.i + 0.8, j: b.j + 0.4 }) < 1.6));
  const corner = (clear.length ? clear : far)[(dumps++ * 3) % (clear.length || far.length)];
  await T('place', corner.i, corner.j);
  let spread = 0;
  for (const item of items) {
    const k = (await S()).bag.indexOf(item);
    if (k >= 0) { await T('hold', null); await T('drop', k, corner.i + 0.8 + spread, corner.j + 0.4 - spread); spread += 0.9; await wait(1500); }
  }
  await T('place', s.at.i, s.at.j);
}
/** Picks up whatever lies within `r` metres of a spot (but `keep`) and puts it out of the way, so a tap on that spot takes what it was meant for. */
async function clearAround(spot, r = 1.4, keep = null) {
  for (let n = 0; n < 8; n++) {
    const s = await S();
    // `keep`: the thing a tap is meant for, which stays where it lies.
    const near = s.lying.filter((l) => dist(l, spot) < r && !(keep && dist(l, keep) < 0.02));
    if (!near.length) return;
    const had = [...s.bag];
    await T('hold', null);
    await tapAt(near[0]);
    await idle('clearing the way');
    const now = await S();
    const taken = [...now.bag];
    for (const it of had) { const k = taken.indexOf(it); if (k >= 0) taken.splice(k, 1); }
    if (!taken.length) return;
    await dump(taken);
  }
}
/** Makes room in the bag as the player does: eats what is food, drags the rest out onto the sand (the bag holds six things). */
async function tidy(keep = []) {
  await T('hold', null);
  const food = ['coconut', 'fish', 'wrasse', 'snapper', 'crab', 'fishSoup'];
  for (let n = 0; n < 12; n++) {
    const k = (await S()).bag.findIndex((it) => food.includes(it) && !keep.includes(it));
    if (k < 0) break;
    await T('eat', k); await wait(100);
  }
  await dump((await S()).bag.filter((it) => !keep.includes(it)));
}
const slotOf = async (item) => (await S()).bag.indexOf(item);
/** Ties the first `a` onto the first `b` in the bag, as a drag does. */
async function tie(a, b, makes) {
  const ok = await T('tie', await slotOf(a), await slotOf(b));
  if (!ok) await fail(`${a} and ${b} would not tie`);
  await until(`the ${makes} in the bag`, (s) => s.bag.includes(makes));
}
/** Walks to the blanket (the hut's middle): a thing lying near it may take the tap, so such things are cleared away and it is tapped again. */
async function toBlanket(what) {
  for (let tries = 0; tries < 4; tries++) {
    const s = await S();
    await T('hold', null);
    await tapAt(s.blanket); await idle(what);
    const now = await S();
    // (The walk ends on the blanket, a metre or so from its middle.)
    if (dist(now.at, now.blanket) < 1.6) return;
    log(`   ${what}: ended at ${now.at.i},${now.at.j}, not at the blanket; bag ${now.bag.join(',')}`);
    await clearAround(now.blanket, 1.6);
  }
  await fail(`${what}: could not get to the blanket`);
}
/** Walks to the blanket (the hut's middle) and sleeps; through any wake-up in the night, until the morning. */
async function sleepThrough(what) {
  await T('fill');
  const s = await S();
  // The fish and the crab are reached from the water's edge: back onto the sand first.
  await T('place', s.blanket.i + 1.2, s.blanket.j);
  await toBlanket(`${what}: walking to the blanket`);
  await T('sleep');
  await until(`${what}: falling asleep`, (x) => x.sleeping, 6000);
  await until(`${what}: waking`, (x) => !x.sleeping, 40000);
  await settle();
}
/** A short hash of the game's state, to compare two runs step by step (FNV-1a over its JSON). */
function fingerprint(s) {
  let h = 2166136261;
  for (const ch of JSON.stringify(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}
const STOP_AFTER = Number(process.env.STOP_AFTER) || Infinity;
let steps = 0;
const step = async (name, f) => {
  if (steps >= STOP_AFTER) return;
  steps++;
  log(`… ${name}`);
  await f();
  const s = await S();
  log(`✓ ${name} (quest ${s.quest.n + 1} "${s.quest.id}"${s.quest.done ? ', done' : ''}, day ${s.day}; state ${fingerprint(s)})`);
  // TRACE=file: the whole state after each step, one line each, to tell where two runs part.
  if (process.env.TRACE) (await import('node:fs')).appendFileSync(process.env.TRACE, `${name}\t${JSON.stringify(s)}\n`);
};
const questIs = (id) => async (what) => { const s = await S(); if (s.quest.id !== id) await fail(`${what}: expected quest "${id}", found "${s.quest.id}"`); return s; };

// ---------------------------------------------------------------------------------------------------- the start
process.on('unhandledRejection', (e) => fail(String(e?.message ?? e)));
process.on('uncaughtException', (e) => fail(String(e?.message ?? e)));
// The game's time is ours from before the page loads: it passes only as the script lets it (a fixed date, the clock
// stopped), so not one frame runs on real time; and from the first step on nothing is drawn.
const T0 = Date.UTC(2026, 0, 1, 8);
await page.clock.install({ time: T0 });
await page.clock.pauseAt(T0 + 1000);
log(`seed ${SEED}`);
await page.goto(`${url}?seed=${SEED}`, { waitUntil: 'load' });
await within(page.waitForFunction(() => window.__test, null, { polling: 50 }), 30000, 'the test hook');
await T('draw', false);
// Frames come on a grid of 16 ms that the page's load time shifts a little each run: on until a frame has just run, so
// every wait from here starts at the same point of the grid, and covers the same frames.
const framesNow = async () => (await S()).frames;
for (let f = await framesNow(), n = 0; n < 40 && (await framesNow()) === f; n++) await page.clock.runFor(1);
await wait(1500);
// Clicked from inside the page: Playwright's own click waits for animation frames to see the button stand still, and
// those would let the game run on real time, a few frames more or less each run.
const press = (label) => within(page.evaluate((l) => { const b = document.querySelector(`button[aria-label="${l}"]`); if (!b) throw new Error(`no ${l} button`); b.click(); }, label), 15000, label);
await press('Create character');
await wait(1200);
await press('Start');
await until('the survivor to wake on the beach', (s) => s.present && !s.sleeping && s.telling, 30000);
await settle();

await step('quest 1, eat: a coconut from the ground', async () => {
  await questIs('eat')('start');
  await pickUp('coconut');
  await T('eat', await slotOf('coconut'));
  await until('the eat quest done and the sleep quest started at once', (s) => s.quest.id === 'sleep');
  await settle();
});

await step('quest 2, sleep: a night on the blanket', async () => {
  await sleepThrough('the first night');
  await until('the fish quest', (s) => s.quest.id === 'fish');
});

await step('quest 3, fish: a spear from a stick and a stone, a fish speared', async () => {
  await pickUp('wood'); await pickUp('stone');
  await tie('wood', 'stone', 'spear');
  await T('hold', 'spear');
  for (let n = 0; n < 12; n++) {
    const s = await S();
    if (s.quest.done) break;
    const f = [...s.fish].sort((a, b) => dist(a, s.at) - dist(b, s.at))[0];
    if (!f) { await wait(500); continue; }
    await T('place', f.i + 0.6, f.j); await tapAt(f, 0, 0.8); await wait(700); await settle();
  }
  await until('a fish in the bag and the quest done', (s) => s.quest.done && s.quest.id === 'fish');
});

await step('quest 4, crab: a windy day, a crab caught with the spear', async () => {
  await sleepThrough('the second night');
  await questIs('crab')('after the night');
  await T('hold', 'spear');
  const tries = [];
  const missed = {};
  for (let n = 0; n < 60; n++) {
    const s = await S();
    if (s.quest.done) break;
    // A crab that will not be caught after a few tries (hiding, say) is left for another.
    const key = (x) => `${x.i},${x.j}`;
    const c = s.crabs.find((x) => (missed[key(x)] ?? 0) < 3);
    if (!c) { await wait(1000); continue; }
    missed[key(c)] = (missed[key(c)] ?? 0) + 1;
    await T('place', c.i + 0.6, c.j); await tapAt(c, 0, 0.8); await wait(600); await settle();
    const after = await S();
    tries.push(`crab at ${c.i},${c.j}: survivor ${after.at.i},${after.at.j}, bag ${after.bag.join(',')}, crabs ${after.crabs.map((x) => `${x.i},${x.j}`).join(' ')}`);
  }
  if (!(await S()).quest.done) log(`   crab tries:\n     ${tries.slice(-8).join('\n     ')}`);
  await until('the crab quest done', (s) => s.quest.done && s.quest.id === 'crab');
});

await step('quest 5, crate: smashed with a stone', async () => {
  await sleepThrough('the third night');
  await tidy();
  const s0 = await questIs('crate')('after the night');
  if (!s0.crates.some((c) => c.item === 'crate')) await fail('no crate washed up');
  await pickUp('stone'); await T('hold', 'stone');
  // A thing lying beside the crate takes the tap (loose things come first): put such things out of the way, then tap it higher up.
  await clearAround((await S()).crates.find((c) => c.item === 'crate'));
  for (const up of [8, 13, 16, 10, 15]) {
    const s = await S();
    if (s.quest.done) break;
    const crate = s.crates.find((c) => c.item === 'crate');
    if (!crate) break;
    await T('hold', 'stone');
    await tapAt(crate, up);
    await idle('smashing the crate');
    const after = await S();
    log(`   crate tap up ${up}: survivor ${s.at.i},${s.at.j} -> ${after.at.i},${after.at.j}, bag ${after.bag.join(',')}, hand ${after.hand}, crates ${after.crates.length}, thought: ${await page.$eval('.bubble', (b) => (b.hidden ? '' : b.getAttribute('aria-label'))).catch(() => '')}`);
  }
  await until('the crate smashed and the quest done', (s) => s.quest.done && s.quest.id === 'crate', 8000);
});

await step('quest 6, hut: four driftwood, the hammer, four palm leaves, built round the blanket', async () => {
  await sleepThrough('the fourth night');
  await questIs('hut')('after the night');
  await tidy();
  await pickUp('hammer');
  for (let n = 0; n < 4; n++) await pickUp('drift');
  await toBlanket('walking to the hut');
  for (let n = 0; n < 4; n++) { await T('build', 'hut'); await wait(300); }
  if ((await S()).builds.find((b) => b.kind === 'hut')?.stage !== 4) await fail('the four walls were not built');
  for (let tries = 0; tries < 12 && count(await S(), 'leaf') < 4; tries++) {
    const s = await S();
    const palms = s.palms.filter((p) => !p.felled && !p.struck).sort((a, b) => dist(a, s.at) - dist(b, s.at));
    const palm = palms[tries % palms.length];
    await T('hold', null); await tapAt(palm, 26); await idle('picking a palm leaf');
    const now = await S();
    log(`   leaf try ${tries + 1}: palm ${palm.k} at ${palm.i},${palm.j}, survivor at ${now.at.i},${now.at.j}, bag ${now.bag.join(',')}`);
  }
  if (count(await S(), 'leaf') < 4) await fail('did not get four palm leaves');
  await toBlanket('walking back to the hut');
  for (let n = 0; n < 4; n++) { await T('build', 'hut'); await wait(300); }
  await until('the hut finished and the quest done', (s) => s.quest.done && s.quest.id === 'hut');
});

await step('quest 7, storm: woken by it in the night, a storm night slept in the hut', async () => {
  await T('fill');
  // To the blanket first, as each night: sleep is only to be had on it.
  await toBlanket('walking to the blanket in the hut');
  await T('sleep');
  await until('the first sleep', (s) => s.sleeping, 6000);
  await until('the storm waking the survivor', (s) => !s.sleeping, 40000);
  await settle();
  await questIs('storm')('woken in the night');
  await sleepThrough('the storm night');
  await until('the storm quest done, or the next one started', (s) => s.quest.id !== 'storm' || s.quest.done);
});

await step('quest 8, fire: lightning on a palm, a torch from the stump, a campfire by the hut', async () => {
  let s = await S();
  if (s.quest.id !== 'fire') { await sleepThrough('the night after the storm'); }
  await questIs('fire')('after the storm');
  await tidy();
  // Out of the hut, to pick up a stick: the bolt comes as the survivor steps out.
  await pickUp('wood');
  await until('the lightning to strike a palm', (x) => x.struck !== null, 30000);
  await settle();
  await pickUp('drift');
  // The driftwood goes down just outside the hut's east wall (inside it, walls are in the way), near enough to count as the hut's.
  s = await S();
  await T('place', s.hut.i + 1.9, s.hut.j + 0.2);
  await T('drop', s.bag.indexOf('drift'), s.hut.i + 2.5, s.hut.j + 0.3);
  const byTheHut = (x) => lying(x, 'drift').filter((l) => dist(l, x.hut) <= 2.9 && l.i - x.hut.i > 1.3);
  await until('the driftwood to land by the hut', (x) => byTheHut(x).length > 0, 8000);
  s = await S();
  const stump = s.palms.find((p) => p.struck);
  await T('hold', 'wood');
  await tapAt(stump, 11); await idle('lighting a torch at the stump');
  await until('a torch in hand', (x) => x.hand === 'fire' || x.bag.includes('fire'), 8000);
  await T('hold', 'fire');
  s = await S();
  const wood = byTheHut(s)[0];
  await tapAt(wood, 2); await idle('lighting the campfire');
  await until('the campfire lit and the quest done', (x) => x.fires.length > 0 && x.quest.done, 8000);
});

await step('quest 9, axe: a stick, a stone and a vine tied together, four logs cut', async () => {
  await sleepThrough('the night after the fire');
  await questIs('axe')('after the night');
  await tidy();
  await pickUp('wood'); await pickUp('stone'); await pickUp('vine');
  await tie('vine', 'stone', 'axe');
  await T('hold', 'axe');
  for (let n = 0; n < 6; n++) {
    const s = await S();
    if (s.quest.done) break;
    const palm = s.palms.filter((p) => p.tall && !p.felled && !p.struck).sort((a, b) => dist(a, s.at) - dist(b, s.at))[0];
    if (!palm) await fail('no tall palm left to cut for the logs');
    await tapAt(palm, 26); await idle('cutting a palm');
    const after = await S();
    log(`   cut try ${n + 1}: palm ${palm.k} at ${palm.i},${palm.j}; survivor ${s.at.i},${s.at.j} -> ${after.at.i},${after.at.j}; bag ${after.bag.join(',')}; logs lying ${lying(after, 'log').length}; felled ${after.felled.join(',')}; thought: ${await page.$eval('.bubble', (b) => (b.hidden ? '' : b.getAttribute('aria-label'))).catch(() => '')}`);
  }
  await until('four logs cut and the quest done', (s) => s.quest.done && s.quest.id === 'axe');
});

await step('quest 10, raft: four logs, rope, a stick and the sailcloth lashed on the beach, and set sail', async () => {
  await sleepThrough('the night before the raft');
  await questIs('raft')('after the night');
  await tidy();
  await T('hold', null);
  for (let n = 0; n < 4; n++) await pickUp('log');
  await pickUp('rope');
  // The first stage, on a beach spot clear of the palms (the game says which, by building or not).
  let s = await S();
  let built = false;
  for (const b of [...s.beach].sort((a, c) => dist(c, s.hut) - dist(a, s.hut))) {
    await T('place', b.i, b.j);
    if ((await S()).canBuild.raft) { await T('build', 'raft'); built = true; break; }
  }
  if (!built) await fail('no beach spot to lay the raft on');
  await T('build', 'raft');
  await pickUp('wood'); await pickUp('cloth');
  const r = (await S()).builds.find((x) => x.kind === 'raft');
  await T('place', r.i + 0.3, r.j + 0.3);
  await T('build', 'raft');
  s = await S();
  if (s.builds.find((x) => x.kind === 'raft')?.stage !== 3) await fail('the raft was not finished');
  await until('the raft ready to sail', (x) => x.canSail, 6000);
  await T('sail');
  await until('the end of the demo', (x) => x.ended, 8000);
});

if (errors.length) await fail(`the game logged errors:\n${errors.join('\n')}`);
log(steps >= 10 ? 'The whole tutorial was played: from the first coconut to setting sail, no errors.' : `Stopped after ${steps} steps (STOP_AFTER), no errors.`);
// Closing the dev server can hang for a minute on its open sockets: a few seconds, then out.
await Promise.race([Promise.allSettled([browser.close(), server.close()]), realWait(3000)]);
process.exit(0);
