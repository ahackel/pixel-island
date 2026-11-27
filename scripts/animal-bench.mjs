// Times drawing animal frames cold (engine/animals/animal.ts), per kind, over its clips and drawn facings.
// Plain imports, no Vite: the animal code needs none, and Vite's module wrapping slows hot loops that read imports.
// Usage: node scripts/animal-bench.mjs [kind]
import { CLIP_IDS, CLIPS, drawAnimal } from '../engine/animals/animal.ts';
import { PRESETS } from '../engine/animals/animal-presets.ts';
import { FACING_VIEWS } from '../engine/core/puppet.ts';

const only = process.argv[2];
let all = 0, count = 0;
const rows = [];
for (const p of PRESETS.filter((p) => !only || p.id === only)) {
  let ms = 0, n = 0, worst = 0;
  for (const clip of CLIP_IDS) for (let f = 0; f < CLIPS[clip].frames; f += 2) for (let facing = 0; facing < 8; facing++) {
    if (FACING_VIEWS[facing].mirror) continue;
    const t = performance.now();
    drawAnimal(p.animal, clip, f, facing);
    const d = performance.now() - t;
    ms += d; n++; worst = Math.max(worst, d);
  }
  rows.push([p.id, ms / n, worst]);
  all += ms; count += n;
}
for (const [id, mean, worst] of rows.sort((a, b) => b[1] - a[1])) console.log(`${id.padEnd(14)} ${mean.toFixed(2)} ms mean, ${worst.toFixed(2)} worst`);
console.log(`all: ${(all / count).toFixed(2)} ms mean over ${count} frames`);
