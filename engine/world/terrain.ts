// Ground for the island: a height map with one value per ground tile (one metre), drawn in the
// same 2:1 view and pixel style as the characters and plants. Heights are whole levels; level 0
// is the water line. Everything else follows from the heights by rule: what the surface is
// (sea, beach, sand, grass, rock), where the ground slopes and where it drops as a cliff, where
// one can walk, and how it is painted.

import { cellHash, pixelHash, rng } from '../../shared/random.ts';

/** A ground tile on screen: one metre across. */
export const TILE_W = 32;
export const TILE_H = 16;
/** Screen pixels per height level. One level is about a third of a metre. */
export const LEVEL_PX = 8;
/** The water line. Cells below it are sea; cells at it are beach. */
export const SEA_LEVEL = 0;
export const MIN_LEVEL = -4;
export const MAX_LEVEL = 12;

export interface HeightMap {
  readonly w: number;
  readonly h: number;
  /** Level per cell, row by row: `levels[j * w + i]`. Whole levels, but for the smoothed sea floor `seaFloor` gives. */
  readonly levels: Int8Array | Float32Array;
  /** Optional painted ground per cell: 0 follows the height rule, otherwise `PAINTS[n - 1]`. Under water it is ignored. */
  readonly paint?: Uint8Array;
}

export function createHeightMap(w: number, h: number, fill = MIN_LEVEL): HeightMap {
  return { w, h, levels: new Int8Array(w * h).fill(fill) };
}

const clampLevel = (n: number) => Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(n)));

export const inside = (map: HeightMap, i: number, j: number) => i >= 0 && j >= 0 && i < map.w && j < map.h;

/** The level of a cell. Outside the map is open sea. */
export function levelAt(map: HeightMap, i: number, j: number): number {
  return inside(map, i, j) ? map.levels[j * map.w + i] : MIN_LEVEL;
}

export function setLevel(map: HeightMap, i: number, j: number, level: number): void {
  if (inside(map, i, j)) map.levels[j * map.w + i] = clampLevel(level);
}

/** The height that shows: the ground, or the water surface over it. */
export const surfaceLevel = (map: HeightMap, i: number, j: number) => Math.max(SEA_LEVEL, levelAt(map, i, j));

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** The largest step to a neighbouring cell, in levels. Water counts at the water line. */
export function steepness(map: HeightMap, i: number, j: number): number {
  const here = surfaceLevel(map, i, j);
  return Math.max(...NEIGHBOURS.map(([di, dj]) => Math.abs(here - surfaceLevel(map, i + di, j + dj))));
}

export const SURFACES = ['deep', 'shallow', 'beach', 'sand', 'grass', 'rock', 'cave'] as const;
export type Surface = (typeof SURFACES)[number];
/** What can be painted on land. */
export const PAINTS = ['sand', 'grass', 'rock', 'cave'] as const;

const paintAt = (map: HeightMap, i: number, j: number) => (map.paint && inside(map, i, j) ? map.paint[j * map.w + i] : 0);

/** What a cell is, by rule from its height and its neighbours. */
export function surfaceAt(map: HeightMap, i: number, j: number): Surface {
  const level = levelAt(map, i, j);
  if (level < -1) return 'deep';
  if (level < SEA_LEVEL) return 'shallow';
  const painted = paintAt(map, i, j);
  if (painted) return PAINTS[painted - 1];
  if (level === SEA_LEVEL) return 'beach';
  if (level >= 6 || steepness(map, i, j) >= 3) return 'rock';
  if (level === 1) return 'sand';
  return 'grass';
}

export const isLand = (map: HeightMap, i: number, j: number) => levelAt(map, i, j) >= SEA_LEVEL;

/** The largest difference between neighbouring cells that is drawn as a slope rather than a cliff. */
export const SLOPE_LEVELS = 2;

// ------------------------------------------------------------------ generating

/** Smooth noise from a coarse grid of random values, -1 to 1. */
function valueNoise(random: () => number, w: number, h: number, step: number): (x: number, y: number) => number {
  const gw = Math.ceil(w / step) + 2;
  const gh = Math.ceil(h / step) + 2;
  const grid = Array.from({ length: gw * gh }, () => random() * 2 - 1);
  const ease = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / step;
    const gy = y / step;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = ease(gx - x0);
    const ty = ease(gy - y0);
    const at = (i: number, j: number) => grid[Math.min(gh - 1, j) * gw + Math.min(gw - 1, i)];
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

export interface IslandOptions {
  /** The highest level, roughly. */
  peak?: number;
  /** How much of the map is land, 0 to 1. */
  land?: number;
}

/** An island: high in the middle, falling to beaches all round, with hills and coves by noise. */
export function generateIsland(seed: number, w: number, h: number, options: IslandOptions = {}): HeightMap {
  const peak = options.peak ?? 6;
  const land = options.land ?? 0.55;
  const random = rng(seed * 2654435761 + 17);
  const broad = valueNoise(random, w, h, 5);
  const fine = valueNoise(random, w, h, 2.5);
  const map = createHeightMap(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const dx = (i + 0.5 - w / 2) / (w / 2);
      const dy = (j + 0.5 - h / 2) / (h / 2);
      const d = Math.hypot(dx, dy);
      const e = (1 - d / land) * 0.8 + broad(i, j) * 0.3 + fine(i, j) * 0.12;
      setLevel(map, i, j, e < 0 ? Math.floor(e * 6) : Math.floor(e * peak * 1.1));
    }
  }
  return map;
}

/** Where a point of the map appears, relative to the north corner of cell 0, 0 at the water line. */
export function toScreen(i: number, j: number, level = 0): { x: number; y: number } {
  return { x: ((i - j) * TILE_W) / 2, y: ((i + j) * TILE_H) / 2 - level * LEVEL_PX };
}

// ------------------------------------------------------------------ slopes

/**
 * The heights of a cell's four corners: north (i, j), east (i + 1, j), south (i + 1, j + 1) and
 * west (i, j + 1). A corner is the average of the four cells round it, kept within one level of
 * this cell. Neighbours share their corners, so a step of one or two levels becomes a slope, and a
 * larger step leaves the difference as a cliff. The sea floor slopes the same way, so a beach
 * runs into the water.
 */
export function cornersOf(map: HeightMap, i: number, j: number): [number, number, number, number] {
  const own = levelAt(map, i, j);
  const corner = (vi: number, vj: number) => {
    const mean = (levelAt(map, vi - 1, vj - 1) + levelAt(map, vi, vj - 1) + levelAt(map, vi - 1, vj) + levelAt(map, vi, vj)) / 4;
    return Math.max(own - 1, Math.min(own + 1, mean));
  };
  return [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
}

/** Which diagonal a cell folds along: the one whose ends are closest in height. */
const foldsNorthSouth = (c: [number, number, number, number]) => Math.abs(c[0] - c[2]) <= Math.abs(c[1] - c[3]);

/** The ground's height in levels at any point of the map, on the slopes between corners. */
export function heightAt(map: HeightMap, i: number, j: number): number {
  const ci = Math.floor(i);
  const cj = Math.floor(j);
  const [n, e, s, w] = cornersOf(map, ci, cj);
  const u = i - ci;
  const v = j - cj;
  if (foldsNorthSouth([n, e, s, w])) return u >= v ? n + u * (e - n) + v * (s - e) : n + v * (w - n) + u * (s - w);
  return u + v <= 1 ? n + u * (e - n) + v * (w - n) : s + (1 - u) * (w - s) + (1 - v) * (e - s);
}

/** Where things stand: on the ground, or on the water where the ground is under it. */
export const standingHeight = (map: HeightMap, i: number, j: number) => Math.max(SEA_LEVEL, heightAt(map, i, j));

// ------------------------------------------------------------------ drawing

export interface TerrainImage {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  /** Per pixel, the cell that painted it (`j * w + i`), or -1. Used to hide things behind higher ground. */
  cell: Int32Array;
  /** Per pixel, the height of the ground painted there, in levels. */
  height: Float32Array;
  /** Where map point 0, 0 at the water line is on the image. */
  origin: { x: number; y: number };
  /** Per pixel, 1 where higher ground keeps the light off it. */
  shade: Uint8Array;
  /**
   * Per pixel where water shows, how many levels deep it is at the point of the water surface
   * seen there; 0 elsewhere. The floor seen through the water lies lower on screen than the
   * surface over it, so waves are placed by this, not by `height`.
   */
  depth: Float32Array;
  /** Per pixel, 1 + the index in `GROUNDS` of the top ground painted there; 0 on side faces and off the map. */
  tops: Uint8Array;
}

const COLORS = {
  wet: '#e4cb93',
  sand: '#f6e4b4',
  grass: '#8fcf78',
  rock: '#aeaba3',
  /** A cave's floor: dark stone, painted for the dark it lies in. */
  cave: '#3f4359',
} as const;
/** Side faces: the left one in light, the right one in shade, as everything else is lit. */
const SIDES = {
  wet: ['#bfa66f', '#a99160'],
  sand: ['#c9b077', '#b39a63'],
  grass: ['#b98f63', '#9c7650'],
  rock: ['#8f8b83', '#78746d'],
  cave: ['#2c2f42', '#222433'],
} as const;
const GRASS_LIP = '#6c9f55';
/** Water by depth in levels: pale turquoise at the beach to deep blue offshore. */
// Turquoise only where the sand floor shows through; deep water is blue.
// The last band to the open sea is the long one, so the shelf darkens slowly into the deep.
const WATER: [number, string][] = [[0, '#8ff2de'], [0.7, '#3fe0d4'], [1.4, '#1fbad8'], [3.2, '#2394da'], [4, '#2470cc']];
/** Replaces the five water colours, shore to deep; the next `renderTerrain` uses them. */
export function setWater(colors: string[]): void {
  colors.forEach((c, k) => (WATER[k][1] = c));
  waterSteps = [];
}
/** The blends `waterAt` has worked out, by colour pair and step. */
let waterSteps: string[] = [];
/**
 * How much of something under water still shows, `depth` levels down: all of it at the water
 * line, less the deeper it is, none once the water has its open-sea colour (the last band only
 * darkens it a little). The rest is the water colour.
 */
export const underwater = (depth: number) => Math.max(0, 1 - depth / WATER[WATER.length - 2][0]);
/** Steps between two water colours: fine enough that a long band shows no stripes, few enough to keep. */
const WATER_STEPS = 128;
/** The water colour at a depth, blended between the colours above in steps of `WATER_STEPS`. */
export function waterAt(depth: number): string {
  for (let k = 1; k < WATER.length; k++) {
    const [d1, hi] = WATER[k];
    if (depth >= d1) continue;
    const [d0, lo] = WATER[k - 1];
    const step = Math.round(((depth - d0) / (d1 - d0)) * WATER_STEPS);
    return (waterSteps[k * (WATER_STEPS + 1) + step] ??= mixHex(lo, hi, step / WATER_STEPS));
  }
  return WATER[WATER.length - 1][1];
}
const LIT = '#fff6d8';
const DIM = '#5a4060';

type Ground = keyof typeof SIDES;
export const GROUNDS = Object.keys(SIDES) as Ground[];

/** Smooth noise from -1 to 1 over the map, a third of a tile across: borders between grounds wander by it. */
function wobble(x: number, y: number, seed: number): number {
  const gx = x * 3, gy = y * 3;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const tx = (gx - x0) * (gx - x0) * (3 - 2 * (gx - x0));
  const ty = (gy - y0) * (gy - y0) * (3 - 2 * (gy - y0));
  const g = (a: number, b: number) => cellHash(a, b, seed);
  const top = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
  const bottom = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
  return (top + (bottom - top) * ty) * 2 - 1;
}
/** A 4 × 4 ordered dither, thresholds 0 to 1. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** How far, in tiles, a neighbour's ground reaches into a cell where the two meet on a slope. */
const BLEND = 0.35;

/**
 * Ground clutter, drawn into the ground itself (so it is never a thing one can pick): rows top to
 * bottom, the last row on the ground. l, m, d: light, mid, dark; s: shadow on the ground.
 */
const CLUTTER: Record<Ground, { chance: number; tries: number; stamps: string[][] }> = {
  wet: { chance: 0.45, tries: 3, stamps: [['md'], ['lm', 'mds']] },
  sand: { chance: 0.22, tries: 2, stamps: [['lm', 'mds'], ['md'], ['l', 'ds']] },
  grass: { chance: 0.45, tries: 3, stamps: [['  l', 'l d', 'dmd'], ['l  l', 'd ld', ' dd '], ['l', 'd'], [' l ', 'dmd']] },
  rock: { chance: 0.35, tries: 2, stamps: [['lm', 'mds'], ['lmm', 'mdds'], ['d']] },
  cave: { chance: 0.4, tries: 2, stamps: [['lm', 'mds'], ['lmm', 'mdds'], ['l'], ['d']] },
};
/** How deep under water, in levels, pebbles still show on the sea floor, fading with depth. */
const PEBBLE_DEPTH = 1.4;
/** Under water a pebble pixel tints the water over it, by role: the colour and how much. */
const UNDERWATER: Record<string, [string, number]> = { l: ['#ffffff', 0.5], m: ['#16505e', 0.3], d: ['#16505e', 0.55], s: ['#16505e', 0.2] };
const PEBBLE = { l: '#d2cabb', m: '#a39886', d: '#7d7364' } as const;
/** The colours of a clutter pixel, from the ground colour under it. */
function clutterColor(kind: Ground, role: string, ground: string): string {
  if (role === 's') return mixHex(ground, SHADE, 0.3);
  if (kind === 'grass') return role === 'l' ? mixHex(ground, '#d8f5a8', 0.35) : mixHex(ground, GRASS_LIP, role === 'd' ? 0.85 : 0.5);
  if (kind === 'rock' || kind === 'cave') return role === 'l' ? mixHex(ground, LIT, 0.4) : mixHex(ground, '#000000', role === 'd' ? 0.3 : 0.14);
  return mixHex(PEBBLE[role as keyof typeof PEBBLE], ground, 0.25);
}
/** What the ground is at a height, inside a cell of some surface: low ground is sand whatever the cell. */
function groundAt(surface: Surface, h: number, painted = false): Ground {
  // A cave's floor is stone to its edge, never wet sand.
  if (surface === 'cave') return 'cave';
  if (h < 0.15) return 'wet';
  if (surface === 'rock') return 'rock';
  if (painted) return surface === 'grass' ? 'grass' : 'sand';
  if (h < 1.3 || surface !== 'grass') return 'sand';
  return 'grass';
}

/**
 * Light from the upper left of the screen, as on characters and plants, in map space: i runs
 * down to the right, j down to the left, z up (one level is about a third of a metre, a tile one).
 */
const LIGHT = (() => {
  const v = [-0.141, 0.636, 0.75];
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
})();
/** Metres per height level. */
export const LEVEL_M = 0.354;
/** Shadows: things and ground shade what lies this way of them, in tiles per metre of height. */
export const SHADOW_RUN = [-LIGHT[0] / LIGHT[2], -LIGHT[1] / LIGHT[2]] as const;
/** The tint of a shadow, the same as the ground shadows plants and characters cast. */
export const SHADE = '#2a1c3a';
export const SHADE_ALPHA = 0x38 / 255;
/** Samples per tile for ground shadows; pixels in between interpolate, so edges stay straight. */
const SHADE_STEPS = 4;

/**
 * The ground's height at any point of the map, as `heightAt` gives it, with every cell's corners
 * worked out once: for the many lookups of shadows and of the water surface. Outside the map it is
 * the lowest level.
 */
function groundOf(map: HeightMap): (i: number, j: number) => number {
  const corners = new Float32Array(map.w * map.h * 4);
  for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) corners.set(cornersOf(map, i, j), (j * map.w + i) * 4);
  return (i, j) => {
    const ci = Math.floor(i);
    const cj = Math.floor(j);
    if (!inside(map, ci, cj)) return MIN_LEVEL;
    const k = (cj * map.w + ci) * 4;
    const n = corners[k], e = corners[k + 1], s = corners[k + 2], w = corners[k + 3];
    const u = i - ci;
    const v = j - cj;
    if (Math.abs(n - s) <= Math.abs(e - w)) return u >= v ? n + u * (e - n) + v * (s - e) : n + v * (w - n) + u * (s - w);
    return u + v <= 1 ? n + u * (e - n) + v * (w - n) : s + (1 - u) * (w - s) + (1 - v) * (e - s);
  };
}

/**
 * For points spread over the map, the level below which a point lies in shadow: the highest the
 * ground rises over the ray towards the light, less the light's rise along it.
 */
function horizons(map: HeightMap): { at(i: number, j: number): number } {
  let top = SEA_LEVEL;
  for (const l of map.levels) top = Math.max(top, l);
  const ground = groundOf(map);
  const toward = [-SHADOW_RUN[0], -SHADOW_RUN[1]];
  const per = Math.hypot(toward[0], toward[1]);
  const step = 0.2; // tiles
  const rise = step / per / LEVEL_M; // levels the light climbs per step
  const gw = map.w * SHADE_STEPS + 1;
  const gh = map.h * SHADE_STEPS + 1;
  const grid = new Float32Array(gw * gh).fill(MIN_LEVEL);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let i = x / SHADE_STEPS;
    let j = y / SHADE_STEPS;
    let best = MIN_LEVEL;
    for (let k = 1; best < top - k * rise; k++) {
      i += (toward[0] / per) * step;
      j += (toward[1] / per) * step;
      best = Math.max(best, ground(i, j) - k * rise);
    }
    grid[y * gw + x] = best;
  }
  return {
    at(i, j) {
      const x = Math.max(0, Math.min(gw - 1.001, i * SHADE_STEPS));
      const y = Math.max(0, Math.min(gh - 1.001, j * SHADE_STEPS));
      const x0 = Math.floor(x), y0 = Math.floor(y), u = x - x0, v = y - y0;
      const g = (a: number, b: number) => grid[b * gw + a];
      return (g(x0, y0) * (1 - u) + g(x0 + 1, y0) * u) * (1 - v) + (g(x0, y0 + 1) * (1 - u) + g(x0 + 1, y0 + 1) * u) * v;
    },
  };
}

// Colours are worked out per pixel from a handful of strings, so both helpers remember their answers.
const rgbCache = new Map<string, number[]>();
const rgbOf = (hex: string) => {
  let rgb = rgbCache.get(hex);
  if (!rgb) rgbCache.set(hex, (rgb = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))));
  return rgb;
};

/**
 * The sea floor as drawn: it drops at most a level per tile away from the shore, and is then
 * smoothed into fractions of a level, so the water deepens on an even slope from every coast
 * instead of in flat terraces of whole levels. Only the picture and what swims or wades go by
 * it; the map keeps its levels.
 */
export function seaFloor(map: HeightMap): HeightMap {
  const levels = Float32Array.from(map.levels);
  for (let pass = SEA_LEVEL; pass > MIN_LEVEL; pass--) {
    const before = Float32Array.from(levels);
    for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) {
      const k = j * map.w + i;
      if (before[k] >= SEA_LEVEL) continue;
      let floor = before[k];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (inside(map, i + di, j + dj)) floor = Math.max(floor, Math.min(SEA_LEVEL, before[k + dj * map.w + di]) - 1);
      }
      levels[k] = floor;
    }
  }
  // Twice the mean of each sea cell's 3 by 3, land counting as the water line and off the map as the cell itself.
  const smooth = Float32Array.from(levels);
  for (let pass = 0; pass < 2; pass++) {
    const before = Float32Array.from(smooth);
    for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) {
      const k = j * map.w + i;
      if (levels[k] >= SEA_LEVEL) continue;
      let sum = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        sum += inside(map, i + di, j + dj) ? Math.min(SEA_LEVEL, before[k + dj * map.w + di]) : before[k];
      }
      // Still sea, however near the shore.
      smooth[k] = Math.min(SEA_LEVEL - 0.25, sum / 9);
    }
  }
  return { ...map, levels: smooth };
}

/** Paints the whole map, back to front, over open sea, then lays the water over what lies below it. */
export function renderTerrain(shape: HeightMap, size?: { w: number; h: number; origin: { x: number; y: number } }): TerrainImage {
  const map = seaFloor(shape);
  const w = size?.w ?? (map.w + map.h) * (TILE_W / 2) + 16;
  const h = size?.h ?? (map.w + map.h) * (TILE_H / 2) + MAX_LEVEL * LEVEL_PX + 16;
  const origin = size?.origin ?? { x: map.h * (TILE_W / 2) + 8, y: MAX_LEVEL * LEVEL_PX + 8 };
  const rgba = new Uint8ClampedArray(w * h * 4);
  const cell = new Int32Array(w * h).fill(-1);
  const height = new Float32Array(w * h).fill(MIN_LEVEL);
  const colors: string[] = new Array(w * h).fill(WATER[WATER.length - 1][1]);
  /** Per pixel, 1 + the index in GROUNDS of the top ground painted there; 0 for side faces and sea. */
  const tops = new Uint8Array(w * h);
  const put = (x: number, y: number, hex: string, index: number, level: number, top: Ground | null = null) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    colors[p] = hex;
    tops[p] = top ? GROUNDS.indexOf(top) + 1 : 0;
    cell[p] = index;
    height[p] = level;
  };
  const hash = pixelHash;
  const screen = (i: number, j: number, level: number) => {
    const p = toScreen(i, j, level);
    return { x: origin.x + p.x, y: origin.y + p.y };
  };

  const order: [number, number][] = [];
  for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) order.push([i, j]);
  order.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);

  const surfaces = order.map(() => 'deep' as Surface);
  for (const [i, j] of order) surfaces[j * map.w + i] = surfaceAt(map, i, j);
  /** The cell whose ground shows at a map point of cell i, j: near a border on a slope, the neighbour's, along a wavy line. */
  const groundCell = (i: number, j: number, mi: number, mj: number) => {
    const u = mi - i, v = mj - j;
    if (u > BLEND && u < 1 - BLEND && v > BLEND && v < 1 - BLEND) return j * map.w + i;
    const ni = Math.floor(mi + BLEND * wobble(mi, mj, 1));
    const nj = Math.floor(mj + BLEND * wobble(mi, mj, 2));
    if ((ni === i && nj === j) || !inside(map, ni, nj) || !isLand(map, ni, nj) || !isLand(map, i, j)) return j * map.w + i;
    return Math.abs(levelAt(map, ni, nj) - levelAt(map, i, j)) <= SLOPE_LEVELS ? nj * map.w + ni : j * map.w + i;
  };

  // The slope's light on each triangle: brighter facing the light, darker facing away, flat ground 0.
  const corners = order.map(() => [0, 0, 0, 0] as [number, number, number, number]);
  const triLight: [number[], number][][] = [];
  for (const [i, j] of order) {
    const index = j * map.w + i;
    const c = (corners[index] = cornersOf(map, i, j));
    const tris = foldsNorthSouth(c) ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 3], [1, 2, 3]];
    triLight[index] = tris.map((tri) => {
      const p = tri.map((k) => [k & 2 ? (k === 3 ? 0 : 1) : k, k >> 1, c[k]]);
      const a = [p[1][0] - p[0][0], p[1][1] - p[0][1], (p[1][2] - p[0][2]) * LEVEL_M];
      const b = [p[2][0] - p[0][0], p[2][1] - p[0][1], (p[2][2] - p[0][2]) * LEVEL_M];
      let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      if (n[2] < 0) n = n.map((x) => -x);
      const nl = Math.hypot(n[0], n[1], n[2]) || 1;
      return [tri, (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / nl - LIGHT[2]];
    });
  }
  /**
   * The light at a corner of a cell: the mean over the triangles that meet there at the same
   * height, in this cell and its neighbours, so it shades smoothly over slopes and stays sharp at cliffs.
   */
  const cornerLight = (i: number, j: number, k: number) => {
    const pi = i + (k === 1 || k === 2 ? 1 : 0), pj = j + (k >> 1);
    const level = corners[j * map.w + i][k];
    let sum = 0, count = 0;
    for (const [ci, cj, ck] of [[pi, pj, 0], [pi - 1, pj, 1], [pi - 1, pj - 1, 2], [pi, pj - 1, 3]]) {
      if (!inside(map, ci, cj) || Math.abs(corners[cj * map.w + ci][ck] - level) > 0.01) continue;
      for (const [tri, lit] of triLight[cj * map.w + ci]) if (tri.includes(ck)) { sum += lit; count++; }
    }
    return sum / count;
  };

  for (const [i, j] of order) {
    const index = j * map.w + i;
    const surface = surfaces[index];
    const painted = paintAt(map, i, j) > 0;
    const c = corners[index];
    const at: [number, number, number][] = [[i, j, c[0]], [i + 1, j, c[1]], [i + 1, j + 1, c[2]], [i, j + 1, c[3]]];
    const light = [0, 1, 2, 3].map((k) => cornerLight(i, j, k));
    for (const [tri] of triLight[index]) {
      const p = tri.map((k) => at[k]);
      const l = tri.map((k) => light[k]);
      const s = p.map(([pi, pj, pl]) => screen(pi, pj, pl));
      const area = (s[1].x - s[0].x) * (s[2].y - s[0].y) - (s[2].x - s[0].x) * (s[1].y - s[0].y);
      if (Math.abs(area) < 1e-6) continue;
      const x0 = Math.floor(Math.min(s[0].x, s[1].x, s[2].x));
      const x1 = Math.ceil(Math.max(s[0].x, s[1].x, s[2].x));
      const y0 = Math.floor(Math.min(s[0].y, s[1].y, s[2].y));
      const y1 = Math.ceil(Math.max(s[0].y, s[1].y, s[2].y));
      // The colour of each kind of ground at each step of light, plain and with a grain.
      const tones: Partial<Record<string, [string, string]>> = {};
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((s[1].x - px) * (s[2].y - py) - (s[2].x - px) * (s[1].y - py)) / area;
        const w1 = ((s[2].x - px) * (s[0].y - py) - (s[0].x - px) * (s[2].y - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const level = w0 * p[0][2] + w1 * p[1][2] + w2 * p[2][2];
        const from = groundCell(i, j, w0 * p[0][0] + w1 * p[1][0] + w2 * p[2][0], w0 * p[0][1] + w1 * p[1][1] + w2 * p[2][1]);
        let kind = groundAt(surfaces[from], level, paintAt(map, from % map.w, Math.floor(from / map.w)) > 0);
        // Rock is the bottom layer: other ground spreads over it, it never spreads over them.
        if (kind === 'rock' && from !== index) kind = groundAt(surface, level, painted);
        const sandy = kind === 'sand' || kind === 'wet';
        // The light between the corners, in steps of a fiftieth, dithered so the steps do not band.
        const lit = w0 * l[0] + w1 * l[1] + w2 * l[2];
        const step = Math.floor(Math.min(0.22, Math.abs(lit) * 0.9) * 50 + BAYER[(y & 3) * 4 + (x & 3)]) * Math.sign(lit);
        // A cave's floor has no grid to read: it varies in soft patches by where it lies instead.
        const patch = kind === 'cave' ? Math.round(2 * wobble((w0 * p[0][0] + w1 * p[1][0] + w2 * p[2][0]) / 6, (w0 * p[0][1] + w1 * p[1][1] + w2 * p[2][1]) / 6, 7)) : 0;
        let tone = tones[kind + step + '|' + patch];
        if (!tone) {
          let color: string = COLORS[kind];
          if (step) color = mixHex(color, step > 0 ? LIT : DIM, Math.abs(step) / 50);
          // Tiles alternate faintly so the one-metre grid reads; a cave's floor varies by patch instead.
          if (kind === 'cave') color = mixHex(color, patch > 0 ? LIT : DIM, Math.abs(patch) * 0.07);
          else if ((i + j) % 2 === 0) color = mixHex(color, '#ffffff', 0.05);
          // Grains: darker green on grass, the side colour elsewhere; sand gets fewer, fainter ones.
          const grain = kind === 'grass' ? GRASS_LIP : SIDES[kind][1];
          tone = tones[kind + step + '|' + patch] = [color, mixHex(color, grain, sandy ? 0.3 : 0.5)];
        }
        const color = hash(x, y) < (sandy ? 0.01 : 0.035) ? tone[1] : tone[0];
        put(x, y, color, index, level, kind);
      }
    }
    // Side faces where this cell stands above the one in front: under the east edge (to i + 1)
    // and under the south-west edge (to j + 1). Mostly cliffs; on slopes they are a pixel or none.
    const right = cornersOf(map, i + 1, j);
    const left = cornersOf(map, i, j + 1);
    const faces = [
      { from: at[1], to: at[2], below: [right[0], right[3]], side: 1 },
      { from: at[3], to: at[2], below: [left[0], left[1]], side: 0 },
    ];
    for (const face of faces) {
      const a = screen(face.from[0], face.from[1], 0);
      const b = screen(face.to[0], face.to[1], 0);
      for (let x = Math.floor(Math.min(a.x, b.x)); x < Math.ceil(Math.max(a.x, b.x)); x++) {
        const t = (x + 0.5 - a.x) / (b.x - a.x);
        const top = face.from[2] + (face.to[2] - face.from[2]) * t;
        const bottom = face.below[0] + (face.below[1] - face.below[0]) * t;
        if ((top - bottom) * LEVEL_PX < 1) continue; // a seam, not a face
        const ground = a.y + (b.y - a.y) * t;
        const yTop = ground - top * LEVEL_PX;
        const yBottom = ground - bottom * LEVEL_PX;
        for (let y = Math.ceil(yTop - 0.5); y < yBottom; y++) {
          const level = (ground - (y + 0.5)) / LEVEL_PX;
          const kind = groundAt(surface, level, painted);
          let color: string = SIDES[kind][face.side];
          if (surface === 'grass' && kind === 'grass' && y - yTop < 2) color = GRASS_LIP;
          else if (hash(x, y) < 0.06) color = mixHex(color, '#000000', 0.08);
          put(x, y, color, index, level);
        }
      }
    }
  }

  // Neighbouring cells only share a corner within a level of each, so where two meet a hair
  // apart and no side face is drawn between them, a one-pixel seam can stay unpainted and the
  // open sea shows through. Such a pixel takes the ground above it.
  for (let y = 1; y < h - 1; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (cell[p] >= 0 || cell[p - w] < 0 || cell[p + w] < 0) continue;
    colors[p] = colors[p - w];
    tops[p] = tops[p - w];
    cell[p] = cell[p - w];
    height[p] = height[p - w];
  }

  // Clutter: pebbles, grass tufts and stones at fixed random spots of each cell, by the ground
  // under the spot. Only over ground of this cell or of cells behind it, so nearer ground still covers it.
  const ground = groundOf(map);
  /** Per pixel, the role of a pebble lying under water there, tinted in when the water is laid. */
  const underwater: string[] = [];
  for (const [i, j] of order) {
    const index = j * map.w + i;
    for (let k = 0; k < 3; k++) {
      const mi = i + 0.1 + cellHash(i, j, 10 + k) * 0.8;
      const mj = j + 0.1 + cellHash(i, j, 20 + k) * 0.8;
      const at = screen(mi, mj, ground(mi, mj));
      const ax = Math.round(at.x), ay = Math.round(at.y);
      if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
      const a = ay * w + ax;
      if (cell[a] !== index || !tops[a] || height[a] < SEA_LEVEL - PEBBLE_DEPTH) continue;
      const kind = GROUNDS[tops[a] - 1];
      const { chance, tries, stamps } = CLUTTER[kind];
      if (k >= tries || cellHash(i, j, 30 + k) >= chance) continue;
      const stamp = stamps[Math.floor(cellHash(i, j, 40 + k) * stamps.length)];
      const base = colors[a];
      stamp.forEach((row, r) => [...row].forEach((role, dx) => {
        const x = ax + dx, y = ay - (stamp.length - 1 - r);
        if (role === ' ' || x < 0 || y < 0 || x >= w || y >= h) return;
        const p = y * w + x;
        const c = cell[p];
        if (c < 0 || (c % map.w) + Math.floor(c / map.w) > i + j || height[p] < SEA_LEVEL - PEBBLE_DEPTH) return;
        if (role === 's' && !tops[p]) return;
        if (height[p] < SEA_LEVEL) underwater[p] = role;
        else colors[p] = clutterColor(kind, role, role === 's' ? colors[p] : base);
      }));
    }
  }

  // Water over everything below the water line, by depth: sand showing through
  // the shallows, then turquoise to deep blue. The bands follow the slopes, so the shore is a curve.
  // Then shadows from higher ground, on land only: the water stays bright.
  const horizon = horizons(map);
  const shade = new Uint8Array(w * h);
  const floor = ground;
  const surfaceDepth = new Float32Array(w * h);
  // Few colours fill many pixels: each one's shaded version is mixed once, and a run of one colour is parsed once.
  const shaded = new Map<string, string>();
  let lastColor = '';
  let lastRgb: number[] = [0, 0, 0];
  // The floor is flat per tile triangle, so its depth bends at every tile edge and the colour would
  // show the tiles as bands; the water's colour goes by the depth smoothed over a few tiles instead.
  const soft = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) soft[p] = Math.max(0, SEA_LEVEL - height[p]);
  smooth(soft, w, h, WATER_BLUR);
  for (let p = 0; p < w * h; p++) {
    const depth = SEA_LEVEL - height[p];
    let color = colors[p];
    if (depth > 0) {
      const sx = (p % w) + 0.5 - origin.x;
      const sy = Math.floor(p / w) + 0.5 - origin.y;
      // Open sea off the map is as deep as it gets; elsewhere the floor is looked up under the surface.
      surfaceDepth[p] = cell[p] < 0 ? depth : Math.max(0.01, SEA_LEVEL - floor((sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2, (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2));
      const water = waterAt(soft[p]);
      // The sand floor shows through the first half level; steps of a tenth keep the colour cache small.
      color = depth < 0.5 ? mixHex(color, water, Math.round((0.5 + depth) * 10) / 10) : water;
      const pebble = underwater[p] && UNDERWATER[underwater[p]];
      if (pebble) color = mixHex(color, pebble[0], Math.round(pebble[1] * Math.max(0, 1 - (depth / PEBBLE_DEPTH) ** 2) * 20) / 20);
    }
    if (cell[p] >= 0 && depth <= 0) {
      const level = height[p];
      const sx = (p % w) + 0.5 - origin.x;
      const sy = Math.floor(p / w) + 0.5 - origin.y + level * LEVEL_PX;
      const i = (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2;
      const j = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
      if (horizon.at(i, j) > level + 0.15) {
        shade[p] = 1;
        let dark = shaded.get(color);
        if (!dark) shaded.set(color, (dark = mixHex(color, SHADE, SHADE_ALPHA)));
        color = dark;
      }
    }
    if (color !== lastColor) lastRgb = rgbOf((lastColor = color));
    rgba[p * 4] = lastRgb[0]; rgba[p * 4 + 1] = lastRgb[1]; rgba[p * 4 + 2] = lastRgb[2]; rgba[p * 4 + 3] = 255;
  }
  return { w, h, rgba, cell, height, origin, shade, depth: surfaceDepth, tops };
}

/** Pixels the water's depth is smoothed over, each way, for its colour. */
const WATER_BLUR = 10;
/** Blurs `a`, `w` by `h`, in place: two box passes each way of radius `r`, near enough a gaussian. */
function smooth(a: Float32Array, w: number, h: number, r: number): void {
  const line = new Float32Array(Math.max(w, h));
  const pass = (n: number, stride: number, start: number) => {
    for (let k = 0; k < n; k++) line[k] = a[start + k * stride];
    let sum = 0;
    // The ends are held, so the open sea at the image's edge stays as deep as it is.
    for (let k = -r; k <= r; k++) sum += line[Math.max(0, Math.min(n - 1, k))];
    for (let k = 0; k < n; k++) {
      a[start + k * stride] = sum / (2 * r + 1);
      sum += line[Math.min(n - 1, k + r + 1)] - line[Math.max(0, k - r)];
    }
  };
  for (let twice = 0; twice < 2; twice++) {
    for (let y = 0; y < h; y++) pass(w, 1, y * w);
    for (let x = 0; x < w; x++) pass(h, w, x);
  }
}

const mixCache = new Map<string, string>();
function mixHex(a: string, b: string, t: number): string {
  const key = `${a}${b}${t}`;
  let mixed = mixCache.get(key);
  if (mixed) return mixed;
  const x = rgbOf(a);
  const y = rgbOf(b);
  mixed = '#' + x.map((v, k) => Math.round(v + (y[k] - v) * t).toString(16).padStart(2, '0')).join('');
  // shortcut: the light term is continuous, so the cache is capped rather than exact; raise if redraws slow down again.
  if (mixCache.size > 20000) mixCache.clear();
  mixCache.set(key, mixed);
  return mixed;
}

/**
 * Whether ground in front hides a pixel of something standing at map point `i`, `j` at height
 * `base`. Things are drawn after the ground, so a cliff or a hill nearer the viewer has to cover them.
 */
export function hiddenByGround(map: HeightMap, image: TerrainImage, x: number, y: number, i: number, j: number, base: number): boolean {
  if (x < 0 || y < 0 || x >= image.w || y >= image.h) return false;
  const p = y * image.w + x;
  const c = image.cell[p];
  if (c < 0) return false;
  const ci = c % map.w;
  const cj = Math.floor(c / map.w);
  if (ci + cj <= Math.floor(i) + Math.floor(j)) return false;
  return Math.max(SEA_LEVEL, image.height[p]) > base + 0.4;
}
