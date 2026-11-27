// The running world of a scene: its ground drawn once per change, its plants drawn per wind
// frame, and a camera window composed each frame with everything standing on the ground. Also
// answers where a screen pixel is on the map, and where a walker may go.
import { drawPlantCropped, FRAMES, grow, isStill, type Category, type Grown } from '../flora/flora.ts';
import { crop, type Cropped } from '../core/cropped.ts';
import { plantById, plantOf } from '../flora/flora-catalog.ts';
import { blend, footOf, HOMES, packedOf, stamp, type Picture, type Pixels, type Spot, type Thing } from './island.ts';
import { SHADOW } from '../core/palette.ts';
import { drew, part } from '../../shared/stats.ts';
import { cached, has } from '../core/cache.ts';
import {
  BRICK, BY_HEIGHT, GROUNDS, heightAt, frontOf, groundOf, hiddenByGround, inside, isLand, isRock, LEVEL_M, LEVEL_PX, levelAt, renderTerrain, ROCK_LEVEL, SEA_LEVEL, seaFloor, setWater, setLevel, SHADE, SHADE_ALPHA, SHADOW_RUN, MINE, standingHeight, surfaceAt, underwater, waterOf,
  TILE_H, TILE_W, MAX_LEVEL, MIN_LEVEL, toScreen, type HeightMap, type TerrainImage,
} from './terrain.ts';
import { CUT, defaultShape, edgeWalkable, HOLE, shapeAt, standable, turnShape } from './ground.ts';
import { ANIMAL_H, ANIMAL_ORIGIN, ANIMAL_W, CLIPS, drawAnimal, type Animal, type ClipId } from '../animals/animal.ts';
import { FACING_VIEWS, turnFacing, type Facing } from '../core/puppet.ts';
import type { Herd } from './herd.ts';
import { decorById, decorPixels } from './decor.ts';
import { flameFrame } from './flame.ts';
import { GLOW_ALPHA } from './daylight.ts';
import { fishPixels, type Fish } from './fish.ts';
import { CLEAR, drawWeather, flashAt, plantWind, shadowLight, weatherSea, type Weather } from './weather.ts';
import { itemCovers, itemHalf, itemPicture, type PlacedItem } from './props.ts';
import { blockRadius, lockedPicture, propKind, propPicture } from './prop.ts';
import { ocean, rgb, WATER_COLORS } from './ocean.ts';
import { CAVE_FLOOR, CAVE_OPEN, mapOf, settingsOf, TURNS, type PlacedAnimal, type PlacedPlant, type Scene } from './scene.ts';
import { blocked, BuildingView, cornerBlocked, crosses, edgeBetween, edgeEnds, edgeKey, emptyBuilding, wallEnds, type Building, type Edge, type EdgeKind, type Part, type PieceKind } from './building/building.ts';
import { edgeKindOf, wallById, wallFades } from './building/walls.ts';
import { WallFade } from './wall-fade.ts';
import { DOOR_HEIGHT, edgeCells, holeLadder, ladderOn, type LadderView, type SceneDoor } from './ways.ts';
import { ladderPart } from './building/pieces/ladder.ts';
import { door as doorKind } from './building/pieces/door.ts';

export interface Rect { x: number; y: number; w: number; h: number }
/** A lamp for `World.lightField`: where it stands on the map, how far it reaches in tiles, its colour, its strength 0 to 1. */
export interface TileLamp { i: number; j: number; r: number; color?: string; amount?: number }
/** A lamp of a light field, with how far round walls its light must go to reach each cell (`World.lightField`). */
export interface LitLamp { i: number; j: number; r: number; rgb: number[]; amount: number; detour: Float32Array }
/** The lamps' light over the map, which cells can hold light at all, and whether beyond the map lies in daylight (the open sea round a dark scene). */
export interface TileLight { w: number; h: number; open: Uint8Array; lamps: LitLamp[]; outside?: boolean }
const rgb3 = (hex: string) => [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16));
export type { Thing };

/**
 * Things back to front. By `i + j` of their spots, except that a thing with a footprint on the
 * plan (`box`) goes behind whatever its picture overlaps that lies wholly in front of the footprint
 * along i or j, and in front of what lies wholly behind it (the box test of Ultima 8). Without any
 * footprint in view this is the plain `i + j` sort.
 */
export function paintOrder<T extends Thing & { dx: number; dy: number }>(things: T[]): T[] {
  const keyOf = (t: T) => t.box?.key ?? t.spot.i + t.spot.j;
  const sorted = [...things].sort((a, b) => keyOf(a) - keyOf(b));
  if (!sorted.some((t) => t.box)) return sorted;
  const overlaps = (a: T, b: T) => a.dx < b.dx + b.w && b.dx < a.dx + a.w && a.dy < b.dy + b.h && b.dy < a.dy + a.h;
  // A point thing's footprint is its spot.
  const boxOf = (t: T) => t.box ?? { x0: t.spot.i, x1: t.spot.i, y0: t.spot.j, y1: t.spot.j };
  const before = (a: T, b: T) => {
    if (!a.box && !b.box) return keyOf(a) < keyOf(b);
    const p = boxOf(a), q = boxOf(b);
    const aFirst = p.x1 <= q.x0 || p.y1 <= q.y0;
    const bFirst = q.x1 <= p.x0 || q.y1 <= p.y0;
    if (aFirst !== bFirst) return aFirst;
    return keyOf(a) < keyOf(b);
  };
  const out: T[] = [];
  const seen = new Set<T>();
  const visit = (t: T) => {
    if (seen.has(t)) return;
    seen.add(t);
    for (const o of sorted) if (o !== t && !seen.has(o) && overlaps(o, t) && before(o, t)) visit(o);
    out.push(t);
  };
  for (const t of sorted) visit(t);
  return out;
}

const EDGE = '#e0332e';
const EDGE_HOT = '#ffe066';
const COLLIDER = '#e0332ee0';
const ROCK_GRID = 48; // grey of the grid lines on a cave's black rock
/** The pale tone of the player's silhouette where ground hides them, as a whole pixel (little-endian RGBA). */
const SILHOUETTE = (() => {
  const [r, g, b] = rgb('#a7b6dc');
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
})();
const GRID_SHADE = 0.2; // how much darker grid lines are than the ground
const SHADE_RGB = rgb(SHADE);
/** How deep, in levels, a shadow still shows on the water; it fades out toward there. */
const SHADOW_DEPTH = 1.5;
const shadowFade = (depth: number) => Math.max(0, 1 - depth / SHADOW_DEPTH);
/** How long a footprint takes to vanish. */
const PRINT_MS = 60_000;
/**
 * How long the ground and water of a window stay good for. Waves, foam, the wash on the beach and
 * the fish all step about ten times a second, so between those steps the base is kept as drawn
 * rather than worked out per pixel again. Only the cache key is rounded to it: `ms` itself stays
 * exact, so weather, lightning and footprints still move every frame.
 */
const WATER_MS = 100;
/** New animal frames drawn a frame at most (`animalFrame`): each takes a few milliseconds. */
const COLD_DRAWS = 1;
/** The alpha of a kept water pixel still to be shaded toward the horizon. */
const WATER_ALPHA = 254;
/** Bands of rows the water is refreshed in, one after another over WATER_MS. */
const BANDS = 8;
/** Prints are pressed sand: tinted toward the sand's shaded side colour, at most this much. */
const PRINT_RGB = rgb('#b39a63');
const PRINT_DEPTH = 0.45;
/** Wet sand where the wash has been: tinted toward this, at most this much. */
const WET_RGB = rgb('#a8905c');
const WET_DEPTH = 0.4;
/** Fish are dark shapes under the water: this colour, this much. */
/** The pixels of a footprint and of a paw print, round the spot stepped on. */
const FOOT = [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
const PAW = [[0, 0], [1, 0]] as const;
// Wavelets on the open sea sit in rows that the current carries down the screen, each row
// swaying sideways; a wavelet shows for `shown` of every `ms`. Their colours, share, length and
// drift, the glints and the waves come from `ocean`.
const MARKS = { cell: 20, sway: 1.5, ms: 3500, rows: 0.3, shown: 0.3 };

// Shore waves: a crest line with foam fading out behind it seaward, broken into pieces that differ
// from wave to wave; where a crest breaks, a thin sheet of water runs up the beach, slides back
// and leaves the sand wet for a while.
/** Levels of depth behind a crest that its foam trails over. */
const TRAIL = 0.2;
/** The share of each crest left out, in pieces. */
const GAPS = 0.3;
/** Pixels up the beach the furthest wash reaches, and the share of a wave period it takes up and back. */
export const WASH_RUN = 5;
const WASH = 0.35;
/** The share of a wave period the sand stays darker after the wash leaves it. */
const DRY = 0.45;

/** Smooth noise 0 to 1 over a grid one unit across, a different field for each seed. */
function noiseAt(x: number, y: number, seed: number): number {
  // Written out rather than with small helpers: it runs for every shore pixel of every water frame.
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = mix(ix, iy, seed), b = mix(ix + 1, iy, seed), c = mix(ix, iy + 1, seed), e = mix(ix + 1, iy + 1, seed);
  const top = a + (b - a) * u;
  const bottom = c + (e - c) * u;
  return top + (bottom - top) * v;
}

/**
 * Crest `n` on its way in at pixel x, y is at `t` = `crestTime(x, y, ms) + n / ocean.waves`: its fraction is how far
 * along it is (0 rising, 1 breaking), and `floor(t) * ocean.waves + n` which pass of it this is. The time is bent
 * along x so crests are not rings. (No list of crests per pixel: this runs for every shore pixel of every water frame.)
 */
const crestTime = (x: number, y: number, ms: number) => ms / (ocean.wavePeriod * 1000) + (0.1 * Math.sin(x * 0.07) + 0.06 * Math.sin(x * 0.019 + y * 0.041));

/** Whether pass `id` of a crest shows at pixel x, y, or falls in one of its gaps. */
const shownAt = (x: number, y: number, id: number) => noiseAt(x / 14, y / 8, id) >= GAPS;

/**
 * How strong a wave is at ground pixel x, y, `depth` levels deep, given the depths of the pixels
 * above and to the left: the crest line is where the crest depth falls between them, so it is one
 * pixel wide whatever the slope, and foam fades out behind it. Crests rise in the
 * shallows, run in and break on the shore; the time is bent along x so crests are not rings.
 */
export function waveAt(depth: number, above: number, left: number, x: number, y: number, ms: number): number {
  const reach = ocean.waveReach;
  if (depth <= 0 || depth >= reach + TRAIL) return 0;
  let foam = 0;
  const t0 = crestTime(x, y, ms);
  for (let n = 0; n < ocean.waves; n++) {
    const t = t0 + n / ocean.waves;
    const phase = t - Math.floor(t);
    const crest = reach * (1 - phase);
    // Only against water: next to land or a cliff the crest would otherwise outline the shore for good.
    const on = (above > 0 && (depth - crest) * (above - crest) <= 0) || (left > 0 && (depth - crest) * (left - crest) <= 0);
    const behind = (depth - crest) / TRAIL;
    // Most pixels are neither on a crest nor behind one: only those ask whether this pass has a gap here.
    if (!on && !(behind > 0 && behind < 1)) continue;
    if (!shownAt(x, y, Math.floor(t) * ocean.waves + n)) continue;
    if (on) return Math.sqrt(phase);
    foam = Math.max(foam, 0.6 * Math.sqrt(phase) * (1 - behind));
  }
  return foam;
}

/**
 * The wash on beach pixel x, y, `dist` pixels from the water: how much a sheet of water covers it
 * (its front brighter) and how wet the sand is where a sheet has just left.
 */
export function washAt(dist: number, x: number, y: number, ms: number): { sheet: number; wet: number } {
  let sheet = 0, wet = 0;
  const t0 = crestTime(x, y, ms);
  for (let n = 0; n < ocean.waves; n++) {
    const t = t0 + n / ocean.waves;
    const phase = t - Math.floor(t), id = Math.floor(t) * ocean.waves + n;
    // The wash comes from the pass that just broke.
    if (phase >= WASH + DRY || !shownAt(x, y, id - ocean.waves)) continue;
    const run = WASH_RUN * (0.4 + 0.6 * noiseAt(x / 9, y / 5, id + 7919));
    if (dist > run) continue;
    const s = phase / WASH;
    const front = s < 1 ? run * Math.sin(Math.PI * s) : 0;
    if (dist <= front) sheet = Math.max(sheet, dist > front - 1 ? 0.75 : 0.35);
    // Wet from when the sliding sheet uncovered it.
    const left = WASH * (1 - Math.asin(Math.min(1, dist / run)) / Math.PI);
    if (phase > left) wet = Math.max(wet, 1 - (phase - left) / DRY);
  }
  return { sheet, wet: Math.min(1, wet) };
}

const mix = (a: number, b: number, k: number) => ((Math.imul(a * 7 + k, 73856093) ^ Math.imul(b * 13 + k, 19349663)) >>> 0) % 1000 / 1000;

/**
 * How strongly the wave colour covers water `depth` levels deep at pixel x, y: 0 for nothing.
 * Glints and wavelets show on all but the thinnest water at the shore.
 */
export function markAt(x: number, y: number, depth: number, ms: number): number {
  if (depth < 0.3) return 0;
  const t = ms / 1000;
  const row = Math.floor(y - t * ocean.drift);
  const g = { x: Math.floor(x / 9), y: Math.floor(row / 7) };
  if (mix(g.x, g.y, 5) < ocean.glints && x === g.x * 9 + Math.floor(mix(g.x, g.y, 6) * 9) && row === g.y * 7 + Math.floor(mix(g.x, g.y, 7) * 7)
    && (t / 2.5 + mix(g.x, g.y, 8)) % 1 < 0.1) return 0.8;
  return waveletAt(x, row, ms);
}

/**
 * How strong the wavelet in `row` is at pixel column x: a short straight line in the wave colour.
 * Rows are swayed sideways by the current; a wavelet keeps its length and quickly fades in and out.
 */
function waveletAt(x: number, row: number, ms: number): number {
  if (mix(row, 0, 1) > MARKS.rows) return 0; // rows without wavelets leave the water calm between them
  const sx = Math.floor(x + (ms / 1000) * (mix(row, 0, 2) - 0.5) * 2 * MARKS.sway);
  const cell = Math.floor(sx / MARKS.cell);
  const r = (k: number) => mix(cell, row, k);
  if (r(1) > ocean.ripples) return 0;
  const phase = (ms / MARKS.ms + r(2)) % 1;
  if (phase > MARKS.shown) return 0;
  const longest = Math.min(ocean.rippleLength, MARKS.cell - 4);
  const len = Math.max(2, Math.round(longest * (0.5 + 0.5 * r(3))));
  const start = 2 + Math.floor(r(4) * (MARKS.cell - 4 - longest));
  const at = sx - cell * MARKS.cell;
  return at >= start && at < start + len ? Math.sin((phase / MARKS.shown) * Math.PI) * ocean.rippleOpacity : 0;
}

/**
 * The deepest a walker wades, in levels under the water line, by the sea floor as drawn (per tile): which with the floor
 * sloping between tiles is up to about half a character's height. Deeper water blocks.
 */
export const WADE = 2;

/** How close, in metres, a walker comes to a wall: enough to keep clear of its planks poking out. */
const WALL_ROOM = 0.15;
const NOTHING: Picture = { get: () => null };
/** How long a door takes to swing open or shut, in ms. */
const DOOR_SWING_MS = 300;
/** A scene's door as the view has it: its edge turned, the kind of wall it stands in (if any) and its height. */
export interface ViewDoor { door: SceneDoor; edge: Edge; wall?: string; height: number }
/** A building part's picture, kept per part picture so the stamping's packing is kept too. */
const partPictures = new WeakMap<Uint8ClampedArray, Picture>();
function partPicture(part: Part): Picture {
  let pic = partPictures.get(part.rgba);
  if (!pic) {
    const hexes = new Array<string | null>(part.w * part.h).fill(null);
    for (let p = 0; p < hexes.length; p++) {
      if (!part.rgba[p * 4 + 3]) continue;
      hexes[p] = '#' + [0, 1, 2].map((k) => part.rgba[p * 4 + k].toString(16).padStart(2, '0')).join('');
    }
    partPictures.set(part.rgba, (pic = { get: (x, y) => hexes[y * part.w + x] ?? null }));
  }
  return pic;
}

/** Everything blocks a walker except grass. Radius in metres per unit of plant size. */
const BLOCK: Record<Category, number> = { palm: 0.3, jungle: 0.35, cactus: 0.3, rock: 0.4, driftwood: 0.35, grass: 0 };

// ------------------------------------------------------------------ plants

export { plantOf };

/** Up to how many wind frames a plant runs behind the shared wind. */
const WIND_LAG = 3;
const grownCache = new Map<string, GrownPlant>();
const sizeStep = (s: number) => Math.round(s * 10) / 10;
/** One wind frame of a placed plant. Shared by every plant with the same recipe, variant, size and turn. */
export function rasterOf(p: Pick<PlacedPlant, 'plant' | 'seed' | 'size'> & { turn?: number }, frame: number, wind = 1): Cropped | null {
  const grown = grownOf(p);
  return grown && rasterFrom(grown, frame, wind);
}
interface GrownPlant { key: string; grown: Grown; still: boolean }
/** A placed plant grown from its recipe, variant, size and turn, with the key its pictures are kept by. */
function grownOf(p: Pick<PlacedPlant, 'plant' | 'seed' | 'size'> & { turn?: number }): GrownPlant | null {
  const entry = plantById(p.plant);
  if (!entry) return null;
  const turn = ((p.turn ?? 0) % TURNS + TURNS) % TURNS;
  const key = `${p.plant}|${p.seed}|${sizeStep(p.size)}|${turn}`;
  let grown = grownCache.get(key);
  if (!grown) {
    const made = grow(plantOf(entry), { seed: p.seed, size: sizeStep(p.size), turn: (turn * 360) / TURNS });
    grownCache.set(key, (grown = { key, grown: made, still: isStill(made) }));
  }
  return grown;
}
function rasterFrom(grown: GrownPlant, frame: number, wind: number): Cropped {
  // What the wind does not move, or no wind moves, is one picture for every frame.
  const calm = grown.still || !wind;
  const at = calm ? 0 : frame;
  return cached('plant', `${grown.key}|${at}|${calm ? 0 : wind}`, () => drawPlantCropped(grown.grown, { frame: at, wind }));
}

/** Whether a plant may grow on a tile: each group keeps to its own ground, as on the generated islands. */
export const grows = (map: HeightMap, plant: string, i: number, j: number) => {
  const entry = plantById(plant);
  return !!entry && inside(map, Math.floor(i), Math.floor(j)) && HOMES[entry.category].includes(surfaceAt(map, Math.floor(i), Math.floor(j)));
};

/** A copy of a map where each cell of rock with floor on all four sides (a stalagmite) stands as high as the lowest of them. */
function withLoneRockFloored<M extends HeightMap & { shape: Uint8Array }>(map: M): M {
  const levels = Int8Array.from(map.levels);
  const shape = Uint8Array.from(map.shape);
  const at = (i: number, j: number) => map.levels[j * map.w + i];
  for (let j = 1; j < map.h - 1; j++) for (let i = 1; i < map.w - 1; i++) {
    if (!isRock(at(i, j))) continue;
    const round = [at(i + 1, j), at(i - 1, j), at(i, j + 1), at(i, j - 1)];
    if (round.some(isRock)) continue;
    // Flat, at the lowest floor round it.
    levels[j * map.w + i] = Math.min(...round);
    shape[j * map.w + i] = CUT;
  }
  return { ...map, levels, shape };
}

/** Smooths tiles (`j * w + i`): each takes the rounded mean of itself and its eight neighbours, all read before any change; a cave's rock stays and does not count. */
export function smooth(map: HeightMap, cells: number[]): void {
  const before = Int8Array.from(map.levels);
  for (const c of cells) {
    // A cave's rock is neither smoothed nor counted: it stands for no height.
    if (isRock(before[c])) continue;
    const i = c % map.w;
    const j = Math.floor(c / map.w);
    let sum = 0;
    let n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!inside(map, i + di, j + dj) || isRock(before[(j + dj) * map.w + i + di])) continue;
      sum += before[(j + dj) * map.w + i + di];
      n++;
    }
    setLevel(map, i, j, Math.round(sum / n));
  }
}

// ------------------------------------------------------------------ world

/**
 * A world is seen from one of four sides. The scene keeps its own map coordinates; the world
 * draws, picks and walks in view coordinates, on a copy of the ground turned by quarter turns.
 * Everything outside `World` that takes a tile or a point (tools, the walker) uses view
 * coordinates; `toData` and `toView` convert for what is saved.
 */
const shaded = new Uint8ClampedArray(3);
/**
 * Copies the part `x0`, `y0`, `sw` by `sh` of a kept ground `w` by `h` into `to`, shading the water marked with
 * WATER_ALPHA toward the horizon, the further up the window the more. Whole pixels move as 32-bit words, and a run of
 * one colour is shaded once (most of the sea is one).
 */
function horizon(from: Uint8ClampedArray, to: Uint8ClampedArray, w: number, h: number, x0: number, y0: number, sw: number, sh: number): void {
  const src = new Uint32Array(from.buffer, from.byteOffset, w * h);
  const dst = new Uint32Array(to.buffer, to.byteOffset, w * h);
  const [fr, fg, fb] = rgb(ocean.far);
  const ALPHA = WATER_ALPHA << 24;
  for (let y = y0; y < y0 + sh; y++) {
    const shade = ocean.gradient * (1 - y / h);
    let last = -1, out = 0;
    for (let i = y * w + x0, end = i + sw; i < end; i++) {
      const v = src[i];
      if ((v & 0xff000000) !== ALPHA) { dst[i] = v; continue; }
      if (v !== last) {
        // Little-endian: the red byte is the lowest. The clamped array rounds as the drawing does.
        const r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255;
        shaded[0] = r + (fr - r) * shade; shaded[1] = g + (fg - g) * shade; shaded[2] = b + (fb - b) * shade;
        last = v;
        out = 0xff000000 | (shaded[2] << 16) | (shaded[1] << 8) | shaded[0];
      }
      dst[i] = out;
    }
  }
}

/**
 * Whether a move from `from` to `to` runs into something round at (ci, cj), `r` across from its middle: the way passes
 * within `r` of it. Inside it already (placed on the walker), any move away from its middle is allowed, so nobody is
 * stuck in it. Neither depends on how long the move is, so a way planned in long steps is walked in short ones alike.
 */
function bumps(from: { i: number; j: number }, to: { i: number; j: number }, ci: number, cj: number, r: number): boolean {
  const fi = from.i - ci, fj = from.j - cj, di = to.i - from.i, dj = to.j - from.j;
  if (fi * fi + fj * fj < r * r) return fi * di + fj * dj < 0;
  const len = di * di + dj * dj;
  const t = len ? Math.max(0, Math.min(1, -(fi * di + fj * dj) / len)) : 0;
  const ni = fi + di * t, nj = fj + dj * t;
  return ni * ni + nj * nj < r * r;
}

export class World {
  scene: Scene;
  /** Quarter turns, 0 to 3. */
  rot: number;
  /** The ground as seen: the scene's ground turned by `rot`. Edits go here and are copied back by `redraw`. */
  map: HeightMap & { paint: Uint8Array; shape: Uint8Array; side: Uint8Array };
  ground!: TerrainImage;
  /** The ground as drawn: the map, with the sea floor sloping gently from every coast. Walkers wade on it. */
  floor!: HeightMap;

  /** In Play, the items where they lie now (picked up and set down again); in Edit, null, and the scene's own. */
  loose: PlacedItem[] | null = null;
  /** Objects of the scene that stay where they are whatever `loose` holds (a game that keeps its own loose items still shows the scene's holes and ladders). */
  fixed: PlacedItem[] = [];
  /** The weather now; set it with `setWeather`. */
  weather: Weather = CLEAR;
  /** Changes the weather: the sea, the plants' sway, shadows and the overlays follow it. */
  setWeather(w: Weather): void {
    this.weather = w;
    weatherSea(w);
  }
  /**
   * Where on the map each pixel of the last window composed lies, while `trackSpots` is set: the map point of the ground
   * seen there, or for a thing's pixel the thing's own spot, so a thing is lit as one by the light where it stands.
   * NaN where nothing is. For lighting tile by tile (daylight.ts `lightByTile`).
   */
  spots: { i: Float32Array; j: Float32Array } | null = null;
  trackSpots = false;

  /**
   * Light from lamps, as the old isometric games lit their dungeons but without their steps: for each lamp, how much
   * further than straight the light has to go to reach each cell (its detour round walls, which it does not pass, and,
   * round rock). The light at a point is then its straight distance plus the
   * detour blended from the cells round it, so pools are round and smooth, yet stop at walls.
   */
  lightField(lamps: readonly TileLamp[]): TileLight {
    const { w, h } = this.map;
    const open = new Uint8Array(w * h);
    for (let c = 0; c < w * h; c++) open[c] = isRock(this.shown.levels[c]) ? 0 : 1;
    const all = this.allBuildings();
    const walled = (a: { x: number; y: number }, b: { x: number; y: number }) => all.some((bd) => crosses(bd, a, b));
    const out: LitLamp[] = [];
    for (const lamp of lamps) {
      const ci = Math.floor(lamp.i), cj = Math.floor(lamp.j);
      if (!inside(this.map, ci, cj)) continue;
      // Past the reach by a cell, so the blend at the rim has cells on both sides.
      const far = lamp.r + 1.5;
      const dist = new Float32Array(w * h).fill(Infinity);
      dist[cj * w + ci] = Math.hypot(ci + 0.5 - lamp.i, cj + 0.5 - lamp.j);
      // Few cells and few lamps: a plain scan for the nearest open cell stands in for a heap.
      const todo = [cj * w + ci];
      while (todo.length) {
        let best = 0;
        for (let n = 1; n < todo.length; n++) if (dist[todo[n]] < dist[todo[best]]) best = n;
        const c = todo.splice(best, 1)[0];
        const d = dist[c];
        const i = c % w, j = Math.floor(c / w);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (!inside(this.map, ni, nj)) continue;
          const nc = nj * w + ni;
          const nd = d + (di && dj ? Math.SQRT2 : 1);
          if (!open[nc] || nd >= dist[nc] || nd > far) continue;
          if (walled({ x: i + 0.5, y: j + 0.5 }, { x: ni + 0.5, y: nj + 0.5 })) continue;
          dist[nc] = nd;
          todo.push(nc);
        }
      }
      const detour = new Float32Array(w * h).fill(far);
      for (let c = 0; c < w * h; c++) {
        if (dist[c] === Infinity) continue;
        const straight = Math.hypot((c % w) + 0.5 - lamp.i, Math.floor(c / w) + 0.5 - lamp.j);
        // Steps of eight ways run up to an eighth longer than straight in the open; that is no detour.
        detour[c] = Math.max(0, dist[c] - straight * 1.09);
      }
      out.push({ i: lamp.i, j: lamp.j, r: lamp.r, rgb: rgb3(lamp.color ?? '#ffb060'), amount: lamp.amount ?? 1, detour });
    }
    return { w, h, open, lamps: out, outside: !this.void };
  }

  /** Beyond the map, open sea; or, for an inside such as a cave, nothing: black (`SceneSettings.outside`). */
  void = false;
  /** The water line of the ground in view (terrain.ts `waterOf`): `DRY` where there is no water. */
  water = SEA_LEVEL;
  /**
   * Drawn on its own, as one of several scenes laid side by side (the scene editor's desk): beyond the map's outline at
   * the water line nothing is drawn, no sea and no dark, so what lies behind shows; only ground rising above the water
   * line and what stands there reach past it. Those pixels are left fully transparent.
   */
  alone = false;
  /** The map the ground is drawn from: `map`, but a lone cell of rock is drawn as floor, for what stands there (a cave's stalagmite) to stand on. */
  private shown!: HeightMap & { paint: Uint8Array; shape: Uint8Array };
  /** How much darker than outside shadows fall: more in a cave, where little else lights the ground. */
  shadowDepth = 1;
  /** Fish under the water, in view coordinates on `floor`; the game moves them (see fish.ts). */
  fish: Fish[] = [];
  /**
   * Buildings standing here, set by the game, and the kinds their pieces are drawn with. Their walls
   * block walking.
   */
  // shortcut: buildings are in view coordinates and do not turn with `rot`; keep them in scene coordinates when a game turns the view.
  buildings: Building[] = [];
  pieceKinds: Record<string, PieceKind> = {};
  private builtWith: { view: BuildingView; ground: TerrainImage; kinds: Record<string, PieceKind> } | null = null;

  /**
   * The buildings' pieces as things. `at` is where the player stands: under a roof, that roof is
   * not drawn (it still shades) and the walls on its front are cut to half height.
   */
  buildingThings(at?: { i: number; j: number }): Thing[] {
    const b = this.builtWith;
    if (!b || b.ground !== this.ground || b.kinds !== this.pieceKinds) {
      this.builtWith = { view: new BuildingView(this.pieceKinds, { map: this.floor, ground: this.ground }), ground: this.ground, kinds: this.pieceKinds };
    }
    return this.partThings(this.builtWith!.view, this.buildings, at);
  }

  private partThings(view: BuildingView, buildings: Building[], at?: { i: number; j: number }): Thing[] {
    return buildings.flatMap((building) => view.parts(building, at && { x: at.i, y: at.j })).map((part) => this.thingOfPart(part));
  }
  private thingOfPart(part: Part): Thing {
    // Any spot will do to place the picture; the middle of its footprint, which also decides what ground lies in front of it.
    const spot = { i: (part.box.x0 + part.box.x1) / 2, j: (part.box.y0 + part.box.y1) / 2, level: 0 };
    const at0 = footOf(this.ground, spot);
    return {
      spot, w: part.w, h: part.h, foot: { x: at0.x - part.x, y: at0.y - part.y },
      picture: part.hidden ? NOTHING : partPicture(part),
      box: { ...part.box, key: part.key }, shadow: part.shadow, bases: part.base,
    };
  }

  /** An edge of the scene in view coordinates. */
  viewEdge(edge: Edge): Edge | null {
    const [a, b] = edgeEnds(edge).map(([i, j]) => this.toView({ i, j }));
    return edgeBetween([Math.round(a.i), Math.round(a.j)], [Math.round(b.i), Math.round(b.j)]);
  }
  /** An edge in view coordinates back in the scene's. */
  dataEdge(edge: Edge): Edge | null {
    const [a, b] = edgeEnds(edge).map(([i, j]) => this.toData({ i, j }));
    return edgeBetween([Math.round(a.i), Math.round(a.j)], [Math.round(b.i), Math.round(b.j)]);
  }

  /**
   * The scene's own walls (`Scene.walls`) in view coordinates: a building per kind, as each kind has its own height.
   * A door on a wall's edge stands in its place (`viewDoors`).
   */
  private walled: { from: Scene['walls']; doors: Scene['doors']; rot: number; buildings: Building[] } | null = null;
  viewWalls(): Building[] {
    const w0 = this.walled;
    if (!w0 || w0.from !== this.scene.walls || w0.doors !== this.scene.doors || w0.rot !== this.rot) {
      const byKind = new Map<string, Building>();
      const doors = new Set((this.scene.doors ?? []).map((d) => edgeKey(d.edge)));
      for (const { edge, kind } of this.scene.walls ?? []) {
        const w = wallById(kind);
        if (!w || doors.has(edgeKey(edge))) continue;
        const e = this.viewEdge(edge);
        if (!e) continue;
        const bd = byKind.get(kind) ?? byKind.set(kind, emptyBuilding(w.height)).get(kind)!;
        bd.edges.set(edgeKey(e), { kind, edge: e });
      }
      this.walled = { from: this.scene.walls, doors: this.scene.doors, rot: this.rot, buildings: [...byKind.values()] };
    }
    return this.walled!.buildings;
  }

  /**
   * The scene's doors (`Scene.doors`) in view coordinates, each with the kind of wall it stands in (if any) and its
   * height: the wall's, or `DOOR_HEIGHT`.
   */
  private doored: { from: Scene['doors']; walls: Scene['walls']; rot: number; list: ViewDoor[] } | null = null;
  viewDoors(): ViewDoor[] {
    const d0 = this.doored;
    if (!d0 || d0.from !== this.scene.doors || d0.walls !== this.scene.walls || d0.rot !== this.rot) {
      const walls = new Map((this.scene.walls ?? []).map((w) => [edgeKey(w.edge), w.kind]));
      const list: ViewDoor[] = [];
      for (const door of this.scene.doors ?? []) {
        const edge = this.viewEdge(door.edge);
        if (!edge) continue;
        const wall = walls.get(edgeKey(door.edge));
        const kind = wall && wallById(wall) ? wall : undefined;
        list.push({ door, edge, wall: kind, height: kind ? wallById(kind)!.height : DOOR_HEIGHT });
      }
      this.doored = { from: this.scene.doors, walls: this.scene.walls, rot: this.rot, list };
    }
    return this.doored!.list;
  }
  /** The doors that stop a walker, as a building: all but the open ones and those `pass` lets through. */
  private doorBlocks = new Map<string, Building>();
  private doorBlock(pass?: (d: SceneDoor) => boolean): Building | null {
    const doors = this.viewDoors();
    if (!doors.length) return null;
    const shut = doors.filter((d) => d.door.state !== 'open' && !pass?.(d.door));
    const key = `${this.rot}|${shut.map((d) => edgeKey(d.edge)).join(' ')}`;
    let b = this.doorBlocks.get(key);
    if (!b) {
      if (this.doorBlocks.size > 64) this.doorBlocks.clear();
      b = emptyBuilding(DOOR_HEIGHT);
      for (const d of shut) b.edges.set(edgeKey(d.edge), { kind: 'door', edge: d.edge });
      this.doorBlocks.set(key, b);
    }
    return b;
  }
  /** The door on an edge (in view coordinates), if any. */
  doorOn(edge: Edge): SceneDoor | null {
    return this.viewDoors().find((d) => edgeKey(d.edge) === edgeKey(edge))?.door ?? null;
  }
  /**
   * The first door not open that a walker at `from` heading for `to` would meet within `reach` tiles: the one a game
   * opens (or unlocks) as the walker comes up to it.
   */
  doorAhead(from: { i: number; j: number }, to: { i: number; j: number }, reach = 0.9): SceneDoor | null {
    const d = Math.hypot(to.i - from.i, to.j - from.j);
    if (d < 1e-6) return null;
    const k = Math.min(1, reach / d);
    const end = { x: from.i + (to.i - from.i) * k, y: from.j + (to.j - from.j) * k };
    let best: SceneDoor | null = null, near = Infinity;
    for (const v of this.viewDoors()) {
      if (v.door.state === 'open') continue;
      const one = emptyBuilding(1);
      one.edges.set('d', { kind: 'door', edge: v.edge });
      if (!crosses(one, { x: from.i, y: from.j }, end)) continue;
      const [c0, c1] = edgeCells(v.edge);
      const far = Math.hypot((c0[0] + c1[0] + 1) / 2 - from.i, (c0[1] + c1[1] + 1) / 2 - from.j);
      if (far < near) { near = far; best = v.door; }
    }
    return best;
  }

  /**
   * The scene's ladders (`Scene.ladders`) as they stand on the ground, in view coordinates: only those with a step of
   * at least `LADDER_MIN` between two floors under them.
   */
  private laddered: { from: Scene['ladders']; ground: TerrainImage; list: LadderView[] } | null = null;
  viewLadders(): LadderView[] {
    const l0 = this.laddered;
    if (!l0 || l0.from !== this.scene.ladders || l0.ground !== this.ground) {
      const list: LadderView[] = [];
      for (const { edge } of this.scene.ladders ?? []) {
        const e = this.viewEdge(edge);
        const L = e && ladderOn(this.map, e);
        if (L) list.push(L);
      }
      this.laddered = { from: this.scene.ladders, ground: this.ground, list };
    }
    return this.laddered!.list;
  }
  /** The ladder down a hole object, in view coordinates: on the hole's cell, leaning on the floor at its back. */
  holeLadder(it: PlacedItem): LadderView | null {
    if (it.item !== 'hole') return null;
    const v = this.toView(it);
    return holeLadder(this.map, Math.floor(v.i), Math.floor(v.j), (it.turn ?? 0) + this.rot);
  }

  /** Everything that stops a walker on an edge: the game's buildings, the scene's walls and its doors but those open or let through by `pass`. */
  private allBuildings(pass?: (d: SceneDoor) => boolean): Building[] {
    const doors = this.doorBlock(pass);
    return doors ? [...this.buildings, ...this.viewWalls(), doors] : [...this.buildings, ...this.viewWalls()];
  }

  /**
   * The doors as buildings to draw, one per height: a door's own piece, or where it is hidden the piece of the wall it
   * stands in, else of the rock beside it (brick where that is brick, stone otherwise).
   */
  private doorDraw: { doors: ViewDoor[]; hidden: string; buildings: Building[] } | null = null;
  private doorBuildings(): Building[] {
    const doors = this.viewDoors();
    const hidden = doors.map((d) => (d.door.state === 'hidden' ? 1 : 0)).join('');
    if (this.doorDraw?.doors !== doors || this.doorDraw.hidden !== hidden) {
      const byHeight = new Map<number, Building>();
      for (const d of doors) {
        const b = byHeight.get(d.height) ?? byHeight.set(d.height, emptyBuilding(d.height)).get(d.height)!;
        b.edges.set(edgeKey(d.edge), { kind: d.door.state === 'hidden' ? (d.wall ?? `hidden:${this.rockBeside(d.edge)}`) : 'door', edge: d.edge });
      }
      this.doorDraw = { doors, hidden, buildings: [...byHeight.values()] };
    }
    return this.doorDraw.buildings;
  }
  /** What the rock beside a doorway is built of, for a hidden door to look like it: brick, or stone. */
  private rockBeside(e: Edge): 'brick' | 'stone' {
    const [a, b] = edgeCells(e);
    const side = e.axis === 'H' ? [0, 1] : [1, 0];
    for (const [ci, cj] of [a, b]) for (const k of [-1, 1]) {
      const i = ci + side[0] * k, j = cj + side[1] * k;
      if (inside(this.map, i, j) && isRock(levelAt(this.map, i, j)) && this.map.paint[j * this.map.w + i] === BRICK) return 'brick';
    }
    return 'stone';
  }

  /** How far each door's leaf has swung open, 0 to 1. */
  private swing = new Map<SceneDoor, number>();
  /** How the scene's walls are drawn and how far each has dissolved. */
  private wallDraw: { view: BuildingView; ground: TerrainImage; kinds: string; fade: WallFade; cell: string; walls: Building[]; ms?: number } | null = null;
  /** The ladders' pictures, by ground and ladder. */
  private ladderDraw: { ground: TerrainImage; parts: Map<string, Part> } | null = null;
  /**
   * The scene's walls, doors and ladders as things. Walls and doors in front of the player at `at` dissolve over a
   * quarter second, by the frame's time `ms` (at once without it), a straight run at a time (wall-fade.ts); a door in a
   * wall goes with the wall's run. Without a player none do. Doors swing open or shut by the same clock.
   */
  wallThings(at?: { i: number; j: number }, ms?: number): Thing[] {
    const ladders = this.ladderThings(this.viewLadders());
    const walls = this.viewWalls(), doors = this.doorBuildings();
    const buildings = [...walls, ...doors];
    if (!buildings.length) return ladders;
    const dark = settingsOf(this.scene).light === 'dark';
    const used = new Set(buildings.flatMap((b) => [...b.edges.values()].map((p) => p.kind)));
    const kinds = [...used].sort().join('|') + `|${dark}`;
    let d = this.wallDraw;
    if (!d || d.ground !== this.ground || d.kinds !== kinds) {
      const pieces: Record<string, EdgeKind> = {};
      for (const kind of used) {
        if (kind === 'door') pieces[kind] = doorKind();
        else if (kind.startsWith('hidden:')) pieces[kind] = edgeKindOf(wallById(kind.slice(7))!, dark);
        else pieces[kind] = edgeKindOf(wallById(kind)!, dark);
      }
      d = this.wallDraw = { view: new BuildingView(pieces, { map: this.floor, ground: this.ground }), ground: this.ground, kinds, fade: d?.fade ?? new WallFade(), cell: '-', walls: [] };
    }
    // Where the player stands, as the fade goes by it; walls, doors or ground changed, it is aimed again.
    const cell = at ? `${Math.floor(at.i)},${Math.floor(at.j)}` : '';
    if (d.cell !== cell || d.walls.length !== buildings.length || d.walls.some((b, k) => b !== buildings[k])) {
      const fading = walls.flatMap((b) => [...b.edges.values()].map(({ edge, kind }) => ({
        edge, kind, fades: wallFades(wallById(kind)!), top: Math.max(...wallEnds(this.floor, edge).high) + b.height,
      })));
      // A door goes with the run of wall it stands in, as that kind; one on its own is a run of its own.
      for (const v of this.viewDoors()) {
        const w = v.wall ? wallById(v.wall) : undefined;
        fading.push({ edge: v.edge, kind: v.wall ?? 'door', fades: w ? wallFades(w) : true, top: Math.max(...wallEnds(this.floor, v.edge).high) + v.height });
      }
      d.fade.aim(fading, this.floor, at ? { i: Math.floor(at.i), j: Math.floor(at.j) } : null);
      d.cell = cell;
      d.walls = buildings;
    }
    const dt = ms === undefined || d.ms === undefined ? null : Math.max(0, Math.min(100, ms - d.ms));
    if (dt === null) d.fade.settle();
    else d.fade.advance(dt);
    d.ms = ms;
    for (const v of this.viewDoors()) {
      const to = v.door.state === 'open' ? 1 : 0, now = this.swing.get(v.door) ?? to;
      const next = dt === null ? to : now + Math.sign(to - now) * Math.min(Math.abs(to - now), dt / DOOR_SWING_MS);
      this.swing.set(v.door, next);
    }
    for (const b of walls) for (const piece of b.edges.values()) piece.fade = d.fade.fadeOf(piece.edge);
    const doorOf = new Map(this.viewDoors().map((v) => [edgeKey(v.edge), v.door]));
    for (const b of doors) for (const piece of b.edges.values()) {
      const door = doorOf.get(edgeKey(piece.edge))!;
      piece.fade = d.fade.fadeOf(piece.edge);
      piece.open = Math.round((this.swing.get(door) ?? 0) * 8) / 8;
      piece.locked = door.state === 'locked';
    }
    return [...this.partThings(d.view, buildings), ...ladders];
  }

  /** Ladders as things, drawn once per ground. */
  private ladderThings(ladders: LadderView[]): Thing[] {
    if (!ladders.length) return [];
    if (this.ladderDraw?.ground !== this.ground) this.ladderDraw = { ground: this.ground, parts: new Map() };
    const parts = this.ladderDraw.parts;
    return ladders.map((L) => {
      const key = `${edgeKey(L.edge)}|${L.foot}|${L.low}|${L.high}|${L.hole}`;
      let p = parts.get(key);
      if (!p) parts.set(key, (p = ladderPart({ map: this.floor, ground: this.ground }, L)));
      return this.thingOfPart(p);
    });
  }

  constructor(scene: Scene, rot = 0) {
    this.scene = scene;
    this.rot = ((rot % 4) + 4) % 4;
    this.void = settingsOf(scene).outside === 'void';
    this.map = this.viewMap();
    this.ground = this.draw();
  }

  /** A point of the scene in view coordinates. One quarter turn takes (i, j) on a w by h map to (h - j, i). */
  toView(p: { i: number; j: number }): { i: number; j: number } {
    let { i, j } = p;
    let [w, h] = [this.scene.w, this.scene.h];
    for (let k = 0; k < this.rot; k++) {
      [i, j] = [h - j, i];
      [w, h] = [h, w];
    }
    return { i, j };
  }

  toData(p: { i: number; j: number }): { i: number; j: number } {
    let { i, j } = p;
    let [w, h] = this.rot % 2 ? [this.scene.h, this.scene.w] : [this.scene.w, this.scene.h];
    for (let k = 0; k < this.rot; k++) {
      [i, j] = [j, w - i];
      [w, h] = [h, w];
    }
    return { i, j };
  }

  /** The scene's tile index under a view tile. */
  private dataCell(vi: number, vj: number): number {
    const d = this.toData({ i: vi + 0.5, j: vj + 0.5 });
    return Math.floor(d.j) * this.scene.w + Math.floor(d.i);
  }

  private viewMap(): HeightMap & { paint: Uint8Array; shape: Uint8Array; side: Uint8Array } {
    const w = this.rot % 2 ? this.scene.h : this.scene.w;
    const h = this.rot % 2 ? this.scene.w : this.scene.h;
    // The scene's shift as a step in this view.
    const at = this.toView({ i: 0, j: 0 }), to = this.toView(this.scene.shift ?? { i: 0, j: 0 });
    const base = this.scene.origin ?? this.scene;
    const seed = { i: to.i - at.i, j: to.j - at.j, x: (this.rot % 2 ? base.w : base.h) * (TILE_W / 2) + 8 };
    const data = { ...mapOf(this.scene), seed };
    // Every cell has a material for its faces while edited (0, as its top, where the scene keeps none).
    const map = { ...data, shape: data.shape ?? defaultShape(data), side: data.side ?? new Uint8Array(data.w * data.h) };
    if (!this.rot) return map;
    const levels = new Int8Array(w * h);
    const paint = new Uint8Array(w * h);
    const shape = new Uint8Array(w * h);
    const side = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = this.dataCell(i, j);
      levels[j * w + i] = map.levels[c];
      paint[j * w + i] = map.paint[c];
      side[j * w + i] = map.side[c];
      // A ramp turns with the view.
      shape[j * w + i] = turnShape(map.shape[c], this.rot);
    }
    return { ...map, w, h, levels, paint, shape, side };
  }

  /** Turns the view; the scene itself does not change. */
  setRotation(rot: number): void {
    this.rot = ((rot % 4) + 4) % 4;
    this.map = this.viewMap();
    this.ground = this.draw();
    this.prints = [];
  }

  /** Footprints, in view coordinates; each fades away over `PRINT_MS`. */
  private prints: { i: number; j: number; level: number; ms: number; shape: readonly (readonly [number, number])[] }[] = [];
  /** A foot (or a paw) set down at a point: it leaves a print where the ground there is dry or wet sand. */
  footstep(i: number, j: number, ms: number, paw = false): void {
    const level = standingHeight(this.map, i, j);
    const g = this.ground;
    const at = footOf(g, { i, j, level });
    if (at.x < 0 || at.y < 0 || at.x >= g.w || at.y >= g.h) return;
    const kind = GROUNDS[g.tops[at.y * g.w + at.x] - 1];
    if ((kind !== 'sand' && kind !== 'wet') || g.depth[at.y * g.w + at.x] > 0) return;
    this.prints.push({ i, j, level, ms, shape: paw ? PAW : FOOT });
  }

  /** Draws the ground with the sea's current water colours. */
  private draw(): TerrainImage {
    this.water = waterOf(this.map);
    this.floor = seaFloor(this.map);
    setWater(WATER_COLORS.map((k) => ocean[k]));
    // With the water hidden (the editor's view), the ground under it is drawn bare.
    this.shown = withLoneRockFloored(this.waterShown ? this.map : { ...this.map, bare: true });
    // In the dark, stone faces are painted in the cave's tones.
    const dark = settingsOf(this.scene).light === 'dark';
    // Under a cutaway, ground over it is drawn as cut ground at its level.
    const cut = this.cutaway;
    const sliced = <T extends HeightMap & { shape: Uint8Array }>(m: T): T => (cut === null ? m : {
      ...m,
      levels: (m.levels as Int8Array).map((l) => (!isRock(l) && l > cut ? cut : l)),
      shape: m.shape.map((sh, c) => (!isRock(m.levels[c]) && m.levels[c] > cut ? CUT : sh)),
    });
    if (!this.void && !this.shown.levels.some(isRock)) return this.capped(renderTerrain(sliced(dark ? { ...this.shown, dark } : this.shown)));
    // Rock is drawn black on the floor's own plane (cave.ts stands its blocks and walls on it), so nothing slopes off at
    // the edge of the hollow and the editor's grid lies flat across it.
    let flat = Infinity;
    for (const l of this.shown.levels) if (l >= this.water && !isRock(l) && l < flat) flat = l;
    if (flat === Infinity) flat = this.scene.cave ? CAVE_FLOOR : SEA_LEVEL;
    this.flatLevel = flat;
    // Rock drawn so is cut ground; beyond a void's edge lies rock, which the ground beside it does not slope to.
    const ground = sliced(this.shown);
    return this.capped(renderTerrain({
      ...ground,
      levels: ground.levels.map((l) => (isRock(l) ? flat : l)),
      shape: ground.shape.map((sh, c) => (isRock(this.shown.levels[c]) ? CUT : sh)),
      solid: Uint8Array.from(this.shown.levels, (l) => (isRock(l) ? 1 : 0)),
      dark,
      ...(this.void && { outside: ROCK_LEVEL }),
    }));
  }

  /**
   * Marks the caps of ground cut off by the cutaway: darker, with a hatch across, so they read as cut, not as ground;
   * and ground under its floor, tops and faces, darker still.
   */
  private capped(image: TerrainImage): TerrainImage {
    if (this.cutaway === null && this.cutBelow === null) return image;
    const { rgba, cell, tops, w } = image;
    for (let p = 0; p < cell.length; p++) {
      if (cell[p] < 0) continue;
      if (this.belowCut(cell[p])) {
        for (let k = 0; k < 3; k++) rgba[p * 4 + k] *= 0.55;
        continue;
      }
      if (!tops[p] || !this.aboveCut(cell[p])) continue;
      // Half grey, so a cap keeps a hint of its ground, with darker lines across it every few pixels.
      const hatch = ((p % w) + Math.floor(p / w)) % 6 === 0;
      const grey = (rgba[p * 4] + rgba[p * 4 + 1] + rgba[p * 4 + 2]) / 3;
      for (let k = 0; k < 3; k++) rgba[p * 4 + k] = ((rgba[p * 4 + k] + grey) / 2) * (hatch ? 0.6 : 0.85);
    }
    return image;
  }

  /** Copies edits of the ground back to the scene, so what is saved is up to date. */
  commit(): void {
    const shape = (this.scene.shape ??= new Array(this.scene.w * this.scene.h).fill(0));
    const side = new Array(this.scene.w * this.scene.h).fill(0);
    for (let j = 0; j < this.map.h; j++) for (let i = 0; i < this.map.w; i++) {
      const c = this.dataCell(i, j);
      const at = j * this.map.w + i;
      const level = this.map.levels[at], paint = this.map.paint[at];
      this.scene.levels[c] = level;
      shape[c] = turnShape(this.map.shape[at], -this.rot);
      // In a cave the world paints unpainted floor as its own stone (see `mapOf`); rock is stone but where it is built of brick or mine.
      this.scene.paint[c] = this.scene.cave && (paint === CAVE_OPEN || (isRock(level) && paint !== BRICK && paint !== MINE)) ? 0 : paint;
      // Faces as their top's are not kept, nor any of rock, which has no faces of its own.
      side[c] = isRock(level) || this.map.side[at] === paint || (this.map.side[at] === BY_HEIGHT && paint === 0) ? 0 : this.map.side[at];
    }
    if (side.some((n) => n > 0)) this.scene.side = side;
    else delete this.scene.side;
  }

  /** After the ground changed: copies it back to the scene and draws it again. */
  redraw(): void {
    this.commit();
    this.ground = this.draw();
  }

  /** Placed things with their positions in view coordinates. */
  private seen<T extends { i: number; j: number }>(list: T[]): (T & { vi: number; vj: number })[] {
    return list.map((p) => {
      const v = this.toView(p);
      return { ...p, vi: v.i, vj: v.j };
    });
  }
  viewPlants() { return this.seen(this.scene.plants); }
  viewDecor() { return this.seen(this.scene.decor); }
  viewAnimals() { return this.seen(this.scene.animals); }
  viewItems() { return this.seen(this.loose ? [...this.fixed, ...this.loose] : this.scene.items); }

  /** The plant whose picture covers a pixel of the ground image, the front-most one, or null. */
  plantAt(x: number, y: number): PlacedPlant | null {
    let best: PlacedPlant | null = null;
    let front = -Infinity;
    const seen = this.viewPlants();
    seen.forEach((p, k) => {
      const raster = rasterOf({ ...p, turn: (p.turn ?? 0) + this.rot * (TURNS / 4) }, 0);
      if (!raster) return;
      const at = footOf(this.ground, { i: p.vi, j: p.vj, level: standingHeight(this.map, p.vi, p.vj) });
      const px = Math.floor(x) - (at.x - raster.foot.x);
      const py = Math.floor(y) - (at.y - raster.foot.y);
      if (px < 0 || py < 0 || px >= raster.w || py >= raster.h) return;
      const c = raster.get(px, py);
      if (!c || c === SHADOW || p.vi + p.vj < front) return;
      front = p.vi + p.vj;
      best = this.scene.plants[k];
    });
    return best;
  }

  /**
   * Lays the decorations on the ground in the window: on the sea floor they show through the
   * water, and nearer ground that rises in front hides them.
   */
  private drawDecor(image: Pixels, view: Rect): void {
    const g = this.ground;
    const d = image.data;
    for (const item of this.viewDecor()) {
      const kind = decorById(item.decor);
      if (!kind || kind.stands) continue;
      const level = heightAt(this.floor, item.vi, item.vj);
      const at = footOf(g, { i: item.vi, j: item.vj, level });
      if (at.x < view.x - 8 || at.y < view.y - 8 || at.x > view.x + view.w + 8 || at.y > view.y + view.h + 8) continue;
      const wet = underwater(this.water - level);
      if (wet <= 0) continue;
      for (const px of decorPixels(kind)) {
        const gx = at.x + px.x;
        const gy = at.y + px.y;
        const x = gx - view.x;
        const y = gy - view.y;
        if (x < 0 || y < 0 || x >= view.w || y >= view.h || gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) continue;
        if (Math.abs(g.height[gy * g.w + gx] - level) > 0.6) continue;
        const c = rgb(px.color);
        const o = (y * view.w + x) * 4;
        for (let k = 0; k < 3; k++) d[o + k] += (c[k] - d[o + k]) * wet;
      }
    }
  }

  /** Fish seen through the water, only where water shows, so never on the beach. */
  private drawFish(image: Pixels, view: Rect, ms: number): void {
    // No water, no fish to see.
    if (!this.waterShown) return;
    const g = this.ground;
    const d = image.data;
    this.fish.forEach((f, n) => {
      const at = footOf(g, { i: f.i, j: f.j, level: this.water });
      // Out in deep water a fish is lost in the blue.
      if (underwater(this.water - heightAt(this.floor, f.i, f.j)) <= 0) return;
      if (at.x < view.x - 8 || at.y < view.y - 8 || at.x > view.x + view.w + 8 || at.y > view.y + view.h + 8) return;
      const dir = Math.round(f.a / (Math.PI / 4));
      for (const px of fishPixels(Math.floor(ms / 150 + n * 0.37), dir, f.kind)) {
        const gx = at.x + px.x, gy = at.y + px.y;
        const x = gx - view.x, y = gy - view.y;
        if (x < 0 || y < 0 || x >= view.w || y >= view.h || gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) continue;
        const depth = g.depth[gy * g.w + gx];
        if (depth <= 0) continue;
        const c = rgb(px.color);
        const o = (y * view.w + x) * 4;
        const shows = underwater(depth);
        for (let k = 0; k < 3; k++) d[o + k] += (c[k] - d[o + k]) * shows;
      }
    });
  }

  /** The fish nearest a pixel of the ground image, within `r` pixels of its middle, if any. */
  fishAt(p: { x: number; y: number }, r: number): Fish | null {
    let best: Fish | null = null;
    let bestD = r;
    for (const f of this.fish) {
      const at = footOf(this.ground, { i: f.i, j: f.j, level: this.water });
      const dist = Math.hypot(p.x - at.x, p.y - at.y);
      if (dist <= bestD) [best, bestD] = [f, dist];
    }
    return best;
  }

  /** Where a map point is on the ground image. */
  screenOf(i: number, j: number): { x: number; y: number } {
    return footOf(this.ground, { i, j, level: standingHeight(this.map, i, j) });
  }

  /** The tile drawn at a pixel of the ground image, or null off the map. */
  tileAt(x: number, y: number): { i: number; j: number } | null {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.ground.w || y >= this.ground.h) return null;
    const c = this.ground.cell[y * this.ground.w + x];
    return c < 0 ? null : { i: c % this.map.w, j: Math.floor(c / this.map.w) };
  }

  /**
   * Outlines the top of one tile in a composed window, over everything drawn there (lights included): its own pixels
   * next to another tile's or to its faces. Under water the floor has no top drawn as such, so there it is the edge of
   * all of it that shows.
   */
  outlineTile(image: Pixels, view: Rect, cell: number, color: string): void {
    const g = this.ground;
    const wet = this.map.levels[cell] < this.water;
    const i = cell % this.map.w, j = Math.floor(cell / this.map.w);
    // Only the rows and columns the tile can be drawn in: its diamond, from the highest ground down to the lowest.
    const top = toScreen(i, j, MAX_LEVEL + 1), bottom = toScreen(i + 1, j + 1, MIN_LEVEL - 1);
    const x0 = Math.max(0, Math.floor(g.origin.x + top.x - TILE_W / 2 - view.x - 1)), x1 = Math.min(view.w, Math.ceil(g.origin.x + top.x + TILE_W / 2 - view.x + 1));
    const y0 = Math.max(0, Math.floor(g.origin.y + top.y - view.y - 1)), y1 = Math.min(view.h, Math.ceil(g.origin.y + bottom.y - view.y + 1));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const gx = x + view.x, gy = y + view.y;
      if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) continue;
      const p = gy * g.w + gx;
      if (g.cell[p] !== cell || (!wet && g.tops[p] === 0)) continue;
      const rim = [p - 1, p + 1, p - g.w, p + g.w].some((q) => q < 0 || q >= g.cell.length || g.cell[q] !== cell || (!wet && g.tops[q] === 0));
      if (rim) blend(image, x, y, color);
    }
  }

  /** The height, in levels, of the ground drawn at a pixel of the ground image, or null off it. */
  heightAtPixel(x: number, y: number): number | null {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.ground.w || y >= this.ground.h) return null;
    const p = y * this.ground.w + x;
    return this.ground.cell[p] < 0 ? null : this.ground.height[p];
  }

  /**
   * The map point (view coordinates, in fractions of a tile) seen at a pixel of the ground image on a flat plane at
   * `level`, whatever ground is drawn there: the editor keeps a stroke on one plane, so ground rising or falling under
   * the pointer does not move the stroke onto another tile.
   */
  planeAt(x: number, y: number, level: number): { i: number; j: number } {
    const across = (2 * (x - this.ground.origin.x)) / TILE_W; // i - j
    const down = (2 * (y - this.ground.origin.y + level * LEVEL_PX)) / TILE_H; // i + j
    return { i: (down + across) / 2, j: (down - across) / 2 };
  }

  private plantMemo = new WeakMap<PlacedPlant, {
    i: number; j: number; rot: number; ground: TerrainImage; plant: string; seed: number; size: number; turn?: number;
    lag: number; viewTurn: number; spot: Spot; grown: GrownPlant | null;
  }>();
  plantThings(frame: number): Thing[] {
    const out: Thing[] = [];
    const wind = this.windLevel();
    for (const p of this.scene.plants) {
      // What stays the same from frame to frame is kept per plant, while it stays put and the view and ground stay.
      let m = this.plantMemo.get(p);
      if (!m || m.i !== p.i || m.j !== p.j || m.rot !== this.rot || m.ground !== this.ground || m.plant !== p.plant || m.seed !== p.seed || m.size !== p.size || m.turn !== p.turn) {
        const v = this.toView(p);
        // Each plant sways a little behind or ahead of its neighbours, and turns with the view.
        const lag = ((Math.imul(Math.floor(p.i * 97), 73856093) ^ Math.imul(Math.floor(p.j * 89), 19349663)) >>> 0) % WIND_LAG;
        const turn = (p.turn ?? 0) + this.rot * (TURNS / 4);
        m = {
          i: p.i, j: p.j, rot: this.rot, ground: this.ground, plant: p.plant, seed: p.seed, size: p.size, turn: p.turn, lag, viewTurn: turn,
          spot: { i: v.i, j: v.j, level: standingHeight(this.map, v.i, v.j) }, grown: grownOf({ ...p, turn }),
        };
        this.plantMemo.set(p, m);
      }
      const { lag, viewTurn: turn } = m;
      const spot = { ...m.spot };
      // A plant frozen in the props tool is drawn from its painted pixels.
      const locked = lockedPicture(p.plant, turn, (frame + lag) % FRAMES, wind);
      if (locked) {
        out.push({ spot, picture: locked, w: locked.w, h: locked.h, foot: locked.foot });
        continue;
      }
      const raster = m.grown && rasterFrom(m.grown, (frame + lag) % FRAMES, wind);
      if (raster) out.push({ spot, picture: raster, w: raster.w, h: raster.h, foot: raster.foot });
    }
    return out;
  }

  /** The decorations that stand up (crystals, a torch) as things; the rest lie on the ground. */
  /**
   * One picture per kind's colours and set of rows (its own, or one of its flame frames; kinds can share rows), so its
   * packed pixels and shadow are kept from frame to frame.
   */
  private decorPictures = new WeakMap<Record<string, string>, WeakMap<readonly string[], Picture>>();
  private decorPicture(rows: readonly string[], colors: Record<string, string>): Picture {
    let byRows = this.decorPictures.get(colors);
    if (!byRows) this.decorPictures.set(colors, (byRows = new WeakMap()));
    let p = byRows.get(rows);
    if (!p) byRows.set(rows, (p = { get: (x: number, y: number) => colors[rows[y]?.[x]] ?? null }));
    return p;
  }

  decorThings(ms = 0): Thing[] {
    return this.viewDecor().flatMap((d) => {
      const kind = decorById(d.decor);
      if (!kind?.stands) return [];
      const w = Math.max(...kind.rows.map((r) => r.length)), h = kind.rows.length;
      const lift = kind.lift ?? 0;
      const rows = kind.frames ? flameFrame(kind.frames, ms, d.vi * 7 + d.vj * 3) : kind.rows;
      // One hung up on a wall casts no shadow on the floor.
      return [{
        // One on a wall stands at its own cell's floor, not the slope blended toward the rock behind (under the floor in a cave).
        spot: { i: d.vi, j: d.vj, level: lift ? levelAt(this.map, Math.floor(d.vi), Math.floor(d.vj)) : standingHeight(this.map, d.vi, d.vj) }, w, h, foot: { x: Math.floor(w / 2), y: h - 1 + lift },
        picture: this.decorPicture(rows, kind.colors), ...(lift && { shadow: [] }), ...(kind.fx && { fx: kind.fx }),
      }];
    });
  }

  itemThings(): Thing[] {
    return this.viewItems().map((it) => {
      // A hole is the ground's own (a hole-shaped cell); what stands in it is the ladder down.
      const down = this.holeLadder(it);
      if (down) return this.ladderThings([down])[0];
      const spot = { i: it.vi, j: it.vj, level: standingHeight(this.map, it.vi, it.vj) };
      // A catalogue object locked to pixels is drawn from them, until it opens (its frames are drawn by the renderer).
      const locked = it.open ? null : lockedPicture(`object:${it.item}`, ((it.turn ?? 0) + this.rot) * 2);
      return locked ? { spot, picture: locked, w: locked.w, h: locked.h, foot: locked.foot } : { spot, ...itemPicture(it.item, (it.turn ?? 0) + this.rot, this.scene.objects, it.open) };
    });
  }

  viewProps() { return this.seen(this.scene.props ?? []); }
  /** The props from the library standing in the scene, turned with the view, in a frame of the wind and loops. */
  propThings(frame: number): Thing[] {
    const out: Thing[] = [];
    for (const p of this.viewProps()) {
      const kind = propKind(p.kind);
      if (!kind) continue;
      const lag = ((Math.imul(Math.floor(p.i * 97), 73856093) ^ Math.imul(Math.floor(p.j * 89), 19349663)) >>> 0) % WIND_LAG;
      const picture = propPicture(kind, p.turn + this.rot * 2, frame + lag, this.windLevel(), p.seed, p.size);
      if (picture) out.push({ spot: { i: p.vi, j: p.vj, level: standingHeight(this.map, p.vi, p.vj) }, picture, w: picture.w, h: picture.h, foot: picture.foot });
    }
    return out;
  }

  /** Every placed animal is its own copy, so the same animal placed twice is known by what it is. */
  private animalKeys = new WeakMap<Animal, string>();

  /**
   * The animals as things: standing where placed and idling, each a little out of step with the
   * others, or as the herd has them in Play.
   */
  animalThings(ms: number, herd?: Herd): Thing[] {
    return this.scene.animals.flatMap((placed, k) => {
      const pose = herd?.poses[k];
      if (pose?.carried) return [];
      return [this.animalSprite(placed, k, ms, herd)];
    });
  }

  /** One animal's sprite in its current frame, as the herd has it in Play; the carried one too. */
  animalSprite(placed: PlacedAnimal, k: number, ms: number, herd?: Herd, facingNow?: Facing): Thing {
    const pose = herd?.poses[k];
    const clipId: ClipId = pose?.clip ?? 'idle';
    const clip = CLIPS[clipId];
    const lag = ((Math.imul(Math.floor(placed.i * 97), 73856093) ^ Math.imul(Math.floor(placed.j * 89), 19349663)) >>> 0) % clip.frames;
    const n = (Math.floor(((ms - (pose?.started ?? 0)) / 1000) * clip.rate) + lag) % clip.frames;
    const v = this.toView(pose ?? placed);
    const facing = facingNow ?? turnFacing((pose ?? placed).facing, this.rot * 2);
    let same = this.animalKeys.get(placed.animal);
    if (!same) this.animalKeys.set(placed.animal, (same = JSON.stringify(placed.animal)));
    const sprite = this.animalFrame(placed.animal, same, clipId, n, facing, this.lastShown.get(placed));
    this.lastShown.set(placed, sprite);
    return { spot: { i: v.i, j: v.j, level: standingHeight(this.map, v.i, v.j) }, picture: sprite, w: sprite.w, h: sprite.h, foot: sprite.foot };
  }

  /** An animal's frame from the picture store; a mirrored facing is the facing it mirrors, flipped, not drawn again. */
  private animalPicture(animal: Animal, same: string, clip: ClipId, n: number, facing: Facing): Cropped {
    const { mirror, drawn } = FACING_VIEWS[facing];
    return cached('animal', `${same}|${clip}|${n}|${facing}`, () =>
      mirror ? this.animalPicture(animal, same, clip, n, drawn).mirrored(ANIMAL_W, ANIMAL_ORIGIN.x) : crop(drawAnimal(animal, clip, n, facing).sprite, ANIMAL_W, ANIMAL_H, ANIMAL_ORIGIN));
  }

  /** New animal frames still to be drawn this frame (reset by `compose`). */
  private coldLeft = COLD_DRAWS;
  /** The picture each animal showed last. */
  private lastShown = new WeakMap<PlacedAnimal, Cropped>();
  /**
   * An animal's frame, drawn if need be, but only COLD_DRAWS new ones a frame: a herd setting off together would
   * otherwise draw dozens at once. Past that, the nearest earlier frame of the clip already drawn stands in, or with
   * none of its clip and facing drawn yet, the `last` picture the animal showed: it sets off or turns a few frames late.
   * One never shown before is drawn anyway, so none goes missing.
   */
  private animalFrame(animal: Animal, same: string, clip: ClipId, n: number, facing: Facing, last?: Cropped): Cropped {
    const { mirror, drawn } = FACING_VIEWS[facing];
    const ready = (m: number) => has('animal', `${same}|${clip}|${m}|${facing}`) || (mirror && has('animal', `${same}|${clip}|${m}|${drawn}`));
    if (!ready(n)) {
      const frames = CLIPS[clip].frames;
      if (this.coldLeft <= 0) for (let k = 1; k < frames; k++) {
        const m = (n - k + frames) % frames;
        if (ready(m)) return this.animalPicture(animal, same, clip, m, facing);
      }
      if (this.coldLeft <= 0 && last) return last;
      this.coldLeft--;
    }
    return this.animalPicture(animal, same, clip, n, facing);
  }

  /**
   * Draws the ground, the sea floor under the water and the water surface of `view` into `image`, a picture its size.
   * The sea's gradient toward the horizon goes by the window, not the ground: the water's pixels are left for it with
   * alpha WATER_ALPHA (`horizon`).
   */
  private drawBase(image: Pixels, view: Rect, ms: number, grid: boolean): void {
    const { w, h } = view;
    const SEA = rgb(ocean.deep);
    const FOAM = rgb(ocean.wave);
    const g = this.ground;
    const shore = this.shoreOf(g);
    const d = image.data;
    // Where one tile's pixels meet the next one's, to the right or below: one pixel wide.
    const onGrid = (gx: number, gy: number) => {
      const p = gy * g.w + gx, c = g.cell[p];
      const right = gx + 1 < g.w ? g.cell[p + 1] : c;
      const below = gy + 1 < g.h ? g.cell[p + g.w] : c;
      // One pixel wide: the pixel over a change of tile, so a slanted edge is a clean line two pixels a row; a change to
      // the right only where the edge runs straight down (the tile goes on below, as does the other one beside it).
      if (c >= 0 && below >= 0 && below !== c) return true;
      if (c >= 0 && right >= 0 && right !== c && below === c && (gy + 1 >= g.h || gx + 1 >= g.w || g.cell[p + g.w + 1] === right)) return true;
      // A cave's level edges: the line round the whole flat plane, where the next pixel is off the map.
      if (!this.void || c < 0) return false;
      return right < 0 || below < 0 || (gx > 0 && g.cell[p - 1] < 0) || (gy > 0 && g.cell[p - g.w] < 0);
    };
    d.fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = x + view.x, gy = y + view.y;
      if (gy < 0 || gx < 0 || gy >= g.h || gx >= g.w) continue;
      const p = gy * g.w + gx, o = (y * w + x) * 4;
      d[o] = g.rgba[p * 4]; d[o + 1] = g.rgba[p * 4 + 1]; d[o + 2] = g.rgba[p * 4 + 2]; d[o + 3] = 255;
    }
    // On the sea floor, under the surface the waves and ripples are drawn on next: decorations, then fish over them.
    this.drawDecor(image, view);
    this.drawFish(image, view, ms);
    for (let y = 0; y < h; y++) {
      const gy = y + view.y;
      for (let x = 0; x < w; x++) {
        const gx = x + view.x;
        const o = (y * w + x) * 4;
        // Alone on the desk with the water hidden, nothing but the map's own ground is drawn.
        if (this.alone && (this.beyond(gx, gy) || (!this.waterShown && !(gy >= 0 && gx >= 0 && gy < g.h && gx < g.w && g.cell[gy * g.w + gx] >= 0)))) {
          d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0;
          continue;
        }
        // Rock is black, and in a void world so is everything beyond the map.
        const on = gy >= 0 && gx >= 0 && gy < g.h && gx < g.w, cell = on ? g.cell[gy * g.w + gx] : -1;
        if ((cell >= 0 && isRock(this.shown.levels[cell])) || (this.void && cell < 0)) {
          d[o] = d[o + 1] = d[o + 2] = 0; d[o + 3] = 255;
          // The rock shows the grid too, in the editor, so you see where hollow space can be carved.
          if (grid && gy >= 0 && gx >= 0 && gy < g.h && gx < g.w && g.tops[gy * g.w + gx] > 0 && onGrid(gx, gy)) d[o] = d[o + 1] = d[o + 2] = ROCK_GRID;
          continue;
        }
        if (gy < 0 || gx < 0 || gy >= g.h || gx >= g.w) {
          d[o] = SEA[0]; d[o + 1] = SEA[1]; d[o + 2] = SEA[2]; d[o + 3] = 255;
          const mark = markAt(gx, gy, 9, ms);
          if (mark) for (let k = 0; k < 3; k++) d[o + k] += (FOAM[k] - d[o + k]) * mark;
          d[o + 3] = WATER_ALPHA;
          continue;
        }
        const p = gy * g.w + gx;
        // Waves and ripples are on the water surface, so they go by its depth, not the floor's.
        const depth = g.depth[p];
        const foam = 0.85 * waveAt(depth, g.depth[gy > 0 ? p - g.w : p], g.depth[gx > 0 ? p - 1 : p], gx, gy, ms);
        if (foam > 0) for (let k = 0; k < 3; k++) d[o + k] += (FOAM[k] - d[o + k]) * foam;
        else if (depth > 0) {
          const mark = markAt(gx, gy, depth, ms);
          if (mark) for (let k = 0; k < 3; k++) d[o + k] += (FOAM[k] - d[o + k]) * mark;
        } else if (shore[p] <= WASH_RUN && !this.void) { // no sea washes a cave's floor
          const { sheet, wet } = washAt(shore[p], gx, gy, ms);
          if (wet) for (let k = 0; k < 3; k++) d[o + k] += (WET_RGB[k] - d[o + k]) * wet * WET_DEPTH;
          if (sheet) for (let k = 0; k < 3; k++) d[o + k] += (FOAM[k] - d[o + k]) * sheet;
        }
        if (depth > 0) d[o + 3] = WATER_ALPHA;
        if (grid) {
          if (onGrid(gx, gy)) for (let k = 0; k < 3; k++) d[o + k] *= 1 - GRID_SHADE;
        }
      }
    }
  }

  /**
   * For an `alone` world: whether a pixel of the ground image lies beyond the map, neither inside its outline at the
   * water line (in a void world, on the plane its rock is drawn on) nor on ground higher than it.
   */
  private beyond(gx: number, gy: number): boolean {
    const g = this.ground;
    const base = this.void ? this.flatLevel : this.water;
    const a = (gx + 0.5 - g.origin.x) / (TILE_W / 2), b = (gy + 0.5 + base * LEVEL_PX - g.origin.y) / (TILE_H / 2);
    const i = (a + b) / 2, j = (b - a) / 2;
    if (i >= 0 && j >= 0 && i < this.map.w && j < this.map.h) return false;
    if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) return true;
    const p = gy * g.w + gx;
    return g.cell[p] < 0 || g.height[p] <= base;
  }

  /**
   * Paints the camera window: the ground, every shadow at once, then things back to front with
   * higher ground in front hiding them. `highlight` tints some tiles (the brush in the editor): all of them, or with
   * `part` only their tops (`floor`) or only their faces and rock (`walls`).
   * The picture is reused by the next call: copy it to keep it.
   */
  compose(view: Rect, things: Thing[], highlight?: { cells: Set<number>; color: string; part?: 'floor' | 'walls' }, outline = false, ms = 0, grid = false): Pixels {
    const { w, h } = view;
    this.coldLeft = COLD_DRAWS;
    const g = this.ground;
    let t0 = performance.now();
    // The picture and the shadow mask are reused from frame to frame rather than made anew each time.
    if (this.image?.width !== w || this.image.height !== h) this.image = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    const image = this.image;
    const d = image.data;
    {
      // The ground and water are kept from frame to frame: moved along when the view moves, drawing only the strips it
      // uncovers, and refreshed for the waves a band of rows at a time, each band every WATER_MS, so no frame redraws it all.
      const bandOf = (k: number) => Math.floor((ms + (k * WATER_MS) / BANDS) / WATER_MS);
      const old = this.base?.ground === g && this.base.grid === grid && this.base.alone === this.alone ? this.base : null;
      // The part of the window last drawn that is still in view.
      const x0 = old ? Math.max(view.x, old.x) : 0, x1 = old ? Math.min(view.x + w, old.x + old.w) : 0;
      const y0 = old ? Math.max(view.y, old.y) : 0, y1 = old ? Math.min(view.y + h, old.y + old.h) : 0;
      // A buffer for this window's size, in the memory of `a` where that is big enough (a zoom changes the size often).
      const sized = (a?: Uint8ClampedArray) => (a && a.buffer.byteLength >= d.length ? new Uint8ClampedArray(a.buffer, 0, d.length) : new Uint8ClampedArray(d.length));
      let b: NonNullable<World['base']>;
      if (!old || x1 <= x0 || y1 <= y0) {
        const was = this.base;
        b = this.base = { ground: g, grid, alone: this.alone, x: view.x, y: view.y, w, h, data: sized(was?.data), spare: sized(was?.spare), lit: sized(was?.lit), bands: new Float64Array(BANDS) };
        this.drawBase({ data: b.data, width: w, height: h }, view, ms, grid);
        for (let k = 0; k < BANDS; k++) b.bands[k] = bandOf(k);
        horizon(b.data, b.lit, w, h, 0, 0, w, h);
      } else {
        b = old;
        const kept = old;
        // The shading toward the horizon goes by the window's rows: kept where the view only moves sideways, so only what
        // is drawn anew is shaded, and all shaded again when it moves up or down or changes size.
        const drawn: [number, number, number, number][] = [];
        const strip = (x: number, y: number, sw: number, sh: number) => {
          if (sw <= 0 || sh <= 0) return;
          if (this.strip.length < sw * sh * 4) this.strip = new Uint8ClampedArray(sw * sh * 4);
          const s = { data: this.strip.subarray(0, sw * sh * 4), width: sw, height: sh };
          this.drawBase(s, { x: view.x + x, y: view.y + y, w: sw, h: sh }, ms, grid);
          for (let r = 0; r < sh; r++) kept.data.set(s.data.subarray(r * sw * 4, (r + 1) * sw * 4), ((y + r) * w + x) * 4);
          drawn.push([x, y, sw, sh]);
        };
        const dy = view.y - kept.y;
        const resized = w !== kept.w || h !== kept.h;
        if (view.x !== kept.x || dy || resized) {
          // What is still in view is copied to where it now is (into the spare buffer, then swapped), the rest drawn anew.
          const next = sized(kept.spare), len = (x1 - x0) * 4;
          for (let y = y0; y < y1; y++) {
            const from = ((y - kept.y) * kept.w + x0 - kept.x) * 4, to = ((y - view.y) * w + x0 - view.x) * 4;
            next.set(kept.data.subarray(from, from + len), to);
            if (!dy && !resized) kept.lit.copyWithin(to, from, from + len);
          }
          kept.spare = kept.data;
          kept.data = next;
          if (resized) {
            kept.lit = sized(kept.lit);
            // Bands are rows of the new size: each is next refreshed when its turn comes.
            for (let k = 0; k < BANDS; k++) kept.bands[k] = bandOf(k);
          }
          Object.assign(kept, { x: view.x, y: view.y, w, h });
          const top = y0 - view.y, bottom = y1 - view.y, left = x0 - view.x, right = x1 - view.x;
          strip(0, 0, w, top);
          strip(0, bottom, w, h - bottom);
          strip(0, top, left, bottom - top);
          strip(right, top, w - right, bottom - top);
        }
        // Only rows with water or a wet beach in them move with the waves: each run of them in the band is drawn again.
        const wet = this.wetRowsOf(g);
        const moves = (r: number) => !this.alone || (r + view.y >= 0 && r + view.y < g.h && wet[r + view.y] === 1);
        for (let k = 0; k < BANDS; k++) {
          const now = bandOf(k);
          if (now === kept.bands[k]) continue;
          kept.bands[k] = now;
          const r1 = Math.floor(((k + 1) * h) / BANDS);
          for (let r = Math.floor((k * h) / BANDS); r < r1; r++) {
            if (!moves(r)) continue;
            let end = r;
            while (end < r1 && moves(end)) end++;
            strip(0, r, w, end - r);
            r = end;
          }
        }
        t0 = part('water', t0);
        if (dy || resized) horizon(kept.data, kept.lit, w, h, 0, 0, w, h);
        else for (const [x, y, sw, sh] of drawn) horizon(kept.data, kept.lit, w, h, x, y, sw, sh);
        t0 = part('horizon', t0);
      }
      d.set(b.lit);
    }
    if (highlight) this.tint(image, view, highlight);
    const placed = things
      .map((t) => {
        const at = footOf(g, t.spot);
        return { ...t, dx: at.x - t.foot.x - view.x, dy: at.y - t.foot.y - view.y };
      })
      .filter((t) => t.dx < w && t.dy < h && t.dx + t.w > 0 && t.dy + t.h > 0);
    this.prints = this.prints.filter((f) => ms - f.ms < PRINT_MS);
    // Overlapping prints do not add up: each pixel takes the darkest print on it.
    const pressed = new Map<number, number>();
    const water = this.water;
    for (const f of this.prints) {
      const at = footOf(g, f);
      const strength = PRINT_DEPTH * (1 - (ms - f.ms) / PRINT_MS);
      for (const [dx, dy] of f.shape) {
        const gx = at.x + dx, gy = at.y + dy;
        const x = gx - view.x, y = gy - view.y;
        if (x < 0 || y < 0 || x >= w || y >= h || gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) continue;
        // Nearer, higher ground drawn over the spot hides the print, as with shadows.
        if (Math.abs(Math.max(water, g.height[gy * g.w + gx]) - f.level) > 0.5) continue;
        const o = (y * w + x) * 4;
        pressed.set(o, Math.max(pressed.get(o) ?? 0, strength));
      }
    }
    for (const [o, strength] of pressed) for (let k = 0; k < 3; k++) d[o + k] += (PRINT_RGB[k] - d[o + k]) * strength;
    // Shadows reach past a thing's picture, so things just outside the window cast into it too.
    // Each ground pixel is darkened once, and not where the ground already lies in shadow.
    t0 = part('ground', t0);
    if (this.mask.length !== w * h) this.mask = new Uint8Array(w * h);
    const mask = this.mask.fill(0);
    // A lightning flash throws hard shadows, darker than the sun's.
    const flash = flashAt(ms, this.weather);
    // The same for every shadow pixel of the frame, so worked out once.
    const strength = Math.min(1, SHADE_ALPHA * this.shadowDepth);
    const sun = Math.max(shadowLight(this.weather), 3 * flash);
    for (const t of things) {
      const at = footOf(g, t.spot);
      const reach = 2 * Math.max(t.w, t.h);
      if (at.x + reach < view.x || at.x - reach > view.x + w || at.y - reach / 2 > view.y + h || at.y + reach / 2 < view.y) continue;
      const shadow = t.shadow ?? this.shadowOf(t);
      for (let k = 0; k < shadow.length; k++) {
        const p = shadow[k];
        const gy = Math.floor(p / g.w);
        const x = p - gy * g.w - view.x;
        const y = gy - view.y;
        if (x >= 0 && y >= 0 && x < w && y < h && !g.shade[p] && !mask[y * w + x]) {
          mask[y * w + x] = 1;
          const o = (y * w + x) * 4;
          const a = strength * shadowFade(g.depth[p]) * sun;
          for (let k = 0; k < 3; k++) d[o + k] += (SHADE_RGB[k] - d[o + k]) * a;
        }
      }
    }
    t0 = part('shadows', t0);
    const spots = this.trackSpots ? this.spotsOf(view, g) : null;
    if (spots) t0 = part('spots', t0);
    // `hiddenBehind`, with the ground's per-pixel table looked up once for the frame.
    const { diags, highs } = frontOf(this.map, g);
    const behind = (x: number, y: number, diag: number, limit: number) => {
      const gx = x + view.x, gy = y + view.y;
      if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) return false;
      const p = gy * g.w + gx;
      return diags[p] > diag && highs[p] > limit;
    };
    const px = new Uint32Array(image.data.buffer, image.data.byteOffset, w * h);
    for (const t of paintOrder(placed)) {
      // Where no ground in a thing's box stands higher than it, no pixel of it needs asking whether ground hides it.
      // A wall's pixels stand at heights of their own: none can be hidden if its lowest cannot.
      const diag = Math.floor(t.spot.i) + Math.floor(t.spot.j), limit = Math.max(this.water, t.bases ? this.lowest(t.bases) : t.spot.level) + 0.4;
      const hides = this.groundAbove(t.dx + view.x, t.dy + view.y, t.w, t.h, diag, limit);
      const outline = t.silhouette && hides;
      if (!spots && !t.bases && !outline) {
        stamp(image, t.picture, t.w, t.h, t.dx, t.dy, hides ? (x, y) => behind(x, y, diag, limit) : undefined);
        continue;
      }
      stamp(image, t.picture, t.w, t.h, t.dx, t.dy, (x, y) => {
        const hidden = hides && behind(x, y, diag, t.bases ? Math.max(this.water, t.bases[(y - t.dy) * t.w + x - t.dx]) + 0.4 : limit);
        // Hidden, every other pixel of a silhouette's shows in one pale tone, on a pattern that stays put as the view moves.
        const traced = hidden && outline && ((x + view.x + y + view.y) & 1) === 0;
        if (traced) px[y * w + x] = SILHOUETTE;
        if ((!hidden || traced) && spots) {
          const b = t.box;
          if (b) {
            // A wall is long: each column of it is lit by the light at its own place along the wall, not all by its middle's.
            const a = (x + view.x + 0.5 - g.origin.x) / (TILE_W / 2);
            const along = b.x1 - b.x0 >= b.y1 - b.y0;
            const jc = (b.y0 + b.y1) / 2, ic = (b.x0 + b.x1) / 2;
            spots.i[y * w + x] = along ? Math.max(b.x0, Math.min(b.x1, a + jc)) : ic;
            spots.j[y * w + x] = along ? jc : Math.max(b.y0, Math.min(b.y1, ic - a));
          } else spots.i[y * w + x] = t.spot.i, spots.j[y * w + x] = t.spot.j;
        }
        return hidden;
      });
    }
    t0 = part('stamp', t0);
    if (this.weather !== CLEAR) {
      drawWeather(image, view, (gx, gy) => (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h ? Infinity : g.depth[gy * g.w + gx]), ms, this.weather);
    }
    if (outline) this.drawEdge(image, view);
    part('weather', t0);
    return image;
  }

  /** Where on the map the ground seen at each pixel of the ground image lies; NaN where no ground is. Made once per ground. */
  private groundSpots: { ground: TerrainImage; i: Float32Array; j: Float32Array } | null = null;
  /** `spots` for a window, filled with where the ground seen at each pixel lies on the map. */
  private spotsOf(view: Rect, g: TerrainImage): { i: Float32Array; j: Float32Array } {
    const n = view.w * view.h;
    if (this.spots?.i.length !== n) this.spots = { i: new Float32Array(n), j: new Float32Array(n) };
    if (this.groundSpots?.ground !== g) {
      const gi = new Float32Array(g.w * g.h), gj = new Float32Array(g.w * g.h);
      for (let q = 0; q < g.w * g.h; q++) {
        if (g.cell[q] < 0) { gi[q] = gj[q] = NaN; continue; }
        // Back from the screen to the map: x tells i - j, y with the height there tells i + j.
        const gx = q % g.w, gy = Math.floor(q / g.w);
        const a = (gx + 0.5 - g.origin.x) / (TILE_W / 2);
        const b = (gy + 0.5 - g.origin.y + g.height[q] * LEVEL_PX) / (TILE_H / 2);
        gi[q] = (a + b) / 2;
        gj[q] = (b - a) / 2;
      }
      this.groundSpots = { ground: g, i: gi, j: gj };
    }
    const { i: si, j: sj } = this.spots;
    const { i: gi, j: gj } = this.groundSpots;
    // Copied row by row; off the ground image, NaN.
    const x0 = Math.max(0, -view.x), x1 = Math.min(view.w, g.w - view.x);
    for (let y = 0; y < view.h; y++) {
      const gy = y + view.y, p = y * view.w;
      if (gy < 0 || gy >= g.h || x1 <= x0) { si.fill(NaN, p, p + view.w); sj.fill(NaN, p, p + view.w); continue; }
      si.fill(NaN, p, p + x0); sj.fill(NaN, p, p + x0);
      si.set(gi.subarray(gy * g.w + view.x + x0, gy * g.w + view.x + x1), p + x0);
      sj.set(gj.subarray(gy * g.w + view.x + x0, gy * g.w + view.x + x1), p + x0);
      si.fill(NaN, p + Math.max(x0, x1), p + view.w); sj.fill(NaN, p + Math.max(x0, x1), p + view.w);
    }
    return this.spots;
  }

  private shore: { ground: TerrainImage; dist: Uint8Array } | null = null;

  /**
   * Per ground pixel, how many pixels a beach pixel lies from the water, up to `WASH_RUN`; 255
   * elsewhere. Only ground at the water line counts, so higher ground drawn next to water is left dry.
   */
  /** Per row of the ground image, 1 where water or a wet beach is drawn in it: the rows that move with the waves. */
  private wetRowsOf(g: TerrainImage): Uint8Array {
    if (this.wetRows?.ground === g) return this.wetRows.rows;
    const shore = this.shoreOf(g);
    const rows = new Uint8Array(g.h);
    for (let p = 0; p < shore.length; p++) if (shore[p] <= WASH_RUN) rows[Math.floor(p / g.w)] = 1;
    this.wetRows = { ground: g, rows };
    return rows;
  }
  private wetRows: { ground: TerrainImage; rows: Uint8Array } | null = null;

  /**
   * Tints the tiles of `highlight` in a composed window: all of their pixels, or with `part` only their tops (floor) or
   * only their faces and rock (walls). Only the rows and columns the tiles can be drawn in are looked at.
   */
  private tint(image: Pixels, view: Rect, highlight: { cells: Set<number>; color: string; part?: 'floor' | 'walls' }): void {
    const g = this.ground, m = this.map;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of highlight.cells) {
      const i = c % m.w, j = Math.floor(c / m.w);
      x0 = Math.min(x0, toScreen(i, j + 1, 0).x - 1);
      x1 = Math.max(x1, toScreen(i + 1, j, 0).x + 1);
      y0 = Math.min(y0, toScreen(i, j, MAX_LEVEL + 1).y - 1);
      y1 = Math.max(y1, toScreen(i + 1, j + 1, MIN_LEVEL - 1).y + 1);
    }
    const ox = g.origin.x - view.x, oy = g.origin.y - view.y;
    for (let y = Math.max(0, Math.floor(y0 + oy)); y < Math.min(view.h, Math.ceil(y1 + oy)); y++) {
      for (let x = Math.max(0, Math.floor(x0 + ox)); x < Math.min(view.w, Math.ceil(x1 + ox)); x++) {
        const gx = x + view.x, gy = y + view.y;
        if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) continue;
        const p = gy * g.w + gx, c = g.cell[p];
        if (c < 0 || !highlight.cells.has(c)) continue;
        // Rock is drawn flat and black: it takes the tint but for a Floor part.
        const rock = isRock(this.shown.levels[c]);
        if (rock ? highlight.part !== 'floor' : !highlight.part || (highlight.part === 'floor') === g.tops[p] > 0) blend(image, x, y, highlight.color);
      }
    }
  }

  private shoreOf(g: TerrainImage): Uint8Array {
    if (this.shore?.ground === g) return this.shore.dist;
    const dist = new Uint8Array(g.w * g.h).fill(255);
    for (let p = 0; p < dist.length; p++) if (g.depth[p] > 0) dist[p] = 0;
    const wet = this.water + 0.5;
    for (let k = 1; k <= WASH_RUN; k++) {
      for (let p = 0; p < dist.length; p++) {
        if (dist[p] !== 255 || !g.tops[p] || g.height[p] > wet) continue;
        const x = p % g.w;
        if ((x > 0 && dist[p - 1] === k - 1) || (x < g.w - 1 && dist[p + 1] === k - 1) || (p >= g.w && dist[p - g.w] === k - 1) || (p + g.w < dist.length && dist[p + g.w] === k - 1)) dist[p] = k;
      }
    }
    this.shore = { ground: g, dist };
    return dist;
  }

  /**
   * The ground and water of the last window composed without a highlight, where it is, the wave time each band of rows
   * was last drawn at, `lit`, the same with the water shaded toward the horizon, and a `spare` buffer to move it into.
   */
  private base: { ground: TerrainImage; grid: boolean; alone: boolean; x: number; y: number; w: number; h: number; data: Uint8ClampedArray; spare: Uint8ClampedArray; lit: Uint8ClampedArray; bands: Float64Array } | null = null;
  /** Room to draw a strip of the base in. */
  private strip = new Uint8ClampedArray(0);
  private wind = -1;
  /** The plants' wind level now, held a little past a change of weather (`plantWind`). */
  private windLevel(): number {
    return (this.wind = plantWind(this.weather, this.wind));
  }
  private image: Pixels | null = null;
  /**
   * For each 16×16 block of the ground image, its tile diagonals (`i + j` of the cells painted there) each with the
   * highest ground (at least the sea) painted from it, as pairs: for `groundAbove`.
   */
  private tallest: { ground: TerrainImage; bw: number; bh: number; blocks: number[][] } | null = null;

  /**
   * Whether any ground in a box of the ground image is in front of tile diagonal `diag` and higher than `limit`:
   * only such ground can hide a thing there (`hiddenByGround`), so where there is none no pixel needs asking.
   */
  /** The lowest height a wall's pixels stand at. */
  private lowestOf = new WeakMap<ArrayLike<number>, number>();
  private lowest(bases: ArrayLike<number>): number {
    let low = this.lowestOf.get(bases);
    if (low === undefined) {
      low = Infinity;
      for (let k = 0; k < bases.length; k++) if (bases[k] < low) low = bases[k];
      this.lowestOf.set(bases, low);
    }
    return low;
  }

  private groundAbove(x: number, y: number, w: number, h: number, diag: number, limit: number): boolean {
    const g = this.ground;
    if (this.tallest?.ground !== g) {
      const bw = Math.ceil(g.w / 16), bh = Math.ceil(g.h / 16);
      const blocks = Array.from({ length: bw * bh }, (): number[] => []);
      for (let p = 0; p < g.cell.length; p++) {
        const c = g.cell[p];
        if (c < 0) continue;
        const block = blocks[Math.floor(p / g.w / 16) * bw + Math.floor((p % g.w) / 16)];
        const d = (c % this.map.w) + Math.floor(c / this.map.w);
        const high = Math.max(this.water, g.height[p]);
        let k = 0;
        while (k < block.length && block[k] !== d) k += 2;
        if (k === block.length) block.push(d, high);
        else if (high > block[k + 1]) block[k + 1] = high;
      }
      this.tallest = { ground: g, bw, bh, blocks };
    }
    const { bw, bh, blocks } = this.tallest;
    const x1 = Math.min(bw - 1, Math.floor((x + w - 1) / 16)), y1 = Math.min(bh - 1, Math.floor((y + h - 1) / 16));
    for (let by = Math.max(0, Math.floor(y / 16)); by <= y1; by++) for (let bx = Math.max(0, Math.floor(x / 16)); bx <= x1; bx++) {
      const block = blocks[by * bw + bx];
      for (let k = 0; k < block.length; k += 2) if (block[k] > diag && block[k + 1] > limit) return true;
    }
    return false;
  }
  private mask = new Uint8Array(0);
  private hitMask = new Uint8Array(0);
  private shadows = new WeakMap<Picture, Map<string, Int32Array>>();
  private shadowsOf: TerrainImage | null = null;
  /** `heightAt` on the map, with its cells' corners worked out once per ground. */
  private groundHeight = (i: number, j: number) => heightAt(this.map, i, j);

  /**
   * The ground pixels a thing's shadow falls on. Each pixel of its picture stands upright over its
   * foot, as high as it is drawn above it, and is sent away from the light to where it meets the
   * ground, so shadows lie across slopes and fall down cliffs. Kept per picture and spot.
   */
  private shadowOf(t: Thing): Int32Array {
    const g = this.ground;
    if (this.shadowsOf !== g) {
      this.shadows = new WeakMap();
      this.shadowsOf = g;
      this.groundHeight = groundOf(this.map);
    }
    let byPicture = this.shadows.get(t.picture);
    if (!byPicture) this.shadows.set(t.picture, (byPicture = new Map()));
    const key = `${t.spot.i},${t.spot.j}`;
    const known = byPicture.get(key);
    if (known) return known;
    return drew('shadow', () => this.castShadow(t, byPicture, key), (s) => s.length * 4);
  }

  private castShadow(t: Thing, byPicture: Map<string, Int32Array>, key: string): Int32Array {
    const g = this.ground;
    // The ground pixels hit, each once, in the order first hit: marked in a mask kept for the next cast.
    if (this.hitMask.length !== g.w * g.h) this.hitMask = new Uint8Array(g.w * g.h);
    const marked = this.hitMask, hit: number[] = [];
    const height = this.groundHeight;
    // The painted pixels, as stamping has them: glowing ones (marked by their alpha) cast no shadow.
    const { n, xy, rgba } = packedOf(t.picture, t.w, t.h);
    // Where each column meets the ground: the foot's row, or lying flat, the column's lowest pixel.
    const rests = new Array<number>(t.w).fill(-1);
    for (let k = 0; k < n; k++) rests[xy[2 * k]] = Math.max(rests[xy[2 * k]], xy[2 * k + 1]);
    for (let x = 0; x < t.w; x++) if (!t.flat || rests[x] < 0) rests[x] = t.foot.y;
    for (let k = 0; k < n; k++) {
      if (rgba[4 * k + 3] === GLOW_ALPHA) continue;
      const x = xy[2 * k], y = xy[2 * k + 1];
      const up = Math.max(0, rests[x] - y) / LEVEL_PX * LEVEL_M;
      const side = (x - t.foot.x) / TILE_W;
      const back = (rests[x] - t.foot.y) / TILE_H; // a lying column rests nearer or further than the foot
      const i = t.spot.i + side + back + up * SHADOW_RUN[0];
      const j = t.spot.j - side + back + up * SHADOW_RUN[1];
      // No shadows off the map, nor on water too deep for them to show.
      if (!inside(this.map, Math.floor(i), Math.floor(j))) continue;
      const ground = height(i, j);
      if (this.water - ground >= SHADOW_DEPTH) continue;
      const level = Math.max(this.water, ground);
      // footOf, without making a point per pixel.
      const ax = Math.round(g.origin.x + ((i - j) * TILE_W) / 2), ay = Math.round(g.origin.y + (((i + j) * TILE_H) / 2 - level * LEVEL_PX));
      if (ax < 0 || ay < 0 || ax >= g.w || ay >= g.h) continue;
      const p = ay * g.w + ax;
      // Nearer, higher ground drawn over that point hides the shadow there.
      if (Math.abs(Math.max(this.water, g.height[p]) - level) > 0.5) continue;
      if (!marked[p]) marked[p] = 1, hit.push(p);
    }
    const pixels = Int32Array.from(hit);
    for (const p of hit) marked[p] = 0;
    // A walker leaves one entry per spot it stood on: past a few dozen, the oldest goes.
    if (byPicture.size >= 48) byPicture.delete(byPicture.keys().next().value!);
    byPicture.set(key, pixels);
    return pixels;
  }

  private edge: { x: number; y: number; spot: Spot; side: 'n' | 'e' | 's' | 'w' }[] = [];
  /** The side of the red edge to draw lit (the editor's resize handle under the pointer), or none. */
  hotEdge: 'n' | 'e' | 's' | 'w' | null = null;
  /** The level of the plane rock is drawn on (the lowest floor): where a cave's grid, its red edge and its blocks of rock stand. */
  flatLevel = SEA_LEVEL;
  /**
   * The editor's cutaway: ground higher than this level is drawn cut off at it, its tops a hatched cap, so what lies
   * behind and below shows; null for none. Only the drawing changes (`redraw` after setting it), not the map.
   */
  cutaway: number | null = null;
  /** Whether the water is drawn; the editor can hide it to see the sea floor (`redraw` after setting it). */
  waterShown = true;
  /** The editor's floor to the cutaway: ground lower than this level is drawn darker, as out of reach; null for none. */
  cutBelow: number | null = null;
  /** Whether a cell's ground stands above the cutaway, so it is drawn cut off. */
  aboveCut(c: number): boolean {
    const level = this.map.levels[c];
    return this.cutaway !== null && !isRock(level) && level > this.cutaway;
  }
  /** Whether a cell's ground lies below the cutaway's floor, so it is drawn darker. */
  belowCut(c: number): boolean {
    const level = this.map.levels[c];
    return this.cutBelow !== null && !isRock(level) && level < this.cutBelow;
  }
  /** Whether a cell's ground is outside the cutaway's band, cut off over it or under its floor. */
  outsideCut(c: number): boolean {
    return this.aboveCut(c) || this.belowCut(c);
  }
  private edgeOf: TerrainImage | null = null;
  /** Where a point of the map's border is drawn: on the red edge. */
  edgeScreen(i: number, j: number): { x: number; y: number } {
    return footOf(this.ground, { i, j, level: this.edgeLevel(i, j) });
  }
  private edgeLevel(i: number, j: number): number {
    return this.void ? this.flatLevel : standingHeight(this.map, i, j);
  }

  /**
   * A red line round the map, on the ground (or the water) along its four edges, hidden where
   * nearer high ground covers it. Recomputed when the ground is redrawn.
   */
  private drawEdge(image: Pixels, view: Rect): void {
    if (this.edgeOf !== this.ground) {
      this.edgeOf = this.ground;
      const { w, h } = this.map;
      const e = 1e-3;
      const corners = [[e, e], [w - e, e], [w - e, h - e], [e, h - e], [e, e]];
      this.edge = [];
      for (let k = 0; k < 4; k++) {
        const [i0, j0] = corners[k];
        const [i1, j1] = corners[k + 1];
        const steps = Math.ceil(Math.hypot(i1 - i0, j1 - j0) * 16);
        for (let s = 0; s <= steps; s++) {
          const i = i0 + ((i1 - i0) * s) / steps;
          const j = j0 + ((j1 - j0) * s) / steps;
          const spot = { i, j, level: this.edgeLevel(i, j) };
          this.edge.push({ ...footOf(this.ground, spot), spot, side: (['n', 'e', 's', 'w'] as const)[k] });
        }
      }
    }
    // Consecutive points are joined, so a cliff at the edge is a vertical line, not a gap.
    for (let k = 1; k < this.edge.length; k++) {
      const a = this.edge[k - 1];
      const b = this.edge[k];
      const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
      for (let s = 0; s <= n; s++) {
        const x = Math.round(a.x + ((b.x - a.x) * s) / n);
        const y = Math.round(a.y + ((b.y - a.y) * s) / n);
        if (hiddenByGround(this.map, this.ground, x, y, a.spot.i, a.spot.j, a.spot.level)) continue;
        const hot = b.side === this.hotEdge;
        blend(image, x - view.x, y - view.y, hot ? EDGE_HOT : EDGE);
        if (hot) blend(image, x - view.x, y + 1 - view.y, EDGE_HOT);
      }
    }
  }

  /**
   * Whether a walker can step from one cell to the next (ground.ts): across an edge whose ends are within a level on
   * both sides, onto ground that is no rock, hole or too steep a slope; diagonally by way of a cell beside both.
   */
  private stepOk(a: [number, number], b: [number, number]): boolean {
    const f = this.floor;
    const di = b[0] - a[0], dj = b[1] - a[1];
    if (Math.abs(di) > 1 || Math.abs(dj) > 1) return true;
    if (!di || !dj) return edgeWalkable(f, ...a, ...b);
    const via = (m: [number, number]) => standable(f, ...m) && edgeWalkable(f, ...a, ...m) && edgeWalkable(f, ...m, ...b);
    return via([b[0], a[1]]) || via([a[0], b[1]]);
  }

  /**
   * Whether a walker can stand at a point: land or the shallows, reached without a cliff or too steep a slope, clear of
   * big plants, through no wall and no door but an open one or one `pass` lets through (path finding plans through
   * closed doors, which the walker opens on the way).
   */
  canWalk(from: { i: number; j: number }, to: { i: number; j: number }, pass?: (d: SceneDoor) => boolean): boolean {
    const a: [number, number] = [Math.floor(from.i), Math.floor(from.j)];
    const b: [number, number] = [Math.floor(to.i), Math.floor(to.j)], b0 = b;
    if (!inside(this.floor, ...b) || this.water - levelAt(this.floor, ...b) > WADE) return false;
    if (isRock(levelAt(this.map, ...b)) || shapeAt(this.map, ...b) === HOLE) return false;
    // Onto a cell (not about in the one stood on, so nobody is stuck on a slope they were set down on): not too steep, and
    // across no step, on land or under the water.
    if ((a[0] !== b[0] || a[1] !== b[1]) && (!standable(this.floor, ...b) || !this.stepOk(a, b))) return false;
    for (const p of this.viewPlants()) {
      const r = BLOCK[plantById(p.plant)!.category] * p.size;
      if (r && bumps(from, to, p.vi, p.vj, r)) return false;
    }
    // Objects block their footprint the same way.
    for (const p of this.viewProps()) {
      const kind = propKind(p.kind);
      const r = kind ? blockRadius(kind, p.size) : 0;
      if (r && bumps(from, to, p.vi, p.vj, r)) return false;
    }
    for (const it of this.viewItems()) {
      if (itemCovers(it, this.rot, this.scene.objects, to.i, to.j) && !itemCovers(it, this.rot, this.scene.objects, from.i, from.j)) return false;
    }
    // Walls block crossing their edge, and a step past a wall's end at a corner; stepping off one placed on the walker is allowed.
    for (const b of this.allBuildings(pass)) {
      if (crosses(b, { x: from.i, y: from.j }, { x: to.i, y: to.j }) || cornerBlocked(b, a, b0)) return false;
      if (blocked(b, to.i, to.j, WALL_ROOM) && !blocked(b, from.i, from.j, WALL_ROOM)) return false;
    }
    return true;
  }

  /**
   * Marks in red what stops a walker, over a finished picture: a ring round each plant and prop, the outline of each object's
   * footprint and the line of each wall, with the same numbers `canWalk` uses. (Deep water and cliffs are not marked.)
   */
  drawColliders(image: Pixels, view: Rect): void {
    const line = (a: [number, number], b: [number, number]) => {
      const pa = this.screenOf(...a);
      const pb = this.screenOf(...b);
      const n = Math.max(Math.abs(pb.x - pa.x), Math.abs(pb.y - pa.y), 1);
      for (let s = 0; s <= n; s++) blend(image, Math.round(pa.x + ((pb.x - pa.x) * s) / n) - view.x, Math.round(pa.y + ((pb.y - pa.y) * s) / n) - view.y, COLLIDER);
    };
    const loop = (pts: [number, number][]) => pts.forEach((p, k) => line(p, pts[(k + 1) % pts.length]));
    const ring = (i: number, j: number, r: number) => loop(Array.from({ length: 32 }, (_, k): [number, number] => [i + r * Math.cos((k * Math.PI) / 16), j + r * Math.sin((k * Math.PI) / 16)]));
    for (const p of this.viewPlants()) {
      const r = BLOCK[plantById(p.plant)!.category] * p.size;
      if (r) ring(p.vi, p.vj, r);
    }
    for (const p of this.viewProps()) {
      const kind = propKind(p.kind);
      const r = kind ? blockRadius(kind, p.size) : 0;
      if (r) ring(p.vi, p.vj, r);
    }
    for (const it of this.viewItems()) {
      const [a, b] = itemHalf(it, this.rot, this.scene.objects);
      loop([[it.vi - a, it.vj - b], [it.vi + a, it.vj - b], [it.vi + a, it.vj + b], [it.vi - a, it.vj + b]]);
    }
    for (const b of this.allBuildings()) {
      for (const { edge: e } of b.edges.values()) line([e.i, e.j], e.axis === 'H' ? [e.i + 1, e.j] : [e.i, e.j + 1]);
    }
  }

  /** A dry tile near a point, for a spawn that ended up in the sea. */
  nearestLand(i: number, j: number): { i: number; j: number } {
    let best = { i, j };
    let bestD = Infinity;
    for (let cj = 0; cj < this.map.h; cj++) for (let ci = 0; ci < this.map.w; ci++) {
      if (!isLand(this.map, ci, cj)) continue;
      const d = Math.hypot(ci + 0.5 - i, cj + 0.5 - j);
      if (d < bestD) { bestD = d; best = { i: ci + 0.5, j: cj + 0.5 }; }
    }
    return best;
  }
}
