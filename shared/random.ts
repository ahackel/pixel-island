// Seeded randomness shared by everything drawn by rule: the same seed always gives the same picture.

/** A hash of a text (FNV-1a), as a 32-bit integer. Only for seeding: use it in bitwise operations. */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h;
}

/** A stream of random numbers from 0 to 1 that depends only on the seed (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fixed random number from 0 to 1 for one pixel, in steps of a thousandth. */
export const pixelHash = (x: number, y: number, seed = 0): number =>
  ((Math.imul(x + 31, 73856093) ^ Math.imul(y + 7, 19349663) ^ seed) >>> 0) % 1000 / 1000;

/** A fixed random number from 0 to 1 for one cell in space, in steps of a thousandth. */
export const cellHash = (a: number, b: number, c: number): number =>
  ((Math.imul(a + 101, 73856093) ^ Math.imul(b + 37, 19349663) ^ Math.imul(c + 11, 83492791)) >>> 0) % 1000 / 1000;
