// Draws every animal preset in every clip, frame and facing and checks it: something is drawn,
// nothing is cut off at the canvas edge, every anchor lies on the canvas, and the standing height
// falls in the size class the spec gives the animal (docs/animal-spec.md).
//
// Usage: node scripts/animals-check.mjs [sheet.png]   (the optional sheet shows every preset, clip and facing)
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { ANCHORS, ANIMAL_H, ANIMAL_W, CLIPS, CLIP_IDS, drawAnimal, heightOf, sizeClassOf } from '../engine/animals/animal.ts';
import { PRESETS } from '../engine/animals/animal-presets.ts';

const CLASS = {
  small: ['rabbit', 'guineapig', 'hedgehog', 'squirrel', 'skunk', 'otter'],
  medium: ['cat', 'dog', 'fox', 'wolf', 'pig', 'cheetah', 'boar'],
  large: ['bear', 'gorilla', 'yak', 'ostrich', 'dromedary', 'rhino'],
  huge: ['elephant', 'dino'],
};
const problems = [];
let frames = 0;
if (PRESETS.length !== 21) problems.push(`${PRESETS.length} presets, expected 21`);
for (const { id, animal } of PRESETS) {
  const height = heightOf(animal);
  const want = Object.keys(CLASS).find((c) => CLASS[c].includes(id));
  const got = sizeClassOf(height).id;
  if (got !== want) problems.push(`${id}: ${height} px tall is ${got}, expected ${want}`);
  for (const clip of CLIP_IDS) {
    for (let f = 0; f < CLIPS[clip].frames; f++) {
      for (const facing of [0, 1, 2, 3]) {
        frames++;
        const { sprite, anchors } = drawAnimal(animal, clip, f, facing);
        let painted = 0;
        let edge = 0;
        for (let y = 0; y < ANIMAL_H; y++) for (let x = 0; x < ANIMAL_W; x++) {
          const hex = sprite.get(x, y);
          if (!hex) continue;
          painted++;
          if (x === 0 || y === 0 || x === ANIMAL_W - 1 || y === ANIMAL_H - 1) edge++;
        }
        const where = `${id} ${clip} ${f} facing ${facing}`;
        if (painted < 20) problems.push(`${where}: only ${painted} pixels`);
        if (edge) problems.push(`${where}: cut off at the edge`);
        for (const name of ANCHORS) {
          const a = anchors[name];
          if (!(a.x >= 0 && a.y >= 0 && a.x < ANIMAL_W && a.y < ANIMAL_H)) problems.push(`${where}: anchor ${name} off the canvas`);
        }
      }
    }
  }
  console.log(`${id.padEnd(10)} ${String(height).padStart(2)} px  ${got}`);
}

const out = process.argv[2];
if (out) {
  // One row per preset: each clip's frames 0 and middle in facings 0 and 3, then idle in 1 and 2.
  const cells = CLIP_IDS.flatMap((clip) => [[clip, 0, 0], [clip, Math.floor(CLIPS[clip].frames / 2), 3]]).concat([['idle', 0, 1], ['idle', 0, 2]]);
  const png = new PNG({ width: ANIMAL_W * cells.length, height: ANIMAL_H * PRESETS.length });
  png.data.fill(255);
  PRESETS.forEach(({ animal }, row) => cells.forEach(([clip, f, facing], col) => {
    const { sprite } = drawAnimal(animal, clip, f, facing);
    for (let y = 0; y < ANIMAL_H; y++) for (let x = 0; x < ANIMAL_W; x++) {
      const o = ((row * ANIMAL_H + y) * png.width + col * ANIMAL_W + x) * 4;
      const hex = sprite.get(x, y);
      const bg = (row + col) % 2 ? [233, 217, 160] : [222, 206, 150];
      const rgb = hex ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : bg;
      const alpha = hex && hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
      for (let k = 0; k < 3; k++) png.data[o + k] = Math.round(bg[k] + (rgb[k] - bg[k]) * alpha);
      png.data[o + 3] = 255;
    }
  }));
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log('sheet', out);
}

console.log(`${frames} frames checked`);
if (problems.length) {
  console.error(problems.slice(0, 40).join('\n') + (problems.length > 40 ? `\n... ${problems.length - 40} more` : ''));
  process.exit(1);
}
