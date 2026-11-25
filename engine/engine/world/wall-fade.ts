// Which thin walls (`Scene.walls`) dissolve in front of the survivor, as a cave's rock does (front-rock.ts), but closer
// in: a wall within 4 cells of the survivor, in front of them on screen with them on its far side (behind its line, so
// it stands between them and the camera), that hides floor within 2 cells of them goes down to its stub, and with it the whole straight run of that kind of wall it is part of; the run stays so while any
// of it is wanted. Runs, not all joined walls: a house's walls meet at its corners, and its back walls should stand
// while its front one goes. Fences never fade (walls.ts `wallFades`). No drawing.
import { edgeKey, type Edge } from './building/building.ts';
import { FADE_MS, FADE_STEPS } from './front-rock.ts';
import { cornersOf } from './ground.ts';
import { inside, isRock, type HeightMap } from './terrain.ts';

/** Only walls within this many cells of the survivor start to fade, and for floor within this many cells of them. */
export const WALL_REACH = 4, WALL_NEAR = 2;

export interface FadingWall {
  edge: Edge;
  /** Its kind: a run is of one kind. */
  kind: string;
  /** Whether it can fade at all (not a fence). */
  fades: boolean;
  /** The level its top stands at, at its higher end. */
  top: number;
}

/** The straight run of one kind a wall is part of: its axis, line and kind. */
const runOf = (w: FadingWall) => `${w.kind}|${w.edge.axis}${w.edge.axis === 'H' ? w.edge.j : w.edge.i}`;
/** Along its run, where it is. */
const placeOf = (e: Edge) => (e.axis === 'H' ? e.i : e.j);

export class WallFade {
  /** By wall (`edgeKey`): how far it has dissolved, 0 to 1, and where it is going. */
  readonly t = new Map<string, number>();
  readonly target = new Map<string, number>();
  /** The runs dissolving, each the keys of its walls. */
  private groups: string[][] = [];

  /**
   * Aims at the survivor standing on the cell at `at`, over the walls as they stand on `map`; without a survivor no
   * wall fades.
   */
  aim(walls: FadingWall[], map: HeightMap, at: { i: number; j: number } | null): void {
    const want = new Set<string>(), keep = new Set<string>();
    if (at) {
      const near: { d: number; c: number; low: number }[] = [];
      for (let j = Math.max(0, at.j - WALL_NEAR); j <= Math.min(map.h - 1, at.j + WALL_NEAR); j++) {
        for (let i = Math.max(0, at.i - WALL_NEAR); i <= Math.min(map.w - 1, at.i + WALL_NEAR); i++) {
          if (!inside(map, i, j) || isRock(map.levels[j * map.w + i]) || Math.hypot(i - at.i, j - at.j) > WALL_NEAR) continue;
          near.push({ d: i + j, c: i - j, low: Math.min(...cornersOf(map, i, j)) });
        }
      }
      const front = at.i + at.j;
      for (const w of walls) {
        const e = w.edge, d = e.i + e.j;
        if (!w.fades || d < front) continue;
        // Only a wall the survivor is behind: standing outside a house before its front wall, the wall stays, though the
        // floor behind it is near.
        if (e.axis === 'H' ? at.j >= e.j : at.i >= e.i) continue;
        const mid = e.axis === 'H' ? [e.i + 0.5, e.j] : [e.i, e.j + 0.5];
        if (Math.hypot(mid[0] - at.i - 0.5, mid[1] - at.j - 0.5) > WALL_REACH) continue;
        // On screen, the wall's column and how far down it stands; floor behind it, within its height, is hidden.
        const col = e.i - e.j + (e.axis === 'V' ? -0.5 : 0.5);
        const hides = near.some((f) => {
          const dd = d - f.d - 0.5;
          return Math.abs(f.c - col) <= 1.01 && dd >= 0 && dd <= w.top - f.low;
        });
        if (!hides) continue;
        keep.add(edgeKey(e));
        if (d > front) want.add(edgeKey(e));
      }
    }
    this.groups = this.groups.filter((g) => g.some((k) => keep.has(k)));
    const taken = new Set(this.groups.flat());
    // A run is the walls of one kind on one line that follow on from each other.
    const byRun = new Map<string, FadingWall[]>();
    for (const w of walls) if (w.fades) (byRun.get(runOf(w)) ?? byRun.set(runOf(w), []).get(runOf(w))!).push(w);
    for (const w of walls) {
      const k = edgeKey(w.edge);
      if (!want.has(k) || taken.has(k)) continue;
      const line = byRun.get(runOf(w))!.slice().sort((a, b) => placeOf(a.edge) - placeOf(b.edge));
      const at0 = line.indexOf(w);
      let lo = at0, hi = at0;
      while (lo > 0 && placeOf(line[lo - 1].edge) === placeOf(line[lo].edge) - 1) lo--;
      while (hi < line.length - 1 && placeOf(line[hi + 1].edge) === placeOf(line[hi].edge) + 1) hi++;
      const g = line.slice(lo, hi + 1).map((x) => edgeKey(x.edge)).filter((x) => !taken.has(x));
      for (const x of g) taken.add(x);
      this.groups.push(g);
    }
    this.target.clear();
    for (const k of taken) this.target.set(k, 1);
    for (const k of [...this.t.keys()]) if (!walls.some((w) => edgeKey(w.edge) === k)) this.t.delete(k);
  }

  /** Moves every fade on by `ms`. */
  advance(ms: number): void {
    const step = ms / FADE_MS;
    const keys = new Set([...this.t.keys(), ...this.target.keys()]);
    for (const k of keys) {
      const to = this.target.get(k) ?? 0, now = this.t.get(k) ?? 0;
      if (now === to) continue;
      const next = Math.abs(to - now) <= step ? to : now + Math.sign(to - now) * step;
      if (next) this.t.set(k, next);
      else this.t.delete(k);
    }
  }

  /** Every fade where it is going, at once. */
  settle(): void {
    this.t.clear();
    for (const [k, v] of this.target) this.t.set(k, v);
  }

  /** How far a wall has dissolved, in whole steps of the pattern. */
  fadeOf(e: Edge): number {
    return Math.round((this.t.get(edgeKey(e)) ?? 0) * FADE_STEPS) / FADE_STEPS;
  }
}
