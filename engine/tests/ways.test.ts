// The engine's ways (ways.ts): a ladder stands only on a step of two levels or more between floors, a hole's ladder
// leans on the floor at its back, climbs go foot to top and back, doors fit between floors a step apart, and what
// is read back is checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUT, HOLE } from '../engine/world/ground.ts';
import { cleanDoors, cleanLadders, climbDown, climbOf, doorFits, holeLadder, ladderOn, ladderSpots } from '../engine/world/ways.ts';
import type { HeightMap } from '../engine/world/terrain.ts';

/** A map of rows of digits (levels), all cut ground, without water; `h` in a row is a hole at level 2. */
const map = (...rows: string[]): HeightMap => {
  const flat = rows.join('');
  return {
    w: rows[0].length, h: rows.length, water: null,
    levels: Int8Array.from(flat, (ch) => (ch === 'h' ? 2 : Number(ch))),
    shape: Uint8Array.from(flat, (ch) => (ch === 'h' ? HOLE : CUT)),
  };
};

test('a ladder goes up a step of two levels or more, from the lower floor to the higher', () => {
  const m = map('5522', '5522', '3322');
  // Between (1, 0) at 5 and (2, 0) at 2: a V edge at i = 2.
  const L = ladderOn(m, { axis: 'V', i: 2, j: 0 })!;
  assert.deepEqual([L.foot, L.top, L.low, L.high, L.hole], [[2, 0], [1, 0], 2, 5, false]);
  // One level is a step anyone takes: no ladder.
  assert.equal(ladderOn(m, { axis: 'V', i: 2, j: 2 }), null);
  // Flat ground: none either.
  assert.equal(ladderOn(m, { axis: 'H', i: 3, j: 1 }), null);
  // Its foot stands before the face, in the lower cell; its top a step onto the higher.
  const { foot, top } = ladderSpots(L);
  assert.ok(foot.i > 2 && foot.i < 2.5 && top.i < 2 && top.i > 1.5 && foot.j === 0.5 && top.j === 0.5);
  // Up: at the foot from the low floor, up the face, onto the top; down the same backwards.
  const up = climbOf(L, true);
  assert.deepEqual(up.map((p) => p.level), [2, 5, 5]);
  assert.deepEqual(climbOf(L, false), [...up].reverse());
});

test("a hole's ladder leans on the floor at its back, or the next floor round", () => {
  const m = map('222', '2h2', '222');
  // Turn 0: the back is toward -j.
  const L = holeLadder(m, 1, 1, 0)!;
  assert.deepEqual([L.top, L.hole, L.low], [[1, 0], true, 2]);
  assert.deepEqual(holeLadder(m, 1, 1, 1)!.top, [2, 1]);
  // Rock behind: it turns to the next floor round.
  const walled = map('292', '2h2', '222');
  walled.levels[1] = 30;
  assert.deepEqual(holeLadder(walled, 1, 1, 0)!.top, [2, 1]);
  assert.equal(holeLadder(m, 0, 0), null);
  // Climbing down it ends below the rim, out of sight.
  assert.ok(climbDown(L).at(-1)!.level < L.low);
});

test('a door fits between two floors a step apart at most; what is read back is checked', () => {
  const m = map('2234', '2234');
  assert.ok(doorFits(m, { axis: 'V', i: 1, j: 0 }));
  assert.ok(doorFits(m, { axis: 'V', i: 2, j: 0 }));
  assert.ok(!doorFits(m, { axis: 'V', i: 0, j: 0 }), 'off the map on one side');
  const doors = cleanDoors([
    { edge: { axis: 'V', i: 1, j: 0 }, kind: 'wood', state: 'locked', key: 'iron' },
    { edge: { axis: 'V', i: 1, j: 0 }, kind: 'wood', state: 'open' },
    { edge: { axis: 'H', i: 9, j: 0 }, kind: 'wood', state: 'open' },
    { edge: { axis: 'H', i: 1, j: 1 }, kind: 'gold', state: 'ajar', to: { scene: 'cave', id: 'ladder1' } },
  ], 4, 2);
  // One per edge (the last wins), off the map dropped, an unknown kind or state made the first, one that leads somewhere named.
  assert.equal(doors.length, 2);
  assert.equal(doors[0].state, 'open');
  assert.deepEqual([doors[1].kind, doors[1].state, doors[1].id, doors[1].to], ['wood', 'closed', 'door1', { scene: 'cave', id: 'ladder1' }]);
  assert.deepEqual(cleanLadders([{ edge: { axis: 'V', i: 2, j: 0 } }, { edge: { axis: 'Q' } }, null], 4, 2), [{ edge: { axis: 'V', i: 2, j: 0 } }]);
});
