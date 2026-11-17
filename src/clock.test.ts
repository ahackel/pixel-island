import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_S, drain, faints, LOW, phaseAt, speedOf, wake } from './clock.ts';

test('day, sunset, dusk, endless night', () => {
  assert.equal(phaseAt(0).phase, 'day');
  assert.equal(phaseAt(DAY_S - 30).phase, 'sunset');
  assert.equal(phaseAt(DAY_S + 10).phase, 'dusk');
  assert.equal(phaseAt(DAY_S * 50).phase, 'night');
});

test('tired 5 minutes into the night, not before', () => {
  const full = { hunger: 1, energy: 1 };
  assert.ok(drain(full, DAY_S + 290).energy > LOW);
  assert.ok(drain(full, DAY_S + 310).energy < LOW);
});

test('slow when low, faint when empty, rested after sleep', () => {
  assert.equal(speedOf({ hunger: 0.1, energy: 1 }), 0.5);
  assert.equal(speedOf({ hunger: 1, energy: 1 }), 1);
  assert.ok(faints({ hunger: 0, energy: 1 }));
  assert.equal(wake({ hunger: 0.5, energy: 0.1 }, false).energy, 1);
  assert.ok(wake({ hunger: 0, energy: 0 }, true).hunger > 0);
});
