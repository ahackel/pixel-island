import { test } from 'node:test';
import assert from 'node:assert/strict';
import loca from './content/loca.json' with { type: 'json' };
import { bagWords, FOOD, BAG_ITEMS, BUILDS, HUT_PLAN, lacking, partsOf, recipeFor, recipeOnto, takeFrom, type BagItem } from './crafts.ts';
import { LOOT } from '@pixel/engine/world/loot.ts';

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

test('a bag slot dragged onto another ties with what fits, lighting the other parts it would use', () => {
  const bag: BagItem[] = ['stone', 'coconut', 'vine', 'wood'];
  assert.equal(recipeOnto(bag, 3, 0)?.makes, 'spear');
  assert.equal(recipeOnto(bag, 2, 0)?.makes, 'axe');
  assert.equal(recipeOnto(bag, 3, 3), null, 'not onto itself');
  assert.equal(recipeOnto(bag, 3, -1), null, 'not off the bag');
  assert.equal(recipeOnto(bag, 3, 7), null, 'not onto an empty slot');
  assert.equal(recipeOnto(bag, 1, 0), null);
  assert.deepEqual([...partsOf(bag, 2, 0)], [3], 'the axe takes the stick too');
  assert.deepEqual([...partsOf(bag, 3, 0)], []);
  assert.deepEqual([...partsOf(bag, 1, 0)], []);
});

test('every bag slot says something there is text for, and every food its thought', () => {
  for (const item of BAG_ITEMS) assert.ok(bagWords(item) in loca, `${item}: ${bagWords(item)}`);
  for (const [item, food] of Object.entries(FOOD)) {
    assert.ok(food.yum in loca, `${item}: ${food.yum}`);
    assert.ok(food.fills > 0 && food.fills <= 1, item);
  }
});
