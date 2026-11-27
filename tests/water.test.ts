// The engine's water line (terrain.ts `HeightMap.water`): what is sea, beach and land, and where things stand, all count
// from the map's own water line; a map without one has the sea at level 0, and one with null has no water at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRY, heightAt, isLand, seaFloor, SEA_LEVEL, standingHeight, surfaceAt, waterOf, type HeightMap } from '../engine/world/terrain.ts';
import { endHeights } from '../engine/world/building/building.ts';

/** A map of rows of digits (levels), with a water line. */
const map = (water: number | null | undefined, ...rows: string[]): HeightMap => ({
  w: rows[0].length, h: rows.length, ...(water !== undefined && { water }),
  levels: Int8Array.from(rows.join(''), (ch) => Number(ch)),
});

test('without a water line of its own a map has the sea at level 0, and with null none at all', () => {
  assert.equal(waterOf(map(undefined, '0')), SEA_LEVEL);
  assert.equal(waterOf(map(2, '0')), 2);
  assert.equal(waterOf(map(null, '0')), DRY);
});

test('sea, beach, sand and land count from the water line', () => {
  const m = map(2, '01234', '01234', '01234');
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => surfaceAt(m, i, 1)), ['deep', 'shallow', 'beach', 'sand', 'grass']);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => isLand(m, i, 1)), [false, false, true, true, true]);
  // With no water, nothing is sea and the low ground is land.
  const dry = map(null, '01234', '01234', '01234');
  assert.ok([0, 1, 2, 3, 4].every((i) => isLand(dry, i, 1) && surfaceAt(dry, i, 1) !== 'deep' && surfaceAt(dry, i, 1) !== 'shallow'));
});

test('things stand on the water over sunk ground, and on the ground where there is no water', () => {
  const rows = ['00000', '00000', '00000'];
  assert.equal(standingHeight(map(2, ...rows), 2.5, 1.5), 2);
  assert.equal(standingHeight(map(null, ...rows), 2.5, 1.5), heightAt(map(null, ...rows), 2.5, 1.5));
});

test('the sea floor is smoothed under the water line, and a map at level 0 is drawn as one without a line', () => {
  const rows = ['44444', '43334', '43234', '43334', '44444'];
  const floor = seaFloor(map(4, ...rows));
  // The basin's cells stay under the line, smoothed toward its shore.
  assert.ok(floor.levels[12] > 2 && floor.levels[12] <= 3.75 && floor.levels[6] <= 3.75 && floor.levels[0] === 4);
  const plain = seaFloor(map(undefined, '01111', '00000', '00000'));
  const zero = seaFloor(map(0, '01111', '00000', '00000'));
  assert.deepEqual(Array.from(plain.levels), Array.from(zero.levels));
  // Without water nothing is smoothed.
  assert.deepEqual(Array.from(seaFloor(map(null, ...rows)).levels), Array.from(map(null, ...rows).levels));
});

test('a wall over water stands on the water line', () => {
  const m = map(3, '000', '000');
  assert.deepEqual(endHeights(m, { axis: 'H', i: 1, j: 1 }), [3, 3]);
});
