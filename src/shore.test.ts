import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpot, headSide, HALF_BODY, lyingCount, sideways, washedUp, morningGifts, topUpStones, washWood, DRIFT_LYING, STONES_OUT, WOOD_LYING, type Shore } from './shore.ts';
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

// The square's edge row all round, as beach.
const edge = { ...shore, beach: Array.from({ length: 12 * 12 }, (_, k) => ({ i: 4.5 + (k % 12), j: 4.5 + Math.floor(k / 12) })).filter((b) => b.i < 5 || b.j < 5 || b.i > 15 || b.j > 15) };

test('washed up, the survivor lies along the water\'s edge on dry sand, the hat beyond their head', () => {
  const g = washedUp(edge, { i: 10, j: 10 }, shore.dry, true);
  // Head and feet both on the island, near its edge.
  for (const side of [-1, 1]) assert.ok(shore.dry(sideways(g.at, side, HALF_BODY)), `end ${side} on the sand`);
  assert.ok(g.at.i < 6 || g.at.j < 6 || g.at.i > 14 || g.at.j > 14, 'by the water');
  assert.ok(g.hat && shore.dry(g.hat), 'the hat on the sand');
  assert.equal(washedUp(edge, { i: 10, j: 10 }, shore.dry, false).hat, null, 'no hat, none washed up');
});

test('with no beach by the sea, the survivor wakes where the island begins', () => {
  const g = washedUp({ ...shore, beach: [] }, { i: 10, j: 10 }, shore.dry, false);
  assert.deepEqual(g.at, { i: 10, j: 10 });
});

test('lying down, the head goes on the dry side, the feet toward the sea', () => {
  // Screen right (+i -j) leads off the square's top edge, j < 4, into the sea.
  assert.equal(headSide(shore.dry, { i: 8, j: 4.8 }), -1);
  // Screen left (-i +j) leads off its left edge, i < 4.
  assert.equal(headSide(shore.dry, { i: 4.8, j: 8 }), 1);
});
