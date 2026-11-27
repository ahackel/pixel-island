import { test } from 'node:test';
import assert from 'node:assert/strict';
import loca from './content/loca.json' with { type: 'json' };
import { checkEffects, goalsOf, idle, run, type Doer, type Effect } from './effects.ts';

const known = { loca, goals: ['eat', 'open'], items: ['crate', 'vine'] };
/** What a list does, as lines. `full`: the bag has no room. */
function doing(effects: Effect[], full = false): string[] {
  const log: string[] = [];
  const d: Doer = {
    think: (id) => log.push(`think ${id}`), reach: (g) => log.push(`reach ${g}`), give: (i) => log.push(`give ${i}`), take: (n) => log.push(`take ${n}`), full: () => full, call: (h) => log.push(`call ${h}`),
    weather: (k) => log.push(`weather ${k}`), washUp: (items) => log.push(`washUp ${items.join(',')}`), stones: (n) => log.push(`stones ${n}`), strike: () => log.push('strike'),
  };
  run(effects, d);
  return log;
}

test('every kind of effect does what it says, in the order written', () => {
  const all: Effect[] = [{ think: 'think.crate' }, { reach: 'open' }, { give: 'stone' }, { take: 'fish' }, { call: 'fell' }, { weather: 'rain' }, { washUp: ['crate', 'vine'] }, { stones: 3 }, { strike: true }];
  assert.deepEqual(doing(all), ['think think.crate', 'reach open', 'give stone', 'take fish', 'call fell', 'weather rain', 'washUp crate,vine', 'stones 3', 'strike']);
});

test('room stops the list with the bag-full thought, and only when the bag is full', () => {
  const list: Effect[] = [{ room: true }, { give: 'leaf' }];
  assert.deepEqual(doing(list), ['give leaf']);
  assert.deepEqual(doing(list, true), ['think think.full']);
});

test('an idle doer does nothing, so a list can be replayed for only some of its effects', () => {
  const log: string[] = [];
  run([{ stones: 2 }, { weather: 'storm' }, { strike: true }, { think: 'think.crate' }], { ...idle, stones: (n) => log.push(`stones ${n}`) });
  assert.deepEqual(log, ['stones 2']);
});

test('the goals a list reaches', () => {
  assert.deepEqual(goalsOf([{ think: 'think.crate' }, { reach: 'open' }, { reach: 'eat' }]), ['open', 'eat']);
});

test('what a hand may do and what a quest start may do are told apart', () => {
  assert.deepEqual(checkEffects([{ think: 'think.crate' }, { reach: 'open' }, { give: 'stone' }, { take: 'fish' }, { take: 'coconut' }, { call: 'fell' }, { room: true }], 'rule', 'r', known), []);
  assert.deepEqual(checkEffects([{ think: 'think.crate' }, { give: 'stone' }, { take: 'stone' }, { call: 'fell' }, { weather: 'rain' }, { washUp: ['crate'] }, { stones: 3 }, { strike: true }], 'start', 's', known), []);
  assert.equal(checkEffects([{ weather: 'rain' }, { stones: 1 }], 'rule', 'r', known).length, 2);
  assert.equal(checkEffects([{ reach: 'open' }, { room: true }], 'start', 's', known).length, 2);
});

test('bad effects are caught', () => {
  const bad = checkEffects([{ weather: 'snow' }, { washUp: [] }, { washUp: ['boat'] }, { stones: 11 }, { stones: 1.5 }, { strike: false }, { think: 'nope' }, { reach: 'dance' }, { give: 'gold' }, { take: 'gold' }, { call: 'explode' }, { room: 1 }, { think: 'think.crate', reach: 'eat' }, { wave: 1 }, 5], 'start', 's', known);
  // Those not for a quest's start are told so before anything else is checked of them.
  for (const part of ['weather "snow"', 'wash-up in []', 'wash-up in ["boat"]', 'stones must be 1–10', 'strike is written as true', 'text "nope"', '"reach" is not for a quest', 'item "gold"', 'thing "gold"', 'handler "explode"', '"room" is not for a quest', 'exactly one', 'effect "wave"']) {
    assert.ok(bad.some((l) => l.includes(part)), part);
  }
  assert.deepEqual(checkEffects([], 'rule', 'r', known), ['r: needs a list of effects']);
  assert.deepEqual(checkEffects('x', 'rule', 'r', known), ['r: needs a list of effects']);
});
