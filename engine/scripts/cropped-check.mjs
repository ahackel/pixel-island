// Checks that cropped pictures (engine/core/cropped.ts) show exactly what the full canvases did: every
// catalogue plant in a few seeds, turns, wind frames and sizes, and every object preset in four turns.
// Usage: node scripts/cropped-check.mjs
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(root + p);
const { drawPlant, drawPlantCropped, grow } = await load('engine/flora/flora.ts');
const { FLORA, plantOf } = await load('engine/flora/flora-catalog.ts');
const { crop } = await load('engine/core/cropped.ts');
const { drawObject, OBJECT_W, OBJECT_H, OBJECT_ORIGIN } = await load('engine/objects/object.ts');
const { OBJECT_PRESETS } = await load('engine/objects/object-presets.ts');

const problems = [];
let pictures = 0, full = 0, kept = 0;
/** Every pixel of the full picture, read through the cropped one at the same place relative to the foot. */
function same(name, big, w, h, foot, small) {
  pictures++;
  full += w * h * 9;
  kept += small.bytes;
  const dx = foot.x - small.foot.x, dy = foot.y - small.foot.y;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (big.get(x, y) !== small.get(x - dx, y - dy)) {
      problems.push(`${name}: differs at ${x},${y}`);
      return;
    }
  }
}

for (const entry of FLORA) {
  for (const seed of [0, 3]) for (const turn of [0, 3]) for (const size of [0.5, 1, 1.6]) for (const [frame, wind] of [[0, 0], [2, 1], [5, 2.5]]) {
    const grown = grow(plantOf(entry), { seed, size, turn: turn * 45 });
    const r = drawPlant(grown, { frame, wind });
    // Drawn twice in a row on the shared canvas: the second must not keep anything of the first.
    drawPlantCropped(grow(plantOf(FLORA[0]), { seed: 1, size }), { frame: 1, wind: 2 });
    same(`${entry.id} seed ${seed} turn ${turn} size ${size} frame ${frame}`, r, r.w, r.h, r.origin, drawPlantCropped(grown, { frame, wind }));
  }
}
for (const { id, prop: build } of OBJECT_PRESETS) for (const turn of [0, 1, 2, 3]) {
  const sprite = drawObject(build, turn).sprite;
  same(`${id} turn ${turn}`, sprite, OBJECT_W, OBJECT_H, OBJECT_ORIGIN, crop(sprite, OBJECT_W, OBJECT_H, OBJECT_ORIGIN));
}
await server.close();
console.log(`${pictures} pictures, ${Math.round(full / 1024)} KB full, ${Math.round(kept / 1024)} KB cropped (${(full / kept).toFixed(1)}x smaller)`);
if (problems.length) {
  console.log(problems.slice(0, 20).join('\n'));
  process.exit(1);
}
console.log('all identical');
