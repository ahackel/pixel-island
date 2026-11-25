// Caves: scenes of solid rock with rooms carved open (scene.ts `createCave`). What stands in them follows from the
// carved ground: solid rock round the floor, with walls on the faces the camera looks at and rubble at their feet; the
// rock at the cave's front is not drawn, and rock in front of the player dissolves (front-rock.ts, `caveRock`). The
// world draws all else as nothing (`World.void`),
// or the open sea where that lies beyond it (a sea cave, `SceneSettings.outside`), dark but where lamps, glowing
// decorations and the daylight coming in light it.
import { PALETTE } from '../core/palette.ts';
import { dissolved, edgeKey, emptyBuilding, STUB_PX, type Building, type EdgePiece } from './building/building.ts';
import { rockWall } from './building/pieces/rock-wall.ts';
import type { Tint } from './daylight.ts';
import { decorById } from './decor.ts';
import { flicker } from './flame.ts';
import { particleSystem, tileHalo } from './particles.ts';
import { footOf, type Thing } from './island.ts';
import { LONE, RockFade, rockView, STANDS, type RockView } from './front-rock.ts';
import { CAVE_FLOOR, settingsOf, type Scene } from './scene.ts';
import { BRICK, hiddenByGround, inside, isRock, LEVEL_PX, MINE, PAINTS, ROCK_LEVEL, standingHeight, TILE_H, TILE_W, type HeightMap } from './terrain.ts';
import { rasterOf, type TileLamp, type World } from './world.ts';

/** The level of a new cave's floor (scene.ts), and how tall its walls stand in levels unless its headroom says (`SceneSettings.headroom`). */
export { CAVE_FLOOR };
export const CAVE_WALL = 5;
/** How tall a cave's rock stands over its floor, in levels: its headroom. */
const wallOf = (scene: Scene) => settingsOf(scene).headroom || CAVE_WALL;
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
    // Open floor and filled rock both start with faces of what they are.
    if (map.side) map.side[c] = 0;
    changed = true;
  }
  return changed;
}

/** The black top of solid rock stands this many pixels over the floor: just over the peaks of walls `wall` levels tall. */
const rockTop = (wall: number) => wall * LEVEL_PX + 2;

/**
 * The rock along the floor, as the old isometric games drew dungeons, seen into from the front (front-rock.ts
 * `rockView`): standing rock that hides some floor behind it on screen is a solid black block, and standing rock along
 * the floor shows it its faces (the walls), of stone, brick or mine as it is built; rock at the cave's front is not drawn at all. A lone cell of rock with floor
 * all round stands as a stalagmite. Gives the walls, with the rock cell each stands for, the cells that stand as
 * blocks, and the stalagmites.
 */
export function caveRock(map: HeightMap, view: RockView, wall = CAVE_WALL): { walls: Building; of: Map<EdgePiece, number>; blocks: number[]; pillars: number[] } {
  const { w, h } = map;
  const walls = emptyBuilding(wall);
  const of = new Map<EdgePiece, number>();
  const blocks: number[] = [];
  const pillars: number[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = j * w + i;
    if (view.kind[c] === LONE) pillars.push(c);
    if (view.kind[c] !== STANDS) continue;
    if (view.hides.has(c)) blocks.push(c);
    // Its walls are of what it is built of (front-rock.ts `material`).
    const kind = view.material[c] === BRICK ? 'brick' : view.material[c] === MINE ? 'mine' : 'rock';
    for (const edge of [isOpen(map, i + 1, j) && { axis: 'V' as const, i: i + 1, j }, isOpen(map, i, j + 1) && { axis: 'H' as const, i, j: j + 1 }]) {
      if (!edge) continue;
      const piece = { kind, edge };
      walls.edges.set(edgeKey(edge), piece);
      of.set(piece, c);
    }
  }
  return { walls, of, blocks, pillars };
}

/** The top of a stub of rock is black, but for its edges along the floor, which catch a little light. */
const STUB_RIM = '#3a4064';
/** How far in from a stub's edge its rim reaches, as a share of a cell. */
const RIM = 0.09;

/**
 * A block of solid rock on a cell: black from the floor up to the rock's top, dissolved by `fade` (front-rock.ts) down
 * to a stub a level high.
 */
function blockThing(world: World, c: number, fade: number): Thing {
  const i = c % world.map.w, j = Math.floor(c / world.map.w);
  const hw = TILE_W / 2, hh = TILE_H / 2;
  const top = rockTop(wallOf(world.scene));
  const height = 2 * hh + top;
  const spot = { i: i + 0.5, j: j + 0.5, level: world.flatLevel };
  const foot = { x: hw, y: hh + top };
  // Where the picture lies on the ground image, so blocks and walls dissolving side by side share one pattern.
  const at = footOf(world.ground, spot), ox = at.x - foot.x, oy = at.y - foot.y;
  const stub = top - STUB_PX; // how far down the picture the stub's top lies
  const rims = [isOpen(world.map, i - 1, j), isOpen(world.map, i + 1, j), isOpen(world.map, i, j - 1), isOpen(world.map, i, j + 1)];
  const picture = {
    get: (x: number, y: number) => {
      const yc = y + 0.5, a = x + 0.5 - hw, dx = Math.abs(a) / 2;
      if (yc < dx || yc > height - dx) return null;
      if (yc < dx + stub) return dissolved(ox + x, oy + y, fade) ? null : '#000000';
      // The stub, whose top shows where the rock over it is gone.
      const b = yc - stub - hh;
      if (!fade || Math.abs(b) > hh - dx || !dissolved(ox + x, oy + y, fade)) return '#000000';
      const u = (a / hw + b / hh + 1) / 2, v = (b / hh - a / hw + 1) / 2;
      return (rims[0] && u < RIM) || (rims[1] && u > 1 - RIM) || (rims[2] && v < RIM) || (rims[3] && v > 1 - RIM) ? STUB_RIM : '#000000';
    },
  };
  // Sorted just behind the walls on its front edges, which reach a little into it.
  return {
    spot, picture, w: TILE_W, h: height, foot, shadow: [],
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
  for (const { edge, kind } of walls.edges.values()) {
    // Brick is laid: no rubble falls from it.
    if (kind === 'brick') continue;
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

interface CaveView {
  ground: unknown;
  view: RockView;
  fade: RockFade;
  /** The walls, with the rock cell each stands for. */
  of: Map<EdgePiece, number>;
  blocks: number[];
  /** Block pictures by cell and fade, so a fade's steps are drawn once. */
  kept: Map<string, Thing>;
  /** Stalagmites and rubble. */
  others: Thing[];
  /** `rockWallAt` per pixel of the ground image, worked out as asked: -2 not yet, -1 no wall. */
  walls?: Int32Array;
  /** The cell of floor the player stands on (`cellOf`), and the time of the last frame. */
  key: string;
  ms?: number;
}
const derived = new WeakMap<World, CaveView>();

/** Which cell of floor the player stands on, as the rock goes by it; off the floor, none. */
const cellOf = (world: World, at?: { i: number; j: number }) => {
  if (!at) return '';
  const i = Math.floor(at.i), j = Math.floor(at.j);
  return isOpen(world.map, i, j) ? `${i},${j}` : '';
};
const cellAt = (key: string) => (key ? { i: Number(key.split(',')[0]), j: Number(key.split(',')[1]) } : null);

/**
 * Makes a world a cave: nothing beyond its rock, shadows deeper, and rock, walls and rubble that follow its ground,
 * the rock in front of the player at `at` gone (or all rock that hides floor down to its stub without one, see
 * front-rock.ts). Call again after the ground changed (or the view turned), so they follow; `caveThings` does when it
 * has to.
 */
export function setUpCave(world: World, at?: { i: number; j: number }): void {
  world.trackSpots = true;
  world.shadowDepth = 2.4;
  if (!world.pieceKinds.rock || !world.pieceKinds.mine) {
    world.pieceKinds = {
      ...world.pieceKinds, rock: rockWall({ tones: PALETTE.cave }), brick: rockWall({ tones: PALETTE.cave, material: 'brick' }), mine: rockWall({ tones: PALETTE.cave, material: 'mine' }),
    };
  }
  const wall = wallOf(world.scene);
  const view = rockView(world.map, world.flatLevel + rockTop(wall) / LEVEL_PX);
  const { walls, of, blocks, pillars } = caveRock(world.map, view, wall);
  world.buildings = [walls];
  const rubble = caveRubble(walls, world.scene.cave?.rubble ?? 0, world.map.seed).flatMap((p) => {
    const raster = rasterOf(p, 0);
    return raster ? [{ spot: { i: p.i, j: p.j, level: standingHeight(world.map, p.i, p.j) }, picture: raster, w: raster.w, h: raster.h, foot: raster.foot }] : [];
  });
  const key = cellOf(world, at);
  const fade = new RockFade(view);
  fade.aim(cellAt(key));
  fade.settle();
  derived.set(world, { ground: world.ground, view, fade, of, blocks, kept: new Map(), others: [...pillars.flatMap((c) => pillarThing(world, c)), ...rubble], key });
}

/**
 * The cave's own things: its rock, walls and the rubble at their feet, the rock in front of `at` (the player)
 * dissolving away and coming back over a quarter second as they walk, by the frame's time `ms`; without `ms` at once.
 * Without `at`, all rock that hides floor is down to its stub. Set up again first if the ground was redrawn.
 */
export function caveThings(world: World, at?: { i: number; j: number }, ms?: number): Thing[] {
  let known = derived.get(world);
  // Stepping off the floor for a moment keeps the last cell's view.
  const key = cellOf(world, at) || (at && known ? known.key : '');
  if (known?.ground !== world.ground) {
    setUpCave(world, cellAt(key) ?? undefined);
    known = derived.get(world)!;
  } else if (known.key !== key) {
    known.key = key;
    known.fade.aim(cellAt(key));
  }
  if (ms === undefined || known.ms === undefined) known.fade.settle();
  else known.fade.advance(Math.max(0, Math.min(100, ms - known.ms)));
  known.ms = ms;
  const { fade, kept } = known;
  for (const [piece, c] of known.of) piece.fade = fade.fadeOf(c);
  const blocks = known.blocks.map((c) => {
    const f = fade.fadeOf(c), k = `${c}|${f}`;
    let thing = kept.get(k);
    if (!thing) kept.set(k, (thing = blockThing(world, c, f)));
    return thing;
  });
  return [...world.buildingThings(at), ...blocks, ...known.others];
}

/**
 * The cell of rock whose wall is drawn at a pixel of the ground image, as the editor shows the cave (rock that hides
 * floor down to its stub), or null where no wall is: the frontmost, as it is drawn over those behind it. The walls
 * stand on the front edges of standing rock, from the floor up; those along the back of the map reach up past its
 * ground, where only this finds them.
 */
export function rockWallAt(world: World, x: number, y: number): number | null {
  if (!derived.get(world) || derived.get(world)!.ground !== world.ground) setUpCave(world);
  const known = derived.get(world)!;
  const g = world.ground;
  x = Math.floor(x);
  y = Math.floor(y);
  const inImage = x >= 0 && y >= 0 && x < g.w && y < g.h;
  if (inImage) {
    known.walls ??= new Int32Array(g.w * g.h).fill(-2);
    const had = known.walls[y * g.w + x];
    if (had !== -2) return had < 0 ? null : had;
  }
  const c = wallAt(world, known.view, x + 0.5, y + 0.5);
  if (inImage) known.walls![y * g.w + x] = c ?? -1;
  return c;
}
function wallAt(world: World, view: RockView, x: number, y: number): number | null {
  const map = world.map;
  const q = world.planeAt(x, y, 0);
  const across = q.i - q.j, down0 = q.i + q.j;
  const high = rockTop(wallOf(world.scene));
  let best: number | null = null, depth = -Infinity;
  // How far over the floor, in pixels, the pixel lies on a wall whose foot runs where i + j is `down`.
  const over = (down: number) => ((down - down0) * TILE_H) / 2 - world.flatLevel * LEVEL_PX;
  for (let c = 0; c < map.w * map.h; c++) {
    if (view.kind[c] !== STANDS) continue;
    const i = c % map.w, j = Math.floor(c / map.w);
    const top = view.hides.has(c) ? STUB_PX : high;
    // Its wall along i + 1, then along j + 1, where floor lies there.
    const a = i + 1 - across, b = across + j + 1;
    const walls: [boolean, number, number][] = [[isOpen(map, i + 1, j) && a >= j && a < j + 1, i + 1 + a, i + 1 + a], [isOpen(map, i, j + 1) && b >= i && b < i + 1, b + j + 1, b + j + 1]];
    for (const [on, down, d] of walls) {
      if (!on) continue;
      const h = over(down);
      if (h < 0 || h > top || d <= depth) continue;
      // Higher ground in front covers a wall, as it covers anything standing behind it.
      if (hiddenByGround(map, world.ground, Math.floor(x), Math.floor(y), i, j, world.flatLevel)) continue;
      best = c;
      depth = d;
    }
  }
  return best;
}

/** How dark the cave is away from any light, as a tint for daylight.ts `lightByTile`. */
export function caveTint(scene: Scene): Tint {
  const tint = scene.cave?.tint ?? '#080e50';
  const [r, g, b] = [1, 3, 5].map((n) => parseInt(tint.slice(n, n + 2), 16));
  return { r, g, b, amount: scene.cave?.dark ?? 0.9 };
}

export { flicker };

/**
 * Where daylight comes in at the map's edge, with the sea beyond it: a lamp on each open cell along the edge, at the
 * side it opens to, in view coordinates.
 */
function edgeLamps(world: World): TileLamp[] {
  const { w, h } = world.map;
  const out: TileLamp[] = [];
  const IN = 0.15;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if ((i > 0 && j > 0 && i < w - 1 && j < h - 1) || !isOpen(world.map, i, j)) continue;
    const li = i === 0 ? IN : i === w - 1 ? w - IN : i + 0.5;
    const lj = j === 0 ? IN : j === h - 1 ? h - IN : j + 0.5;
    out.push({ i: li, j: lj, r: DAY_REACH, color: CAVE_DAY, amount: 0.8 });
  }
  return out;
}

/**
 * The cave's own lights, in view coordinates: the daylight coming in (along the map's edge where the sea lies beyond
 * it, else at its ways out), its glowing decorations, and the halos of the particle systems decorations carry (the
 * wall torches').
 */
export function caveLamps(world: World, ms: number): TileLamp[] {
  const exits = settingsOf(world.scene).outside === 'sea' ? edgeLamps(world)
    : (world.scene.cave?.exits ?? []).map((e) => ({ ...world.toView(e), r: DAY_REACH, color: CAVE_DAY, amount: 0.8 }));
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
