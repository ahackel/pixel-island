// The engine's rule for solid rock (terrain.ts `ROCK_LEVEL`): rock is high ground that is no ground, so the floor
// beside it keeps its own height and walls stand on the floor, not on the rock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cornersOf, heightAt, isLand, isRock, ROCK_LEVEL, setLevel, type HeightMap } from '../engine/world/terrain.ts';
import { endHeights } from '../engine/world/building/building.ts';

const FLOOR = 3;
/** A cave of rows of text: `#` rock, `.` floor at FLOOR, and rock beyond the map. */
const cave = (...rows: string[]): HeightMap => ({
  w: rows[0].length, h: rows.length, outside: ROCK_LEVEL,
  levels: Int8Array.from(rows.join(''), (ch) => (ch === '#' ? ROCK_LEVEL : FLOOR)),
});

test('floor next to rock and at the map edge stays flat', () => {
  const map = cave('###', '#..', '#..');
  for (const [i, j] of [[1, 1], [2, 1], [1, 2], [2, 2]]) assert.deepEqual(cornersOf(map, i, j), [FLOOR, FLOOR, FLOOR, FLOOR]);
  assert.equal(heightAt(map, 1.1, 1.1), FLOOR);
});

test('rock has a flat top, and is neither land nor walkable ground', () => {
  const map = cave('###', '#..', '#..');
  assert.deepEqual(cornersOf(map, 0, 0), [ROCK_LEVEL, ROCK_LEVEL, ROCK_LEVEL, ROCK_LEVEL]);
  assert.ok(isRock(ROCK_LEVEL) && !isRock(FLOOR));
  assert.ok(!isLand(map, 0, 0) && isLand(map, 1, 1));
});

test('a wall between rock and floor stands on the floor, whichever side the rock is', () => {
  const map = cave('###', '#..', '#..');
  // Rock behind (north of) the edge, floor in front.
  assert.deepEqual(endHeights(map, { axis: 'H', i: 1, j: 1 }), [FLOOR, FLOOR]);
  // Rock behind (west of) the edge.
  assert.deepEqual(endHeights(map, { axis: 'V', i: 1, j: 1 }), [FLOOR, FLOOR]);
  // Rock in front: floor at row 1, rock in a row 2 that is all rock.
  const front = cave('...', '###');
  assert.deepEqual(endHeights(front, { axis: 'H', i: 1, j: 1 }), [FLOOR, FLOOR]);
});

test('setting a level keeps rock as rock and ground within its range', () => {
  const map = cave('..', '..');
  setLevel(map, 0, 0, 40);
  setLevel(map, 1, 0, 20);
  assert.equal(map.levels[0], ROCK_LEVEL);
  assert.ok(!isRock(map.levels[1]));
});
