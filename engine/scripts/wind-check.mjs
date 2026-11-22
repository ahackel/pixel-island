// Checks plant wind levels (engine/world/weather.ts): every weather gives one of a few levels, and a weather turning
// slowly from one to another changes level once, not back and forth.
// Usage: node scripts/wind-check.mjs
import assert from 'node:assert/strict';
import { CLEAR, mixWeather, plantWind, WIND_LEVELS } from '../engine/world/weather.ts';

const calm = CLEAR, breeze = { ...CLEAR, wind: 0.3 }, storm = { ...CLEAR, wind: 1 }, fog = { ...CLEAR, fog: 1 };
assert.equal(plantWind(calm), 0.3);
assert.equal(plantWind(breeze), 0.8);
// A cloudy day (the game's 0.15 wind) is a level of its own, whatever came before: not near a halfway point.
for (const last of [0, 0.3, 0.8, 2.5]) assert.equal(plantWind({ ...CLEAR, wind: 0.15 }, last), 0.8);
assert.equal(plantWind(storm), 2.5);
assert.equal(plantWind(fog), 0);

for (const [a, b] of [[calm, storm], [storm, calm], [fog, storm], [breeze, calm]]) {
  let last = -1, changes = 0, prev = -1;
  const seen = [];
  for (let k = 0; k <= 1000; k++) {
    last = plantWind(mixWeather(a, b, k / 1000), last);
    assert.ok(WIND_LEVELS.includes(last));
    if (last !== prev) { changes++; seen.push(last); prev = last; }
  }
  // Each level passed is entered once: no flicking back.
  assert.equal(new Set(seen).size, seen.length, `levels ${seen} from one weather to another`);
  // Jitter round a level's edge does not change it.
  const edge = mixWeather(calm, storm, 0.15);
  const held = plantWind(edge);
  for (let k = 0; k < 50; k++) assert.equal(plantWind(mixWeather(calm, storm, 0.15 + (k % 2 ? 0.01 : -0.01)), held), held);
  assert.ok(changes >= 2);
}
console.log('wind check passed');
