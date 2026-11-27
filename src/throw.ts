// Things thrown from the bag: where one lands and its arc through the air. Plain functions of map positions (in
// metres), so the tests can use them (throw.test.ts); the game draws and lands them (main.ts `putDown`, `land`).
import type { BagItem } from './crafts.ts';

type Spot = { i: number; j: number };

/** How far a thing from the bag is thrown at most, in metres, and how long it flies, in ms. */
export const THROW = { far: 1, ms: 450 };

/** A thing in the air: what, from where to where, and when it was thrown. */
export interface Thrown { item: BagItem; from: Spot; to: Spot; start: number }

/**
 * Where a thing thrown from `from` toward `toward` (a map offset) lands: at most THROW.far away, and never somewhere
 * `ok` refuses (over a wall, into the sea), then shorter, in quarters, down to the thrower's feet.
 */
export function landing(from: Spot, toward: Spot, ok: (at: Spot) => boolean): Spot {
  let { i: di, j: dj } = toward;
  const d = Math.hypot(di, dj);
  if (d > THROW.far) (di *= THROW.far / d), (dj *= THROW.far / d);
  for (let k = 1; k >= 0.25; k -= 0.25) {
    const at = { i: from.i + di * k, j: from.j + dj * k };
    if (ok(at)) return at;
  }
  return { i: from.i, j: from.j };
}

/** Whether a thrown thing has landed by `ms`. */
export const landed = (t: Thrown, ms: number) => ms - t.start >= THROW.ms;

/** Where a thrown thing is at `ms`: along the line, and how many levels above the ground, from the hands (2) up in an arc and down. */
export function flight(t: Thrown, ms: number): { i: number; j: number; up: number } {
  const k = Math.min(1, (ms - t.start) / THROW.ms);
  return { i: t.from.i + (t.to.i - t.from.i) * k, j: t.from.j + (t.to.j - t.from.j) * k, up: 2 * (1 - k) + 6 * k * (1 - k) };
}
