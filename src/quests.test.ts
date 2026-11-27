import { test } from 'node:test';
import assert from 'node:assert/strict';
import loca from './content/loca.json' with { type: 'json' };
import { advance, checkContent, ITEM_GOALS, knownGoals, next, QUESTS, reportedGoals, startProgress, stonesOut, waiting, weatherOf, type Quest } from './quests.ts';
import { RULES } from './interactions.ts';
import { LOOSE } from './crafts.ts';

const REPORTED = reportedGoals(RULES);

test('the shipped quests and texts are valid, and every goal a quest waits for is reported by something', () => {
  assert.deepEqual(checkContent(QUESTS, loca, ['crate', ...LOOSE], REPORTED), []);
});

test('a quest\'s picture is any bag item\'s or an extra one, and an unknown one is caught', () => {
  const lines = (icon: string) => checkContent([{ id: 'a', goal: 'eat', icon, thought: 'quest.eat' }], loca, [], REPORTED);
  for (const icon of ['coconut', 'axe', 'moon', 'storm', 'raft']) assert.deepEqual(lines(icon), [], icon);
  assert.deepEqual(lines('dragon'), ['quest 1: unknown icon "dragon"']);
});

test('bad quests and texts are caught', () => {
  const bad = checkContent([{ id: 'a', goal: 'dance', count: 0, icon: 'x', thought: 'nope', start: [{ weather: 'snow' }, { washUp: ['boat'] }, { stones: 0 }, { reach: 'eat' }, { room: true }] }, { id: 'a' }], { 'bad id': { en: 1 } }, ['crate'], REPORTED);
  for (const part of ['dance', 'snow', 'count', 'icon', 'nope', 'boat', 'stones must be', '"reach" is not for a quest', '"room" is not for a quest', 'repeated', 'bad id', 'needs en']) assert.ok(bad.some((l) => l.includes(part)), part);
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
  const brings = (item: string) => QUESTS.findIndex((q) => q.start?.some((e) => 'washUp' in e && e.washUp.includes(item)));
  const of = (id: string) => QUESTS.findIndex((q) => q.id === id);
  assert.equal(brings('hammer'), of('hut'));
  assert.equal(brings('vine'), of('axe'));
  assert.equal(brings('cloth'), of('raft'));
  assert.equal(brings('crate'), of('crate'));
  assert.equal(stonesOut(of('fish') - 1), false);
  assert.equal(stonesOut(of('fish')), true);
  assert.equal(QUESTS.findIndex((q) => q.start?.some((e) => 'strike' in e)), of('fire'));
  // Crabs come out only on windy days: the crab quest's, and none before it.
  assert.equal(QUESTS.findIndex((q) => weatherOf(q) === 'windy'), of('crab'));
  // The storm comes in the night the hut is done, and the fire from the storm the morning after.
  assert.equal(QUESTS[of('storm') - 1].id, 'hut');
  assert.equal(QUESTS[of('storm')].night, true);
  assert.equal(weatherOf(QUESTS[of('storm')]), 'storm');
  assert.equal(QUESTS[of('fire') - 1].id, 'storm');
  // The fire quest brings no weather of its own: the storm has blown over by its morning.
  assert.equal(weatherOf(QUESTS[of('fire')]), undefined);
});

test('every quest that needs its own weather says so, and no quest asks for rain out of turn', () => {
  // Rain and storms come only with the hut and the storm; the rest of the week is fair or whatever lasts.
  assert.deepEqual(QUESTS.filter((q) => weatherOf(q) === 'rain' || weatherOf(q) === 'storm').map((q) => q.id), ['hut', 'storm']);
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

test('a quest waits only for what is reported: its goal by the game or by a rule, and a goal no rule reaches is caught', () => {
  const lines = checkContent([{ id: 'dig', goal: 'dig', icon: 'moon', thought: 'quest.eat' }], loca, [], REPORTED);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('nothing reports the goal "dig"'));
  // A rule that reaches it makes it reported.
  const rules = [{ do: [{ think: 'think.crate' }, { reach: 'dig' }] }];
  assert.deepEqual(checkContent([{ id: 'dig', goal: 'dig', icon: 'moon', thought: 'quest.eat' }], loca, [], reportedGoals([...RULES, ...rules] as never)), []);
});

test('the start effects are done in the order written, and weather and stones are found among them', () => {
  const q: Quest = { id: 'a', goal: 'eat', icon: 'coconut', thought: 't', start: [{ stones: 2 }, { weather: 'fog' }, { washUp: ['crate'] }] };
  assert.equal(weatherOf(q), 'fog');
  assert.equal(weatherOf({ ...q, start: [{ stones: 2 }] }), undefined);
  assert.equal(weatherOf({ id: 'b', goal: 'eat', icon: 'coconut', thought: 't' }), undefined);
  assert.equal(weatherOf(undefined), undefined);
  assert.equal(stonesOut(0, [q]), true);
  assert.equal(stonesOut(0, [{ ...q, start: [{ weather: 'fog' }] }]), false);
});

test('the game reports what happens to items, and the checks know which goals those are', () => {
  for (const goal of ['got:pot', 'got:fish', 'got:fishSoup', 'ate:coconut', 'ate:fishSoup', 'made:spear', 'made:axe']) assert.ok(ITEM_GOALS.includes(goal), goal);
  // Only food is eaten, and only what a recipe makes is made by itself.
  for (const goal of ['ate:stone', 'ate:pot', 'made:pot', 'made:fishSoup']) assert.ok(!ITEM_GOALS.includes(goal), goal);
  // A rule may reach `made:` of any item (cooking does), and a quest may wait for what rules reach.
  assert.ok(knownGoals(QUESTS).includes('made:fishSoup'));
  assert.ok(reportedGoals(RULES).includes('made:fishSoup'));
  const waits = (goal: string) => checkContent([{ id: 'a', goal, icon: 'pot', thought: 'quest.eat' }], loca, [], REPORTED);
  assert.deepEqual(waits('got:pot'), []);
  assert.deepEqual(waits('ate:fishSoup'), []);
  assert.deepEqual(waits('made:fishSoup'), []);
  assert.equal(waits('made:pot').length, 1);
  assert.equal(waits('got:gold').length, 1);
});
