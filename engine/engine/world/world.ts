// The running world of a scene: its ground drawn once per change, its plants drawn per wind
// frame, and a camera window composed each frame with everything standing on the ground. Also
// answers where a screen pixel is on the map, and where a walker may go.
import { drawPlantCropped, FRAMES, grow, isStill, type Category, type Grown } from '../flora/flora.ts';
import { crop, type Cropped } from '../core/cropped.ts';
import { plantById, plantOf } from '../flora/flora-catalog.ts';
import { blend, footOf, HOMES, packedOf, stamp, type Picture, type Pixels, type Spot, type Thing } from './island.ts';
import { SHADOW } from '../core/palette.ts';
import { drew, part } from '../../shared/stats.ts';
import { cached } from '../core/cache.ts';
import {
  GROUNDS, heightAt, hiddenBehind, hiddenByGround, inside, LEVEL_M, LEVEL_PX, levelAt, renderTerrain, SEA_LEVEL, seaFloor, setWater, setLevel, SHADE, SHADE_ALPHA, SHADOW_RUN, SLOPE_LEVELS, standingHeight, surfaceAt, underwater,
  TILE_H, TILE_W, type HeightMap, type TerrainImage,
} from './terrain.ts';
import { ANIMAL_H, ANIMAL_ORIGIN, ANIMAL_W, CLIPS, drawAnimal, type Animal, type ClipId } from '../animals/animal.ts';
import { turnFacing, type Facing } from '../core/puppet.ts';
import type { Herd } from './herd.ts';
import { decorById, decorPixels } from './decor.ts';
import { flameFrame } from './flame.ts';
import { GLOW_ALPHA } from './daylight.ts';
import { fishPixels, type Fish } from './fish.ts';
import { CLEAR, drawWeather, flashAt, plantWind, shadowLight, weatherSea, type Weather } from './weather.ts';
import { itemCovers, itemHalf, itemPicture, type PlacedItem } from './props.ts';
import { blockRadius, lockedPicture, propKind, propPicture } from './prop.ts';
import { ocean, rgb, WATER_COLORS } from './ocean.ts';
import { mapOf, TURNS, type PlacedAnimal, type PlacedPlant, type Scene } from './scene.ts';
import { blocked, BuildingView, crosses, type Building, type Part, type PieceKind } from './building/building.ts';

export interface Rect { x: number; y: number; w: number; h: number }
/** A lamp for `World.lightField`: where it stands on the map, how far it reaches in tiles, its colour, its strength 0 to 1. */
export interface TileLamp { i: number; j: number; r: number; color?: string; amount?: number }
/** A lamp of a light field, with how far round walls its light must go to reach each cell (`World.lightField`). */
export interface LitLamp { i: number; j: number; r: number; rgb: number[]; amount: number; detour: Float32Array }
/** The lamps' light over the map, and which cells can hold light at all. */
export interface TileLight { w: number; h: number; open: Uint8Array; lamps: LitLamp[] }
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
const COLLIDER = '#e0332ee0';
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
 * The deepest a walker wades: floor two levels under the water line, which with the floor sloping
 * between tiles is up to about half a character's height. Deeper water blocks.
 */
export const WADE = SEA_LEVEL - 2;

/** How close, in metres, a walker comes to a wall: enough to keep clear of its planks poking out. */
const WALL_ROOM = 0.15;
const NOTHING: Picture = { get: () => null };
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
const grownCache = new Map<string, { grown: Grown; still: boolean }>();
const sizeStep = (s: number) => Math.round(s * 10) / 10;
/** One wind frame of a placed plant. Shared by every plant with the same recipe, variant, size and turn. */
export function rasterOf(p: Pick<PlacedPlant, 'plant' | 'seed' | 'size'> & { turn?: number }, frame: number, wind = 1): Cropped | null {
  const entry = plantById(p.plant);
  if (!entry) return null;
  const turn = ((p.turn ?? 0) % TURNS + TURNS) % TURNS;
  const key = `${p.plant}|${p.seed}|${sizeStep(p.size)}|${turn}`;
  let grown = grownCache.get(key);
  if (!grown) {
    const made = grow(plantOf(entry), { seed: p.seed, size: sizeStep(p.size), turn: (turn * 360) / TURNS });
    grownCache.set(key, (grown = { grown: made, still: isStill(made) }));
  }
  // What the wind does not move, or no wind moves, is one picture for every frame.
  const calm = grown.still || !wind;
  const at = calm ? 0 : frame;
  return cached('plant', `${key}|${at}|${calm ? 0 : wind}`, () => drawPlantCropped(grown.grown, { frame: at, wind }));
}

/** Whether a plant may grow on a tile: each group keeps to its own ground, as on the generated islands. */
export const grows = (map: HeightMap, plant: string, i: number, j: number) => {
  const entry = plantById(plant);
  return !!entry && inside(map, Math.floor(i), Math.floor(j)) && HOMES[entry.category].includes(surfaceAt(map, Math.floor(i), Math.floor(j)));
};

/** A copy of a map where each cell under the water line with land on all four sides stands as high as the lowest of them. */
function withLoneRockFloored<M extends HeightMap>(map: M): M {
  const levels = Int8Array.from(map.levels);
  const at = (i: number, j: number) => map.levels[j * map.w + i];
  for (let j = 1; j < map.h - 1; j++) for (let i = 1; i < map.w - 1; i++) {
    if (at(i, j) >= SEA_LEVEL) continue;
    const round = Math.min(at(i + 1, j), at(i - 1, j), at(i, j + 1), at(i, j - 1));
    if (round >= SEA_LEVEL) levels[j * map.w + i] = round;
  }
  return { ...map, levels };
}

/** Smooths tiles (`j * w + i`): each takes the rounded mean of itself and its eight neighbours, all read before any change. */
export function smooth(map: HeightMap, cells: number[]): void {
  const before = Int8Array.from(map.levels);
  for (const c of cells) {
    const i = c % map.w;
    const j = Math.floor(c / map.w);
    let sum = 0;
    let n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!inside(map, i + di, j + dj)) continue;
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

export class World {
  scene: Scene;
  /** Quarter turns, 0 to 3. */
  rot: number;
  /** The ground as seen: the scene's ground turned by `rot`. Edits go here and are copied back by `redraw`. */
  map: HeightMap & { paint: Uint8Array };
  ground!: TerrainImage;
  /** The ground as drawn: the map, with the sea floor sloping gently from every coast. Walkers wade on it. */
  floor!: HeightMap;

  /** In Play, the items where they lie now (picked up and set down again); in Edit, null, and the scene's own. */
  loose: PlacedItem[] | null = null;
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
   * in a `void` world, round cells that are nothing). The light at a point is then its straight distance plus the
   * detour blended from the cells round it, so pools are round and smooth, yet stop at walls.
   */
  lightField(lamps: readonly TileLamp[]): TileLight {
    const { w, h } = this.map;
    const open = new Uint8Array(w * h);
    for (let c = 0; c < w * h; c++) open[c] = this.void && this.shown.levels[c] < SEA_LEVEL ? 0 : 1;
    const walled = (a: { x: number; y: number }, b: { x: number; y: number }) => this.buildings.some((bd) => crosses(bd, a, b));
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
    return { w, h, open, lamps: out };
  }

  /** Beyond the map, open sea; or, for an inside such as a cave, nothing: black, and the cells under the water line too, so a cave's floor can have any outline. */
  void = false;
  /** The map the ground is drawn from: `map`, but in a `void` world a lone cell of nothing is drawn as floor, for what stands there (a cave's stalagmite) to stand on. */
  private shown!: HeightMap & { paint: Uint8Array };
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
    const view = this.builtWith!.view;
    return this.buildings.flatMap((building) => view.parts(building, at && { x: at.i, y: at.j })).map((part) => {
      // Any spot will do to place the picture; the middle of its footprint, which also decides what ground lies in front of it.
      const spot = { i: (part.box.x0 + part.box.x1) / 2, j: (part.box.y0 + part.box.y1) / 2, level: 0 };
      const at0 = footOf(this.ground, spot);
      return {
        spot, w: part.w, h: part.h, foot: { x: at0.x - part.x, y: at0.y - part.y },
        picture: part.hidden ? NOTHING : partPicture(part),
        box: { ...part.box, key: part.key }, shadow: part.shadow, bases: part.base,
      };
    });
  }

  constructor(scene: Scene, rot = 0) {
    this.scene = scene;
    this.rot = ((rot % 4) + 4) % 4;
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

  private viewMap(): HeightMap & { paint: Uint8Array } {
    const w = this.rot % 2 ? this.scene.h : this.scene.w;
    const h = this.rot % 2 ? this.scene.w : this.scene.h;
    if (!this.rot) return mapOf(this.scene);
    const levels = new Int8Array(w * h);
    const paint = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = this.dataCell(i, j);
      levels[j * w + i] = this.scene.levels[c];
      paint[j * w + i] = this.scene.paint[c];
    }
    return { w, h, levels, paint };
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
    this.floor = seaFloor(this.map);
    setWater(WATER_COLORS.map((k) => ocean[k]));
    this.shown = this.void ? withLoneRockFloored(this.map) : this.map;
    return renderTerrain(this.shown);
  }

  /** Copies edits of the ground back to the scene, so what is saved is up to date. */
  commit(): void {
    for (let j = 0; j < this.map.h; j++) for (let i = 0; i < this.map.w; i++) {
      const c = this.dataCell(i, j);
      this.scene.levels[c] = this.map.levels[j * this.map.w + i];
      this.scene.paint[c] = this.map.paint[j * this.map.w + i];
    }
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
  viewItems() { return this.seen(this.loose ?? this.scene.items); }

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
      const wet = underwater(SEA_LEVEL - level);
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
    const g = this.ground;
    const d = image.data;
    this.fish.forEach((f, n) => {
      const at = footOf(g, { i: f.i, j: f.j, level: SEA_LEVEL });
      // Out in deep water a fish is lost in the blue.
      if (underwater(SEA_LEVEL - heightAt(this.floor, f.i, f.j)) <= 0) return;
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
      const at = footOf(this.ground, { i: f.i, j: f.j, level: SEA_LEVEL });
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

  plantThings(frame: number): Thing[] {
    const out: Thing[] = [];
    for (const p of this.viewPlants()) {
      // Each plant sways a little behind or ahead of its neighbours, and turns with the view.
      const lag = ((Math.imul(Math.floor(p.i * 97), 73856093) ^ Math.imul(Math.floor(p.j * 89), 19349663)) >>> 0) % WIND_LAG;
      const turn = (p.turn ?? 0) + this.rot * (TURNS / 4);
      const spot = { i: p.vi, j: p.vj, level: standingHeight(this.map, p.vi, p.vj) };
      // A plant frozen in the props tool is drawn from its painted pixels.
      const locked = lockedPicture(p.plant, turn, (frame + lag) % FRAMES, this.windLevel());
      if (locked) {
        out.push({ spot, picture: locked, w: locked.w, h: locked.h, foot: locked.foot });
        continue;
      }
      const raster = rasterOf({ ...p, turn }, (frame + lag) % FRAMES, this.windLevel());
      if (raster) out.push({ spot, picture: raster, w: raster.w, h: raster.h, foot: raster.foot });
    }
    return out;
  }

  /** The decorations that stand up (crystals, a torch) as things; the rest lie on the ground. */
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
        picture: { get: (x: number, y: number) => kind.colors[rows[y]?.[x]] ?? null }, ...(lift && { shadow: [] }),
      }];
    });
  }

  itemThings(): Thing[] {
    return this.viewItems().map((it) => {
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
    const sprite = cached('animal', `${same}|${clipId}|${n}|${facing}`, () => crop(drawAnimal(placed.animal, clipId, n, facing).sprite, ANIMAL_W, ANIMAL_H, ANIMAL_ORIGIN));
    return { spot: { i: v.i, j: v.j, level: standingHeight(this.map, v.i, v.j) }, picture: sprite, w: sprite.w, h: sprite.h, foot: sprite.foot };
  }

  /**
   * Draws the ground, the sea floor under the water and the water surface of `view` into `image`, a picture its size.
   * The sea's gradient toward the horizon goes by the window, not the ground: with `far` it is drawn on, else the
   * water's pixels are left for it with alpha WATER_ALPHA (`horizon`).
   */
  private drawBase(image: Pixels, view: Rect, ms: number, grid: boolean, far: boolean, highlight?: { cells: Set<number>; color: string }): void {
    const { w, h } = view;
    const SEA = rgb(ocean.deep);
    const FOAM = rgb(ocean.wave);
    const FAR = rgb(ocean.far);
    const g = this.ground;
    const shore = this.shoreOf(g);
    const d = image.data;
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
      const shade = ocean.gradient * (1 - y / h);
      for (let x = 0; x < w; x++) {
        const gx = x + view.x;
        const o = (y * w + x) * 4;
        // In a void world, nothing but the open cells: not their slopes down to the cells below the water line either.
        if (this.void && (gy < 0 || gx < 0 || gy >= g.h || gx >= g.w || g.cell[gy * g.w + gx] < 0 || g.depth[gy * g.w + gx] > 0 || this.shown.levels[g.cell[gy * g.w + gx]] < SEA_LEVEL)) {
          d[o] = d[o + 1] = d[o + 2] = 0; d[o + 3] = 255;
          continue;
        }
        if (gy < 0 || gx < 0 || gy >= g.h || gx >= g.w) {
          d[o] = SEA[0]; d[o + 1] = SEA[1]; d[o + 2] = SEA[2]; d[o + 3] = 255;
          const mark = markAt(gx, gy, 9, ms);
          if (mark) for (let k = 0; k < 3; k++) d[o + k] += (FOAM[k] - d[o + k]) * mark;
          if (far) for (let k = 0; k < 3; k++) d[o + k] += (FAR[k] - d[o + k]) * shade;
          else d[o + 3] = WATER_ALPHA;
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
        if (depth > 0 && far) for (let k = 0; k < 3; k++) d[o + k] += (FAR[k] - d[o + k]) * shade;
        else if (depth > 0) d[o + 3] = WATER_ALPHA;
        if (grid) {
          // A faint line where one tile's pixels meet the next one's, to the right or below.
          const c = g.cell[p];
          const right = gx + 1 < g.w ? g.cell[p + 1] : c;
          const below = gy + 1 < g.h ? g.cell[p + g.w] : c;
          if (c >= 0 && ((right >= 0 && right !== c) || (below >= 0 && below !== c))) for (let k = 0; k < 3; k++) d[o + k] *= 1 - GRID_SHADE;
        }
        if (highlight?.cells.has(g.cell[p])) blend(image, x, y, highlight.color);
      }
    }
  }

  /**
   * Paints the camera window: the ground, every shadow at once, then things back to front with
   * higher ground in front hiding them. `highlight` tints some tiles (the brush in the editor).
   * The picture is reused by the next call: copy it to keep it.
   */
  compose(view: Rect, things: Thing[], highlight?: { cells: Set<number>; color: string }, outline = false, ms = 0, grid = false): Pixels {
    const { w, h } = view;
    const g = this.ground;
    let t0 = performance.now();
    // The picture and the shadow mask are reused from frame to frame rather than made anew each time.
    if (this.image?.width !== w || this.image.height !== h) this.image = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    const image = this.image;
    const d = image.data;
    if (highlight) this.drawBase(image, view, ms, grid, true, highlight);
    else {
      // The ground and water are kept from frame to frame: moved along when the view moves, drawing only the strips it
      // uncovers, and refreshed for the waves a band of rows at a time, each band every WATER_MS, so no frame redraws it all.
      const bandOf = (k: number) => Math.floor((ms + (k * WATER_MS) / BANDS) / WATER_MS);
      const old = this.base?.ground === g && this.base.grid === grid ? this.base : null;
      // The part of the window last drawn that is still in view.
      const x0 = old ? Math.max(view.x, old.x) : 0, x1 = old ? Math.min(view.x + w, old.x + old.w) : 0;
      const y0 = old ? Math.max(view.y, old.y) : 0, y1 = old ? Math.min(view.y + h, old.y + old.h) : 0;
      // A buffer for this window's size, in the memory of `a` where that is big enough (a zoom changes the size often).
      const sized = (a?: Uint8ClampedArray) => (a && a.buffer.byteLength >= d.length ? new Uint8ClampedArray(a.buffer, 0, d.length) : new Uint8ClampedArray(d.length));
      let b: NonNullable<World['base']>;
      if (!old || x1 <= x0 || y1 <= y0) {
        const was = this.base;
        b = this.base = { ground: g, grid, x: view.x, y: view.y, w, h, data: sized(was?.data), spare: sized(was?.spare), lit: sized(was?.lit), bands: new Float64Array(BANDS) };
        this.drawBase({ data: b.data, width: w, height: h }, view, ms, grid, false);
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
          this.drawBase(s, { x: view.x + x, y: view.y + y, w: sw, h: sh }, ms, grid, false);
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
        for (let k = 0; k < BANDS; k++) {
          const now = bandOf(k);
          if (now === kept.bands[k]) continue;
          kept.bands[k] = now;
          const r0 = Math.floor((k * h) / BANDS);
          strip(0, r0, w, Math.floor(((k + 1) * h) / BANDS) - r0);
        }
        t0 = part('water', t0);
        if (dy || resized) horizon(kept.data, kept.lit, w, h, 0, 0, w, h);
        else for (const [x, y, sw, sh] of drawn) horizon(kept.data, kept.lit, w, h, x, y, sw, sh);
        t0 = part('horizon', t0);
      }
      d.set(b.lit);
    }
    const placed = things
      .map((t) => {
        const at = footOf(g, t.spot);
        return { ...t, dx: at.x - t.foot.x - view.x, dy: at.y - t.foot.y - view.y };
      })
      .filter((t) => t.dx < w && t.dy < h && t.dx + t.w > 0 && t.dy + t.h > 0);
    this.prints = this.prints.filter((f) => ms - f.ms < PRINT_MS);
    // Overlapping prints do not add up: each pixel takes the darkest print on it.
    const pressed = new Map<number, number>();
    for (const f of this.prints) {
      const at = footOf(g, f);
      const strength = PRINT_DEPTH * (1 - (ms - f.ms) / PRINT_MS);
      for (const [dx, dy] of f.shape) {
        const gx = at.x + dx, gy = at.y + dy;
        const x = gx - view.x, y = gy - view.y;
        if (x < 0 || y < 0 || x >= w || y >= h || gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) continue;
        // Nearer, higher ground drawn over the spot hides the print, as with shadows.
        if (Math.abs(Math.max(SEA_LEVEL, g.height[gy * g.w + gx]) - f.level) > 0.5) continue;
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
        const x = (p % g.w) - view.x;
        const y = Math.floor(p / g.w) - view.y;
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
    for (const t of paintOrder(placed)) {
      // Where no ground in a thing's box stands higher than it, no pixel of it needs asking whether ground hides it.
      const diag = Math.floor(t.spot.i) + Math.floor(t.spot.j), limit = Math.max(SEA_LEVEL, t.spot.level) + 0.4;
      const hides = !!t.bases || this.groundAbove(t.dx + view.x, t.dy + view.y, t.w, t.h, diag, limit);
      if (!spots && !t.bases) {
        stamp(image, t.picture, t.w, t.h, t.dx, t.dy, hides ? (x, y) => hiddenBehind(this.map, g, x + view.x, y + view.y, diag, limit) : undefined);
        continue;
      }
      stamp(image, t.picture, t.w, t.h, t.dx, t.dy, (x, y) => {
        const hidden = hides && hiddenByGround(this.map, g, x + view.x, y + view.y, t.spot.i, t.spot.j, Math.max(SEA_LEVEL, t.bases ? t.bases[(y - t.dy) * t.w + x - t.dx] : t.spot.level));
        if (!hidden && spots) {
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

  /** `spots` for a window, filled with where the ground seen at each pixel lies on the map. */
  private spotsOf(view: Rect, g: TerrainImage): { i: Float32Array; j: Float32Array } {
    const n = view.w * view.h;
    if (this.spots?.i.length !== n) this.spots = { i: new Float32Array(n), j: new Float32Array(n) };
    const { i: si, j: sj } = this.spots;
    for (let y = 0; y < view.h; y++) for (let x = 0; x < view.w; x++) {
      const gx = x + view.x, gy = y + view.y, p = y * view.w + x;
      const q = gy * g.w + gx;
      if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h || g.cell[q] < 0) { si[p] = sj[p] = NaN; continue; }
      // Back from the screen to the map: x tells i - j, y with the height there tells i + j.
      const a = (gx + 0.5 - g.origin.x) / (TILE_W / 2);
      const b = (gy + 0.5 - g.origin.y + g.height[q] * LEVEL_PX) / (TILE_H / 2);
      si[p] = (a + b) / 2;
      sj[p] = (b - a) / 2;
    }
    return this.spots;
  }

  private shore: { ground: TerrainImage; dist: Uint8Array } | null = null;

  /**
   * Per ground pixel, how many pixels a beach pixel lies from the water, up to `WASH_RUN`; 255
   * elsewhere. Only ground at the water line counts, so higher ground drawn next to water is left dry.
   */
  private shoreOf(g: TerrainImage): Uint8Array {
    if (this.shore?.ground === g) return this.shore.dist;
    const dist = new Uint8Array(g.w * g.h).fill(255);
    for (let p = 0; p < dist.length; p++) if (g.depth[p] > 0) dist[p] = 0;
    for (let k = 1; k <= WASH_RUN; k++) {
      for (let p = 0; p < dist.length; p++) {
        if (dist[p] !== 255 || !g.tops[p] || g.height[p] > SEA_LEVEL + 0.5) continue;
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
  private base: { ground: TerrainImage; grid: boolean; x: number; y: number; w: number; h: number; data: Uint8ClampedArray; spare: Uint8ClampedArray; lit: Uint8ClampedArray; bands: Float64Array } | null = null;
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
        const high = Math.max(SEA_LEVEL, g.height[p]);
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
  private shadows = new WeakMap<Picture, Map<string, Int32Array>>();
  private shadowsOf: TerrainImage | null = null;

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
    const hit = new Set<number>();
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
      if (!inside(this.map, Math.floor(i), Math.floor(j)) || SEA_LEVEL - heightAt(this.map, i, j) >= SHADOW_DEPTH) continue;
      const level = standingHeight(this.map, i, j);
      const at = footOf(g, { i, j, level });
      if (at.x < 0 || at.y < 0 || at.x >= g.w || at.y >= g.h) continue;
      const p = at.y * g.w + at.x;
      // Nearer, higher ground drawn over that point hides the shadow there.
      if (Math.abs(Math.max(SEA_LEVEL, g.height[p]) - level) > 0.5) continue;
      hit.add(p);
    }
    const pixels = Int32Array.from(hit);
    // A walker leaves one entry per spot it stood on: past a few dozen, the oldest goes.
    if (byPicture.size >= 48) byPicture.delete(byPicture.keys().next().value!);
    byPicture.set(key, pixels);
    return pixels;
  }

  private edge: { x: number; y: number; spot: Spot }[] = [];
  private edgeOf: TerrainImage | null = null;

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
          const spot = { i, j, level: standingHeight(this.map, i, j) };
          this.edge.push({ ...footOf(this.ground, spot), spot });
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
        blend(image, x - view.x, y - view.y, EDGE);
      }
    }
  }

  /** Whether a walker can stand at a point: land or the shallows, reached without a cliff, clear of big plants. */
  canWalk(from: { i: number; j: number }, to: { i: number; j: number }): boolean {
    const a: [number, number] = [Math.floor(from.i), Math.floor(from.j)];
    const b: [number, number] = [Math.floor(to.i), Math.floor(to.j)];
    if (!inside(this.floor, ...b) || levelAt(this.floor, ...b) < WADE) return false;
    // In a cave all but the carved floor is rock, whatever the smoothed sea floor beside it says.
    if (this.void && levelAt(this.map, ...b) < SEA_LEVEL) return false;
    // A step of more than a slope is a cliff, on land or under the water.
    if ((a[0] !== b[0] || a[1] !== b[1]) && Math.abs(levelAt(this.floor, ...a) - levelAt(this.floor, ...b)) > SLOPE_LEVELS) return false;
    for (const p of this.viewPlants()) {
      const r = BLOCK[plantById(p.plant)!.category] * p.size;
      if (!r) continue;
      const near = Math.hypot(p.vi - to.i, p.vj - to.j);
      // Moving away is always allowed, so nobody gets stuck inside a plant placed on them.
      if (near < r && near < Math.hypot(p.vi - from.i, p.vj - from.j)) return false;
    }
    // Objects block their footprint; stepping out of one is allowed.
    for (const p of this.viewProps()) {
      const kind = propKind(p.kind);
      const r = kind ? blockRadius(kind, p.size) : 0;
      if (!r) continue;
      const near = Math.hypot(p.vi - to.i, p.vj - to.j);
      if (near < r && near < Math.hypot(p.vi - from.i, p.vj - from.j)) return false;
    }
    for (const it of this.viewItems()) {
      if (itemCovers(it, this.rot, this.scene.objects, to.i, to.j) && !itemCovers(it, this.rot, this.scene.objects, from.i, from.j)) return false;
    }
    // Walls block crossing their edge; stepping off one placed on the walker is allowed.
    for (const b of this.buildings) {
      if (crosses(b, { x: from.i, y: from.j }, { x: to.i, y: to.j })) return false;
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
    for (const b of this.buildings) {
      for (const { edge: e } of b.edges.values()) line([e.i, e.j], e.axis === 'H' ? [e.i + 1, e.j] : [e.i, e.j + 1]);
    }
  }

  /** A dry tile near a point, for a spawn that ended up in the sea. */
  nearestLand(i: number, j: number): { i: number; j: number } {
    let best = { i, j };
    let bestD = Infinity;
    for (let cj = 0; cj < this.map.h; cj++) for (let ci = 0; ci < this.map.w; ci++) {
      if (levelAt(this.map, ci, cj) < SEA_LEVEL) continue;
      const d = Math.hypot(ci + 0.5 - i, cj + 0.5 - j);
      if (d < bestD) { bestD = d; best = { i: ci + 0.5, j: cj + 0.5 }; }
    }
    return best;
  }
}
