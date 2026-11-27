import { test } from 'node:test';
import assert from 'node:assert/strict';
import loca from './content/loca.json' with { type: 'json' };
import { checkRules, ruleFor, RULES, type Condition, type Rule } from './interactions.ts';
import { HANDLERS, idle, run, type Doer } from './effects.ts';
import { CODE_GOALS, QUESTS, wantedGoals } from './quests.ts';
import type { BagItem } from './crafts.ts';

/** Every goal that exists: the game's own, and those quests wait for. */
const GOALS = [...CODE_GOALS, ...wantedGoals(QUESTS)];

const none = () => false;
/** What a rule does, as a list of lines. `full`: the bag has no room. */
function doing(rule: Rule, full = false): string[] {
  const log: string[] = [];
  const d: Doer = { ...idle, think: (id) => log.push(`think ${id}`), reach: (g) => log.push(`reach ${g}`), give: (i) => log.push(`give ${i}`), full: () => full, call: (h) => log.push(`call ${h}`) };
  run(rule.do, d);
  return log;
}
const on = (target: Rule['on'], hand: BagItem | null, yes: Condition[] = []) => {
  const r = ruleFor(target, hand, (c) => yes.includes(c));
  return r && doing(r);
};

test('the shipped interactions are valid', () => {
  assert.deepEqual(checkRules(RULES, loca, GOALS), []);
});

test('every handler is used by a rule, so none is left over', () => {
  const used = new Set(RULES.flatMap((r) => r.do.flatMap((e) => ('call' in e ? [e.call] : []))));
  assert.deepEqual(HANDLERS.filter((h) => !used.has(h)), []);
});

test('bad interactions are caught', () => {
  const bad = checkRules(
    [{ on: 'door', do: [{ think: 'think.crate' }] }, { on: 'crate', hand: 'sword', do: [{ think: 'nope' }, { reach: 'dance' }, { give: 'gold' }, { call: 'explode' }, { room: 1 }, { think: 'think.crate', reach: 'eat' }, { wave: 1 }] }, { on: 'palm', when: 'rainy', do: [] }, 5],
    loca,
    GOALS,
  );
  for (const part of ['target "door"', 'hand "sword"', 'text "nope"', 'goal "dance"', 'item "gold"', 'handler "explode"', 'room is written as true', 'exactly one', 'effect "wave"', 'condition "rainy"', 'list of effects', 'not an object']) {
    assert.ok(bad.some((l) => l.includes(part)), part);
  }
  assert.deepEqual(checkRules('nope', loca, GOALS), ['interactions: not a list']);
  // What belongs to a quest's start is not for a hand on a thing.
  const start = checkRules([{ on: 'crate', do: [{ weather: 'rain' }, { washUp: ['crate'] }, { stones: 2 }, { strike: true }] }], loca, GOALS);
  assert.equal(start.filter((l) => l.includes('is not for an interaction')).length, 4);
});

test('a rule an earlier one always wins over is caught', () => {
  const rules: Rule[] = [
    { on: 'crate', do: [{ think: 'think.crate' }] },
    { on: 'crate', hand: 'stone', do: [{ think: 'think.smashed' }] },
    { on: 'palm', hand: ['axe', 'stone'], do: [{ think: 'think.tooSmall' }] },
    { on: 'palm', hand: 'axe', do: [{ think: 'think.felled' }] },
    { on: 'palm', hand: 'axe', when: 'tall', do: [{ think: 'think.felled' }] },
    { on: 'stump', hand: 'wood', when: 'tall', do: [{ think: 'think.haveFire' }] },
    { on: 'stump', hand: 'wood', do: [{ think: 'think.needStick' }] },
  ];
  const lines = checkRules(rules, loca, GOALS);
  assert.deepEqual(lines.map((l) => l.slice(0, 14)), ['interaction 2:', 'interaction 4:', 'interaction 5:']);
});

test('the first rule that fits wins, and a hand that fits none gets none', () => {
  const rules: Rule[] = [
    { on: 'palm', hand: 'axe', when: 'tall', do: [{ think: 'a' }] },
    { on: 'palm', hand: 'axe', do: [{ think: 'b' }] },
  ];
  assert.equal(ruleFor('palm', 'axe', () => true, rules), rules[0]);
  assert.equal(ruleFor('palm', 'axe', none, rules), rules[1]);
  assert.equal(ruleFor('palm', null, none, rules), null);
  assert.equal(ruleFor('crate', 'axe', none, rules), null);
});

test('a full bag stops a rule at its room effect, saying so', () => {
  const r = ruleFor('palm', null, none)!;
  assert.deepEqual(doing(r, false), ['give leaf', 'think think.leaf']);
  assert.deepEqual(doing(r, true), ['think think.full']);
});

// The story's first week as the game plays it: these are what the code did before the rules were data.
test('a crate: smashed by a stone or the hammer, prised by the axe, taken by an empty hand, else left shut', () => {
  for (const hand of ['stone', 'hammer'] as const) assert.deepEqual(on('crate', hand), ['call smashCrate', 'think think.smashed', 'reach open']);
  assert.deepEqual(on('crate', 'axe'), ['call priseCrate', 'think think.opened', 'reach open']);
  assert.deepEqual(on('crate', null), ['call removeItem', 'give crate', 'think think.crateTaken']);
  for (const hand of ['wood', 'fire', 'spear', 'coconut'] as const) assert.deepEqual(on('crate', hand), ['think think.crate']);
});

test('a palm: the axe fells a tall one, a small one is too small, any other hand gets a leaf', () => {
  assert.deepEqual(on('palm', 'axe', ['tall']), ['call fell', 'think think.felled']);
  assert.deepEqual(on('palm', 'axe'), ['think think.tooSmall']);
  assert.deepEqual(on('palm', null), ['give leaf', 'think think.leaf']);
  assert.deepEqual(on('palm', 'stone'), ['give leaf', 'think think.leaf']);
});

test('the burning stump: a stick catches, a torch has it already, anything else needs a stick', () => {
  assert.deepEqual(on('stump', 'wood'), ['call lightTorch', 'think think.gotFire']);
  assert.deepEqual(on('stump', 'fire'), ['think think.haveFire']);
  assert.deepEqual(on('stump', null), ['think think.needStick']);
  assert.deepEqual(on('stump', 'stone'), ['think think.needStick']);
});

test('driftwood with a torch: a campfire, which counts only by the hut and says so when the quest wants one by the hut', () => {
  assert.deepEqual(on('drift', 'fire', ['byHut', 'wantsFire']), ['call lightFire', 'think think.campfire', 'reach campfire']);
  assert.deepEqual(on('drift', 'fire', ['wantsFire']), ['call lightFire', 'think think.fireFar']);
  assert.deepEqual(on('drift', 'fire'), ['call lightFire', 'think think.campfire']);
  // Without a torch it is picked up like any loose thing: no rule.
  assert.equal(on('drift', null), null);
  assert.equal(on('drift', 'wood'), null);
});
