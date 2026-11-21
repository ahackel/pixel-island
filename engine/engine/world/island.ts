// Putting things on the island and painting them: which ground each group grows on, scattering
// them without crowding, and drawing a scene in one pass with shared shadows and higher ground
// in front hiding what stands behind it. Used by the flora page and the start page.
import type { Category } from '../flora/flora.ts';
import { SHADOW } from '../core/palette.ts';
import { GLOW_ALPHA, GLOWING } from './daylight.ts';
import { rng } from '../../shared/random.ts';
import { hiddenByGround, standingHeight, surfaceAt, toScreen, type HeightMap, type Surface, type TerrainImage } from './terrain.ts';

/** Where each group grows. Rocks may stand in the shallows; driftwood only lies on the beach. */
export const HOMES: Record<Category, Surface[]> = {
  palm: ['beach', 'sand', 'grass'],
  grass: ['sand', 'grass'],
  cactus: ['sand', 'rock'],
  jungle: ['grass'],
  rock: ['shallow', 'beach', 'sand', 'grass', 'rock', 'cave'],
  driftwood: ['beach'],
};
/** Room each needs round it, in metres. */
export const ROOM: Record<Category, number> = { palm: 1.3, cactus: 0.8, jungle: 1.1, grass: 0.5, rock: 0.9, driftwood: 1.1 };
const TALL: Category[] = ['palm', 'jungle', 'cactus'];

/** Standing somewhere on the map: `i`, `j` in metres, `level` the height of the ground there. */
export interface Spot { i: number; j: number; level: number }
export interface Scattered<T> extends Spot { item: T; seed: number; scale: number }

function cellsBySurface(map: HeightMap): Map<Surface, [number, number][]> {
  const cells = new Map<Surface, [number, number][]>();
  for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) {
    const s = surfaceAt(map, i, j);
    cells.set(s, [...(cells.get(s) ?? []), [i, j]]);
  }
  return cells;
}

/** The middle of the dry land: where a person stands. */
export function middleOf(map: HeightMap): Spot {
  const cells = cellsBySurface(map);
  const dry = [...(cells.get('sand') ?? []), ...(cells.get('grass') ?? [])];
  const d = (c: [number, number]) => Math.hypot(c[0] + 0.5 - map.w / 2, c[1] + 0.5 - map.h / 2);
  const [i, j] = dry.sort((a, b) => d(a) - d(b))[0] ?? [map.w / 2, map.h / 2];
  return { i: i + 0.5, j: j + 0.5, level: standingHeight(map, i + 0.5, j + 0.5) };
}

/**
 * Scatters up to `count` things over the ground they belong on, clear of each other, and of
 * `clear` (where a person stands; nothing tall is put right in front of them).
 */
export function scatter<T extends { category: Category }>(map: HeightMap, pool: T[], count: number, seed: number, clear?: Spot): Scattered<T>[] {
  const cells = cellsBySurface(map);
  const random = rng(seed * 7919 + pool.length);
  const out: Scattered<T>[] = [];
  for (let tries = 0; out.length < count && tries < 800 && pool.length; tries++) {
    const item = pool[Math.floor(random() * pool.length)];
    const homes = HOMES[item.category].flatMap((s) => cells.get(s) ?? []);
    if (!homes.length) continue;
    const [ci, cj] = homes[Math.floor(random() * homes.length)];
    const i = ci + 0.2 + random() * 0.6;
    const j = cj + 0.2 + random() * 0.6;
    const r = ROOM[item.category];
    if (clear) {
      const near = Math.hypot(i - clear.i, j - clear.j);
      if (near < 0.9 + r * 0.5) continue;
      if (TALL.includes(item.category) && i + j > clear.i + clear.j && near < 3) continue;
    }
    if (out.some((p) => Math.hypot(p.i - i, p.j - j) < (ROOM[p.item.category] + r) * 0.6)) continue;
    out.push({ item, seed: Math.floor(random() * 8), scale: 0.8 + random() * 0.4, i, j, level: standingHeight(map, i, j) });
  }
  return out;
}

// ------------------------------------------------------------------ painting

export interface Pixels { data: Uint8ClampedArray; width: number; height: number }
/** Anything with pixels: a plant picture keeps its ground shadow apart, a character sprite in the shadow colour. */
export type Picture = { get(x: number, y: number): string | null; shaded?(x: number, y: number): boolean };

const rgbaOf = (hex: string): [number, number, number, number] => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
  hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255,
];

/** Lays a colour over a pixel, blending see-through colours. */
export function blend(image: Pixels, x: number, y: number, hex: string): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const [r, g, b, a] = rgbaOf(hex);
  const o = (y * image.width + x) * 4;
  const d = image.data;
  if (a === 255 || d[o + 3] === 0) {
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = Math.max(a, d[o + 3]);
    return;
  }
  const k = a / 255;
  d[o] = Math.round(r * k + d[o] * (1 - k));
  d[o + 1] = Math.round(g * k + d[o + 1] * (1 - k));
  d[o + 2] = Math.round(b * k + d[o + 2] * (1 - k));
}

/**
 * A picture's painted pixels, shadow aside, with their colours parsed: stamping walks these, not
 * the whole canvas, which is mostly empty. Worked out at a picture's first stamp, so a picture
 * must not change once it has been stamped.
 */
interface Packed { n: number; xy: Int16Array; rgba: Uint8Array }
const packed = new WeakMap<Picture, Packed>();
function packedOf(picture: Picture, w: number, h: number): Packed {
  let p = packed.get(picture);
  if (p) return p;
  const xy: number[] = [];
  const rgba: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const hex = picture.get(x, y);
    if (!hex || hex === SHADOW) continue;
    xy.push(x, y);
    const c = rgbaOf(hex);
    if (GLOWING.has(hex)) c[3] = GLOW_ALPHA;
    rgba.push(...c);
  }
  packed.set(picture, (p = { n: xy.length / 2, xy: Int16Array.from(xy), rgba: Uint8Array.from(rgba) }));
  return p;
}

/** Paints a picture's pixels, leaving out its ground shadow; `hide` can veto single pixels. Glowing ones are marked by their alpha. */
export function stamp(image: Pixels, picture: Picture, w: number, h: number, dx: number, dy: number, hide?: (x: number, y: number) => boolean): void {
  const { n, xy, rgba } = packedOf(picture, w, h);
  const d = image.data;
  for (let k = 0; k < n; k++) {
    const x = xy[2 * k] + dx;
    const y = xy[2 * k + 1] + dy;
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
    if (hide?.(x, y)) continue;
    const r = rgba[4 * k], g = rgba[4 * k + 1], b = rgba[4 * k + 2], a = rgba[4 * k + 3];
    const o = (y * image.width + x) * 4;
    if (a === 255 || a === GLOW_ALPHA || d[o + 3] === 0) {
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a === GLOW_ALPHA ? a : Math.max(a, d[o + 3]);
      continue;
    }
    const t = a / 255;
    d[o] = Math.round(r * t + d[o] * (1 - t));
    d[o + 1] = Math.round(g * t + d[o + 1] * (1 - t));
    d[o + 2] = Math.round(b * t + d[o + 2] * (1 - t));
  }
}

/**
 * Ground shadows are collected in one mask first and laid on the ground once, so where two
 * shadows overlap the ground is not darkened twice.
 */
export function castShadow(mask: Uint8Array, mw: number, mh: number, picture: Picture, w: number, h: number, dx: number, dy: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!(picture.shaded?.(x, y) || picture.get(x, y) === SHADOW)) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (tx >= 0 && ty >= 0 && tx < mw && ty < mh) mask[ty * mw + tx] = 1;
    }
  }
}
export function layShadow(image: Pixels, mask: Uint8Array): void {
  for (let p = 0; p < mask.length; p++) if (mask[p]) blend(image, p % image.width, Math.floor(p / image.width), SHADOW);
}

/** Where a spot on the map is on the terrain image. */
export function footOf(ground: TerrainImage, spot: Spot): { x: number; y: number } {
  const p = toScreen(spot.i, spot.j, spot.level);
  return { x: Math.round(ground.origin.x + p.x), y: Math.round(ground.origin.y + p.y) };
}

/** A footprint on the plan, in map units, with the order key to fall back on where two footprints do not decide. */
export interface PlanBox { x0: number; x1: number; y0: number; y1: number; key: number }

/**
 * One thing to paint: its picture, and where the picture's ground pixel goes. Things that are not
 * a point on the map, like a wall along an edge or a roof over cells, also give:
 *  - `box`, their footprint, so they are put in front of or behind others by the plan rather than by `i + j`;
 *  - `shadow`, the ground-image pixels they shade, instead of a shadow cast from the picture as if it stood upright at `spot`;
 *  - `bases`, per picture pixel, the level of the ground it stands on, for hiding it behind nearer higher ground;
 *  - `flat`, lying on the ground (someone asleep): each column of the picture rests on the ground at its lowest pixel, and casts its shadow from there.
 */
export interface Thing {
  spot: Spot; picture: Picture; w: number; h: number; foot: { x: number; y: number };
  box?: PlanBox;
  shadow?: ArrayLike<number>;
  bases?: Float32Array;
  flat?: boolean;
}

/** Paints the island with everything on it: ground, all shadows at once, then things back to front. */
export function paintIsland(map: HeightMap, ground: TerrainImage, things: Thing[]): Pixels {
  const image: Pixels = { data: new Uint8ClampedArray(ground.rgba), width: ground.w, height: ground.h };
  const placed = things.map((t) => {
    const dx = footOf(ground, t.spot).x - t.foot.x;
    const dy = footOf(ground, t.spot).y - t.foot.y;
    return { ...t, dx, dy };
  });
  const mask = new Uint8Array(image.width * image.height);
  for (const t of placed) castShadow(mask, image.width, image.height, t.picture, t.w, t.h, t.dx, t.dy);
  layShadow(image, mask);
  placed.sort((a, b) => a.spot.i + a.spot.j - (b.spot.i + b.spot.j));
  for (const t of placed) stamp(image, t.picture, t.w, t.h, t.dx, t.dy, (x, y) => hiddenByGround(map, ground, x, y, t.spot.i, t.spot.j, t.spot.level));
  return image;
}
