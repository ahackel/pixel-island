import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpot, lyingCount, morningGifts, topUpStones, washWood, DRIFT_LYING, STONES_OUT, WOOD_LYING, type Shore } from './shore.ts';
import { HUT_AT } from './crafts.ts';
import { QUESTS, startProgress } from './quests.ts';
import type { Game } from './save.ts';

// A square of land, 4 to 16 on each side, with its edge rows beach; everything else sea.
const shore: Shore = {
  beach: [{ i: 4.5, j: 4.5 }, { i: 15.5, j: 15.5 }],
  palms: [{ plant: 'plant-palms-0', i: 8, j: 8 }],
  dry: (p) => p.i >= 4 && p.i < 16 && p.j >= 4 && p.j < 16,
  aboveWater: () => true,
  surface: (p) => (p.i < 5 || p.j < 5 || p.i >= 15 || p.j >= 15 ? 'beach' : 'grass'),
  random: Math.random,
};
const game = (more: Partial<Game> = {}): Game => ({
  day: 1, hunger: 1, energy: 1, bag: [], items: [], chests: {}, doors: {}, struck: null, fires: [], lying: [], felled: [], builds: [],
  at: { i: 8, j: 8 }, hat: null, who: {} as Game['who'], quest: startProgress(), weather: 'sunny', ...more,
});

test('the sea never leaves more wood than its limits, however many mornings', () => {
  const g = game();
  for (let n = 0; n < 10; n++) washWood(shore, g);
  assert.equal(lyingCount(g, 'wood'), WOOD_LYING);
  assert.equal(lyingCount(g, 'drift'), DRIFT_LYING);
});

test('a coconut falls only once the last one is eaten, and never from a felled palm', () => {
  const g = game();
  morningGifts(shore, g);
  assert.equal(lyingCount(g, 'coconut'), 1);
  morningGifts(shore, g);
  assert.equal(lyingCount(g, 'coconut'), 1);
  const felled = game({ felled: [0] });
  morningGifts(shore, felled);
  assert.equal(lyingCount(felled, 'coconut'), 0);
});

test('stones are topped up only once a quest has brought them, counting those in the bag', () => {
  const before = game();
  topUpStones(shore, before);
  assert.equal(lyingCount(before, 'stone'), 0);
  const fish = QUESTS.findIndex((q) => q.id === 'fish');
  const g = game({ quest: { quest: fish, count: 0, done: false }, bag: ['stone'] });
  topUpStones(shore, g);
  assert.equal(lyingCount(g, 'stone') + 1, STONES_OUT);
});

test('the hut is built only near its place, with the hammer; the raft only on the beach, clear of palms', () => {
  const near = { i: HUT_AT.i + 1, j: HUT_AT.j };
  assert.equal(buildSpot(shore, game({ bag: ['drift'] }), 'hut', near), null);
  assert.equal(buildSpot(shore, game({ bag: ['drift', 'hammer'] }), 'hut', near), 'new');
  assert.equal(buildSpot(shore, game({ bag: ['drift', 'hammer'] }), 'hut', { i: HUT_AT.i + 3, j: HUT_AT.j }), null);
  const logs = game({ bag: ['log', 'log'] });
  assert.equal(buildSpot(shore, logs, 'raft', { i: 4.5, j: 10 }), 'new');
  assert.equal(buildSpot(shore, logs, 'raft', { i: 10, j: 10 }), null);
  // A raft begun is built further only beside it.
  const begun = game({ bag: ['log', 'log', 'rope'], builds: [{ kind: 'raft', i: 4.5, j: 10, stage: 1 }] });
  assert.equal(buildSpot(shore, begun, 'raft', { i: 4.5, j: 10.5 }), begun.builds[0]);
  assert.equal(buildSpot(shore, begun, 'raft', { i: 4.5, j: 14 }), null);
});
