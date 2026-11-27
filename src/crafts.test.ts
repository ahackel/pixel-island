import { test } from 'node:test';
import assert from 'node:assert/strict';
import loca from './content/loca.json' with { type: 'json' };
import items from './content/items.json' with { type: 'json' };
import { bagWords, BAG_ITEMS, BUILDS, checkItems, checkRecipes, FISH_ITEMS, FOOD, HUT_PLAN, lacking, LOOSE, partsOf, RECIPES, recipeFor, recipeOnto, takeFrom, type BagItem } from './crafts.ts';
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

test('the shipped items and recipes are valid', () => {
  assert.deepEqual(checkItems(items, loca), []);
  assert.deepEqual(checkRecipes(RECIPES, loca), []);
  // Every bag slot says something there is text for, and every food its thought.
  for (const item of BAG_ITEMS) assert.ok(bagWords(item) in loca, `${item}: ${bagWords(item)}`);
});

// What the lists were while they were written in code: the data must give the same.
test('the items as data give the bag, the loose things, the fish and the food the game had, and the Island 2 additions', () => {
  assert.deepEqual(BAG_ITEMS, ['coconut', 'wood', 'fire', 'stone', 'spear', 'fish', 'wrasse', 'snapper', 'crab', 'leaf', 'vine', 'axe', 'rope', 'cloth', 'log', 'hammer', 'crate', 'drift', 'lantern', 'key', 'pot', 'flint', 'fishSoup']);
  assert.deepEqual(LOOSE, ['vine', 'rope', 'cloth', 'log', 'hammer', 'drift', 'pot', 'flint']);
  assert.deepEqual(FISH_ITEMS, ['fish', 'wrasse', 'snapper']);
  assert.deepEqual(FOOD, {
    coconut: { fills: 0.35, label: 'eat', yum: 'think.yum' },
    fish: { fills: 0.5, label: 'eatFish', yum: 'think.yumFish' },
    wrasse: { fills: 0.5, label: 'eatFish', yum: 'think.yumFish' },
    snapper: { fills: 0.5, label: 'eatFish', yum: 'think.yumFish' },
    crab: { fills: 0.5, label: 'eatCrab', yum: 'think.yumCrab' },
    fishSoup: { fills: 0.8, label: 'eatSoup', yum: 'think.yumSoup' },
  });
  assert.deepEqual(RECIPES.map((r) => [r.needs, r.makes]), [[['wood', 'stone'], 'spear'], [['wood', 'stone', 'vine'], 'axe']]);
});

test('bad items and recipes are caught', () => {
  const bad = checkItems({ 'bad id': {}, a: 5, b: { loose: 'yes', group: 3, sparkle: 1 }, e: { loose: true }, c: { food: { fills: 2, label: 'nope', yum: 'nada' } }, d: {} }, loca);
  for (const part of ['bad id', 'not an object', 'loose is true or false', 'group is a name', 'unknown field "sparkle"', 'needs the pickup thought "think.e"', 'fills 0 to 1', 'text "nope"', 'text "nada"', 'no name']) assert.ok(bad.some((l) => l.includes(part)), part);
  assert.deepEqual(checkItems([], loca), ['items: not an object']);
  const worse = checkRecipes([{ needs: ['wood'], makes: 'gold', thought: 'nope' }, { needs: ['wood', 'stone'], makes: 'wood', thought: 'think.spear' }, 4], loca);
  for (const part of ['two or more', 'unknown item "gold"', 'unknown text "nope"', 'makes what it needs', 'not an object']) assert.ok(worse.some((l) => l.includes(part)), part);
  assert.deepEqual(checkRecipes({}, loca), ['recipes: not a list']);
});
