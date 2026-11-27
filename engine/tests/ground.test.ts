// The engine's ground shapes (ground.ts): smooth ground shares its corners, cut ground is flat with hard steps, a ramp
// runs between the floors at its ends, a hole has no floor; and a walker crosses an edge only where both its ends meet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUT, defaultShape, edgeWalkable, HOLE, RAMP, SMOOTH, standable, topOf, turnShape } from '../engine/world/ground.ts';
import { cornersOf, heightAt, type HeightMap } from '../engine/world/terrain.ts';

/** A map of rows of digits (levels) and a row of shapes per row: `.` smooth, `c` cut, `>` `<` `v` `^` ramps, `o` hole. */
const map = (rows: string[], shapes?: string[]): HeightMap => ({
  w: rows[0].length, h: rows.length, water: null, outside: 30,
  levels: Int8Array.from(rows.join(''), (ch) => Number(ch)),
  ...(shapes && { shape: Uint8Array.from(shapes.join(''), (ch) => ({ '.': SMOOTH, c: CUT, '>': RAMP, '<': RAMP + 1, v: RAMP + 2, '^': RAMP + 3, o: HOLE })[ch]!) }),
});

test('smooth neighbours share their corners, so they meet without a step', () => {
  const m = map(['0122', '0122', '0122'], ['....', '....', '....']);
  for (let i = 0; i < 3; i++) {
    const a = cornersOf(m, i, 1), b = cornersOf(m, i + 1, 1);
    assert.equal(a[1], b[0]);
    assert.equal(a[2], b[3]);
  }
});

test('cut ground is flat at its level, with a step to the smooth ground beside it', () => {
  const m = map(['1155', '1155', '1155'], ['..cc', '..cc', '..cc']);
  assert.deepEqual(cornersOf(m, 2, 1), [5, 5, 5, 5]);
  // The smooth side does not slope up to the cut ground: its corners are the mean of the smooth cells only.
  assert.deepEqual(cornersOf(m, 1, 1), [1, 1, 1, 1]);
  assert.ok(!edgeWalkable(m, 1, 1, 2, 1));
});

test('a single raised cell shows its level in its middle', () => {
  const m = map(['111', '141', '111'], ['...', '...', '...']);
  const top = topOf(m, 1, 1);
  assert.equal(top.mid, 4);
  assert.equal(heightAt(m, 1.5, 1.5), 4);
});

test('a ramp runs evenly between the floors at its ends, a share per cell', () => {
  // Floor at 0 on the left, at 6 on the right, two ramp cells rising toward +i between.
  const m = map(['0006', '0006'], ['c>>c', 'c>>c']);
  assert.deepEqual(cornersOf(m, 1, 0), [0, 3, 3, 0]);
  assert.deepEqual(cornersOf(m, 2, 0), [3, 6, 6, 3]);
  assert.ok(edgeWalkable(m, 0, 0, 1, 0) && edgeWalkable(m, 1, 0, 2, 0) && edgeWalkable(m, 2, 0, 3, 0));
  // Without a higher floor at its top end, it is cut ground at its own level.
  const flat = map(['0000', '0000'], ['c>>c', 'c>>c']);
  assert.deepEqual(cornersOf(flat, 1, 0), [0, 0, 0, 0]);
});

test('a hole has no floor to stand on, and steep smooth ground cannot be walked', () => {
  const m = map(['333', '333', '333'], ['ccc', 'coc', 'ccc']);
  assert.ok(!standable(m, 1, 1) && standable(m, 0, 0));
  const steep = map(['000', '090', '000'], ['...', '...', '...']);
  assert.ok(!standable(steep, 1, 1));
});

test('ground from before shapes is smooth but for the higher cell of a step over two levels, which is cut', () => {
  const m = map(['0125', '0125']);
  assert.deepEqual(Array.from(defaultShape(m)), [SMOOTH, SMOOTH, SMOOTH, CUT, SMOOTH, SMOOTH, SMOOTH, CUT]);
});

test('ramps turn with the view, and back', () => {
  for (let d = 0; d < 4; d++) {
    for (let k = 0; k < 4; k++) assert.equal(turnShape(turnShape(RAMP + d, k), -k), RAMP + d);
    assert.equal(turnShape(RAMP + d, 4), RAMP + d);
  }
  // Rising toward +i, turned a quarter, rises toward +j.
  assert.equal(turnShape(RAMP, 1), RAMP + 2);
  assert.equal(turnShape(CUT, 1), CUT);
});
