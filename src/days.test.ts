import { test } from 'node:test';
import assert from 'node:assert/strict';
import loca from './content/loca.json' with { type: 'json' };
import { checkContent, DAYS } from './days.ts';
import { LOOSE } from './crafts.ts';

test('the shipped days and texts are valid', () => {
  assert.deepEqual(checkContent(DAYS, loca, ['crate', ...LOOSE]), []);
});

test('bad days and texts are caught', () => {
  const texts = { 'think.a': { en: 'A' } };
  assert.deepEqual(checkContent({ 2: { thought: 'think.a', events: [{ at: 3, do: 'strike' }] } }, texts, ['crate']), []);
  const bad = checkContent({ 0: { weather: 'snow', coconuts: 99, washUps: ['boat'], thought: 'nope', events: [{ at: 99, do: 'dance' }] } }, { 'bad id': { en: 1 } }, ['crate']);
  for (const part of ['bad day number', 'snow', 'coconuts', 'boat', 'nope', 'time must', 'dance', 'bad id', 'needs en']) assert.ok(bad.some((l) => l.includes(part)), part);
});
