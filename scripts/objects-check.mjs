// Draws every object preset in every camera turn and frame and checks it: something is drawn, nothing is cut
// off at the canvas edge, every point lies on the canvas and shows in at least one turn. First a plain box,
// to check the light: top light, front (lower left) base, side (lower right) shade (docs/object-spec.md).
//
// Usage: node scripts/objects-check.mjs
import { cleanBuild, drawObject, framesOf, newPart, OBJECT_H, OBJECT_ORIGIN, OBJECT_W } from '../engine/objects/object.ts';
import { OBJECT_PRESETS } from '../engine/objects/object-presets.ts';
import { PALETTE } from '../engine/core/palette.ts';

const problems = [];

// ---- the light on one box
{
  const { sprite } = drawObject(cleanBuild({ w: 1, d: 1, parts: [newPart({ x: 2, z: 2, w: 12, d: 12, h: 10, color: 'red' })] }), 0);
  const at = (dx, dy) => sprite.get(OBJECT_ORIGIN.x + dx, OBJECT_ORIGIN.y + dy);
  const want = [[0, -12, 'light', 'top'], [-5, 0, 'base', 'front'], [5, 0, 'shade', 'side']];
  for (const [dx, dy, tone, face] of want) if (at(dx, dy) !== PALETTE.red[tone]) problems.push(`box ${face}: ${at(dx, dy)}, expected ${tone} ${PALETTE.red[tone]}`);
}

// ---- the presets
let frames = 0;
if (OBJECT_PRESETS.length !== 24) problems.push(`${OBJECT_PRESETS.length} presets, expected 24`);
for (const { id, prop } of OBJECT_PRESETS) {
  if (JSON.stringify(cleanBuild(prop)) !== JSON.stringify(prop)) problems.push(`${id}: changed by cleanBuild`);
  const seen = new Set();
  for (let f = 0; f < framesOf(prop); f++) {
    for (const turn of [0, 1, 2, 3]) {
      frames++;
      const { sprite, points } = drawObject(prop, turn, f);
      let painted = 0;
      let edge = 0;
      for (let y = 0; y < OBJECT_H; y++) for (let x = 0; x < OBJECT_W; x++) {
        const hex = sprite.get(x, y);
        if (!hex) continue;
        painted++;
        if (x === 0 || y === 0 || x === OBJECT_W - 1 || y === OBJECT_H - 1) edge++;
      }
      const where = `${id} frame ${f} turn ${turn}`;
      if (painted < 40) problems.push(`${where}: only ${painted} pixels`);
      if (edge) problems.push(`${where}: cut off at the edge`);
      for (const [name, p] of Object.entries(points)) {
        if (p.x < 0 || p.y < 0 || p.x >= OBJECT_W || p.y >= OBJECT_H) problems.push(`${where}: point ${name} off the canvas`);
        if (p.visible) seen.add(name);
      }
    }
  }
  for (const { name } of prop.points) if (!seen.has(name)) problems.push(`${id}: point ${name} never shows`);
}

console.log(`${frames} frames of ${OBJECT_PRESETS.length} objects checked`);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('all good');
