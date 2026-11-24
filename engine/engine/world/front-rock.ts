// Which of a cave's rock is drawn, and which of it dissolves in front of the survivor (cave.ts draws it). The rock is
// seen from the front: rock with only more rock between it and the camera (front rock) is never drawn, so a cave's
// front just ends in black, and the rest stands over the floor behind it. Rock standing in front of the survivor that
// hides floor near them dissolves down to a stub, a whole joined mass of it at a time, and stays so until none of that
// mass is needed any more. What each cell of rock hides is found along its own screen column, once per ground; the
// survivor stepping onto another cell only picks from that.
import { BRICK, inside, isRock, LEVEL_PX, MINE, TILE_H, type HeightMap } from './terrain.ts';

/** What a cell is to the view: floor, rock never drawn (front rock), rock standing, and a lone cell of rock (a stalagmite). */
export const FLOOR = 0, FRONT = 1, STANDS = 2, LONE = 3;

/** Floor within this many cells of the survivor is kept in view. */
export const NEAR = 3.5;
/** How long rock takes to dissolve, or to come back, in ms. */
export const FADE_MS = 250;
/** The steps a fade goes in: those of the 4×4 pattern it dissolves in (building.ts `dissolved`), so pictures can be kept by step. */
export const FADE_STEPS = 16;

export interface RockView {
  w: number;
  h: number;
  /** Per cell: FLOOR, FRONT, STANDS or LONE. */
  kind: Uint8Array;
  /** Per cell of rock, what it is built of: 0 stone, else `BRICK` or `MINE` (its paint). A mass fades only as far as its material goes. */
  material: Uint8Array;
  /** Per cell of standing rock that hides some floor behind it on screen, the floor cells it hides. Only this rock fades. */
  hides: Map<number, number[]>;
}

/** The cells `d` rows of the screen nearer the camera than a cell (further for negative `d`), on its column or one off it. */
const column = (d: number): [number, number][] => {
  const a = Math.floor(d / 2), b = Math.ceil(d / 2);
  return a === b ? [[a, d - a]] : [[a, d - a], [b, d - b]];
};

/**
 * How a cave's rock shows, from its ground; `top` is the level its black top stands at. Rock with some floor in front
 * of it on screen stands; rock with none, only more rock up to the camera, is not drawn. A floor cell is hidden by
 * rock in front of it whose top stands higher on screen than the floor's own.
 */
export function rockView(map: HeightMap, top: number): RockView {
  const { w, h } = map;
  const kind = new Uint8Array(w * h);
  const material = new Uint8Array(w * h);
  const hides = new Map<number, number[]>();
  const open = (i: number, j: number) => inside(map, i, j) && !isRock(map.levels[j * w + i]);
  let lowest = top;
  for (const l of map.levels) if (!isRock(l)) lowest = Math.min(lowest, l);
  // No floor further back than this can be hidden: a row of cells is half a tile high on screen.
  const reach = Math.ceil(((top - lowest) * LEVEL_PX) / (TILE_H / 2));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = j * w + i;
    if (open(i, j)) continue;
    const paint = map.paint?.[c] ?? 0;
    material[c] = paint === BRICK || paint === MINE ? paint : 0;
    if (open(i + 1, j) && open(i - 1, j) && open(i, j + 1) && open(i, j - 1)) {
      kind[c] = LONE;
      continue;
    }
    let seen = false;
    for (let d = 1; d < w + h && !seen; d++) seen = column(d).some(([di, dj]) => open(i + di, j + dj));
    kind[c] = seen ? STANDS : FRONT;
    if (!seen) continue;
    const hidden: number[] = [];
    for (let d = 1; d <= reach; d++) for (const [di, dj] of column(-d)) {
      const fi = i + di, fj = j + dj;
      if (open(fi, fj) && d * (TILE_H / 2) <= (top - map.levels[fj * w + fi]) * LEVEL_PX) hidden.push(fj * w + fi);
    }
    if (hidden.length) hides.set(c, hidden);
  }
  return { w, h, kind, material, hides };
}

/** Which rock dissolves for where the survivor stands, and how far it has got. */
export class RockFade {
  readonly view: RockView;
  /** Per cell, how far its rock has dissolved, 0 to 1. */
  readonly t: Float32Array;
  /** Per cell, 1 where its rock is going. */
  readonly target: Uint8Array;
  /** The masses of rock dissolving together. */
  private groups: number[][] = [];
  // Plain fields, not parameter properties, so node can load this file with its types stripped (the game's tests).
  constructor(view: RockView) {
    this.view = view;
    this.t = new Float32Array(view.w * view.h);
    this.target = new Uint8Array(view.w * view.h);
  }

  /**
   * Aims at the survivor standing on the cell at `at`: rock in front of them (further down the screen) that hides floor
   * within `NEAR` of them goes, and with it all the rock of its material joined to it that hides floor, the whole mass at once (were
   * only the rock in front of them to go, the mass would go a cell at a time as they walk along it); a mass that went
   * stays gone while any of it hides floor near them and is not behind them (rock beside them on screen holds it too, so
   * it does not flicker as they walk along it). Without a survivor (an editor's view), every rock that hides floor is
   * down to its stub.
   */
  aim(at: { i: number; j: number } | null): void {
    const { w, h, hides, material } = this.view;
    if (!at) {
      this.groups = [];
      this.target.fill(0);
      for (const c of hides.keys()) this.target[c] = 1;
      return;
    }
    const front = at.i + at.j;
    const near = (f: number) => Math.hypot((f % w) - at.i, Math.floor(f / w) - at.j) <= NEAR;
    const want = new Uint8Array(w * h), keep = new Uint8Array(w * h);
    for (const [c, cells] of hides) {
      const d = (c % w) + Math.floor(c / w);
      if (d < front || !cells.some(near)) continue;
      keep[c] = 1;
      if (d > front) want[c] = 1;
    }
    this.groups = this.groups.filter((g) => g.some((c) => keep[c]));
    const taken = new Uint8Array(w * h);
    for (const g of this.groups) for (const c of g) taken[c] = 1;
    for (const [s] of hides) {
      if (!want[s] || taken[s]) continue;
      const g = [s];
      taken[s] = 1;
      for (let q = 0; q < g.length; q++) {
        const i = g[q] % w, j = Math.floor(g[q] / w);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const a = i + di, b = j + dj, n = b * w + a;
          if (a < 0 || b < 0 || a >= w || b >= h || taken[n] || !hides.has(n) || material[n] !== material[g[q]]) continue;
          taken[n] = 1;
          g.push(n);
        }
      }
      this.groups.push(g);
    }
    this.target.set(taken);
  }

  /** Moves every fade on by `ms`; says whether any of them changed. */
  advance(ms: number): boolean {
    const k = ms / FADE_MS;
    let changed = false;
    for (let c = 0; c < this.t.length; c++) {
      const to = this.target[c], now = this.t[c];
      if (now === to) continue;
      this.t[c] = Math.abs(to - now) <= k ? to : now + Math.sign(to - now) * k;
      changed = true;
    }
    return changed;
  }

  /** Every fade where it is going, at once. */
  settle(): void {
    this.t.set(this.target);
  }

  /** How far a cell's rock has dissolved, in whole steps of the pattern, 0 to 1. */
  fadeOf(c: number): number {
    return Math.round(this.t[c] * FADE_STEPS) / FADE_STEPS;
  }
}
