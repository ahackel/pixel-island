// The shape of the ground: how each cell's top follows from the levels and its shape (`HeightMap.shape`), and what
// can be walked. No drawing here; terrain.ts draws what this says, and world.ts walks by it.
//
// Smooth ground shares its corners: each corner is the mean of the smooth cells round it (and of the sea floor past a
// sea's edge), so smooth neighbours always meet without a step, and the middle of a smooth cell stays at its own level.
// Cut ground is flat at its level, with hard steps to whatever is beside it. A ramp runs between the floors at the ends
// of its run of ramp cells. A hole has no floor at all. Rock (terrain.ts `ROCK_LEVEL`) is cut, whatever its shape says.
import { inside, isRock, levelAt, MIN_LEVEL, waterOf, type HeightMap } from './terrain.ts';

export const SMOOTH = 0;
export const CUT = 1;
/** Ramps are `RAMP` + 0 to 3: rising toward +i, -i, +j and -j. */
export const RAMP = 2;
export const HOLE = 6;
/** How many shapes there are, ramps four of them. */
export const SHAPES = 7;
/** Which way a ramp rises, by `shape - RAMP`. */
export const RAMP_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** The direction a ramp rises in (0 to 3, an index of `RAMP_DIRS`), or -1 for any other shape. */
export const rampDir = (shape: number) => (shape >= RAMP && shape < RAMP + 4 ? shape - RAMP : -1);

/** What a ramp rising toward each direction becomes after one quarter turn of the view, (i, j) to (h - j, i). */
const TURN = [2, 3, 1, 0];
/** A shape as seen after `turns` quarter turns of the view (ramps turn with it), or back with a negative `turns`. */
export function turnShape(shape: number, turns: number): number {
  const d = rampDir(shape);
  if (d < 0) return shape;
  let r = d;
  for (let k = 0; k < (((turns % 4) + 4) % 4); k++) r = TURN[r];
  return RAMP + r;
}

/** A step between neighbours, in levels of their surfaces (ground or water), over which a scene without shapes of its own cuts the higher cell. */
const CLIFF_STEP = 2;
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * A cell's shape by rule, for ground made before shapes were kept: smooth, but where it stands more than `CLIFF_STEP`
 * levels over a neighbour (counting water at the water line), which is cut so the step stays a cliff. Rock is cut.
 */
function ruledShape(map: HeightMap, i: number, j: number): number {
  const level = map.levels[j * map.w + i];
  if (isRock(level)) return CUT;
  const water = waterOf(map);
  const top = Math.max(water, level);
  for (const [di, dj] of SIDES) {
    if (!inside(map, i + di, j + dj)) continue;
    const other = map.levels[(j + dj) * map.w + i + di];
    if (!isRock(other) && top - Math.max(water, other) > CLIFF_STEP) return CUT;
  }
  return SMOOTH;
}

/** The shapes a map has by rule (`ruledShape`): what a scene saved before shapes were kept starts with. */
export function defaultShape(map: HeightMap): Uint8Array {
  const shape = new Uint8Array(map.w * map.h);
  for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) shape[j * map.w + i] = ruledShape(map, i, j);
  return shape;
}

/** A cell's shape: the map's own, or by rule where it has none. Off the map, smooth. */
export function shapeAt(map: HeightMap, i: number, j: number): number {
  if (!inside(map, i, j)) return SMOOTH;
  return map.shape ? map.shape[j * map.w + i] : ruledShape(map, i, j);
}

/** Whether a cell is smooth ground: smooth, and neither rock nor a hole. */
const isSmooth = (map: HeightMap, i: number, j: number) => shapeAt(map, i, j) === SMOOTH && !isRock(levelAt(map, i, j));

/** The height of the corner shared by the cells round map point (vi, vj): the mean of the smooth ones and of open ground past the edge, or `own` with none. */
function vertex(map: HeightMap, vi: number, vj: number, own: number): number {
  let sum = 0, k = 0;
  for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
    const i = vi + di, j = vj + dj;
    if (!inside(map, i, j)) {
      // Past the edge, the sea floor (or what lies beyond); nothing where rock or nothing does.
      const out = map.outside ?? MIN_LEVEL;
      if (!isRock(out)) { sum += out; k++; }
      continue;
    }
    if (isSmooth(map, i, j)) { sum += map.levels[j * map.w + i]; k++; }
  }
  return k ? sum / k : own;
}

/** Floor a ramp can run from or to: not rock, a hole or another ramp. */
const landing = (map: HeightMap, i: number, j: number) => {
  if (!inside(map, i, j)) return null;
  const shape = shapeAt(map, i, j), level = levelAt(map, i, j);
  return isRock(level) || shape === HOLE || rampDir(shape) >= 0 ? null : level;
};

/**
 * A ramp's corners: it runs evenly from the floor at the low end of its run of ramp cells (all rising the same way) to
 * the floor at the high end, each cell taking its share. Null where it has no floor at both ends or the far one is not
 * higher: then it is drawn as cut ground at its own level.
 */
function rampCorners(map: HeightMap, i: number, j: number, d: number): [number, number, number, number] | null {
  const [di, dj] = RAMP_DIRS[d], code = RAMP + d;
  let bi = i - di, bj = j - dj, k = 0;
  while (inside(map, bi, bj) && shapeAt(map, bi, bj) === code) { k++; bi -= di; bj -= dj; }
  let fi = i + di, fj = j + dj, m = 0;
  while (inside(map, fi, fj) && shapeAt(map, fi, fj) === code) { m++; fi += di; fj += dj; }
  const low = landing(map, bi, bj), high = landing(map, fi, fj);
  if (low === null || high === null || high <= low) return null;
  const n = k + m + 1;
  const h0 = low + ((high - low) * k) / n, h1 = low + ((high - low) * (k + 1)) / n;
  const up = d === 0 ? [0, 1, 1, 0] : d === 1 ? [1, 0, 0, 1] : d === 2 ? [0, 0, 1, 1] : [1, 1, 0, 0];
  return up.map((u) => (u ? h1 : h0)) as [number, number, number, number];
}

/**
 * The heights of a cell's four corners: north (i, j), east (i + 1, j), south (i + 1, j + 1) and west (i, j + 1), by its
 * shape (see the top of this file). Rock, cut ground and holes are flat at their level.
 */
export function cornersOf(map: HeightMap, i: number, j: number): [number, number, number, number] {
  const own = levelAt(map, i, j);
  if (isRock(own) || !inside(map, i, j)) return [own, own, own, own];
  const shape = shapeAt(map, i, j);
  if (shape === SMOOTH) return [vertex(map, i, j, own), vertex(map, i + 1, j, own), vertex(map, i + 1, j + 1, own), vertex(map, i, j + 1, own)];
  const d = rampDir(shape);
  return (d >= 0 && rampCorners(map, i, j, d)) || [own, own, own, own];
}

/** Whether four corners and a middle lie in one plane. */
const planar = (c: readonly number[], mid: number) => Math.abs(c[0] + c[2] - c[1] - c[3]) < 1e-3 && Math.abs(mid - (c[0] + c[1] + c[2] + c[3]) / 4) < 1e-3;
/**
 * How far from the mean of its corners a smooth cell's level must be for its middle to stand at that level: from the
 * first figure the middle starts to move toward it, from the second it is there. On an even slope or a shore a cell's
 * level is near the mean, and the top stays a plane; a single cell raised over the ground round it shows as a hump.
 * Ground at or under the water line has no middle.
 */
const MIDDLE = [0.25, 0.75] as const;

/** A cell's top: its corners, and for smooth ground that stands off the mean of its corners a middle (the top is then four triangles round it). */
export interface Top { corners: [number, number, number, number]; mid: number | null }
export function topOf(map: HeightMap, i: number, j: number): Top {
  const corners = cornersOf(map, i, j);
  // At and under the water line the ground stays even, so the shore runs smoothly from cell to cell.
  if (!inside(map, i, j) || !isSmooth(map, i, j) || levelAt(map, i, j) <= waterOf(map)) return { corners, mid: null };
  const mean = (corners[0] + corners[1] + corners[2] + corners[3]) / 4;
  const off = levelAt(map, i, j) - mean;
  const k = Math.max(0, Math.min(1, (Math.abs(off) - MIDDLE[0]) / (MIDDLE[1] - MIDDLE[0])));
  const mid = mean + off * k;
  return { corners, mid: planar(corners, mid) ? null : mid };
}

/** Which diagonal a top without a middle folds along: the one whose ends are closest in height. */
export const foldsNorthSouth = (c: readonly number[]) => Math.abs(c[0] - c[2]) <= Math.abs(c[1] - c[3]);
/** The triangles a top is drawn as, by corner (0 to 3) and 4 for the middle: four round the middle, or two folded. */
export function trianglesOf(top: Top): number[][] {
  if (top.mid !== null) return [[0, 1, 4], [3, 0, 4], [1, 2, 4], [2, 3, 4]];
  return foldsNorthSouth(top.corners) ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 3], [1, 2, 3]];
}
/** Where each of a top's points lies in its cell: the corners, then the middle. */
export const POINT_UV = [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]] as const;

/** The height of a top at (u, v) in its cell, each 0 to 1: on the triangle of it that point falls in. */
export function heightIn(top: Top, u: number, v: number): number {
  const [n, e, s, w] = top.corners;
  if (top.mid === null) {
    if (foldsNorthSouth(top.corners)) return u >= v ? n + u * (e - n) + v * (s - e) : n + v * (w - n) + u * (s - w);
    return u + v <= 1 ? n + u * (e - n) + v * (w - n) : s + (1 - u) * (w - s) + (1 - v) * (e - s);
  }
  // The triangle round the middle the point falls in, by the two corners it has.
  const du = u - 0.5, dv = v - 0.5;
  const [p, q] = Math.abs(du) >= Math.abs(dv) ? (du > 0 ? [1, 2] : [3, 0]) : (dv > 0 ? [2, 3] : [0, 1]);
  const pu = POINT_UV[p][0] - 0.5, pv = POINT_UV[p][1] - 0.5, qu = POINT_UV[q][0] - 0.5, qv = POINT_UV[q][1] - 0.5;
  const hp = top.corners[p] - top.mid, hq = top.corners[q] - top.mid, det = pu * qv - qu * pv;
  return top.mid + ((hp * qv - hq * pv) / det) * du + ((pu * hq - qu * hp) / det) * dv;
}

/**
 * The way a ramp on a cell would best rise (an index of `RAMP_DIRS`): toward a higher floor, from a lower one behind
 * (a run of ramps between them counts as one), carrying on a ramp beside it where it can; -1 where none would.
 */
export function bestRamp(map: HeightMap & { shape: Uint8Array }, i: number, j: number): number {
  const c = j * map.w + i, was = map.shape[c];
  let best = -1, score = 0;
  for (let d = 0; d < 4; d++) {
    map.shape[c] = RAMP + d;
    const corners = cornersOf(map, i, j);
    if (Math.max(...corners) - Math.min(...corners) < 1e-6) continue;
    const [di, dj] = RAMP_DIRS[d];
    const s = [1, -1].some((k) => shapeAt(map, i + di * k, j + dj * k) === RAMP + d) ? 2 : 1;
    if (s > score) [best, score] = [d, s];
  }
  map.shape[c] = was;
  return best;
}

// ------------------------------------------------------------------ walking

/** The most two cells' tops may differ at each end of the edge they share for a walker to step across it, in levels. */
export const EDGE_STEP = 1;
/** Smooth ground rising more than this from its middle to a corner is too steep to walk. */
export const STEEP = 1.5;

/** Whether a cell is ground one can stand on at all: on the map, not rock, not a hole, and not too steep. */
export function standable(map: HeightMap, i: number, j: number): boolean {
  if (!inside(map, i, j) || isRock(levelAt(map, i, j)) || shapeAt(map, i, j) === HOLE) return false;
  const top = topOf(map, i, j);
  return top.mid === null || top.corners.every((c) => Math.abs(c - top.mid!) <= STEEP + 1e-6);
}

/** Whether a walker can step from a cell to the one beside it (four ways only): both ends of the edge they share within `EDGE_STEP`. */
export function edgeWalkable(map: HeightMap, ai: number, aj: number, bi: number, bj: number): boolean {
  const a = cornersOf(map, ai, aj), b = cornersOf(map, bi, bj);
  // The ends of the shared edge, by corner of each cell.
  const [pa, pb] = bi > ai ? [[1, 2], [0, 3]] : bi < ai ? [[0, 3], [1, 2]] : bj > aj ? [[3, 2], [0, 1]] : [[0, 1], [3, 2]];
  return Math.abs(a[pa[0]] - b[pb[0]]) <= EDGE_STEP + 1e-6 && Math.abs(a[pa[1]] - b[pb[1]]) <= EDGE_STEP + 1e-6;
}
