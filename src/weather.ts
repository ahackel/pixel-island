// Which weather each day has. Picked from the day number, so nothing needs saving: day 1 is
// sunny, the next two stay gentle, then a weighted pick that often keeps yesterday's weather and
// gets better or worse a step at a time. Through the afternoon the
// sky turns toward tomorrow's weather (clouds and wind; rain only falls on a rain or storm day); fog does not: a foggy day is
// fog from morning to night, and the fog comes and goes only overnight. A day's plan (days.json) can
// set its weather; the days after it follow on from what it set.
import { CLEAR, mixWeather, type Weather } from '@pixel/engine/world/weather.ts';
import { DAY_S, DUSK_S } from './clock.ts';
import { dayPlan, KINDS, type Kind } from './days.ts';

export { KINDS, type Kind };

const LOOKS: Record<Kind, Weather> = {
  sunny: CLEAR,
  cloudy: { ...CLEAR, cloud: 0.6, wind: 0.15 },
  windy: { ...CLEAR, cloud: 0.3, wind: 1 },
  rain: { ...CLEAR, cloud: 1, rain: 0.7, wind: 0.3 },
  storm: { ...CLEAR, cloud: 1, rain: 1, wind: 1, storm: 1 },
  fog: { ...CLEAR, fog: 1 },
};
/** How bad each is: a day moves at most one step from the day before. */
const LEVEL: Record<Kind, number> = { sunny: 0, cloudy: 1, windy: 1, fog: 1, rain: 2, storm: 3 };
const WEIGHTS: [Kind, number][] = [['sunny', 0.37], ['cloudy', 0.18], ['windy', 0.15], ['fog', 0.1], ['rain', 0.12], ['storm', 0.08]];
const GENTLE: Kind[] = ['sunny', 'cloudy', 'windy'];
/** The share of days that keep yesterday's weather (a storm never lasts: it eases to rain). */
const KEEP = 0.35;
/** The share of rainy days followed by a storm. */
const STORMY = 0.3;

const roll = (day: number, salt: number) => ((Math.imul(day, 2654435761) ^ Math.imul(salt, 40503)) >>> 0) % 10007 / 10007;

const known: Kind[] = [];
/** The weather of a day. */
export function kindOf(day: number): Kind {
  day = Math.max(1, Math.floor(day));
  if (!known.length) known.push(dayPlan(1).weather ?? 'sunny');
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
    known.push(dayPlan(d).weather ?? next);
  }
  return known[day - 1];
}

/** What the cheat can force instead of the day's own weather. */
export type Forced = Kind;

/** The weather `t` game seconds into a day, `forced` overriding the day's own (for the cheat). */
export function weatherAt(day: number, t: number, forced?: Forced): Weather {
  const today = forced ?? kindOf(day);
  const tomorrow = forced ?? kindOf(day + 1);
  if (today === 'fog' || tomorrow === 'fog') return { ...LOOKS[today] };
  const k = Math.min(1, Math.max(0, (t - 0.6 * DAY_S) / (0.4 * DAY_S + DUSK_S)));
  // Rain and storm stay the day's own: only a rain or storm day has them, also in its evening.
  return { ...mixWeather(LOOKS[today], LOOKS[tomorrow], k * k * (3 - 2 * k)), rain: LOOKS[today].rain, storm: LOOKS[today].storm };
}
