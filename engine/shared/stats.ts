/**
 * Dev counters for drawing: how often each render cache misses, how long its drawing takes and roughly how many
 * bytes it makes, what each cache holds now, and time spent in named parts of a frame. Read in the console with
 * `__render.report()` (`__render.reset()` starts a new count), or live in the stats overlay (`shared/cheats.ts`).
 * Counting is a few additions, so it stays on.
 */
interface Count { misses: number; ms: number; bytes: number }
const caches: Record<string, Count> = {};
const parts: Record<string, number> = {};
const held: Record<string, () => [entries: number, bytes: number]> = {};
let frames = 0;
let since = performance.now();
/** Never reset: the overlay works from differences of these. */
let allFrames = 0;
let allFrameMs = 0;

/** Draws on a cache miss, counting it; `bytes` gives what the result keeps. */
export function drew<T>(cache: string, draw: () => T, bytes: (made: T) => number): T {
  const t0 = performance.now();
  const made = draw();
  const c = (caches[cache] ??= { misses: 0, ms: 0, bytes: 0 });
  c.misses++;
  c.ms += performance.now() - t0;
  c.bytes += bytes(made);
  return made;
}

/** Adds the time since `t0` to a part of the frame, and gives the time now for the next part. */
export function part(name: string, t0: number): number {
  const now = performance.now();
  parts[name] = (parts[name] ?? 0) + now - t0;
  if (name === 'whole frame') allFrameMs += now - t0;
  return now;
}

export const frameDone = () => void (frames++, allFrames++);

/** Lets the counters see what a cache holds now: its entries and their bytes. */
export const watch = (cache: string, holds: () => [number, number]) => void (held[cache] = holds);

/** Bytes of a canvas kept as one string-or-null slot per pixel (a pointer each), plus `extra` per pixel. */
export const slots = (w: number, h: number, extra = 0) => w * h * (8 + extra);

const heapMB = () => {
  const heap = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  return heap ? +(heap / 2 ** 20).toFixed(1) : undefined;
};

/** What the caches hold now, by name: entries and bytes. */
export function cachesNow(): { name: string; entries: number; bytes: number }[] {
  return Object.entries(held).map(([name, f]) => { const [entries, bytes] = f(); return { name, entries, bytes }; });
}

/** Running totals for an overlay: frames drawn and their time so far, and the JS heap in MB where the browser tells it. */
export const totals = () => ({ frames: allFrames, frameMs: allFrameMs, heapMB: heapMB() });

function report() {
  const n = Math.max(1, frames);
  const s = (performance.now() - since) / 1000;
  const now = Object.fromEntries(cachesNow().map((c) => [c.name, c]));
  const table: Record<string, Record<string, string | number>> = {};
  for (const name of new Set([...Object.keys(caches), ...Object.keys(held)])) {
    const c = caches[name] ?? { misses: 0, ms: 0, bytes: 0 };
    table[name] = {
      'misses/frame': +(c.misses / n).toFixed(2), 'draw ms/frame': +(c.ms / n).toFixed(2), 'KB made': Math.round(c.bytes / 1024),
      entries: now[name]?.entries ?? '', 'KB held': now[name] ? Math.round(now[name].bytes / 1024) : '',
    };
  }
  for (const [name, ms] of Object.entries(parts)) table[`frame: ${name}`] = { 'draw ms/frame': +(ms / n).toFixed(2) };
  console.table(table);
  return { frames, fps: +(frames / s).toFixed(1), heapMB: heapMB(), table };
}

function reset() {
  for (const k of Object.keys(caches)) delete caches[k];
  for (const k of Object.keys(parts)) delete parts[k];
  frames = 0;
  since = performance.now();
}

(globalThis as { __render?: unknown }).__render = { report, reset };
