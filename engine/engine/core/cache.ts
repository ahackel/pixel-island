import { drew, watch } from '../../shared/stats.ts';

/**
 * One store, with one memory budget, for every drawn picture that can be drawn again: plants, props, objects,
 * animals, characters. Past the budget the pictures used longest ago go first, but never one used in the last
 * second, so a scene that needs more than the budget runs over it rather than redrawing every frame. What hangs
 * off a picture (its packed pixels, shadows, wading copies) is kept in WeakMaps and goes with it.
 */
export const BUDGET = 32 * 2 ** 20;
const KEEP_MS = 1000;

interface Entry { value: unknown; bytes: number; used: number; cache: string }
/** In order of last use, oldest first: a hit moves its entry to the end. */
const entries = new Map<string, Entry>();
const perCache = new Map<string, [number, number]>();
let total = 0;

function count(cache: string, n: number, bytes: number): void {
  let c = perCache.get(cache);
  if (!c) {
    perCache.set(cache, (c = [0, 0]));
    watch(cache, () => perCache.get(cache)!);
  }
  c[0] += n;
  c[1] += bytes;
  total += bytes;
}

function drop(key: string, e: Entry): void {
  entries.delete(key);
  count(e.cache, -1, -e.bytes);
}

/** The picture `key` of `cache`, drawn on a miss. `bytes` says what one keeps; pictures that know it need not. */
export function cached<T>(cache: string, key: string, draw: () => T, bytes: (made: T) => number = (v) => (v as { bytes: number }).bytes): T {
  const full = `${cache}|${key}`;
  const now = performance.now();
  const hit = entries.get(full);
  if (hit) {
    entries.delete(full);
    entries.set(full, hit);
    hit.used = now;
    return hit.value as T;
  }
  const value = drew(cache, draw, bytes);
  const e: Entry = { value, bytes: bytes(value), used: now, cache };
  entries.set(full, e);
  count(cache, 1, e.bytes);
  for (const [k, old] of entries) {
    if (total <= BUDGET || now - old.used < KEEP_MS) break;
    drop(k, old);
  }
  return value;
}

/** Whether the picture `key` of `cache` is drawn and kept, without counting as a use. */
export const has = (cache: string, key: string): boolean => entries.has(`${cache}|${key}`);

/** Forgets the pictures of `cache` whose keys start with `prefix`, as when what they show was edited. */
export function forget(cache: string, prefix = ''): void {
  const start = `${cache}|${prefix}`;
  for (const [k, e] of entries) if (k.startsWith(start)) drop(k, e);
}

const ids = new WeakMap<object, number>();
let nextId = 0;
/** A number for an object, the same each time, for cache keys of things known by identity (a build, a look). */
export function idOf(o: object): number {
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = nextId++));
  return id;
}
