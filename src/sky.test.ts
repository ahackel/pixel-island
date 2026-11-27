import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asSeen, FOG_NIGHT, nightfall, tintAt, weatherLight } from './sky.ts';
import { DAY_S, DUSK_S, SUNSET_S } from './clock.ts';
import { TINTS } from '@pixel/engine/world/daylight.ts';
import { CLEAR, overcast } from '@pixel/engine/world/weather.ts';

const NOON = (DAY_S - SUNSET_S) / 2;
const MID_DUSK = DAY_S + DUSK_S / 2;
const NIGHT = DAY_S + DUSK_S + 10;

test('the night falls through dusk: none by day and at sunset, all of it once dark', () => {
  assert.equal(nightfall(NOON), 0);
  assert.equal(nightfall(DAY_S - 1), 0);
  assert.equal(nightfall(MID_DUSK), 0.5);
  assert.equal(nightfall(NIGHT), 1);
});

test('the daylight tints day, sunset, dusk and night, joining up between them', () => {
  assert.deepEqual(tintAt(NOON), TINTS.day);
  assert.ok(Math.abs(tintAt(DAY_S - 0.0001).amount - TINTS.sunset.amount) < 1e-3);
  assert.deepEqual(tintAt(DAY_S), TINTS.sunset);
  assert.deepEqual(tintAt(NIGHT), TINTS.night);
  assert.ok(Math.abs(tintAt(DAY_S + DUSK_S - 0.0001).amount - TINTS.night.amount) < 1e-3);
});

test('at night the cloud is not seen, but fog is, and by day the weather is as it is', () => {
  const grey = { ...CLEAR, cloud: 0.8, rain: 0.5 };
  assert.equal(asSeen(grey, 0), grey);
  assert.equal(asSeen(grey, 1).cloud, 0);
  assert.equal(asSeen(grey, 0.5).cloud, 0.4);
  assert.equal(asSeen(grey, 1).rain, 0.5);
  const fog = { ...CLEAR, cloud: 0.8, fog: 1 };
  assert.equal(asSeen(fog, 1), fog);
});

test('fog by night lights the world dark blue, by day the overcast grey', () => {
  const fog = { ...CLEAR, cloud: 0.5, fog: 1 };
  assert.deepEqual(weatherLight(fog, 0), overcast(fog));
  assert.deepEqual(weatherLight(fog, 1), FOG_NIGHT);
  const rain = { ...CLEAR, cloud: 0.5, rain: 1 };
  assert.deepEqual(weatherLight(rain, 1), overcast(rain));
});
