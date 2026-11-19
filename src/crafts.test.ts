import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDS, HUT_PLAN, lacking, recipeFor, takeFrom, type BagItem } from './crafts.ts';

test('stick and stone make a spear, with a vine in hand an axe', () => {
  assert.equal(recipeFor('wood', 'stone', ['wood', 'stone', 'vine'])?.makes, 'spear');
  assert.equal(recipeFor('vine', 'stone', ['wood', 'stone', 'vine'])?.makes, 'axe');
  assert.equal(recipeFor('vine', 'stone', ['stone', 'vine']), null);
  assert.equal(recipeFor('wood', 'wood', ['wood', 'wood']), null);
});

test('a build stage takes exactly what it needs', () => {
  const bag: BagItem[] = ['leaf', 'leaf', 'axe'];
  assert.deepEqual(lacking('hut', 0, bag), ['wood', 'hammer']);
  bag.push('hammer');
  assert.deepEqual(lacking('hut', 0, bag), ['wood']);
  assert.deepEqual(lacking('hut', 4, bag), ['leaf']);
  bag.push('leaf');
  assert.deepEqual(lacking('hut', 4, bag), []);
  takeFrom(bag, BUILDS.hut.stages[4]);
  // The hammer is not used up.
  assert.deepEqual(bag, ['axe', 'hammer']);
  assert.deepEqual(lacking('raft', 1, ['log', 'rope']), ['log']);
});

test('the hut plan has a stage for every cost', () => {
  assert.equal(HUT_PLAN.length, BUILDS.hut.stages.length);
  assert.equal(HUT_PLAN.at(-1), 'roof');
});
