// The game's day and the survivor's needs, as plain numbers so they can be tested without a page.
// Time `t` is in game seconds since the morning began.

/** The day lasts 10 minutes; its last minute is the sunset. Then night, which never ends by itself. */
export const DAY_S = 600;
export const SUNSET_S = 60;
/** From sunset's end, how long dusk takes to turn into full night. */
export const DUSK_S = 30;

/** Full to empty: hunger over a day and a half-night, energy so it runs low 5 minutes into the night. */
export const HUNGER_S = 900;
export const ENERGY_S = 1200;
/** Below this the survivor is tired (energy) or weak (hunger), and walks slowly. */
export const LOW = 0.25;
export const SLOW = 0.5;
export const COCONUT = 0.35;

export type Phase = 'day' | 'sunset' | 'dusk' | 'night';

/** Which part of the day it is, and how far into it, 0 to 1. */
export function phaseAt(t: number): { phase: Phase; k: number } {
  if (t < DAY_S - SUNSET_S) return { phase: 'day', k: t / (DAY_S - SUNSET_S) };
  if (t < DAY_S) return { phase: 'sunset', k: (t - (DAY_S - SUNSET_S)) / SUNSET_S };
  if (t < DAY_S + DUSK_S) return { phase: 'dusk', k: (t - DAY_S) / DUSK_S };
  return { phase: 'night', k: 1 };
}

export interface Needs { hunger: number; energy: number }

/** Needs after `dt` game seconds. 1 is full, 0 empty. */
export function drain(n: Needs, dt: number): Needs {
  return { hunger: Math.max(0, n.hunger - dt / HUNGER_S), energy: Math.max(0, n.energy - dt / ENERGY_S) };
}

/** How fast the survivor walks, 1 normal. */
export const speedOf = (n: Needs) => (n.hunger < LOW || n.energy < LOW ? SLOW : 1);

/** Either need empty: the survivor faints and wakes the next morning. */
export const faints = (n: Needs) => n.hunger <= 0 || n.energy <= 0;

/** Needs on waking: rested after sleep, only partly after fainting. Sleep does not feed. */
export function wake(n: Needs, fainted: boolean): Needs {
  return { hunger: Math.max(fainted ? 0.3 : 0.1, n.hunger - 0.15), energy: fainted ? 0.6 : 1 };
}
