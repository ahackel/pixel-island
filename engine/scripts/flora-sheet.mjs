// Renders plants to a PNG sheet for inspection.
// Usage: node scripts/flora-sheet.mjs <out.png> <scale> <plants.json|test> [variants|wind|dry|size] [character]
import fs from 'node:fs';
import { writeSheet } from './sheet.mjs';
import { tryPlant, grow, drawPlant, canvasFor, FLORA_ORIGIN, FRAMES, Raster } from '../engine/flora/flora.ts';
import { withSunShadow } from '../engine/world/island.ts';
import { drawCharacter, BUILDS } from '../engine/core/puppet.ts';
import { STAND } from '../engine/core/poses.ts';
import { baseLook } from '../engine/character/base.ts';

/** Rows of plants as one PNG, each in a cell the size of the largest, with their ground shadows cast from the sun. */
export function writeRasters(file, rows, scale = 3, background = [233, 217, 160]) {
  const cells = rows.flat().filter(Boolean);
  const cell = { w: Math.max(...cells.map((r) => r.w)), h: Math.max(...cells.map((r) => r.h)) };
  const cast = new Map(cells.map((r) => [r, withSunShadow(r, r.w, r.h, r.origin)]));
  writeSheet(file, rows, scale, background, cell, (raster, x, y) => cast.get(raster).get(x, y));
}

/** Draws the default character beside the plant, for scale. */
function withPerson(raster, origin = FLORA_ORIGIN) {
  const sprite = drawCharacter({ ...baseLook('skinB', 'hairBrown'), build: BUILDS[1] }, STAND, 0);
  const dx = origin.x - 34 - 32;
  const dy = origin.y - 52;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const hex = sprite.get(x, y);
    if (!hex || raster.get(x + dx, y + dy)) continue;
    raster.set(x + dx, y + dy, hex);
  }
  return raster;
}

if (process.argv[1].endsWith('flora-sheet.mjs')) {
  const [out, scale = '3', source, mode = 'variants', person] = process.argv.slice(2);
  const list = JSON.parse(fs.readFileSync(source, 'utf8'));
  const rows = [];
  for (const raw of list) {
    const result = tryPlant(raw);
    if (!result.ok) { console.log('REJECTED', raw.name, '-', result.error); continue; }
    const { plant, repairs } = result.compiled;
    if (repairs.length) console.log('repaired', plant.name, '-', repairs.join('; '));
    const row = [];
    if (mode === 'variants') for (let seed = 0; seed < 4; seed++) row.push(drawPlant(grow(plant, { seed })));
    if (mode === 'wind') for (let f = 0; f < FRAMES; f += 2) row.push(drawPlant(grow(plant, { seed: 0 }), { frame: f, wind: 2.5 }));
    if (mode === 'dry') for (const d of [0, 0.35, 0.7, 1]) row.push(drawPlant(grow(plant, { seed: 0, dryness: d })));
    const big = canvasFor(1.5);
    if (mode === 'size') for (const size of [0.5, 0.75, 1, 1.5]) row.push(drawPlant(grow(plant, { seed: 0, size }), { origin: big.origin }, new Raster(big.w, big.h)));
    if (person) row[0] = mode === 'size' ? withPerson(row[0], big.origin) : withPerson(row[0]);
    const lost = row.reduce((n, r) => n + r.lost, 0);
    if (lost) console.log('clipped', plant.name, lost, 'pixels');
    rows.push(row);
  }
  writeRasters(out, rows, Number(scale));
}
