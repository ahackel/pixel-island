// Times a frame in a cave outside the browser: the game's cave scene (given as a scene file), its rock, decor and
// lamps, composed and lit tile by tile as the game does, part by part, with a hash of the last frame so a change can be
// checked for pixel identity. Run from a game that has a cave scene.
// Usage: [VIEW=480x270] node engine/scripts/cave-bench.mjs <scene.json> [frames]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const [file, frames = 60] = process.argv.slice(2);
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(root + p);
const { World } = await load('engine/world/world.ts');
const { readSceneFile } = await load('engine/world/scene.ts');
const { caveLamps, caveThings, caveTint, setUpCave } = await load('engine/world/cave.ts');
const { lightByTile } = await load('engine/world/daylight.ts');
const { frameDone, part } = await load('shared/stats.ts');
const render = globalThis.__render;
console.table = () => {};

const scene = readSceneFile(readFileSync(file, 'utf8'));
const world = new World(scene);
setUpCave(world);
const at = scene.spawn;
const [vw, vh] = (process.env.VIEW ?? '480x270').split('x').map(Number);
const mid = world.screenOf(at.i, at.j);
const view = { x: Math.round(mid.x - vw / 2), y: Math.round(mid.y - vh / 2), w: vw, h: vh };
const tint = caveTint(scene);
let last;
const frame = (ms) => {
  const t0 = performance.now();
  const things = [...caveThings(world, at), ...world.decorThings(ms), ...world.itemThings()];
  let t = part('things', t0);
  last = world.compose(view, things, undefined, false, ms);
  t = performance.now();
  const field = world.lightField(caveLamps(world, ms));
  t = part('light field', t);
  lightByTile(last, tint, 0, world.spots, field);
  part('light', t);
  part('whole frame', t0);
  frameDone();
};
for (let k = 0; k < 10; k++) frame(k * 16);
render.reset();
for (let k = 0; k < frames; k++) frame(1000 + k * 8.3);
const r = render.report();
const parts = Object.entries(r.table).filter(([k]) => k.startsWith('frame: ')).map(([k, v]) => `${k.slice(7)} ${v['draw ms/frame']}`).join(', ');
const misses = Object.entries(r.table).filter(([k, v]) => !k.startsWith('frame') && v['misses/frame'] > 0).map(([k, v]) => `${k} ${v['misses/frame']}`).join(', ');
console.log(`cave, view ${vw}x${vh}, ${world.lightField(caveLamps(world, 0)).lamps.length} lamps: ${parts}; misses/frame: ${misses || 'none'}; hash ${createHash('sha1').update(last.data).digest('hex').slice(0, 12)}`);
if (process.env.COUNT) {
  const { i, j } = world.spots; let none = 0, same = 0, black = 0;
  for (let p = 0; p < i.length; p++) { if (i[p] !== i[p]) none++; else if (p && i[p] === i[p - 1] && j[p] === j[p - 1]) same++; }
  for (let p = 0; p < i.length; p++) if (!last.data[p * 4] && !last.data[p * 4 + 1] && !last.data[p * 4 + 2]) black++;
  console.log(`pixels ${i.length}: no spot ${none}, same spot as the one before ${same}, black after light ${black}`);
}
await server.close();
