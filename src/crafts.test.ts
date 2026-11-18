import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lacking, recipeFor, takeFrom, type BagItem } from './crafts.ts';

test('stick and stone make a spear, with a vine in hand an axe', () => {
  assert.equal(recipeFor('wood', 'stone', ['wood', 'stone', 'vine'])?.makes, 'spear');
  assert.equal(recipeFor('vine', 'stone', ['wood', 'stone', 'vine'])?.makes, 'axe');
  assert.equal(recipeFor('vine', 'stone', ['stone', 'vine']), null);
  assert.equal(recipeFor('wood', 'wood', ['wood', 'wood']), null);
});

test('a build stage takes exactly what it needs', () => {
  const bag: BagItem[] = ['wood', 'leaf', 'wood', 'axe'];
  assert.deepEqual(lacking('hut', 0, bag), ['wood']);
  bag.push('wood');
  assert.deepEqual(lacking('hut', 0, bag), []);
  takeFrom(bag, ['wood', 'wood', 'wood']);
  assert.deepEqual(bag, ['leaf', 'axe']);
  assert.deepEqual(lacking('raft', 1, ['log', 'rope']), ['log']);
});
