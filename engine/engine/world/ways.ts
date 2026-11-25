// Ways through a scene that are not plain walking, no drawing: ladders up a step inside the scene, the ladder down a
// hole (a `hole` object on a hole-shaped cell, the way to another scene it names), and doors on cell edges. A ladder
// links its foot cell and its top cell, which path.ts walks as one more step, climbed; a door stands on an edge as a
// wall would, closed, open, locked or hidden, and only an open one lets a walker through (path finding plans through
// the closed ones, which a game opens on the way). Saved in scene coordinates (`Scene.ladders`, `Scene.doors`).
import { edgeKey, type Edge } from './building/building.ts';
import { edgeWalkable, HOLE, rampDir, shapeAt, standable } from './ground.ts';
import { inside, levelAt, type HeightMap } from './terrain.ts';

type Cell = [number, number];
type P = { i: number; j: number };

/** A ladder inside a scene, up the step on a cell edge from the lower cell to the higher one. */
export interface SceneLadder { edge: Edge }

export const DOOR_STATES = ['closed', 'open', 'locked', 'hidden'] as const;
export type DoorState = (typeof DOOR_STATES)[number];
/** The looks a door can have. */
export const DOOR_KINDS = ['wood'] as const;
/**
 * A door on a cell edge: closed (a walker opens it on the way through), open, locked (shut until a game unlocks it,
 * with `key` if it names the key that does) or hidden (it looks like the wall it stands in, or the rock beside it,
 * until a game finds it). Like a hole or ladder object it can lead to another scene: `id` its name among the scene's
 * ways, `to` the scene and the way there.
 */
export interface SceneDoor {
  edge: Edge;
  kind: string;
  state: DoorState;
  key?: string;
  id?: string;
  to?: { scene: string; id: string };
}

/** The least step a ladder climbs, in levels: one level is a step anyone takes. */
export const LADDER_MIN = 2;
/** How tall a door stands where no wall gives it a height, in levels. */
export const DOOR_HEIGHT = 5;
/** How far a ladder's rails stand off the face they lean on, in tiles. */
export const LADDER_OFF = 0.06;

/** The two cells on either side of an edge: behind it (toward -i or -j) and in front. */
export const edgeCells = (e: Edge): [Cell, Cell] => (e.axis === 'H' ? [[e.i, e.j - 1], [e.i, e.j]] : [[e.i - 1, e.j], [e.i, e.j]]);
/** The edge between a cell and its neighbour across one side. */
export function edgeOfCells(a: Cell, b: Cell): Edge {
  const di = b[0] - a[0], dj = b[1] - a[1];
  if (di) return { axis: 'V', i: Math.max(a[0], b[0]), j: a[1] };
  return { axis: 'H', i: a[0], j: dj > 0 ? b[1] : a[1] };
}

/** Floor a ladder can stand on or lead to: standable, and no ramp. */
const floorCell = (map: HeightMap, [i, j]: Cell) => standable(map, i, j) && rampDir(shapeAt(map, i, j)) < 0;

/** A ladder as it stands on the ground: its edge, foot and top cells, and the levels it climbs between. */
export interface LadderView {
  edge: Edge;
  foot: Cell;
  top: Cell;
  low: number;
  high: number;
  /** Down a hole: its foot is the hole, and it leads out of the scene. */
  hole: boolean;
}

/** The ladder up the step on an edge, or null where there is no step of at least `LADDER_MIN` between two floors. */
export function ladderOn(map: HeightMap, e: Edge): LadderView | null {
  const [a, b] = edgeCells(e);
  if (!floorCell(map, a) || !floorCell(map, b)) return null;
  const la = levelAt(map, ...a), lb = levelAt(map, ...b);
  if (Math.abs(la - lb) < LADDER_MIN) return null;
  const [foot, top] = la < lb ? [a, b] : [b, a];
  return { edge: e, foot, top, low: Math.min(la, lb), high: Math.max(la, lb), hole: false };
}

/** The four ways a hole's ladder can lean, by quarter turn: an object's back (-z) at turn 0 is toward -j. */
const BACKS: Cell[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * The ladder down a hole on cell (i, j): against the face of the floor behind it, by `turn` (the hole object's turn,
 * with the view's), or the next floor round if there is none there; null when the cell is no hole or no floor is beside it.
 */
export function holeLadder(map: HeightMap, i: number, j: number, turn = 0): LadderView | null {
  if (!inside(map, i, j) || shapeAt(map, i, j) !== HOLE) return null;
  for (let k = 0; k < 4; k++) {
    const [di, dj] = BACKS[(((turn + k) % 4) + 4) % 4];
    const top: Cell = [i + di, j + dj];
    if (!floorCell(map, top)) continue;
    const rim = levelAt(map, i, j);
    return { edge: edgeOfCells([i, j], top), foot: [i, j], top, low: rim, high: Math.max(rim, levelAt(map, ...top)), hole: true };
  }
  return null;
}

/** The turn whose back looks from a cell toward a neighbour (the inverse of `holeLadder`'s choice). */
export const turnToward = (from: Cell, to: Cell) => BACKS.findIndex(([di, dj]) => from[0] + di === to[0] && from[1] + dj === to[1]);

/** Where a walker stands to climb a ladder: at its foot, before the face; at its top, a step onto the higher floor. */
export function ladderSpots(L: LadderView): { foot: P; top: P } {
  const di = L.top[0] - L.foot[0], dj = L.top[1] - L.foot[1];
  const mi = L.foot[0] + 0.5 + di * 0.5, mj = L.foot[1] + 0.5 + dj * 0.5;
  return { foot: { i: mi - di * 0.28, j: mj - dj * 0.28 }, top: { i: mi + di * 0.3, j: mj + dj * 0.3 } };
}

/** A climb as the points it passes, in order, each on the map with the level the climber is at. */
export type Climb = { i: number; j: number; level: number }[];
/** Up a ladder from its foot, or down it from its top. */
export function climbOf(L: LadderView, up: boolean): Climb {
  const { foot, top } = ladderSpots(L);
  const way = [{ ...foot, level: L.low }, { ...foot, level: L.high }, { ...top, level: L.high }];
  return up ? way : way.reverse();
}
/** Down a hole's ladder from its top, `deep` levels below the rim, out of sight. */
export function climbDown(L: LadderView, deep = 3): Climb {
  const { foot, top } = ladderSpots(L);
  return [{ ...top, level: L.high }, { ...foot, level: L.high }, { ...foot, level: L.low - deep }];
}

/** Whether a door can stand on an edge: floor on both sides, a walker's step apart. */
export function doorFits(map: HeightMap, e: Edge): boolean {
  const [a, b] = edgeCells(e);
  return floorCell(map, a) && floorCell(map, b) && edgeWalkable(map, ...a, ...b);
}

/** The ladders of a scene as read back: on edges inside its map, one per edge. Whether there is a step for them is the world's to say. */
export function cleanLadders(raw: unknown, w: number, h: number): SceneLadder[] {
  const out = new Map<string, SceneLadder>();
  for (const x of Array.isArray(raw) ? raw : []) {
    const e = cleanEdge(x?.edge, w, h);
    if (e) out.set(edgeKey(e), { edge: e });
  }
  return [...out.values()];
}

/** The doors of a scene as read back: on edges inside its map, one per edge, named if they lead anywhere. */
export function cleanDoors(raw: unknown, w: number, h: number): SceneDoor[] {
  const out = new Map<string, SceneDoor>();
  for (const x of Array.isArray(raw) ? raw : []) {
    const e = cleanEdge(x?.edge, w, h);
    if (!e) continue;
    const kind = (DOOR_KINDS as readonly string[]).includes(x.kind) ? x.kind : DOOR_KINDS[0];
    const state: DoorState = (DOOR_STATES as readonly string[]).includes(x.state) ? x.state : 'closed';
    out.set(edgeKey(e), {
      edge: e, kind, state,
      ...(typeof x.key === 'string' && x.key && { key: x.key.slice(0, 24) }),
      ...(typeof x.id === 'string' && x.id && { id: x.id.slice(0, 24) }),
      ...(x.to && typeof x.to.scene === 'string' && typeof x.to.id === 'string' && x.to.scene && { to: { scene: x.to.scene.slice(0, 60), id: x.to.id.slice(0, 24) } }),
    });
  }
  const doors = [...out.values()];
  for (const d of doors) if (d.to) nameDoor(doors, d);
  return doors;
}

/** An edge inside a w by h map, or null. */
export function cleanEdge(e: any, w: number, h: number): Edge | null {
  if (!e || (e.axis !== 'H' && e.axis !== 'V') || !Number.isInteger(e.i) || !Number.isInteger(e.j)) return null;
  const fits = e.axis === 'H' ? e.i >= 0 && e.i < w && e.j >= 0 && e.j <= h : e.i >= 0 && e.i <= w && e.j >= 0 && e.j < h;
  return fits ? { axis: e.axis, i: e.i, j: e.j } : null;
}

/** Gives a door its name among the scene's ways (door1, door2, ...) if it has none. */
export function nameDoor(doors: readonly SceneDoor[], d: SceneDoor): void {
  if (d.id) return;
  let n = 1;
  while (doors.some((o) => o.id === `door${n}`)) n++;
  d.id = `door${n}`;
}

/** Where a door is met on the map, in scene coordinates: the middle of the cell in front of it. */
export const doorSpot = (d: SceneDoor): P => {
  const [, front] = edgeCells(d.edge);
  return { i: front[0] + 0.5, j: front[1] + 0.5 };
};
