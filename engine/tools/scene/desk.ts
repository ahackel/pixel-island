// The scene editor's desk: the open scenes laid out side by side on one shared ground, each at its own place
// (`Scene.desk`, its north corner in tiles). The view turns the whole desk; each scene's world is turned the same way.
// Desk pixels are the shared ground's own: a point at the water line is where `toScreen` puts it.
import type { Scene } from '../../engine/world/scene.ts';
import { TILE_H, TILE_W, toScreen } from '../../engine/world/terrain.ts';
import type { World } from '../../engine/world/world.ts';

type P = { i: number; j: number };
type XY = { x: number; y: number };

/** How many tiles of open desk are kept between two scenes. */
export const DESK_GAP = 2;

export const deskOf = (s: Scene): P => s.desk ?? { i: 0, j: 0 };

/** A point of the desk as seen with the view turned `rot` quarters, as `World.toView` turns a scene's own points. */
export function turned(p: P, rot: number): P {
  let { i, j } = p;
  for (let k = 0; k < rot; k++) [i, j] = [-j, i];
  return { i, j };
}
export function unturned(p: P, rot: number): P {
  let { i, j } = p;
  for (let k = 0; k < rot; k++) [i, j] = [j, -i];
  return { i, j };
}

/** The scene's corner that the turned view puts at its own point 0, 0, as seen on the turned desk. */
export function seenCorner(s: Scene, rot: number): P {
  const at = deskOf(s);
  const corners = [[0, 0], [s.w, 0], [0, s.h], [s.w, s.h]].map(([i, j]) => turned({ i: at.i + i, j: at.j + j }, rot));
  return { i: Math.min(...corners.map((c) => c.i)), j: Math.min(...corners.map((c) => c.j)) };
}

/** What to add to a pixel of the world's ground image to have it on the desk. */
export function offsetOf(w: World): XY {
  const c = seenCorner(w.scene, w.rot);
  const s = toScreen(c.i, c.j, 0);
  return { x: s.x - w.ground.origin.x, y: s.y - w.ground.origin.y };
}

/** The scene's outline on the desk at the water line: its north, east, south and west corners as seen. */
export function outline(s: Scene, rot: number): XY[] {
  const c = seenCorner(s, rot);
  const [w, h] = rot % 2 ? [s.h, s.w] : [s.w, s.h];
  return [[0, 0], [w, 0], [w, h], [0, h]].map(([i, j]) => toScreen(c.i + i, c.j + j, 0));
}

/** Whether a scene of size `size` lying at `at` would come nearer to `other` than the gap between scenes. */
export function crowds(at: P, size: { w: number; h: number }, other: Scene): boolean {
  const o = deskOf(other);
  return at.i < o.i + other.w + DESK_GAP && o.i < at.i + size.w + DESK_GAP && at.j < o.j + other.h + DESK_GAP && o.j < at.j + size.h + DESK_GAP;
}

/** A free place for a scene: east of the others as the desk is seen now, level with the middle of the last one. */
export function freePlace(s: Scene, others: Scene[], rot: number): P {
  if (!others.length) return { i: 0, j: 0 };
  const last = others[others.length - 1];
  // Along the desk as seen, to the right: + i and - j in the turned frame, so the scene lies level with the last one.
  const right = unturned({ i: 1, j: -1 }, rot);
  const mid = (o: Scene) => ({ i: deskOf(o).i + o.w / 2, j: deskOf(o).j + o.h / 2 });
  let at = { i: Math.round(mid(last).i - s.w / 2), j: Math.round(mid(last).j - s.h / 2) };
  for (let k = 0; k < 4 * 64 && others.some((o) => crowds(at, s, o)); k++) at = { i: at.i + right.i, j: at.j + right.j };
  return at;
}

/** A drag across the desk by `dx`, `dy` pixels as whole tiles of the desk (before the view is turned). */
export function tilesOf(dx: number, dy: number, rot: number): P {
  const a = dx / (TILE_W / 2), b = dy / (TILE_H / 2);
  return unturned({ i: Math.round((a + b) / 2), j: Math.round((b - a) / 2) }, rot);
}

/** A pixel of the desk as a point of the turned desk, in tiles (the frame `seenCorner` and `World.toView` are in). */
export function seenAt(x: number, y: number): P {
  const a = x / (TILE_W / 2), b = y / (TILE_H / 2);
  return { i: (a + b) / 2, j: (b - a) / 2 };
}

/** The place (`Scene.desk`) that puts the scene's middle, as seen on the turned desk, at `mid`, in whole tiles. */
export function placeFor(s: Scene, mid: P, rot: number): P {
  const [w, h] = rot % 2 ? [s.h, s.w] : [s.w, s.h];
  const c = { i: Math.round(mid.i - w / 2), j: Math.round(mid.j - h / 2) };
  // The seen box from c turned back is the scene's box on the desk; its smallest corner is the place.
  const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([i, j]) => unturned({ i: c.i + i, j: c.j + j }, rot));
  return { i: Math.min(...corners.map((p) => p.i)), j: Math.min(...corners.map((p) => p.j)) };
}

/**
 * The free place nearest `at` for a scene among `others`: `at` itself if it is free, else the nearest one on the first
 * ring of tiles round it that has a free place (rings grow one tile at a time).
 */
export function nearestFree(s: Scene, at: P, others: Scene[]): P {
  const free = (p: P) => !others.some((o) => crowds(p, s, o));
  if (free(at)) return at;
  for (let r = 1; r < 1000; r++) {
    let best: P | null = null;
    let far = Infinity;
    for (let k = -r; k <= r; k++) {
      for (const [di, dj] of [[k, -r], [k, r], [-r, k], [r, k]]) {
        const d = di * di + dj * dj;
        const p = { i: at.i + di, j: at.j + dj };
        if (d < far && free(p)) [best, far] = [p, d];
      }
    }
    if (best) return best;
  }
  return freePlace(s, others, 0);
}
