// A way round what blocks a walker, for walking where the player taps: A* over tile centres, eight
// neighbours, each step checked with the world's own `canWalk` (water, cliffs, plants, items, walls, doors), and
// the scene's ladders as one more step each, from foot to top or back; then straightened where a direct walk is free.
// Closed doors are planned through (the walker opens them on the way); a ladder on the way is a waypoint to climb from.
import { climbOf, ladderSpots, type Climb, type LadderView, type SceneDoor } from './ways.ts';
import type { World } from './world.ts';

type P = { i: number; j: number };
/** A point of a way; one with `climb` is the foot or top of a ladder, climbed from there to its other end. */
export type Waypoint = P & { climb?: Climb };

/** What a ladder costs to climb, against a tile's step. */
const CLIMB_COST = 2.5;
/** The doors a way may go through unless told otherwise: the closed ones. */
const CLOSED = (d: SceneDoor) => d.state === 'closed';

/**
 * Waypoints from `from` to `to`, ending exactly at `to`; empty when it cannot be reached. Doors `pass` lets through
 * (by default the closed ones) count as open.
 */
export function findPath(world: World, from: P, to: P, pass: (d: SceneDoor) => boolean = CLOSED): Waypoint[] {
  const { w, h } = world.map;
  const start = Math.floor(from.j) * w + Math.floor(from.i);
  const goal = Math.floor(to.j) * w + Math.floor(to.i);
  if (goal < 0 || goal >= w * h || !world.canWalk(to, to, pass)) return [];
  if (start === goal || clear(world, from, to, pass)) return [to];
  // Each ladder is a step both ways between its foot and its top.
  const links = new Map<number, { n: number; L: LadderView; up: boolean }[]>();
  const link = (a: number, n: number, L: LadderView, up: boolean) => (links.get(a) ?? links.set(a, []).get(a)!).push({ n, L, up });
  for (const L of world.viewLadders()) {
    const f = L.foot[1] * w + L.foot[0], t = L.top[1] * w + L.top[0];
    link(f, t, L, true);
    link(t, f, L, false);
  }
  const via = new Map<number, { L: LadderView; up: boolean }>();
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
      if (!clear(world, at, next, pass)) continue;
      const c = cost.get(k)! + Math.hypot(di, dj);
      if (c < (cost.get(n) ?? Infinity)) {
        cost.set(n, c);
        came.set(n, k);
        via.delete(n);
        if (!open.includes(n)) open.push(n);
      }
    }
    for (const { n, L, up } of links.get(k) ?? []) {
      const c = cost.get(k)! + CLIMB_COST;
      if (c < (cost.get(n) ?? Infinity)) {
        cost.set(n, c);
        came.set(n, k);
        via.set(n, { L, up });
        if (!open.includes(n)) open.push(n);
      }
    }
  }
  if (!came.has(goal)) return [];
  const cells: number[] = [];
  for (let k = goal; k !== start; k = came.get(k)!) cells.unshift(k);
  // Walked stretches, straightened each on its own, between the ladders climbed.
  const out: Waypoint[] = [];
  let at: P = from;
  let stretch: P[] = [];
  for (const k of cells) {
    const v = via.get(k);
    if (!v) {
      stretch.push(k === goal ? to : centre(k));
      continue;
    }
    const spots = ladderSpots(v.L);
    const [begin, end] = v.up ? [spots.foot, spots.top] : [spots.top, spots.foot];
    out.push(...straightened(world, at, [...stretch, begin], pass));
    out[out.length - 1] = { ...begin, climb: climbOf(v.L, v.up) };
    at = end;
    stretch = k === goal ? [to] : [];
  }
  if (stretch.length) out.push(...straightened(world, at, stretch, pass));
  return out;
}

/** How far ahead along a way a straight walk is tried, so long ways stay cheap to straighten. */
const LOOK = 12;

/**
 * The way with the tile-by-tile turns taken out: from each point, straight on to the furthest later one that can be
 * walked to directly, rather than zigzagging from tile middle to tile middle.
 */
function straightened(world: World, from: P, way: P[], pass: (d: SceneDoor) => boolean): P[] {
  const out: P[] = [];
  let at = from;
  for (let k = 0; k < way.length;) {
    let far = k;
    for (let m = Math.min(way.length - 1, k + LOOK); m > k; m--) {
      if (clear(world, at, way[m], pass)) { far = m; break; }
    }
    out.push(way[far]);
    at = way[far];
    k = far + 1;
  }
  return out;
}

/**
 * Whether a straight walk is free: checked every fifth of a metre, and just past every tile edge it crosses, so each
 * step onto another tile is checked as the walker takes it. Through a tile's corner the walker may come by either
 * tile beside it, so both ways round must be free.
 */
function clear(world: World, a: P, b: P, pass: (d: SceneDoor) => boolean): boolean {
  const di = b.i - a.i, dj = b.j - a.j;
  const steps = Math.max(1, Math.ceil(Math.hypot(di, dj) * 5));
  const at = (t: number): P => ({ i: a.i + di * t, j: a.j + dj * t });
  // Where the way crosses tile edges, along i and along j, as fractions of it.
  const edges = (from: number, d: number) => {
    const out: number[] = [];
    if (!d) return out;
    for (let x = d > 0 ? Math.floor(from) + 1 : Math.ceil(from) - 1; d > 0 ? x <= from + d : x >= from + d; x += Math.sign(d)) out.push((x - from) / d);
    return out;
  };
  const across = edges(a.i, di), down = edges(a.j, dj);
  const ts = [...Array.from({ length: steps }, (_, s) => (s + 1) / steps), ...across, ...down].sort((x, y) => x - y);
  const EPS = 1e-6;
  let prev = a;
  for (const t of ts) {
    // Just past an edge, so the point lies in the tile beyond it.
    const p = at(Math.min(1, t + EPS));
    const corner = across.some((x) => Math.abs(x - t) < EPS) && down.some((y) => Math.abs(y - t) < EPS);
    if (corner) {
      const c = at(t), si = Math.sign(di) * EPS * 10, sj = Math.sign(dj) * EPS * 10;
      for (const side of [{ i: c.i + si, j: c.j - sj }, { i: c.i - si, j: c.j + sj }]) {
        if (!world.canWalk(prev, side, pass) || !world.canWalk(side, p, pass)) return false;
      }
    } else if (!world.canWalk(prev, p, pass)) return false;
    prev = p;
  }
  return true;
}
