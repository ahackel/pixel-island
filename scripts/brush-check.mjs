// Run with: node scripts/brush-check.mjs
import assert from 'node:assert/strict';
import { roundBrush } from '../shared/brush.ts';

const counts = [1, 2, 3, 4, 5, 6, 7].map((n) => roundBrush(n).length);
assert.equal(counts[0], 1, 'size 1 is one tile');
for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1], `size ${i + 1} covers more than size ${i}`);
for (const n of [1, 3, 5, 7]) {
  const cells = roundBrush(n);
  const width = Math.max(...cells.map(([x]) => x)) - Math.min(...cells.map(([x]) => x)) + 1;
  assert.equal(width, n, `odd size ${n} is ${n} tiles across`);
  // Round, not square: the corners of the square stay off.
  if (n >= 5) assert.ok(!cells.some(([x, y]) => Math.abs(x) === (n - 1) / 2 && Math.abs(y) === (n - 1) / 2), `size ${n} has no corners`);
}
console.log('brush ok', counts.join(' '));
