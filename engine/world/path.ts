// A way round what blocks a walker, for walking where the player taps: A* over tile centres, eight
// neighbours, each step checked with the world's own `canWalk` (water, cliffs, plants, items), then
// straightened where a direct walk is free.
import type { World } from './world.ts';

type P = { i: number; j: number };

/** Waypoints from `from` to `to`, ending exactly at `to`; empty when it cannot be reached. */
export function findPath(world: World, from: P, to: P): P[] {
  const { w, h } = world.map;
  const start = Math.floor(from.j) * w + Math.floor(from.i);
  const goal = Math.floor(to.j) * w + Math.floor(to.i);
  if (goal < 0 || goal >= w * h || !world.canWalk(to, to)) return [];
  if (start === goal || clear(world, from, to)) return [to];
  const centre = (k: number): P => ({ i: (k % w) + 0.5, j: Math.floor(k / w) + 0.5 });
  const cost = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const open = [start];
  const guess = (k: number) => Math.hypot(centre(k).i - to.i, centre(k).j - to.j);
  while (open.length) {
    // shortcut: a sorted array for the open list; fine up to 64 by 64 maps, use a heap if paths ever lag.
    open.sort((a, b) => cost.get(a)! + guess(a) - (cost.get(b)! + guess(b)));
    const k = open.shift()!;
    if (k === goal) break;
    const at = k === start ? from : centre(k);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = (k % w) + di;
      const nj = Math.floor(k / w) + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const n = nj * w + ni;
      const next = n === goal ? to : centre(n);
      if (!clear(world, at, next)) continue;
      const c = cost.get(k)! + Math.hypot(di, dj);
      if (c < (cost.get(n) ?? Infinity)) {
        cost.set(n, c);
        came.set(n, k);
        if (!open.includes(n)) open.push(n);
      }
    }
  }
  if (!came.has(goal)) return [];
  const way: P[] = [to];
  for (let k = came.get(goal)!; k !== start; k = came.get(k)!) way.unshift(centre(k));
  return straightened(world, from, way);
}

/** How far ahead along a way a straight walk is tried, so long ways stay cheap to straighten. */
const LOOK = 12;

/**
 * The way with the tile-by-tile turns taken out: from each point, straight on to the furthest later one that can be
 * walked to directly, rather than zigzagging from tile middle to tile middle.
 */
function straightened(world: World, from: P, way: P[]): P[] {
  const out: P[] = [];
  let at = from;
  for (let k = 0; k < way.length;) {
    let far = k;
    for (let m = Math.min(way.length - 1, k + LOOK); m > k; m--) {
      if (clear(world, at, way[m])) { far = m; break; }
    }
    out.push(way[far]);
    at = way[far];
    k = far + 1;
  }
  return out;
}

/** Whether a straight walk is free, checked every fifth of a metre. */
function clear(world: World, a: P, b: P): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.i - a.i, b.j - a.j) * 5));
  let prev = a;
  for (let s = 1; s <= steps; s++) {
    const p = { i: a.i + ((b.i - a.i) * s) / steps, j: a.j + ((b.j - a.j) * s) / steps };
    if (!world.canWalk(prev, p)) return false;
    prev = p;
  }
  return true;
}
