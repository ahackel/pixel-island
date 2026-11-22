// Checks the picture store (engine/core/cache.ts): past its budget it drops the pictures used longest ago,
// never one used in the last second, a hit counts as a use, and `forget` drops by key prefix.
// Usage: node scripts/cache-check.mjs
import assert from 'node:assert/strict';

let now = 0;
performance.now = () => now;
const { BUDGET, cached, forget } = await import('../engine/core/cache.ts');

let draws = 0;
const big = (name) => () => (draws++, { name, bytes: BUDGET / 4 });
const get = (key) => cached('test', key, big(key));

for (const key of ['a', 'b', 'c', 'd']) { get(key); now += 2000; }
get('a'); // a hit: a is now the newest
now += 2000;
get('e'); // over budget: b, the oldest unused, goes
assert.equal(draws, 5);
get('a'); get('c'); get('d'); get('e');
assert.equal(draws, 5, 'a, c, d and e are kept');
get('b');
assert.equal(draws, 6, 'b was dropped and is drawn again');

// Everything used within the last second stays, over budget or not.
for (const key of ['f', 'g', 'h', 'i', 'j']) get(key);
for (const key of ['f', 'g', 'h', 'i', 'j']) get(key);
assert.equal(draws, 11, 'pictures used this second are never dropped');

forget('test', 'f');
get('f');
assert.equal(draws, 12, 'forget drops by prefix');
console.log('cache check passed');
