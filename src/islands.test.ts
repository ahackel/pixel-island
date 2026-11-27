import { test } from 'node:test';
import assert from 'node:assert/strict';
import loca from './content/loca.json' with { type: 'json' };
import { bundle, BUNDLES, bundleOf, FIRST, isStory, questsOf, ROCKY } from './islands.ts';
import { checkRules, RULES, type Rule } from './interactions.ts';
import { checkContent, knownGoals, reportedGoals } from './quests.ts';
import { LOOSE } from './crafts.ts';

/** Every text a bundle's content may name: the game's, and its own. */
const textsOf = (b: (typeof BUNDLES)[number]) => ({ ...loca, ...b.loca });
const ALL_QUESTS = BUNDLES.flatMap((b) => b.quests);

test('every island\'s quests are valid, and every goal they wait for is reported by the game or by a rule that island has', () => {
  for (const b of BUNDLES) assert.deepEqual(checkContent(b.quests, textsOf(b), ['crate', ...LOOSE], reportedGoals(b.rules)), [], b.id);
});

test('every island\'s rules are valid', () => {
  for (const b of BUNDLES) assert.deepEqual(checkRules(b.rules, textsOf(b), knownGoals(ALL_QUESTS)), [], b.id);
});

test('islands have different ids, and what one island\'s texts name is not another\'s or the game\'s', () => {
  assert.equal(new Set(BUNDLES.map((b) => b.id)).size, BUNDLES.length);
  const ids = [...Object.keys(loca), ...BUNDLES.flatMap((b) => Object.keys(b.loca))];
  assert.equal(new Set(ids).size, ids.length, 'a text id is in two places');
});

test('an island\'s own rules come before the shared ones, so it can override, and the shared ones follow', () => {
  const own: Rule = { on: 'crate', do: [{ think: 'think.crate' }] };
  const b = bundle('x', [], [own]);
  assert.equal(b.rules[0], own);
  assert.deepEqual(b.rules.slice(1), RULES);
  assert.deepEqual(FIRST.rules, RULES);
});

test('a story id names its bundle, and one nobody knows is the first island\'s, as in a save from before there were bundles', () => {
  assert.equal(bundleOf('rocky'), ROCKY);
  assert.equal(bundleOf('first'), FIRST);
  assert.equal(bundleOf(undefined), FIRST);
  assert.equal(bundleOf('atlantis'), FIRST);
  assert.ok(isStory('rocky') && isStory('first') && !isStory('atlantis') && !isStory(3));
  assert.equal(questsOf({ story: 'rocky' }), ROCKY.quests);
  assert.equal(questsOf({ story: 'nowhere' }), FIRST.quests);
});

test('the rocky island begins with the pot washing up, then the first meal, and its quests are not the first island\'s', () => {
  assert.deepEqual(ROCKY.quests.map((q) => q.id), ['wreck', 'meal']);
  assert.equal(ROCKY.quests[0].goal, 'got:pot');
  assert.equal(ROCKY.quests[1].goal, 'made:fishSoup');
  assert.equal(ROCKY.quests[1].now, true);
  assert.ok(!FIRST.quests.some((q) => ROCKY.quests.some((r) => r.id === q.id)));
});
