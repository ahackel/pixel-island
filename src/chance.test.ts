import test from 'node:test';
import assert from 'node:assert/strict';
import { rng } from '@pixel/shared/random.ts';
import { chanceAt, setChance, startOf, stateOf, stream } from './chance.ts';

test('a stream draws what rng draws from the same seed, so a seed plays as it did before streams kept their state', () => {
  const a = rng(42), b = stream(42);
  for (let n = 0; n < 50; n++) assert.equal(b(), a());
});

test('streams set back to a saved state draw on as they would have: a game loaded from its save goes on the same way', () => {
  const c = chanceAt(startOf(7));
  for (let n = 0; n < 9; n++) { c.shore(); c.fish(); }
  c.luck();
  const saved = stateOf(c);
  const ahead = [c.shore(), c.fish(), c.luck(), c.shore()];
  const loaded = chanceAt(saved);
  assert.deepEqual([loaded.shore(), loaded.fish(), loaded.luck(), loaded.shore()], ahead);
  // Set in place, the same functions draw from there too (the rules hold on to them).
  const shore = c.shore;
  setChance(c, saved);
  assert.equal(shore(), ahead[0]);
});

test('each part of the game has its own stream: they do not start alike', () => {
  const [a, b, c] = startOf(1);
  assert.ok(a !== b && b !== c && a !== c);
});
