// Which weather each day has. Picked from the day number, so nothing needs saving: day 1 is
// sunny, the next two stay gentle, then a weighted pick that often keeps yesterday's weather and
// gets better or worse a step at a time. Some mornings start in fog. Through the afternoon the
// sky turns toward tomorrow's weather, so the night already brings it.
import { CLEAR, mixWeather, type Weather } from '@pixel/engine/world/weather.ts';
import { DAY_S, DUSK_S } from './clock.ts';

export const KINDS = ['sunny', 'cloudy', 'windy', 'rain', 'storm'] as const;
export type Kind = (typeof KINDS)[number];

const LOOKS: Record<Kind, Weather> = {
  sunny: CLEAR,
  cloudy: { ...CLEAR, cloud: 0.6, wind: 0.15 },
  windy: { ...CLEAR, cloud: 0.3, wind: 1 },
  rain: { ...CLEAR, cloud: 1, rain: 0.7, wind: 0.3 },
  storm: { ...CLEAR, cloud: 1, rain: 1, wind: 1, storm: 1 },
};
/** How bad each is: a day moves at most one step from the day before. */
const LEVEL: Record<Kind, number> = { sunny: 0, cloudy: 1, windy: 1, rain: 2, storm: 3 };
const WEIGHTS: [Kind, number][] = [['sunny', 0.45], ['cloudy', 0.2], ['windy', 0.15], ['rain', 0.12], ['storm', 0.08]];
const GENTLE: Kind[] = ['sunny', 'cloudy', 'windy'];
/** The share of days that keep yesterday's weather (a storm never lasts: it eases to rain). */
const KEEP = 0.35;
/** The share of rainy days followed by a storm. */
const STORMY = 0.3;
/** The share of mornings that start in fog, and how long it takes to lift, in game seconds. */
const FOGGY = 0.25;
const FOG_S = 180;

const roll = (day: number, salt: number) => ((Math.imul(day, 2654435761) ^ Math.imul(salt, 40503)) >>> 0) % 10007 / 10007;

const known: Kind[] = [];
/** The weather of a day. */
export function kindOf(day: number): Kind {
  day = Math.max(1, Math.floor(day));
  if (!known.length) known.push('sunny');
  while (known.length < day) {
    const d = known.length + 1;
    const before = known[known.length - 1];
    let next: Kind;
    if (d <= 3) next = GENTLE[Math.floor(roll(d, 1) * GENTLE.length)];
    else if (roll(d, 2) < KEEP) next = before === 'storm' ? 'rain' : before;
    else {
      let r = roll(d, 3);
      next = (WEIGHTS.find(([, w]) => (r -= w) < 0) ?? WEIGHTS[0])[0];
    }
    // A step at a time: from sunshine no storm, from a storm no sunshine.
    const step = LEVEL[next] - LEVEL[before];
    if (Math.abs(step) > 1) next = step > 0 ? (before === 'sunny' ? 'cloudy' : before === 'rain' ? 'storm' : 'rain') : before === 'storm' ? 'rain' : 'cloudy';
    // Storms build out of rain: the step rule alone would make them rare.
    if (before === 'rain' && next !== 'storm' && roll(d, 5) < STORMY) next = 'storm';
    if (before === 'storm' && next === 'storm') next = 'rain';
    known.push(next);
  }
  return known[day - 1];
}

/** Whether a day's morning starts in fog: never on day 1, nor in a storm. */
export const foggy = (day: number) => day > 1 && kindOf(day) !== 'storm' && roll(day, 4) < FOGGY;

/** What the cheat can force instead of the day's own weather: a kind, or a still, foggy day. */
export type Forced = Kind | 'fog';

/** The weather `t` game seconds into a day, `forced` overriding the day's own (for the cheat). */
export function weatherAt(day: number, t: number, forced?: Forced): Weather {
  if (forced === 'fog') return { ...CLEAR, fog: 1 };
  const today = LOOKS[forced ?? kindOf(day)];
  const tomorrow = LOOKS[forced ?? kindOf(day + 1)];
  const k = Math.min(1, Math.max(0, (t - 0.6 * DAY_S) / (0.4 * DAY_S + DUSK_S)));
  const w = mixWeather(today, tomorrow, k * k * (3 - 2 * k));
  if (foggy(day)) w.fog = Math.max(w.fog, Math.max(0, 1 - t / FOG_S));
  return w;
}
