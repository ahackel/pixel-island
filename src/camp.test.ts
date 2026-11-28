import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLANKET, burning, burnPalm, byFire, canSail, fireNear, FIRE_FEAR, onBlanket, sheltered, sleepRefused, stormWakes, TORCH_FEAR } from './camp.ts';
import { BUILDS, HUT_AT, placeHut, type Build } from './crafts.ts';
import { TUTORIAL } from './islands.ts';
import { startProgress } from './quests.ts';

const QUESTS = TUTORIAL.quests;
import type { Shore } from './shore.ts';
import type { Game } from './save.ts';

const game = (more: Partial<Game> = {}): Game => ({
  day: 1, hunger: 1, energy: 1, bag: [], items: [], chests: {}, doors: {}, struck: null, fires: [], lying: [], felled: [], builds: [],
  at: { i: 8, j: 8 }, hat: null, who: {} as Game['who'], quest: startProgress(), story: 'tutorial', weather: 'sunny', ...more,
});
const hut = (stage: number = BUILDS.hut.stages.length): Build => ({ kind: 'hut', ...HUT_AT, stage });
const raft = (stage: number = BUILDS.raft.stages.length): Build => ({ kind: 'raft', i: 3, j: 3, stage });
const DRY = { rain: 0 };
const RAIN = { rain: 0.8 };
const campfireQuest = QUESTS.findIndex((q) => q.goal === 'campfire');

test('the blanket is slept on from its middle only', () => {
  assert.ok(onBlanket(BLANKET));
  assert.ok(onBlanket({ i: BLANKET.i + 0.3, j: BLANKET.j }));
  assert.ok(!onBlanket({ i: BLANKET.i + 0.6, j: BLANKET.j }));
});

test('only the finished hut shelters, and only on its 2×2 cells', () => {
  assert.ok(!sheltered(game({ builds: [hut(1)] }), HUT_AT));
  const g = game({ builds: [hut()] });
  assert.ok(sheltered(g, HUT_AT));
  assert.ok(sheltered(g, { i: HUT_AT.i - 0.9, j: HUT_AT.j - 0.9 }));
  assert.ok(!sheltered(g, { i: HUT_AT.i + 1.1, j: HUT_AT.j }));
});

test('in the rain the survivor sleeps only under the finished hut', () => {
  assert.equal(sleepRefused(game(), BLANKET, RAIN), 'think.rainSleep');
  assert.equal(sleepRefused(game({ builds: [hut()] }), BLANKET, RAIN), null);
  assert.equal(sleepRefused(game(), BLANKET, DRY), null);
});

test('during the fire quest, sleep waits for a campfire by the hut, not one far off', () => {
  assert.ok(campfireQuest >= 0, 'there is a campfire quest');
  const quest = { quest: campfireQuest, count: 0, done: false };
  assert.equal(sleepRefused(game({ quest }), BLANKET, DRY), 'think.needFire');
  assert.equal(sleepRefused(game({ quest, fires: [{ i: HUT_AT.i + 10, j: HUT_AT.j }] }), BLANKET, DRY), 'think.needFire');
  assert.equal(sleepRefused(game({ quest, fires: [{ i: HUT_AT.i + 2, j: HUT_AT.j }] }), BLANKET, DRY), null);
  assert.equal(sleepRefused(game({ quest: { ...quest, done: true } }), BLANKET, DRY), null);
});

test('a storm wakes the survivor unless they sleep under the hut or by a fire', () => {
  const out = { i: 2, j: 2 };
  assert.ok(stormWakes(game(), out, 'storm'));
  assert.ok(!stormWakes(game(), out, 'rain'));
  assert.ok(!stormWakes(game({ fires: [{ i: 3, j: 2 }] }), out, 'storm'));
  assert.ok(byFire(game({ fires: [{ i: 3, j: 2 }] }), out));
  assert.ok(!stormWakes(game({ builds: [hut()] }), HUT_AT, 'storm'));
});

test('the raft sails when it is finished, the survivor is by it and there is no storm', () => {
  const by = { i: 3.5, j: 3.5 };
  assert.ok(canSail(game({ builds: [raft()] }), by, 'sunny'));
  assert.ok(!canSail(game({ builds: [raft(1)] }), by, 'sunny'));
  assert.ok(!canSail(game({ builds: [raft()] }), { i: 8, j: 8 }, 'sunny'));
  assert.ok(!canSail(game({ builds: [raft()] }), by, 'storm'));
  assert.ok(!canSail(game(), by, 'sunny'));
});

test('fires frighten within their reach, the nearest one counting; a torch less far', () => {
  const palms = [{ i: 20, j: 20 }];
  const lit = burning(game({ fires: [{ i: 0, j: 0 }], struck: 0 }), palms, { i: 10, j: 0 });
  assert.deepEqual(lit.map((f) => f.fear), [FIRE_FEAR, FIRE_FEAR, TORCH_FEAR]);
  assert.equal(fireNear({ i: 1, j: 0 }, lit)?.i, 0);
  assert.equal(fireNear({ i: 20, j: 21 }, lit)?.i, 20);
  assert.equal(fireNear({ i: 10 + TORCH_FEAR + 0.1, j: 0 }, lit), null);
  assert.equal(fireNear({ i: 5, j: 10 }, lit), null);
});

test('lightning burns the nearest tall palm still standing, never a sapling, and drops dry wood round it', () => {
  const shore: Shore = {
    beach: [],
    palms: [{ plant: 'plant-palms-2', i: 5, j: 5 }, { plant: 'plant-palms-0', i: 7, j: 5 }, { plant: 'plant-palms-1', i: 12, j: 5 }],
    dry: () => true,
    aboveWater: () => true,
    surface: () => 'grass',
    random: Math.random,
  };
  const g = game();
  assert.ok(burnPalm(shore, g, { i: 5, j: 5 }));
  assert.equal(g.struck, 1, 'the sapling at 5,5 is skipped for the tall palm next to it');
  assert.ok(g.lying.some((l) => l.item === 'wood'));
  const felled = game({ felled: [1] });
  assert.ok(burnPalm(shore, felled, { i: 5, j: 5 }));
  assert.equal(felled.struck, 2);
  assert.ok(!burnPalm(shore, game({ felled: [1, 2] }), { i: 5, j: 5 }));
});

test('the hut goes at a hut marker: its cell and the ones beside it toward +i and +j, the blanket at their shared corner', () => {
  const was = { ...HUT_AT };
  try {
    placeHut({ i: 14.5, j: 6.5 });
    assert.deepEqual(HUT_AT, { i: 15, j: 7 });
    // The blanket is the same spot, and the rules that read it follow.
    assert.deepEqual(BLANKET, { i: 15, j: 7 });
    placeHut({ i: 14.9, j: 6.1 });
    assert.deepEqual(HUT_AT, { i: 15, j: 7 });
  } finally {
    Object.assign(HUT_AT, was);
  }
});
