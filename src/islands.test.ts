import { test } from 'node:test';
import assert from 'node:assert/strict';
import loca from './content/loca.json' with { type: 'json' };
import { readFileSync } from 'node:fs';
import { bundle, BUNDLES, bundleOf, TUTORIAL, isStory, questsOf, ROCKY, SCENE_OF } from './islands.ts';
import { checkRules, RULES, type Rule } from './interactions.ts';
import { checkContent, knownGoals, reportedGoals } from './quests.ts';
import { LOOSE } from './crafts.ts';
import { DRIFT_LYING, STONES_OUT, WOOD_LYING } from './shore.ts';

/** Every text a bundle's content may name: the game's, and its own. */
const textsOf = (b: (typeof BUNDLES)[number]) => ({ ...loca, ...b.loca });
const ALL_QUESTS = BUNDLES.flatMap((b) => b.quests);
/** The names of the markers of the scene a story is played on, as the scene editor saved it. */
const markersOf = (id: string): string[] => (JSON.parse(readFileSync(new URL(`./content/scenes/${SCENE_OF[id]}.json`, import.meta.url), 'utf8')).scene.markers ?? []).map((m: { name: string }) => m.name);

test('every island\'s quests are valid, and every goal they wait for is reported by the game or by a rule that island has', () => {
  for (const b of BUNDLES) assert.deepEqual(checkContent(b.quests, textsOf(b), ['crate', ...LOOSE], reportedGoals(b.rules), markersOf(b.id)), [], b.id);
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
  assert.deepEqual(TUTORIAL.rules, RULES);
});

test("a story id names its bundle, and one nobody knows is the tutorial's, as in a save from before there were bundles or from when it was called first", () => {
  assert.equal(bundleOf('rocky'), ROCKY);
  assert.equal(bundleOf('first'), TUTORIAL);
  assert.equal(bundleOf(undefined), TUTORIAL);
  assert.equal(bundleOf('atlantis'), TUTORIAL);
  assert.ok(isStory('rocky') && isStory('tutorial') && !isStory('first') && !isStory('atlantis') && !isStory(3));
  assert.equal(questsOf({ story: 'rocky' }), ROCKY.quests);
  assert.equal(questsOf({ story: 'nowhere' }), TUTORIAL.quests);
});

test("the rocky island begins with the pot washing up, then the first meal, and its quests are not the tutorial's", () => {
  assert.deepEqual(ROCKY.quests.map((q) => q.id), ['wreck', 'meal']);
  assert.equal(ROCKY.quests[0].goal, 'got:pot');
  assert.equal(ROCKY.quests[1].goal, 'made:fishSoup');
  assert.equal(ROCKY.quests[1].now, true);
  assert.ok(!TUTORIAL.quests.some((q) => ROCKY.quests.some((r) => r.id === q.id)));
});

test('every story has a scene, and a marker a quest lays things at must be in it', () => {
  for (const b of BUNDLES) assert.ok(SCENE_OF[b.id], b.id);
  const lines = checkContent([{ id: 'a', goal: 'eat', icon: 'coconut', thought: 'quest.eat', start: [{ washUp: { items: ['crate'], at: 'nowhere' } }, { stones: { n: 2, at: 'stones' } }] }], loca, ['crate'], reportedGoals(RULES), ['stones']);
  assert.deepEqual(lines, ['quest 1, effect 1: no marker "nowhere" in the island\'s scene']);
});

test('every island\'s scene has markers for the morning\'s gifts, as many as can lie about at once', () => {
  const count = (names: string[], kind: string) => names.filter((n) => new RegExp(`^${kind}\\d+$`).test(n)).length;
  for (const b of BUNDLES) {
    const names = markersOf(b.id);
    assert.ok(count(names, 'wood') >= WOOD_LYING && count(names, 'drift') >= DRIFT_LYING && count(names, 'stone') >= STONES_OUT && count(names, 'coconut') >= 2, b.id);
  }
});

test("an island whose story builds the hut has a hut marker in its scene, where it stands", () => {
  for (const b of BUNDLES) if (b.quests.some((q) => q.goal === 'hut')) assert.ok(markersOf(b.id).includes('hut'), b.id);
});
