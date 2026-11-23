import { test } from 'node:test';
import assert from 'node:assert/strict';
import loca from './content/loca.json' with { type: 'json' };
import { advance, checkContent, next, QUESTS, startProgress, stonesOut, waiting, type Quest } from './quests.ts';
import { LOOSE } from './crafts.ts';

test('the shipped quests and texts are valid', () => {
  assert.deepEqual(checkContent(QUESTS, loca, ['crate', ...LOOSE]), []);
});

test('bad quests and texts are caught', () => {
  const bad = checkContent([{ id: 'a', goal: 'dance', weather: 'snow', count: 0, icon: 'x', thought: 'nope', washUps: ['boat'] }, { id: 'a' }], { 'bad id': { en: 1 } }, ['crate']);
  for (const part of ['dance', 'snow', 'count', 'icon', 'nope', 'boat', 'repeated', 'bad id', 'needs en']) assert.ok(bad.some((l) => l.includes(part)), part);
});

const chain: Quest[] = [
  { id: 'a', goal: 'eat', icon: 'coconut', thought: 't' },
  { id: 'b', goal: 'sleep', now: true, icon: 'moon', thought: 't' },
  { id: 'c', goal: 'log', count: 2, icon: 'axe', thought: 't' },
];

test('only the current quest counts, and a done one waits for its morning unless the next says now', () => {
  let p = startProgress();
  // Not this quest's goal: nothing.
  assert.equal(advance(p, 'log', chain), p);
  p = advance(p, 'eat', chain);
  assert.equal(p.done, true);
  // The sleep quest starts at once.
  p = next(p, false, chain);
  assert.deepEqual(p, { quest: 1, count: 0, done: false });
  p = advance(p, 'sleep', chain);
  // The log quest waits for the morning.
  assert.equal(next(p, false, chain), p);
  p = next(p, true, chain);
  assert.equal(p.quest, 2);
  p = advance(advance(p, 'log', chain), 'log', chain);
  assert.equal(p.done, true);
  // The last quest stays.
  assert.equal(next(p, true, chain), p);
});

test('what a task needs only comes with its own quest', () => {
  const brings = (item: string) => QUESTS.findIndex((q) => q.washUps?.includes(item));
  const of = (id: string) => QUESTS.findIndex((q) => q.id === id);
  assert.equal(brings('hammer'), of('hut'));
  assert.equal(brings('vine'), of('axe'));
  assert.equal(brings('cloth'), of('raft'));
  assert.equal(brings('crate'), of('crate'));
  assert.equal(stonesOut(of('fish') - 1), false);
  assert.equal(stonesOut(of('fish')), true);
  assert.equal(QUESTS.findIndex((q) => q.strike), of('fire'));
  // Crabs come out only on windy days: the crab quest's, and none before it.
  assert.equal(QUESTS.findIndex((q) => q.weather === 'windy'), of('crab'));
  // The storm comes in the night the hut is done, and the fire from the storm the morning after.
  assert.equal(QUESTS[of('storm') - 1].id, 'hut');
  assert.equal(QUESTS[of('storm')].night, true);
  assert.equal(QUESTS[of('storm')].weather, 'storm');
  assert.equal(QUESTS[of('fire') - 1].id, 'storm');
  // The fire quest brings no weather of its own: the storm has blown over by its morning.
  assert.equal(QUESTS[of('fire')].weather, undefined);
});

test('every quest that needs its own weather says so, and no quest asks for rain out of turn', () => {
  // Rain and storms come only with the hut and the storm; the rest of the week is fair or whatever lasts.
  assert.deepEqual(QUESTS.filter((q) => q.weather === 'rain' || q.weather === 'storm').map((q) => q.id), ['hut', 'storm']);
});

test('a done quest waits for the next one only when that one waits for the morning', () => {
  const done = (quest: number) => ({ quest, count: 0, done: true });
  // The next starts at once: nothing to wait for.
  assert.equal(waiting(done(0), chain), null);
  assert.equal(waiting(done(1), chain), chain[2]);
  // The last quest: none comes after it.
  assert.equal(waiting(done(2), chain), null);
  assert.equal(waiting({ quest: 1, count: 0, done: false }, chain), null);
});
