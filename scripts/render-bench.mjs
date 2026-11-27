// Times World.compose outside the browser: the ground and water pass (redrawn every WATER_MS) and a crowded scene
// (many plants, animals, characters, objects), part by part, and prints a hash of each kind of frame so a change
// can be checked for pixel identity against the version before it.
// Usage: [VIEW=960x540] [ONLY=water|crowd|night|pan] [WARM=5 frames before timing] [TABLE=1 per-cache table] node scripts/render-bench.mjs [plants] [animals] [people]   (defaults 300 40 30, view 512x320)
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Characters fidget at random: seeded, so every run draws the same frames.
let seed = 1;
Math.random = () => ((seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5 | 0) >>> 0) / 2 ** 32;
const [plants = 300, animals = 40, people = 30] = process.argv.slice(2).map(Number);
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(root + p);
const { createScene } = await load('engine/world/scene.ts');
const { World, grows } = await load('engine/world/world.ts');
const { FLORA } = await load('engine/flora/flora-catalog.ts');
const { PRESETS } = await load('engine/animals/animal-presets.ts');
const { OBJECT_PRESETS } = await load('engine/objects/object-presets.ts');
const { Actor } = await load('engine/world/actor.ts');
const { defaultState, lookOf } = await load('engine/character/character.ts');
const { frameDone, part } = await load('shared/stats.ts');
const { light, TINTS } = await load('engine/world/daylight.ts');
const render = globalThis.__render;

// Seeded anew once everything is loaded: loading draws random numbers of its own.
seed = 1;
// A seeded island, filled with plants where they grow, then animals, people and objects on what is left.
const scene = createScene('bench', 40, 40, true, 7);
const map = { ...scene, levels: Int8Array.from(scene.levels) };
let n = 0;
for (let k = 0; scene.plants.length < plants && k < 20000; k++) {
  const entry = FLORA[k % FLORA.length], i = 2 + ((k * 7.31) % 36), j = 2 + ((k * 3.77) % 36);
  if (grows(map, entry.id, i, j)) scene.plants.push({ plant: entry.id, i, j, seed: k % 4, size: 0.7 + (k % 5) * 0.15, turn: k % 8 });
}
const land = [];
for (let j = 3; j < 37; j += 0.9) for (let i = 3; i < 37; i += 0.9) if (map.levels[Math.floor(j) * 40 + Math.floor(i)] >= 0) land.push([i, j]);
for (let k = 0; k < animals; k++) {
  const [i, j] = land[(k * 37) % land.length];
  scene.animals.push({ name: 'a', animal: PRESETS[k % PRESETS.length].animal, i, j, facing: k % 8 });
}
OBJECT_PRESETS.slice(0, 12).forEach((o, k) => { const [i, j] = land[(k * 53 + 11) % land.length]; scene.items.push({ item: o.id, i, j, turn: k }); });
const world = new World(scene);
const look = lookOf(defaultState());
const actors = Array.from({ length: people }, (_, k) => { const [i, j] = land[(k * 71 + 5) % land.length]; return new Actor(look, { i, j }); });
const mid = world.screenOf(20, 20);
const [vw, vh] = (process.env.VIEW ?? "512x320").split("x").map(Number);
const view = { x: Math.round(mid.x - vw / 2), y: Math.round(mid.y - vh / 2), w: vw, h: vh };
// Gathering timed per source.
const gathered = { plants: 0, animals: 0, items: 0, people: 0 };
const timed = (k, f) => { const t = performance.now(); const r = f(); gathered[k] += performance.now() - t; return r; };
const thingsAt = (ms) => [
  ...timed('plants', () => world.plantThings(Math.floor(ms / 166) % 8)), ...timed('animals', () => world.animalThings(ms)),
  ...timed('items', () => world.itemThings()), ...timed('people', () => actors.map((a) => a.thing(world, ms))),
];

const hash = (image) => createHash('sha1').update(image.data).digest('hex').slice(0, 12);
// At night the picture is lit after it is composed: a tint over it all, lifted round each lamp (fires, a lantern).
let lit = null;
const night = (image) => {
  const t = performance.now();
  const lamps = [[0.3, 0.4, 46], [0.6, 0.55, 46], [0.45, 0.7, 46], [0.5, 0.5, 64]].map(([x, y, r]) => ({ x: x * image.width, y: y * image.height, r }));
  light(image, TINTS.night, 0, lamps);
  part('light', t);
};
function run(label, frames, things, msOf) {
  const warm = Number(process.env.WARM ?? 5);
  for (let k = 0; k < warm; k++) world.compose(view, things(msOf(k)), undefined, false, msOf(k)); // warm the caches
  render.reset();
  let gather = 0;
  for (const k in gathered) gathered[k] = 0;
  const start = performance.now();
  let last;
  for (let k = 0; k < frames; k++) {
    const ms = msOf(k + warm);
    const t = performance.now();
    const list = things(ms);
    gather += performance.now() - t;
    last = world.compose(view, list, undefined, false, ms);
    if (lit) lit(last);
    frameDone();
  }
  const ms = (performance.now() - start) / frames;
  const r = render.report();
  const parts = Object.entries(r.table).filter(([k]) => k.startsWith('frame: ')).map(([k, v]) => `${k.slice(7)} ${v['draw ms/frame']}`).join(', ');
  const split = Object.entries(gathered).map(([k, v]) => `${k} ${(v / frames).toFixed(2)}`).join(' ');
  console.log(`${label}: ${ms.toFixed(2)} ms/frame (things ${(gather / frames).toFixed(2)}: ${split}; ${parts}) hash ${hash(last)}`);
}
// Silence the per-report table.
console.table = process.env.TABLE ? console.table : () => {};
const n0 = thingsAt(0).length;
console.log(`${scene.plants.length} plants, ${animals} animals, ${people} people, ${scene.items.length} objects: ${n0} things; view ${view.w}x${view.h}`);
const only = process.env.ONLY;
if (!only || only === 'water') run('water redrawn, no things', 40, () => [], (k) => k * 100);
if (!only || only === 'crowd') run('water kept, crowd', 40, thingsAt, (k) => 50 + k * 3);
if (!only) run('water redrawn, crowd', 40, thingsAt, (k) => k * 100);
if (!only || only === 'night') {
  lit = night;
  run('night, 4 lamps, crowd', 40, thingsAt, (k) => 50 + k * 3);
  lit = null;
}
// The view following a walker: the kept ground moves along, only the uncovered strips and one band are drawn.
if (!only || only === 'pan') {
  const still = { ...view };
  run('panning, crowd', 40, thingsAt, (k) => (view.x = still.x + k, view.y = still.y + (k >> 1), 50 + k * 13));
  Object.assign(view, still);
}
// A pan at one moment must match drawing that window afresh.
{
  const fresh = new World(scene);
  const ms = 12345;
  // Sideways only, then also up: the shaded copy is moved along in the one, shaded anew in the other. Then a zoom in and
  // out: a smaller window inside the last one, a larger one round it.
  const zoomIn = { x: view.x + 40, y: view.y + 25, w: view.w - 80, h: view.h - 50 }, zoomOut = { x: view.x - 33, y: view.y - 21, w: view.w + 66, h: view.h + 42 };
  for (const a of [{ ...view, x: view.x + 7 }, { ...view, x: view.x - 5, y: view.y - 40 }, zoomIn, zoomOut]) {
    world.compose(view, [], undefined, false, ms);
    const moved = hash(world.compose(a, [], undefined, false, ms));
    if (moved !== hash(fresh.compose(a, [], undefined, false, ms))) throw new Error(`a view moved to ${a.x}, ${a.y} differs from a fresh one`);
  }
  console.log('pan check passed');
}
await server.close();
