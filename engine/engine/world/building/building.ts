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
import { cornersOf, isRock, LEVEL_M, levelAt, LEVEL_PX, SEA_LEVEL, SHADOW_RUN, TILE_H, TILE_W, type HeightMap, type TerrainImage } from '../terrain.ts';

export const HALF_W = TILE_W / 2; // screen columns along one cell edge
export const HALF_H = TILE_H / 2; // rows down along one cell edge

/** H runs along i between vertices (i, j) and (i + 1, j); V along j between (i, j) and (i, j + 1). */
export type Axis = 'H' | 'V';
export interface Edge { axis: Axis; i: number; j: number }
export const edgeKey = (e: Edge) => `${e.axis}${e.i},${e.j}`;
export const cellKey = (i: number, j: number) => `${i},${j}`;

export interface EdgePiece { kind: string; edge: Edge }
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

/** How an edge piece is drawn: `cut` sawn off at half height, `cap` the eaves level of a roof over it. */
export interface EdgeKind { on: 'edge'; draw(site: Site, e: Edge, height: number, o: { cut: boolean; cap?: number }): Part }
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
  return [Math.max(SEA_LEVEL, end(0)), Math.max(SEA_LEVEL, end(1))];
}

/** The highest ground under a patch. */
export function floorOf(map: HeightMap, p: Patch): number {
  let floor = SEA_LEVEL;
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
      out.push(this.kept1(`${piece.kind}|${edgeKey(e)}|${cut}|${cap}|${b.height}`, () => kind.draw(this.site, e, b.height, { cut, cap })));
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
