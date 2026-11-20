import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAG_ITEMS, BUILDS, HUT_PLAN, lacking, recipeFor, takeFrom, type BagItem } from './crafts.ts';
// By path, as node runs the tests without Vite's `@pixel` alias.
import { LOOT } from '../../pixel-art/pixel-art/engine/world/loot.ts';

test('every thing the scene editor can put in a chest is a bag item', () => {
  for (const l of LOOT) assert.ok(BAG_ITEMS.includes(l.id as BagItem), l.id);
});

test('stick and stone make a spear, with a vine in hand an axe', () => {
  assert.equal(recipeFor('wood', 'stone', ['wood', 'stone', 'vine'])?.makes, 'spear');
  assert.equal(recipeFor('vine', 'stone', ['wood', 'stone', 'vine'])?.makes, 'axe');
  assert.equal(recipeFor('vine', 'stone', ['stone', 'vine']), null);
  assert.equal(recipeFor('wood', 'wood', ['wood', 'wood']), null);
});

test('a build stage takes exactly what it needs', () => {
  const bag: BagItem[] = ['leaf', 'leaf', 'axe'];
  assert.deepEqual(lacking('hut', 0, bag), ['drift', 'hammer']);
  bag.push('hammer');
  assert.deepEqual(lacking('hut', 0, bag), ['drift']);
  // The roof goes on a leaf at a time.
  assert.deepEqual(lacking('hut', 4, bag), []);
  takeFrom(bag, BUILDS.hut.stages[4]);
  assert.deepEqual(lacking('hut', 5, bag), []);
  takeFrom(bag, BUILDS.hut.stages[5]);
  assert.deepEqual(lacking('hut', 6, bag), ['leaf']);
  // The hammer is not used up.
  assert.deepEqual(bag, ['axe', 'hammer']);
  assert.deepEqual(lacking('raft', 1, ['log', 'rope']), ['log']);
});

test('the hut plan has a stage for every cost', () => {
  assert.equal(HUT_PLAN.length, BUILDS.hut.stages.length);
  // Four leaves, one over each of the 2×2 cells, after the walls.
  const leaves = HUT_PLAN.flatMap((s) => ('roof' in s ? [`${s.roof.i},${s.roof.j}`] : []));
  assert.deepEqual([...new Set(leaves)].sort(), ['0,0', '0,1', '1,0', '1,1']);
  assert.ok(HUT_PLAN.slice(-4).every((s) => 'roof' in s));
});
