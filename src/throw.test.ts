import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flight, landed, landing, THROW, type Thrown } from './throw.ts';

const near = (a: { i: number; j: number }, b: { i: number; j: number }) => Math.hypot(a.i - b.i, a.j - b.j) < 1e-9;

test('a thing lands where it is thrown, but never further than a throw goes', () => {
  assert.ok(near(landing({ i: 5, j: 5 }, { i: 0.5, j: 0 }, () => true), { i: 5.5, j: 5 }));
  const far = landing({ i: 5, j: 5 }, { i: 30, j: 40 }, () => true);
  assert.ok(near(far, { i: 5 + 0.6 * THROW.far, j: 5 + 0.8 * THROW.far }));
});

test('over a wall or into the sea it falls short, at worst at the thrower\'s feet', () => {
  // Only within half a metre of the thrower is ground to land on.
  const short = landing({ i: 5, j: 5 }, { i: 1, j: 0 }, (at) => at.i <= 5.6);
  assert.ok(near(short, { i: 5.5, j: 5 }));
  assert.deepEqual(landing({ i: 5, j: 5 }, { i: 1, j: 0 }, () => false), { i: 5, j: 5 });
});

test('it flies from the hands up in an arc and down onto the ground, then has landed', () => {
  const t: Thrown = { item: 'stone', from: { i: 0, j: 0 }, to: { i: 1, j: 0 }, start: 1000 };
  assert.deepEqual(flight(t, 1000), { i: 0, j: 0, up: 2 });
  const mid = flight(t, 1000 + THROW.ms / 2);
  assert.equal(mid.i, 0.5);
  assert.ok(mid.up > 2, 'higher than the hands halfway');
  assert.deepEqual(flight(t, 1000 + THROW.ms * 2), { i: 1, j: 0, up: 0 });
  assert.ok(!landed(t, 1000 + THROW.ms - 1));
  assert.ok(landed(t, 1000 + THROW.ms));
});
