import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optionsOf, withoutQuest } from './options.ts';

test('no options: a real game at normal speed from the first quest', () => {
  assert.deepEqual(optionsOf('', 10), {
    speed: 1, tryout: false, startQuest: 0, cave: false, island2: false, scene: null, fresh: false, cheats: false,
  });
});

test('the speed is a number, at least 0.1', () => {
  assert.equal(optionsOf('?speed=30', 10).speed, 30);
  assert.equal(optionsOf('?speed=0.01', 10).speed, 0.1);
  assert.equal(optionsOf('?speed=fast', 10).speed, 1);
});

test('a tryout starts at its quest, counted from 1 and kept within the quests there are', () => {
  assert.deepEqual([optionsOf('?quest=5', 10).tryout, optionsOf('?quest=5', 10).startQuest], [true, 4]);
  assert.equal(optionsOf('?quest=99', 10).startQuest, 9);
  assert.equal(optionsOf('?quest=0', 10).startQuest, 0);
  assert.equal(optionsOf('?quest', 10).startQuest, 0);
  assert.equal(optionsOf('?quest=2.7', 10).startQuest, 1);
});

test('the cave is on the rocky island; options combine', () => {
  const o = optionsOf('?cave&cheats&speed=5&new&scene=smuggler-cave', 10);
  assert.ok(o.cave && o.island2 && o.cheats && o.fresh);
  assert.equal(o.speed, 5);
  assert.equal(o.scene, 'smuggler-cave');
  assert.ok(optionsOf('?island=2', 10).island2);
  assert.ok(!optionsOf('?island=1', 10).island2);
});

test('ending a tryout drops the quest from the address and keeps the rest, flags bare', () => {
  assert.equal(withoutQuest('?quest=5'), '');
  assert.equal(withoutQuest('?quest=5&cheats&speed=3'), '?cheats&speed=3');
  assert.equal(withoutQuest('?cheats&quest=2'), '?cheats');
});
