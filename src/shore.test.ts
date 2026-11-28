import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpot, markerSpots, headSide, HALF_BODY, layStones, lyingCount, washUp, sideways, washedUp, morningGifts, topUpStones, washWood, DRIFT_LYING, STONES_OUT, WOOD_LYING, type Shore } from './shore.ts';
import { HUT_AT } from './crafts.ts';
import { FIRST } from './islands.ts';
import { startProgress } from './quests.ts';

const QUESTS = FIRST.quests;
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
  at: { i: 8, j: 8 }, hat: null, who: {} as Game['who'], quest: startProgress(), story: 'first', weather: 'sunny', ...more,
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

test('a quest\'s stones are laid on the beach, as many as it says, and none where there is no beach', () => {
  const g = game();
  layStones(shore, g, 3);
  assert.equal(lyingCount(g, 'stone'), 3);
  assert.ok(g.lying.every((l) => shore.surface(l) === 'beach'));
  const none = game();
  layStones({ ...shore, beach: [] }, none, 3);
  assert.equal(lyingCount(none, 'stone'), 0);
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

test('what is left near the survivor lies on the beach near them, and anywhere on the beach where none is near', () => {
  const far = { i: 15.5, j: 15.5 };
  const g = game();
  washUp(shore, g, ['pot', 'flint', 'flint', 'vine'], { at: far, within: 3 });
  assert.equal(g.lying.length, 4);
  assert.ok(g.lying.every((l) => Math.hypot(l.i - far.i, l.j - far.j) <= 3.5), 'within reach, with the tile\'s jitter');
  const s = game();
  layStones(shore, s, 5, { at: { i: 4.5, j: 4.5 }, within: 2 });
  assert.equal(lyingCount(s, 'stone'), 5);
  assert.ok(s.lying.every((l) => Math.hypot(l.i - 4.5, l.j - 4.5) <= 2.5));
  // No beach within reach of the survivor: the sea leaves them anywhere on the beach rather than nowhere.
  const none = game();
  layStones(shore, none, 4, { at: { i: 10, j: 10 }, within: 1 });
  assert.equal(lyingCount(none, 'stone'), 4);
  // Without a place, as before: all over the beach.
  const all = game();
  layStones(shore, all, 40);
  assert.ok(all.lying.some((l) => l.i < 8) && all.lying.some((l) => l.i > 12));
});

test('the sea leaves nothing at a palm\'s foot, where it could not be walked up to, if there is other beach', () => {
  const g = game();
  // A palm on the first beach tile: everything washes up on the other.
  const palmy: Shore = { ...shore, palms: [{ plant: 'plant-palms-0', i: 4.5, j: 4.5 }] };
  washUp(palmy, g, Array.from({ length: 30 }, () => 'vine'));
  assert.equal(g.lying.length, 30);
  assert.ok(g.lying.every((l) => Math.hypot(l.i - 4.5, l.j - 4.5) >= 0.8), 'none within reach of the trunk');
  assert.ok(g.lying.every((l) => Math.hypot(l.i - 15.5, l.j - 15.5) < 0.6), 'all on the far tile');
  // With no other beach they still wash up somewhere rather than nowhere.
  const only: Shore = { ...palmy, beach: [{ i: 4.5, j: 4.5 }] };
  const h = game();
  washUp(only, h, ['vine']);
  assert.equal(h.lying.length, 1);
});

test('things laid at a marker go on it and close round it, the same every time, clear of palms and of each other', () => {
  const at = { i: 6, j: 10 };
  const g = game();
  washUp(shore, g, ['crate', 'hammer', 'vine'], { marker: at });
  layStones(shore, g, 2, { marker: at });
  const spots = [...g.items, ...g.lying].map((o) => `${o.i.toFixed(2)},${o.j.toFixed(2)}`);
  // The crate on the marker, the rest on the ring 0.7 m round it, in order (east first), none on another.
  assert.deepEqual(spots, ['6.00,10.00', '6.70,10.00', '6.49,10.49', '6.00,10.70', '5.51,10.49']);
  const again = game();
  washUp(shore, again, ['crate', 'hammer', 'vine'], { marker: at });
  layStones(shore, again, 2, { marker: at });
  assert.deepEqual([...again.items, ...again.lying].map((o) => `${o.i.toFixed(2)},${o.j.toFixed(2)}`), spots);
  // Next to a palm, the spots within its trunk's reach are left out; with no room at all, things go on the marker.
  const byPalm = markerSpots(shore, game(), { i: 8.7, j: 8 }, 3);
  assert.ok(byPalm.every((c) => Math.hypot(c.i - 8, c.j - 8) >= 0.8), JSON.stringify(byPalm));
  assert.deepEqual(markerSpots({ ...shore, aboveWater: () => false }, game(), at, 2), [at, at]);
});
