// The engine's thin walls (building.ts, wall-fade.ts): a wall's foot and top across a step, a diagonal step past a
// wall's end is blocked, and walls in front of the survivor dissolve a straight run at a time, fences never.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cornerBlocked, edgeKey, emptyBuilding, wallEnds, type Edge } from '../engine/world/building/building.ts';
import { CUT } from '../engine/world/ground.ts';
import { WallFade, type FadingWall } from '../engine/world/wall-fade.ts';
import type { HeightMap } from '../engine/world/terrain.ts';

/** A map of rows of digits (levels), all cut ground, without water. */
const map = (...rows: string[]): HeightMap => ({
  w: rows[0].length, h: rows.length, water: null,
  levels: Int8Array.from(rows.join(''), (ch) => Number(ch)),
  shape: new Uint8Array(rows.length * rows[0].length).fill(CUT),
});

test('a wall across a step counts its top from the higher side and reaches down to the ground on the camera side', () => {
  // Higher behind (to -i), lower in front: the wall's face comes down the step to the lower ground.
  const down = map('5522', '5522', '5522');
  assert.deepEqual(wallEnds(down, { axis: 'V', i: 2, j: 1 }), { low: [2, 2], high: [5, 5], foot: [2, 2] });
  // Higher in front: the step's own face stands in front of the wall, which stands on the higher side.
  const up = map('2255', '2255', '2255');
  assert.deepEqual(wallEnds(up, { axis: 'V', i: 2, j: 1 }), { low: [2, 2], high: [5, 5], foot: [5, 5] });
});

test('a diagonal step past the end of a wall is blocked', () => {
  const b = emptyBuilding(5);
  const e: Edge = { axis: 'V', i: 1, j: 0 };
  b.edges.set(edgeKey(e), { kind: 'brick', edge: e });
  // Cells (0, 1) and (1, 0) share the corner (1, 1), where the wall ends.
  assert.ok(cornerBlocked(b, [0, 1], [1, 0]));
  assert.ok(cornerBlocked(b, [1, 1], [0, 0]));
  assert.ok(!cornerBlocked(b, [2, 2], [3, 3]));
  // Not a diagonal step: the wall itself is for `crosses` to say.
  assert.ok(!cornerBlocked(b, [0, 0], [1, 0]));
});

test('walls in front of the survivor, with them behind, dissolve a straight run at a time; back walls stand, walls they stand before stay and fences never fade', () => {
  const m = map(...Array.from({ length: 12 }, () => '222222222222'));
  const walls: FadingWall[] = [];
  const add = (axis: 'H' | 'V', i: number, j: number, kind = 'brick') => walls.push({ edge: { axis, i, j }, kind, fades: kind !== 'fence', top: 7 });
  // A house from (2, 2) to (7, 7): back walls along j = 2 and i = 2, front walls along j = 8 and i = 8.
  for (let i = 2; i < 8; i++) { add('H', i, 2); add('H', i, 8); }
  for (let j = 2; j < 8; j++) { add('V', 2, j); add('V', 8, j); }
  for (let i = 2; i < 8; i++) add('H', i, 10, 'fence');
  const fade = new WallFade();
  // Inside, near the front wall along j = 8.
  fade.aim(walls, m, { i: 4, j: 7 });
  const going = (axis: 'H' | 'V', line: number) => walls.filter((w) => w.edge.axis === axis && (axis === 'H' ? w.edge.j : w.edge.i) === line).map((w) => fade.target.get(edgeKey(w.edge)) ?? 0);
  assert.deepEqual(going('H', 8), [1, 1, 1, 1, 1, 1]);
  assert.ok(going('H', 2).every((t) => t === 0) && going('V', 2).every((t) => t === 0));
  assert.ok(going('H', 10).every((t) => t === 0));
  // Outside, before the front wall: it stays, though the floor behind it is near.
  fade.aim(walls, m, { i: 4, j: 8 });
  assert.equal(fade.target.size, 0);
  fade.aim(walls, m, { i: 4, j: 9 });
  assert.equal(fade.target.size, 0);
  // Far away, nothing fades; without a survivor neither.
  fade.aim(walls, m, { i: 11, j: 0 });
  assert.equal(fade.target.size, 0);
  fade.aim(walls, m, null);
  assert.equal(fade.target.size, 0);
});
