import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chestKey, doorKey, doorState, openDoor, passable, takeFromChest } from './places.ts';
import type { BagItem } from './crafts.ts';
import type { Game } from './save.ts';

const kept = (bag: BagItem[] = []): Pick<Game, 'bag' | 'chests' | 'doors'> => ({ bag, chests: {}, doors: {} });
// The form save.ts checks door keys against when the save is read back.
const SAVED_DOOR = /^[\w-]{1,60}\|[HV]-?\d+,-?\d+$/;

test('a chest gives what fits in the bag and keeps the rest for later', () => {
  const g = kept(['wood', 'wood', 'wood', 'wood', 'wood']);
  const key = chestKey({ i: 3.5, j: 4.5 });
  const first = takeFromChest(g, key, ['rope', 'key', 'not-a-thing'], 6);
  assert.deepEqual(first, { first: true, took: ['rope'] });
  assert.deepEqual(g.chests[key], ['key'], 'what is not a bag item is not kept');
  g.bag.splice(0, 2);
  const again = takeFromChest(g, key, ['rope', 'key'], 6);
  assert.deepEqual(again, { first: false, took: ['key'] }, 'opened again, the loot is what was left, not the loot again');
  assert.deepEqual(g.chests[key], []);
  assert.deepEqual(takeFromChest(g, key, ['rope'], 6), { first: false, took: [] });
});

test('an empty chest is remembered as opened', () => {
  const g = kept();
  assert.deepEqual(takeFromChest(g, chestKey({ i: 1, j: 2 }), undefined, 6), { first: true, took: [] });
  assert.ok('1,2' in g.chests);
});

test('a door is kept as the game left it, else as its scene made it', () => {
  const g = kept();
  const key = doorKey('smuggler-cave', 'H3,-4');
  assert.match(key, SAVED_DOOR);
  assert.equal(doorState(g, key, 'locked'), 'locked');
  g.doors[key] = 'open';
  assert.equal(doorState(g, key, 'locked'), 'open');
});

test('a closed door opens; a locked one only with a key, which stays in the lock', () => {
  const g = kept(['wood', 'key']);
  assert.deepEqual(openDoor(g, 'a|H1,1', 'closed'), { state: 'open', unlocked: false });
  assert.equal(g.doors['a|H1,1'], 'open');
  assert.deepEqual(openDoor(g, 'a|V2,2', 'locked'), { state: 'open', unlocked: true });
  assert.deepEqual(g.bag, ['wood']);
  assert.deepEqual(openDoor(g, 'a|V3,3', 'locked'), { state: 'locked', unlocked: false });
  assert.ok(!('a|V3,3' in g.doors));
  assert.deepEqual(openDoor(g, 'a|V4,4', 'hidden'), { state: 'hidden', unlocked: false }, 'a hidden door is found, not opened');
  assert.deepEqual(openDoor(g, 'a|V5,5', 'open'), { state: 'open', unlocked: false });
});

test('walks are planned through closed doors, and locked ones while a key is in the bag', () => {
  assert.ok(passable('closed', []));
  assert.ok(!passable('locked', []));
  assert.ok(passable('locked', ['key']));
  assert.ok(!passable('hidden', ['key']));
});
