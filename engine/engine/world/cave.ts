// Caves: scenes of solid rock with rooms carved open (scene.ts `createCave`). What stands in them follows from the
// carved ground: solid rock round the floor, with walls on the faces the camera looks at and rubble at their feet,
// cut away in front of the room the player is in (see `caveRock`). The world draws all else as nothing
// (`World.void`), dark but where lamps, glowing decorations and the daylight at the ways out light it.
import { PALETTE } from '../core/palette.ts';
import { edgeKey, emptyBuilding, type Building } from './building/building.ts';
import { rockWall } from './building/pieces/rock-wall.ts';
import type { Tint } from './daylight.ts';
import { decorById } from './decor.ts';
import { flicker } from './flame.ts';
import { particleSystem, tileHalo } from './particles.ts';
import type { Thing } from './island.ts';
import { CAVE_FLOOR, type Scene } from './scene.ts';
import { inside, isRock, LEVEL_PX, PAINTS, ROCK_LEVEL, standingHeight, TILE_H, TILE_W, type HeightMap } from './terrain.ts';
import { rasterOf, type TileLamp, type World } from './world.ts';

/** The level of a new cave's floor (scene.ts), and how tall its walls stand in levels. */
export { CAVE_FLOOR };
export const CAVE_WALL = 5;
/** The daylight coming in at a way out: cool, and how far it reaches into the dark, in tiles. */
export const CAVE_DAY = '#c8d4e8';
const DAY_REACH = 2.6;
const CAVE_GROUND = PAINTS.indexOf('cave') + 1;
/** The rubble: the flora catalogue's cave rubble, in a cluster of up to three, big against the rock and smaller out. */
/** The rubble's two sets of rocks, one picked per wall edge, for variety. */
const RUBBLE_ROCKS = ['plant-rocks-9', 'plant-rocks-10'];
const CLUSTER = [[0.22, 0.85], [0.5, 0.55], [0.8, 0.35]] as const;

const isOpen = (map: HeightMap, i: number, j: number) => inside(map, i, j) && !isRock(map.levels[j * map.w + i]);

/**
 * The level a cell of rock is carved down to: the floor beside it, the level most of its open neighbours have (the
 * lower one on a tie), or `CAVE_FLOOR` with none.
 */
function floorBeside(map: HeightMap, c: number): number {
  const i = c % map.w, j = Math.floor(c / map.w);
  const count = new Map<number, number>();
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!isOpen(map, i + di, j + dj)) continue;
    const level = map.levels[(j + dj) * map.w + i + di];
    count.set(level, (count.get(level) ?? 0) + 1);
  }
  let best = CAVE_FLOOR, most = 0;
  for (const [level, n] of count) if (n > most || (n === most && level < best)) [best, most] = [level, n];
  return best;
}

/** Carves cells of rock open, down to the floor beside them, or fills cells back with rock. Says whether anything changed. */
export function carve(map: HeightMap & { paint: Uint8Array }, cells: number[], open: boolean): boolean {
  let changed = false;
  const levels = map.levels as Int8Array;
  for (const c of cells) {
    if (open === !isRock(levels[c])) continue;
    levels[c] = open ? floorBeside(map, c) : ROCK_LEVEL;
    map.paint[c] = CAVE_GROUND;
    changed = true;
  }
  return changed;
}

/**
 * The cave's floor in rooms: open places at least three cells across, each with the narrower floor nearest it (the
 * passages between rooms are shared out between the rooms they join). Floor too narrow for any room is a room of
 * its own, a group for each run of it. A room number per cell, -1 for rock.
 */
export function caveRooms(map: HeightMap): Int16Array {
  const { w, h } = map;
  const room = new Int16Array(w * h).fill(-1);
  const open = (i: number, j: number) => isOpen(map, i, j);
  const wide = (i: number, j: number) => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (!open(i + di, j + dj)) return false;
    return true;
  };
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // Grows rooms from where they are, cell by cell, over the floor that `take` allows.
  const grow = (queue: number[], take: (i: number, j: number) => boolean) => {
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q], i = c % w, j = Math.floor(c / w);
      for (const [di, dj] of STEPS) {
        const ni = i + di, nj = j + dj, n = nj * w + ni;
        if (!open(ni, nj) || room[n] >= 0 || !take(ni, nj)) continue;
        room[n] = room[c];
        queue.push(n);
      }
    }
  };
  let rooms = 0;
  // The wide places, each group of them a room.
  for (let c = 0; c < w * h; c++) {
    const i = c % w, j = Math.floor(c / w);
    if (room[c] >= 0 || !open(i, j) || !wide(i, j)) continue;
    room[c] = rooms++;
    grow([c], wide);
  }
  // The narrow floor goes to the nearest room, all rooms growing at once.
  const all: number[] = [];
  for (let c = 0; c < w * h; c++) if (room[c] >= 0) all.push(c);
  grow(all, () => true);
  // What no room reached: rooms of their own.
  for (let c = 0; c < w * h; c++) {
    if (room[c] >= 0 || !open(c % w, Math.floor(c / w))) continue;
    room[c] = rooms++;
    grow([c], () => true);
  }
  return room;
}

/** The black top of solid rock stands this many pixels over the floor: just over the walls' highest peaks. */
const ROCK_TOP = CAVE_WALL * LEVEL_PX + 2;
/** How many rows of cells behind it (by i + j) a block of rock that tall hides on screen. */
const HIDES = Math.ceil(ROCK_TOP / (TILE_H / 2));

/** Rock that hides floor this near the player (in cells) is always cut, so nothing stands over them or their step. */
const CLEAR = 2.5;

/**
 * The rock along the floor, as the old isometric games drew dungeons, seen into from the front: every rock cell
 * that hides some floor behind it on screen stands as a solid black block, and those along the floor show it their
 * faces (the walls). Around the player at `at` it is cut down to the floor, as Diablo cleared the walls in front of
 * the room the player was in: the rock in front of the player's room and of the rooms next to it, so the way on
 * shows, all but the player's room's own back walls; and any rock that would hide the player or the floor right
 * round them. Without a player, the rock in front of every room is cut, all but what is some room's own back wall.
 * Gives the walls, the rock cells that stand as blocks, and the lone ones that stand as stalagmites.
 */
export function caveRock(map: HeightMap, rooms: Int16Array, at: { i: number; j: number } | null): { walls: Building; blocks: number[]; pillars: number[] } {
  const { w, h } = map;
  const walls = emptyBuilding(CAVE_WALL);
  const blocks: number[] = [];
  const pillars: number[] = [];
  const roomAt = (i: number, j: number) => (inside(map, i, j) ? rooms[j * w + i] : -1);
  const home = at ? roomAt(Math.floor(at.i), Math.floor(at.j)) : -1;
  // The player's room and the rooms its floor touches.
  const near = new Set<number>([home]);
  if (home >= 0) for (let c = 0; c < w * h; c++) {
    if (rooms[c] !== home) continue;
    const i = c % w, j = Math.floor(c / w);
    for (const r of [roomAt(i + 1, j), roomAt(i - 1, j), roomAt(i, j + 1), roomAt(i, j - 1)]) if (r >= 0) near.add(r);
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (roomAt(i, j) >= 0) continue;
    // A lone cell of rock with floor all round stands as a stalagmite, not a block with walls.
    if (roomAt(i + 1, j) >= 0 && roomAt(i - 1, j) >= 0 && roomAt(i, j + 1) >= 0 && roomAt(i, j - 1) >= 0) {
      pillars.push(j * w + i);
      continue;
    }
    // The rooms this rock hides some floor of, how near to the player that floor comes, and the rooms it is the back wall of.
    const hides = new Set<number>();
    let nearest = Infinity;
    for (let d = 1; d <= HIDES; d++) for (const di of new Set([Math.floor(d / 2), Math.ceil(d / 2)])) {
      const fi = i - di, fj = j - (d - di);
      const r = roomAt(fi, fj);
      if (r < 0) continue;
      hides.add(r);
      if (at) nearest = Math.min(nearest, Math.hypot(fi + 0.5 - at.i, fj + 0.5 - at.j));
    }
    const back = new Set([roomAt(i + 1, j), roomAt(i, j + 1)].filter((r) => r >= 0));
    const cut = !at
      ? [...hides].some((r) => !back.has(r))
      : nearest <= CLEAR || (!back.has(home) && [...hides].some((r) => near.has(r) && !back.has(r)));
    if (cut) continue;
    if (hides.size) blocks.push(j * w + i);
    if (roomAt(i + 1, j) >= 0) walls.edges.set(edgeKey({ axis: 'V', i: i + 1, j }), { kind: 'rock', edge: { axis: 'V', i: i + 1, j } });
    if (roomAt(i, j + 1) >= 0) walls.edges.set(edgeKey({ axis: 'H', i, j: j + 1 }), { kind: 'rock', edge: { axis: 'H', i, j: j + 1 } });
  }
  return { walls, blocks, pillars };
}

/** A block of solid rock on a cell: black from the floor up to the rock's top. */
function blockThing(world: World, c: number): Thing {
  const i = c % world.map.w, j = Math.floor(c / world.map.w);
  const hw = TILE_W / 2, hh = TILE_H / 2;
  const height = 2 * hh + ROCK_TOP;
  const picture = {
    get: (x: number, y: number) => {
      const dx = Math.abs(x + 0.5 - hw) / 2;
      return y + 0.5 >= dx && y + 0.5 <= height - dx ? '#000000' : null;
    },
  };
  // Sorted just behind the walls on its front edges, which reach a little into it.
  return {
    spot: { i: i + 0.5, j: j + 0.5, level: world.flatLevel }, picture, w: TILE_W, h: height, foot: { x: hw, y: hh + ROCK_TOP }, shadow: [],
    box: { x0: i, x1: i + 0.8, y0: j, y1: j + 0.8, key: i + j + 1 },
  };
}

/** The stalagmite a lone cell of rock stands as, from the flora catalogue: the single one, not the pair. */
const PILLAR = 'plant-rocks-6';

/** A lone cell of rock as a stalagmite, a little bigger than the loose ones, each turned its own way. */
function pillarThing(world: World, c: number): Thing[] {
  const i = c % world.map.w, j = Math.floor(c / world.map.w);
  const sd = world.map.seed ?? { i: 0, j: 0 };
  const r = (k: number) => h01(i - sd.i, j - sd.j, k);
  const raster = rasterOf({ plant: PILLAR, seed: Math.floor(r(1) * 4), size: 1.2, turn: Math.floor(r(2) * 8) }, 0);
  return raster ? [{ spot: { i: i + 0.5, j: j + 0.5, level: world.flatLevel }, picture: raster, w: raster.w, h: raster.h, foot: raster.foot }] : [];
}

/** A hash of integers to 0..1, so the rubble of an edge stays put while other edges are carved. */
function h01(a: number, b: number, c: number): number {
  let x = Math.imul(a | 0, 0x165667b1) ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul(c | 0, 0x85ebca77);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

/** The rubble along the walls' feet, in view coordinates: on about `amount` of the wall edges, a cluster. */
// shortcut: seeded by view position, so it lies differently when the editor turns the view; seed by scene position if that bothers.
export function caveRubble(walls: Building, amount: number, seed = { i: 0, j: 0 }): { plant: string; i: number; j: number; seed: number; size: number; turn: number }[] {
  const out: ReturnType<typeof caveRubble> = [];
  for (const { edge } of walls.edges.values()) {
    const ax = edge.axis === 'H' ? 0 : 1;
    const r = (k: number) => h01((edge.i - seed.i) * 2 + ax, edge.j - seed.j, k);
    if (r(0) >= amount) continue;
    const along = 0.15 + r(1) * 0.7;
    CLUSTER.forEach(([d, size], n) => {
      if (n && r(2 + n) < 0.3) return;
      const off = along + (r(5 + n) - 0.5) * 0.3;
      out.push({
        plant: RUBBLE_ROCKS[Math.floor(r(14) * RUBBLE_ROCKS.length)], i: edge.axis === 'H' ? edge.i + off : edge.i + d, j: edge.axis === 'H' ? edge.j + d : edge.j + off,
        seed: Math.floor(r(8 + n) * 4), size, turn: Math.floor(r(11 + n) * 8),
      });
    });
  }
  return out;
}

const derived = new WeakMap<World, { ground: unknown; rooms: Int16Array; key: string; things: Thing[] }>();

/** Which cell of floor the player stands on, as the cut goes by it; off the floor, none. */
const cellOf = (world: World, at?: { i: number; j: number }) => {
  if (!at) return '';
  const i = Math.floor(at.i), j = Math.floor(at.j);
  return isOpen(world.map, i, j) ? `${i},${j}` : '';
};

/**
 * Makes a world a cave: nothing beyond its rock, shadows deeper, and rock, walls and rubble that follow its ground,
 * cut round the player at `at` (or in front of every room without one, see `caveRock`). Call again after the ground
 * changed (or the view turned), so they follow; `caveThings` does when it has to.
 */
export function setUpCave(world: World, at?: { i: number; j: number }): void {
  // Drawn again once as a void: nothing but black beyond its rock (see `World.void`).
  if (!world.void) { world.void = true; world.redraw(); }
  world.trackSpots = true;
  world.shadowDepth = 2.4;
  if (!world.pieceKinds.rock) world.pieceKinds = { ...world.pieceKinds, rock: rockWall({ tones: PALETTE.cave }) };
  const known = derived.get(world);
  const rooms = known?.ground === world.ground ? known.rooms : caveRooms(world.map);
  const key = cellOf(world, at);
  const { walls, blocks, pillars } = caveRock(world.map, rooms, key && at ? { i: Math.floor(at.i) + 0.5, j: Math.floor(at.j) + 0.5 } : null);
  world.buildings = [walls];
  const rubble = caveRubble(walls, world.scene.cave?.rubble ?? 0, world.map.seed).flatMap((p) => {
    const raster = rasterOf(p, 0);
    return raster ? [{ spot: { i: p.i, j: p.j, level: standingHeight(world.map, p.i, p.j) }, picture: raster, w: raster.w, h: raster.h, foot: raster.foot }] : [];
  });
  derived.set(world, { ground: world.ground, rooms, key, things: [...blocks.map((c) => blockThing(world, c)), ...pillars.flatMap((c) => pillarThing(world, c)), ...rubble] });
}

/**
 * The cave's own things: its rock, walls and the rubble at their feet, cut round `at` (the player), or in front of
 * every room without it. Set up again first if the ground was redrawn or the player stepped onto another cell.
 */
export function caveThings(world: World, at?: { i: number; j: number }): Thing[] {
  const known = derived.get(world);
  // Stepping off the floor for a moment keeps the last cell's view.
  const key = cellOf(world, at) || (at && known ? known.key : '');
  if (known?.ground !== world.ground || known.key !== key) setUpCave(world, key ? { i: Number(key.split(',')[0]), j: Number(key.split(',')[1]) } : undefined);
  return [...world.buildingThings(at), ...derived.get(world)!.things];
}

/** How dark the cave is away from any light, as a tint for daylight.ts `lightByTile`. */
export function caveTint(scene: Scene): Tint {
  const tint = scene.cave?.tint ?? '#080e50';
  const [r, g, b] = [1, 3, 5].map((n) => parseInt(tint.slice(n, n + 2), 16));
  return { r, g, b, amount: scene.cave?.dark ?? 0.9 };
}

export { flicker };

/**
 * The cave's own lights, in view coordinates: the daylight at its ways out, its glowing decorations, and the halos of
 * the particle systems decorations carry (the wall torches').
 */
export function caveLamps(world: World, ms: number): TileLamp[] {
  const exits = (world.scene.cave?.exits ?? []).map((e) => ({ ...world.toView(e), r: DAY_REACH, color: CAVE_DAY, amount: 0.8 }));
  const glows = world.viewDecor().flatMap((d) => {
    const glow = decorById(d.decor)?.glow;
    if (!glow) return [];
    const f = glow.flicker ? flicker(ms, d.vi * 3.1 + d.vj * 1.7) : 1;
    return [{ i: d.vi, j: d.vj, r: glow.r * f, color: glow.color, amount: Math.min(1, glow.amount * f) }];
  });
  const halos = world.viewDecor().flatMap((d) => {
    const fx = decorById(d.decor)?.fx;
    const lamp = fx && tileHalo(particleSystem(fx.system), { i: d.vi, j: d.vj }, ms, d.vi * 3.1 + d.vj * 1.7);
    return lamp ? [lamp] : [];
  });
  return [...exits, ...glows, ...halos];
}
