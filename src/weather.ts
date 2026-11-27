// What the sky does. The weather lasts: it is set when a quest starts (the quest's own, else a fair one picked from
// the day number) and stays the same every day until the next quest begins, so a day never dawns different for no
// reason. It is kept in the save. Through the afternoon the sky turns toward tomorrow's weather (clouds and wind;
// rain only falls on a rain or storm day); fog does not: a foggy day is fog from morning to night, and the fog comes
// and goes only overnight.
import { CLEAR, mixWeather, type Weather } from '@pixel/engine/world/weather.ts';
import { DAY_S, DUSK_S } from './clock.ts';
import { weatherOf, type Kind, type Quest } from './quests.ts';

const LOOKS: Record<Kind, Weather> = {
  sunny: CLEAR,
  cloudy: { ...CLEAR, cloud: 0.6, wind: 0.15 },
  windy: { ...CLEAR, cloud: 0.3, wind: 1 },
  rain: { ...CLEAR, cloud: 1, rain: 0.7, wind: 0.3 },
  storm: { ...CLEAR, cloud: 1, rain: 1, wind: 1, storm: 1 },
  fog: { ...CLEAR, fog: 1 },
};
/** The fair kinds and how often each comes: rain and storms come only with their quests. */
const FAIR: [Kind, number][] = [['sunny', 0.5], ['cloudy', 0.22], ['windy', 0.16], ['fog', 0.12]];

const roll = (day: number) => ((Math.imul(day, 2654435761) ^ 40503) >>> 0) % 10007 / 10007;

/** The fair weather of a day with no quest weather. */
export function fairOf(day: number): Kind {
  let r = roll(Math.max(1, Math.floor(day)));
  return (FAIR.find(([, w]) => (r -= w) < 0) ?? FAIR[0])[0];
}

/** The weather quest number `quest` of `quests` brings when it starts on `day`: its own, else the fair one that day rolls. */
export const kindFor = (quests: readonly Quest[], quest: number, day: number): Kind => weatherOf(quests[quest]) ?? fairOf(day);

/** The weather `t` game seconds into a day of `today`'s kind, turning toward `tomorrow`'s through the afternoon. */
export function weatherAt(today: Kind, tomorrow: Kind, t: number): Weather {
  if (today === 'fog' || tomorrow === 'fog') return { ...LOOKS[today] };
  const k = Math.min(1, Math.max(0, (t - 0.6 * DAY_S) / (0.4 * DAY_S + DUSK_S)));
  // Rain and storm stay the day's own: only a rain or storm day has them, also in its evening.
  return { ...mixWeather(LOOKS[today], LOOKS[tomorrow], k * k * (3 - 2 * k)), rain: LOOKS[today].rain, storm: LOOKS[today].storm };
}
