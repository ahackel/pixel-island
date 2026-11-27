import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST, ROCKY } from './islands.ts';
import { checkStory, HANDLER_YIELDS, NATURAL } from './story.ts';
import { HANDLERS } from './effects.ts';
import type { Effect } from './effects.ts';
import type { Quest } from './quests.ts';

/** The first island's quests with `change` done to the one called `id`. */
const first = (id: string, change: (q: Quest) => Quest | null): Quest[] => FIRST.quests.flatMap((q) => (q.id === id ? change(structuredClone(q)) ?? [] : [q]));
const story = (quests: readonly Quest[], rules = FIRST.rules) => checkStory(quests, rules);
const noStart = (q: Quest): Quest => ({ ...q, start: undefined });
const without = (key: string) => (q: Quest): Quest => ({ ...q, start: q.start?.filter((e) => !(key in e)) });
/** Only the one line about quest `id` that the others do not already say. */
const about = (lines: string[], id: string) => lines.filter((l) => l.includes(`"${id}"`));

test('the first island can be finished: every goal, in order, can be reached with what the quests before it bring', () => {
  assert.deepEqual(story(FIRST.quests), []);
});

test('the rocky island, as far as it goes, can be finished too: the pot, the torch from flint, the spear from stones, the soup', () => {
  assert.deepEqual(checkStory(ROCKY.quests, ROCKY.rules), []);
});

test('every handler says what it yields, and what is always to be had is only what grows or washes up by itself', () => {
  assert.deepEqual(Object.keys(HANDLER_YIELDS).sort(), [...HANDLERS].sort());
  assert.deepEqual([...NATURAL], ['coconut', 'wood', 'drift']);
});

test('a quest whose task needs what no quest brings is caught, and says what is missing', () => {
  // The axe is a stick, a stone and a vine: the vine comes with the axe quest.
  const noVine = story(first('axe', (q) => ({ ...q, start: [] })));
  assert.ok(about(noVine, 'axe')[0].includes('nothing gives axe'), noVine.join('\n'));
  // And with no axe there are no logs, so the raft cannot be built either: what fails later is reported too.
  assert.ok(about(noVine, 'raft')[0].includes('nothing gives log'), noVine.join('\n'));
  assert.equal(noVine.length, 2);
  // The hut is nailed together with the hammer.
  assert.ok(about(story(first('hut', (q) => ({ ...q, start: q.start!.filter((e) => !('washUp' in e)) }))), 'hut')[0].includes('nothing gives hammer'));
  // The crate has to wash up to be opened.
  assert.ok(about(story(first('crate', noStart)), 'crate')[0].includes('no crate'));
  // The spear is a stick and a stone, and the stones come with the fish quest.
  assert.ok(about(story(first('fish', noStart)), 'fish')[0].includes('nothing gives spear'));
  // The raft needs the sailcloth.
  assert.ok(about(story(first('raft', noStart)), 'raft')[0].includes('nothing gives cloth'));
});

test('a fire from lightning needs the lightning, and the storm and the crabs need their weather', () => {
  const noStrike = about(story(first('fire', without('strike'))), 'fire');
  assert.equal(noStrike.length, 1);
  assert.ok(noStrike[0].includes('fire'), noStrike[0]);
  assert.ok(about(story(first('crab', without('weather'))), 'crab')[0].includes('windy'));
  assert.ok(about(story(first('storm', without('weather'))), 'storm')[0].includes('no storm'));
  // Sleeping out a storm needs the hut built before.
  assert.ok(about(story(FIRST.quests.filter((q) => q.id !== 'hut')), 'storm')[0].includes('no hut'));
});

test('a quest that waits for what comes later in the story is caught: the order matters', () => {
  const raft = FIRST.quests.find((q) => q.id === 'raft')!;
  const early = story([raft, ...FIRST.quests.filter((q) => q.id !== 'raft')]);
  assert.ok(about(early, 'raft')[0].includes('nothing gives'), early.join('\n'));
  assert.ok(about(early, 'raft')[0].includes('quest 1'));
});

test('goals about items and meals are followed too: what nothing gives, nothing makes, and what no rule can do', () => {
  const quest = (goal: string, start?: Quest['start']): Quest => ({ id: 'x', goal, icon: 'moon', thought: 'quest.eat', start });
  const pot: Effect = { washUp: ['pot'] };
  assert.deepEqual(story([quest('got:pot', [pot])]), []);
  assert.ok(story([quest('got:pot')])[0].includes('nothing gives pot'));
  assert.deepEqual(story([quest('got:coconut')]), []);
  assert.deepEqual(story([quest('ate:coconut')]), []);
  assert.ok(story([quest('ate:stone')])[0].includes('no stone to eat'));
  assert.deepEqual(story([quest('made:spear', [{ stones: 1 }])]), []);
  assert.ok(story([quest('made:spear')])[0].includes('stone'));
  assert.ok(story([quest('made:pot')])[0].includes('no recipe or rule makes pot'));
  assert.ok(story([quest('dance')])[0].includes('nothing reports it'));
  // Cooking needs the pot, a fish (so a spear, so stones), and a fire (so flint and a stick).
  const soup = (start: Quest['start']) => story([quest('made:fishSoup', start)]);
  assert.deepEqual(soup([{ washUp: ['pot', 'flint'] }, { stones: 1 }]), []);
  assert.ok(soup([{ washUp: ['flint'] }, { stones: 1 }])[0].includes('nothing to hold of pot'));
  assert.ok(soup([{ washUp: ['pot'] }, { stones: 1 }])[0].includes('no lit campfire'));
  assert.ok(soup([{ washUp: ['pot', 'flint'] }])[0].includes('no fish in the bag'));
});

test('an empty story needs nothing, and a quest can use what its own start brings', () => {
  assert.deepEqual(story([]), []);
  assert.deepEqual(story([{ id: 'x', goal: 'fish', icon: 'fish', thought: 'quest.fish', start: [{ stones: 2 }] }]), []);
});
