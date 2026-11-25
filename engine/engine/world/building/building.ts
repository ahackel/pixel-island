// Buildings put together from pieces on the map grid: pieces on cell EDGES (walls) and pieces on
// CELLS (roofs). Nothing here knows what a hut is: a building is just the pieces laid so far, and
// each kind of piece (pieces/*.ts) draws itself. This module turns them into pictures for the frame
// with what is shared: where an edge stands on the terrain, which cells a roof covers, the shadows,
// which edges block walking and how a building looks from inside.
//
//  - an edge piece stores only its edge; its heights come from the terrain's corners, so it follows
//    slopes and stands on top across a cliff;
//  - neighbouring cell pieces of one kind make a patch, drawn as one piece over its bounding rectangle;
//  - a covering patch (a roof) rests on the wall tops: the walls under it stop below its eaves and
//    lie in its shade, and standing in it hides it and cuts its front walls to half height.
import { cornersOf, inside, isRock, LEVEL_M, levelAt, LEVEL_PX, SHADOW_RUN, TILE_H, TILE_W, waterOf, type HeightMap, type TerrainImage } from '../terrain.ts';

export const HALF_W = TILE_W / 2; // screen columns along one cell edge
export const HALF_H = TILE_H / 2; // rows down along one cell edge

/** H runs along i between vertices (i, j) and (i + 1, j); V along j between (i, j) and (i, j + 1). */
export type Axis = 'H' | 'V';
export interface Edge { axis: Axis; i: number; j: number }
export const edgeKey = (e: Edge) => `${e.axis}${e.i},${e.j}`;
export const cellKey = (i: number, j: number) => `${i},${j}`;

/** `fade`: how far it has dissolved down to a stub a level high (see `dissolved`), 0 to 1 in sixteenths; none unless set. */
/** `open` and `locked` only for a door: how far its leaf has swung open, 0 to 1, and whether it shows its lock. */
export interface EdgePiece { kind: string; edge: Edge; fade?: number; open?: number; locked?: boolean }
export interface CellPiece { kind: string; i: number; j: number }

/** A building as built so far. */
export interface Building {
  /** Wall height, in levels: where roofs rest. */
  height: number;
  edges: Map<string, EdgePiece>;
  cells: Map<string, CellPiece>;
}
export const emptyBuilding = (height: number): Building => ({ height, edges: new Map(), cells: new Map() });

/** Neighbouring cell pieces of one kind, drawn together over cells i0..i1 by j0..j1. */
// shortcut: an L-shaped patch gets one piece over its bounding box; split it into rectangles when roofs need corners.
export interface Patch { kind: string; i0: number; i1: number; j0: number; j1: number; cells: string[] }

/** Where a building stands: the map as drawn (sea floor shaped) and its ground picture. */
export interface Site { map: HeightMap; ground: TerrainImage }

export interface Box { x0: number; x1: number; y0: number; y1: number }
/** A drawn piece: a picture placed on the ground image, with what sorting, hiding and shadows need. */
export interface Part {
  x: number; y: number; w: number; h: number;
  rgba: Uint8ClampedArray;
  /** Per pixel, the level of the ground it stands on, for hiding it behind nearer higher ground. */
  base: Float32Array;
  /** The cell used to decide what lies in front. */
  ci: number; cj: number;
  /** Where it stands on the plan, in map units, and a scalar fallback: for sorting. */
  box: Box;
  key: number;
  /** Ground-image pixels in its shadow. */
  shadow: number[];
  edge?: Edge;
  patch?: Patch;
  /** Not drawn (a roof seen from under it), but still casting its shadow. */
  hidden?: boolean;
}

/**
 * How an edge piece is drawn: `cut` sawn off at half height, `cap` the eaves level of a roof over it, `fade` dissolved
 * down to a stub; for a door, `open` and `locked` as on its piece.
 */
export interface EdgeKind { on: 'edge'; draw(site: Site, e: Edge, height: number, o: { cut: boolean; cap?: number; fade?: number; open?: number; locked?: boolean }): Part }
/** How a patch of cell pieces is drawn; `floor` is the highest ground under it. A covering kind is a roof. */
export interface CellKind { on: 'cell'; covers: boolean; draw(site: Site, p: Patch, floor: number, height: number): Part }
export type PieceKind = EdgeKind | CellKind;

// ------------------------------------------------------------------ shared geometry and light

/**
 * The ground height, in levels, at the two ends of an edge: the higher of what the two cells that
 * share the edge say, so a wall never sinks into the ground and, across a cliff, stands on top. Rock on one side
 * is no ground: the wall stands on the other side's (a cave's wall on its floor).
 */
export function endHeights(map: HeightMap, e: Edge): [number, number] {
  const [bi, bj] = e.axis === 'H' ? [e.i, e.j - 1] : [e.i - 1, e.j];
  const front = cornersOf(map, e.i, e.j);
  const behind = cornersOf(map, bi, bj);
  // The two ends on each side: the edge's first and second end, by which corners of each cell they are.
  const f = e.axis === 'H' ? [front[0], front[1]] : [front[0], front[3]];
  const k = e.axis === 'H' ? [behind[3], behind[2]] : [behind[1], behind[2]];
  const rockFront = isRock(levelAt(map, e.i, e.j)), rockBehind = isRock(levelAt(map, bi, bj));
  const end = (n: 0 | 1) => (rockBehind && !rockFront ? f[n] : rockFront && !rockBehind ? k[n] : Math.max(f[n], k[n]));
  // Over water, it stands on the water line.
  const water = waterOf(map);
  return [Math.max(water, end(0)), Math.max(water, end(1))];
}

/**
 * Both sides of an edge, in levels at its two ends: `low` the lower ground and `high` the higher (a wall's top counts
 * from it; a fence stands on it), and `foot` where a wall's face reaches down to: the ground on the camera's side of
 * the edge, so down a step to the lower side where that lies in front, and the higher side where it is the step's
 * own face that stands in front of the wall. Rock is no ground, as for `endHeights`; over water, the water line.
 */
export function wallEnds(map: HeightMap, e: Edge): { low: [number, number]; high: [number, number]; foot: [number, number] } {
  const [bi, bj] = e.axis === 'H' ? [e.i, e.j - 1] : [e.i - 1, e.j];
  const ahead = cornersOf(map, e.i, e.j), behind = cornersOf(map, bi, bj);
  const f = e.axis === 'H' ? [ahead[0], ahead[1]] : [ahead[0], ahead[3]];
  const k = e.axis === 'H' ? [behind[3], behind[2]] : [behind[1], behind[2]];
  const rockFront = !inside(map, e.i, e.j) || isRock(levelAt(map, e.i, e.j)), rockBehind = !inside(map, bi, bj) || isRock(levelAt(map, bi, bj));
  const water = waterOf(map);
  const side = (n: 0 | 1, pick: (a: number, b: number) => number) =>
    Math.max(water, rockBehind && !rockFront ? f[n] : rockFront && !rockBehind ? k[n] : pick(f[n], k[n]));
  const front = (n: 0 | 1) => Math.max(water, rockFront ? k[n] : f[n]);
  return { low: [side(0, Math.min), side(1, Math.min)], high: [side(0, Math.max), side(1, Math.max)], foot: [front(0), front(1)] };
}

/** The two ends of an edge, as map points. */
export const edgeEnds = (e: Edge): [[number, number], [number, number]] => [[e.i, e.j], e.axis === 'H' ? [e.i + 1, e.j] : [e.i, e.j + 1]];
/** The edge between two neighbouring map points (a cell's corners), or null if they are not neighbours. */
export function edgeBetween(a: [number, number], b: [number, number]): Edge | null {
  if (a[1] === b[1] && Math.abs(a[0] - b[0]) === 1) return { axis: 'H', i: Math.min(a[0], b[0]), j: a[1] };
  if (a[0] === b[0] && Math.abs(a[1] - b[1]) === 1) return { axis: 'V', i: a[0], j: Math.min(a[1], b[1]) };
  return null;
}
/** The four edges meeting at a map point (a cell corner). */
export const edgesAt = (x: number, y: number): Edge[] => [{ axis: 'H', i: x - 1, j: y }, { axis: 'H', i: x, j: y }, { axis: 'V', i: x, j: y - 1 }, { axis: 'V', i: x, j: y }];

/**
 * Whether a step from one cell to a diagonal neighbour goes past a wall: past the end of any wall at the corner the two
 * cells share, which the step would squeeze by.
 */
export function cornerBlocked(b: Building, from: [number, number], to: [number, number]): boolean {
  if (Math.abs(to[0] - from[0]) !== 1 || Math.abs(to[1] - from[1]) !== 1) return false;
  const x = Math.max(from[0], to[0]), y = Math.max(from[1], to[1]);
  return edgesAt(x, y).some((e) => b.edges.has(edgeKey(e)));
}

/** The highest ground under a patch, at least the water line. */
export function floorOf(map: HeightMap, p: Patch): number {
  let floor = waterOf(map);
  for (let j = p.j0; j <= p.j1; j++) for (let i = p.i0; i <= p.i1; i++) floor = Math.max(floor, ...cornersOf(map, i, j));
  return floor;
}

/**
 * How bright a face is by which way it faces on the map. The engine's light comes from the upper
 * left of the screen, mostly from +j and a little from -i (terrain.ts), so +j faces are lit and -j
 * faces, seen only on a roof's far slopes, are in shade.
 */
export const TONE = { '+j': 1, '-j': 0.74, '+i': 0.78, '-i': 0.9 };
/** Where the shadow of a point one level up lands on the ground, in map units: the engine's shadow run. */
export const SUN = { i: SHADOW_RUN[0] * LEVEL_M, j: SHADOW_RUN[1] * LEVEL_M };

/** Adds the ground-image pixel shaded by a point `up` levels above ground level `g` at map point (x, y). */
export function shadowAt(site: Site, out: number[], x: number, y: number, g: number, up: number): void {
  const { origin: o, w, h } = site.ground;
  x += up * SUN.i;
  y += up * SUN.j;
  const sx = Math.round(o.x + (x - y) * HALF_W), sy = Math.round(o.y + (x + y) * HALF_H - g * LEVEL_PX);
  if (sx >= 0 && sy >= 0 && sx < w && sy < h) out.push(sy * w + sx);
}

/** The 4×4 ordered pattern things dissolve in, as Diablo's walls did: the threshold of each pixel, 0 to 1. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** A stub that something dissolving goes down to stands this many pixels over its foot. */
export const STUB_PX = LEVEL_PX;
/**
 * Whether the pixel at `x`, `y` of the ground image is gone from something dissolved by `fade` (0 to 1, in sixteenths
 * so its pictures can be kept by it). Ground-image positions, so pictures dissolving side by side share one pattern.
 */
export const dissolved = (x: number, y: number, fade: number) => fade > 0 && BAYER[(y & 3) * 4 + (x & 3)] < fade;

export function hex(s: string): [number, number, number] {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const mul = (c: number[], k: number) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));

// ------------------------------------------------------------------ patches

/** The connected patches of cell pieces, one kind each. */
export function patchesOf(b: Building): Patch[] {
  const seen = new Set<string>();
  const out: Patch[] = [];
  for (const [start, first] of b.cells) {
    if (seen.has(start)) continue;
    const cells: string[] = [];
    const todo = [start];
    seen.add(start);
    while (todo.length) {
      const k = todo.pop()!;
      cells.push(k);
      const { i, j } = b.cells.get(k)!;
      for (const n of [cellKey(i + 1, j), cellKey(i - 1, j), cellKey(i, j + 1), cellKey(i, j - 1)]) {
        if (b.cells.get(n)?.kind === first.kind && !seen.has(n)) { seen.add(n); todo.push(n); }
      }
    }
    const is = cells.map((k) => b.cells.get(k)!.i), js = cells.map((k) => b.cells.get(k)!.j);
    out.push({ kind: first.kind, i0: Math.min(...is), i1: Math.max(...is), j0: Math.min(...js), j1: Math.max(...js), cells });
  }
  return out;
}

/** Whether an edge lies on or inside a patch's rectangle. */
const under = (e: Edge, p: Patch) => e.i >= p.i0 && e.j >= p.j0 && (e.axis === 'H' ? e.i <= p.i1 && e.j <= p.j1 + 1 : e.i <= p.i1 + 1 && e.j <= p.j1);
/** Whether an edge is on a patch's front: its far-j or far-i side, facing the viewer. */
const frontOf = (e: Edge, p: Patch) => (e.axis === 'H' ? e.j === p.j1 + 1 && e.i >= p.i0 && e.i <= p.i1 : e.i === p.i1 + 1 && e.j >= p.j0 && e.j <= p.j1);

// ------------------------------------------------------------------ drawing

/** Draws buildings with a set of piece kinds, keeping what it drew until `forget`. */
export class BuildingView {
  private kept = new Map<string, Part>();
  private kinds: Record<string, PieceKind>;
  private site: Site;
  // Plain fields, not parameter properties, so node can load this file with its types stripped (the game's tests).
  constructor(kinds: Record<string, PieceKind>, site: Site) {
    this.kinds = kinds;
    this.site = site;
  }

  /** Drops everything drawn, after the kinds' options, the site or the building's height change. */
  forget(): void {
    this.kept.clear();
  }

  private kept1(key: string, draw: () => Part): Part {
    let part = this.kept.get(key);
    if (!part) this.kept.set(key, (part = draw()));
    return part;
  }

  /**
   * The building's parts, unsorted. `at` is where someone stands on the map: under a roof, that roof
   * is hidden (it still shades) and the walls on its front are cut to half height.
   */
  parts(b: Building, at?: { x: number; y: number }): Part[] {
    const { map } = this.site;
    const patches = patchesOf(b);
    const roofs = patches.filter((p) => (this.kinds[p.kind] as CellKind | undefined)?.covers);
    const here = at && cellKey(Math.floor(at.x), Math.floor(at.y));
    const home = here === undefined ? undefined : roofs.find((p) => p.cells.includes(here));
    const out: Part[] = [];
    for (const piece of b.edges.values()) {
      const kind = this.kinds[piece.kind];
      if (kind?.on !== 'edge') continue;
      const e = piece.edge;
      const cut = !!home && frontOf(e, home);
      const over = roofs.find((p) => p !== home && under(e, p));
      const cap = over && floorOf(map, over) + b.height;
      const fade = piece.fade ?? 0, open = piece.open ?? 0, locked = !!piece.locked;
      out.push(this.kept1(`${piece.kind}|${edgeKey(e)}|${cut}|${cap}|${b.height}|${fade}|${open}|${locked}`, () => kind.draw(this.site, e, b.height, { cut, cap, fade, open, locked })));
    }
    for (const p of patches) {
      const kind = this.kinds[p.kind];
      if (kind?.on !== 'cell') continue;
      const part = this.kept1(`${p.kind}|${p.i0},${p.i1},${p.j0},${p.j1}|${b.height}`, () => kind.draw(this.site, p, floorOf(map, p), b.height));
      out.push({ ...part, patch: p, hidden: p === home });
    }
    return out;
  }
}

/** Whether a point is within `pad` tiles of an edge piece: walls block crossing an edge. */
export function blocked(b: Building, x: number, y: number, pad: number): boolean {
  for (const { edge: e } of b.edges.values()) {
    const inside = e.axis === 'H'
      ? x >= e.i - pad && x <= e.i + 1 + pad && y >= e.j - pad && y <= e.j + pad
      : x >= e.i - pad && x <= e.i + pad && y >= e.j - pad && y <= e.j + 1 + pad;
    if (inside) return true;
  }
  return false;
}

/** Whether a straight move from `a` to `b` crosses an edge piece, however long the step. */
export function crosses(b: Building, a: { x: number; y: number }, c: { x: number; y: number }): boolean {
  for (const { edge: e } of b.edges.values()) {
    // H edges lie on y = j from x = i to i + 1; V edges on x = i from y = j to j + 1.
    const [along0, across0, along1, across1] = e.axis === 'H' ? [a.x, a.y, c.x, c.y] : [a.y, a.x, c.y, c.x];
    const [at, from] = e.axis === 'H' ? [e.j, e.i] : [e.i, e.j];
    if ((across0 - at) * (across1 - at) >= 0) continue;
    const hit = along0 + ((at - across0) / (across1 - across0)) * (along1 - along0);
    if (hit >= from && hit <= from + 1) return true;
  }
  return false;
}
