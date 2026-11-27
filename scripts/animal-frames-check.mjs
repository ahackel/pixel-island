// Checks animal frames (engine/animals/animal.ts, engine/core/cropped.ts): a mirrored facing taken from its drawn
// facing's cropped picture equals cropping the mirrored drawing, and every kind, clip and drawn facing still draws the
// same pixels as recorded (run with RECORD=1 to record them anew after a change meant to alter the look).
// Usage: [RECORD=1] node scripts/animal-frames-check.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(root + p);
const { drawAnimal, CLIP_IDS, CLIPS, ANIMAL_W, ANIMAL_H, ANIMAL_ORIGIN } = await load('engine/animals/animal.ts');
const { PRESETS } = await load('engine/animals/animal-presets.ts');
const { crop } = await load('engine/core/cropped.ts');
const { FACING_VIEWS } = await load('engine/core/puppet.ts');

const picture = (c) => {
  const rows = [];
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) rows.push(c.get(x, y) ?? '-');
  return `${c.w}x${c.h}@${c.foot.x},${c.foot.y}:${rows.join(' ')}`;
};
const t0 = performance.now();
const hash = createHash('sha1');
let frames = 0;
for (const p of PRESETS) for (const clip of CLIP_IDS) for (let n = 0; n < CLIPS[clip].frames; n += 3) for (let facing = 0; facing < 8; facing++) {
  const view = FACING_VIEWS[facing];
  if (view.mirror) {
    const flipped = crop(drawAnimal(p.animal, clip, n, view.drawn).sprite, ANIMAL_W, ANIMAL_H, ANIMAL_ORIGIN).mirrored(ANIMAL_W, ANIMAL_ORIGIN.x);
    assert.equal(picture(flipped), picture(crop(drawAnimal(p.animal, clip, n, facing).sprite, ANIMAL_W, ANIMAL_H, ANIMAL_ORIGIN)), `${p.id} ${clip} ${n} facing ${facing} mirrored`);
    continue;
  }
  hash.update(picture(crop(drawAnimal(p.animal, clip, n, facing).sprite, ANIMAL_W, ANIMAL_H, ANIMAL_ORIGIN)));
  frames++;
}
const sum = hash.digest('hex');
const file = new URL('./animal-frames.sha1', import.meta.url);
if (process.env.RECORD || !existsSync(file)) writeFileSync(file, `${sum}\n`);
else assert.equal(sum, readFileSync(file, 'utf8').trim(), 'animal frames differ from the recorded ones');
console.log(`animal frames check passed: ${frames} drawn frames, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
await server.close();
