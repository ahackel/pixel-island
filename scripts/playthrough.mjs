// Plays the first island's whole tutorial in a real browser, from the first coconut to setting sail on the raft, through
// the game's own handlers (the dev server's test hook, `window.__test`, set at the end of src/main.ts), and fails with the
// game's state where it gets stuck. It checks what the unit tests cannot: that main.ts reports each goal, that every
// step of the story can be done with what the story gives, and that the ending is reached.
//
//   npm run playthrough            (needs Playwright with a Chromium; it starts the dev server itself)
//
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, logLevel: 'error', server: { port: 8351, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

/** A call into the page that fails, rather than waits for ever, if the game has frozen. */
const within = (promise, ms, what) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what}: the page stopped answering (the game froze?)`)), ms))]);
const T = (fn, ...args) => within(page.evaluate(([f, a]) => window.__test[f](...a), [fn, args]), 15000, fn);
const S = () => T('state');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (msg) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s] ${msg}`);

async function fail(msg) {
  let state = '(no state)';
  try { const { beach, ...rest } = await S(); state = JSON.stringify(rest); await page.screenshot({ path: path.join(root, 'playthrough-failure.png') }); } catch { /* the page is gone */ }
  console.error(`\nFAILED: ${msg}\n${state}\n${errors.length ? `\nBrowser errors:\n${errors.join('\n')}` : ''}\n(screenshot: playthrough-failure.png)`);
  await Promise.race([Promise.allSettled([browser.close(), server.close()]), wait(5000)]);
  process.exit(1);
}

/** Waits until `cond(state)`, polling; fails with `what` if it takes longer than `ms`. */
async function until(what, cond, ms = 20000) {
  const end = Date.now() + ms;
  for (;;) {
    const s = await S();
    if (cond(s)) return s;
    if (Date.now() > end) await fail(`timed out waiting for ${what}`);
    await wait(120);
  }
}
/** Puts away every thought in the story box (the game stands still while one is up). */
async function settle() {
  let quiet = 0;
  for (let n = 0; n < 60 && quiet < 4; n++) {
    const s = await S();
    if (s.telling) { quiet = 0; await page.locator('.dialog').click({ force: true, position: { x: 20, y: 20 } }); await wait(850); } else { quiet++; await wait(250); }
  }
}
const idle = async (what) => { await until(`${what}: the walk to end`, (s) => !s.walking && !s.sleeping); await settle(); return S(); };
const lying = (s, item) => s.lying.filter((l) => l.item === item);
const dist = (a, b) => Math.hypot(a.i - b.i, a.j - b.j);
const count = (s, item) => s.bag.filter((i) => i === item).length;

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
    await T('hold', null);
    await T('tap', spots[Math.min(tries, spots.length - 1)].i, spots[Math.min(tries, spots.length - 1)].j);
    await idle(`picking up ${item}`);
    if (count(await S(), item) > before) return;
    const now = await S();
    const target = spots[Math.min(tries, spots.length - 1)];
    seen.push(`tapped ${item} at ${target.i},${target.j}; survivor at ${now.at.i},${now.at.j}; bag ${now.bag.join(',')}; lying within 1 m: ${now.lying.filter((l) => dist(l, target) < 1).map((l) => `${l.item}@${l.i},${l.j}`).join(' ')}; crates ${now.crates.map((c) => `${c.item}@${c.i},${c.j}`).join(' ')}; thought: ${await page.$eval('.bubble', (b) => (b.hidden ? '' : b.getAttribute('aria-label'))).catch(() => '')}`);
  }
  await fail(`could not pick up ${item}; after each try the bag and thought were:\n  ${seen.join('\n  ')}`);
}
/** Makes room in the bag as the player does: eats what is food, drags the rest out onto the sand (the bag holds six things). */
async function tidy(keep = []) {
  await T('hold', null);
  for (let n = 0; n < 12; n++) {
    const s = await S();
    const k = s.bag.findIndex((it) => !keep.includes(it));
    if (k < 0) return;
    if (['coconut', 'fish', 'wrasse', 'snapper', 'crab', 'fishSoup'].includes(s.bag[k])) { await T('eat', k); await wait(200); }
    else { await T('drop', k, s.at.i + 1.3, s.at.j + 0.6); await wait(1600); }
  }
}
const slotOf = async (item) => (await S()).bag.indexOf(item);
/** Ties the first `a` onto the first `b` in the bag, as a drag does. */
async function tie(a, b, makes) {
  const ok = await T('tie', await slotOf(a), await slotOf(b));
  if (!ok) await fail(`${a} and ${b} would not tie`);
  await until(`the ${makes} in the bag`, (s) => s.bag.includes(makes));
}
/** Walks to the blanket (the hut's middle) and sleeps; through any wake-up in the night, until the morning. */
async function sleepThrough(what) {
  await T('fill');
  const s = await S();
  // The fish and the crab are reached from the water's edge: back onto the sand first.
  await T('place', s.blanket.i + 1.2, s.blanket.j);
  await T('tap', s.blanket.i, s.blanket.j);
  await idle(`${what}: walking to the blanket`);
  await T('sleep');
  await until(`${what}: falling asleep`, (x) => x.sleeping, 6000);
  await until(`${what}: waking`, (x) => !x.sleeping, 40000);
  await settle();
}
const STOP_AFTER = Number(process.env.STOP_AFTER) || Infinity;
let steps = 0;
const step = async (name, f) => {
  if (steps >= STOP_AFTER) return;
  steps++;
  log(`… ${name}`);
  await f();
  const s = await S();
  log(`✓ ${name} (quest ${s.quest.n + 1} "${s.quest.id}"${s.quest.done ? ', done' : ''}, day ${s.day})`);
};
const questIs = (id) => async (what) => { const s = await S(); if (s.quest.id !== id) await fail(`${what}: expected quest "${id}", found "${s.quest.id}"`); return s; };

// ---------------------------------------------------------------------------------------------------- the start
process.on('unhandledRejection', (e) => fail(String(e?.message ?? e)));
process.on('uncaughtException', (e) => fail(String(e?.message ?? e)));
await page.goto(url, { waitUntil: 'load' });
await wait(1500);
await page.click('button[aria-label="Create character"]', { force: true });
await wait(1200);
await page.click('button[aria-label="Start"]', { force: true });
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
    await T('place', f.i + 0.6, f.j); await T('tap', f.i, f.j); await wait(700); await settle();
  }
  await until('a fish in the bag and the quest done', (s) => s.quest.done && s.quest.id === 'fish');
});

await step('quest 4, crab: a windy day, a crab caught with the spear', async () => {
  await sleepThrough('the second night');
  await questIs('crab')('after the night');
  await T('hold', 'spear');
  for (let n = 0; n < 60; n++) {
    const s = await S();
    if (s.quest.done) break;
    const c = s.crabs[0];
    if (!c) { await wait(1000); continue; }
    await T('place', c.i + 0.6, c.j); await T('tap', c.i, c.j); await wait(600); await settle();
  }
  await until('the crab quest done', (s) => s.quest.done && s.quest.id === 'crab');
});

await step('quest 5, crate: smashed with a stone', async () => {
  await sleepThrough('the third night');
  await tidy();
  const s0 = await questIs('crate')('after the night');
  if (!s0.crates.some((c) => c.item === 'crate')) await fail('no crate washed up');
  await pickUp('stone'); await T('hold', 'stone');
  const crate = (await S()).crates.find((c) => c.item === 'crate');
  await T('tap', crate.i, crate.j, 7);
  await idle('smashing the crate');
  await until('the crate smashed and the quest done', (s) => s.quest.done && s.quest.id === 'crate');
});

await step('quest 6, hut: four driftwood, the hammer, four palm leaves, built round the blanket', async () => {
  await sleepThrough('the fourth night');
  await questIs('hut')('after the night');
  await tidy();
  await pickUp('hammer');
  for (let n = 0; n < 4; n++) await pickUp('drift');
  const s1 = await S();
  await T('hold', null);
  await T('tap', s1.blanket.i, s1.blanket.j); await idle('walking to the hut');
  for (let n = 0; n < 4; n++) { await T('build', 'hut'); await wait(300); }
  if ((await S()).builds.find((b) => b.kind === 'hut')?.stage !== 4) await fail('the four walls were not built');
  for (let tries = 0; tries < 12 && count(await S(), 'leaf') < 4; tries++) {
    const s = await S();
    const palms = s.palms.filter((p) => !p.felled && !p.struck).sort((a, b) => dist(a, s.at) - dist(b, s.at));
    const palm = palms[tries % palms.length];
    await T('hold', null); await T('tap', palm.i, palm.j, 26); await idle('picking a palm leaf');
    const now = await S();
    log(`   leaf try ${tries + 1}: palm ${palm.k} at ${palm.i},${palm.j}, survivor at ${now.at.i},${now.at.j}, bag ${now.bag.join(',')}`);
  }
  if (count(await S(), 'leaf') < 4) await fail('did not get four palm leaves');
  const s2 = await S();
  await T('tap', s2.blanket.i, s2.blanket.j); await idle('walking back to the hut');
  for (let n = 0; n < 4; n++) { await T('build', 'hut'); await wait(300); }
  await until('the hut finished and the quest done', (s) => s.quest.done && s.quest.id === 'hut');
});

await step('quest 7, storm: woken by it in the night, a storm night slept in the hut', async () => {
  await T('fill');
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
  s = await S();
  await T('tap', s.blanket.i, s.blanket.j); await idle('walking to the hut');
  s = await S();
  await T('drop', s.bag.indexOf('drift'), s.hut.i + 1.4, s.hut.j + 0.4);
  await until('the driftwood to land by the hut', (x) => lying(x, 'drift').some((l) => dist(l, x.hut) <= 2.5), 8000);
  s = await S();
  const stump = s.palms.find((p) => p.struck);
  await T('hold', 'wood');
  await T('tap', stump.i, stump.j, 11); await idle('lighting a torch at the stump');
  await until('a torch in hand', (x) => x.hand === 'fire' || x.bag.includes('fire'), 8000);
  await T('hold', 'fire');
  s = await S();
  const wood = lying(s, 'drift').find((l) => dist(l, s.hut) <= 2.5);
  await T('tap', wood.i, wood.j, 2); await idle('lighting the campfire');
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
    await T('tap', palm.i, palm.j, 26); await idle('cutting a palm');
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
await browser.close();
await server.close();
