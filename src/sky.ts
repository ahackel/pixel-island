// The sky's light over the island: the time of day's tint, how far into the night it is, and how the weather is seen
// and lights the world by day and by night. Plain functions of the clock and the weather (sky.test.ts).
import { along, mixTint, TINTS, type Tint } from '@pixel/engine/world/daylight.ts';
import { overcast, type Weather } from '@pixel/engine/world/weather.ts';
import { phaseAt } from './clock.ts';

/** How far into the night it is: 0 by day and at sunset, growing through dusk, 1 once it is dark. */
export function nightfall(t: number): number {
  const { phase, k } = phaseAt(t);
  return phase === 'dusk' ? k : phase === 'night' ? 1 : 0;
}
/**
 * The weather the world is shown: by day as it is, but at night without its cloud, since the moon throws shadows
 * as hard as a sunny day's and a grey sky is nothing to see in the dark. Fog is left alone: it swallows shadows
 * whatever the hour.
 */
export function asSeen(w: Weather, night: number): Weather {
  return night <= 0 || w.fog > 0 ? w : { ...w, cloud: w.cloud * (1 - night) };
}
/** Night fog: not the pale grey of a foggy morning but a dark blue bank, which this light over the whole picture makes of it. */
export const FOG_NIGHT: Tint = { r: 34, g: 52, b: 118, amount: 0.62 };
/** The light the weather leaves: the engine's overcast grey, turning to a dark blue where fog lies at night. */
export function weatherLight(w: Weather, night: number): Tint {
  const grey = overcast(w);
  return w.fog > 0 && night > 0 ? mixTint(grey, FOG_NIGHT, night * w.fog) : grey;
}

/** The daylight's tint at a time of day: day, sunset, through dusk into night. */
export function tintAt(time: number): Tint {
  const { phase, k } = phaseAt(time);
  if (phase === 'day') return TINTS.day;
  if (phase === 'sunset') return mixTint(TINTS.day, TINTS.sunset, k);
  if (phase === 'dusk') return along([TINTS.sunset, TINTS.dusk, TINTS.night], k);
  return TINTS.night;
}
