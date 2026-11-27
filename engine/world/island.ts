// Putting things on the island and painting them: which ground each group grows on, scattering
// them without crowding, and drawing a scene in one pass with shared shadows and higher ground
// in front hiding what stands behind it. Used by the flora page and the start page.
import type { Category } from '../flora/flora.ts';
import { SHADOW } from '../core/palette.ts';
import { GLOW_ALPHA, GLOWING } from './daylight.ts';
import { rng } from '../../shared/random.ts';
import { drew } from '../../shared/stats.ts';
import { hiddenByGround, LEVEL_M, LEVEL_PX, SHADOW_RUN, standingHeight, surfaceAt, TILE_H, TILE_W, toScreen, type HeightMap, type Surface, type TerrainImage } from './terrain.ts';

/** Where each group grows. Rocks may stand in the shallows; driftwood only lies on the beach. */
export const HOMES: Record<Category, Surface[]> = {
  palm: ['beach', 'sand', 'grass'],
  grass: ['sand', 'grass'],
  cactus: ['sand', 'rock'],
  jungle: ['grass'],
  rock: ['shallow', 'beach', 'sand', 'grass', 'rock', 'cave', 'dirt'],
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
/** Anything with pixels. Its ground shadow is not in it: shadows are cast from the sun where it stands (`sunShadow`, `World`). */
export type Picture = { get(x: number, y: number): string | null };

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
export interface Packed { n: number; xy: Int16Array; rgba: Uint8Array }
const packed = new WeakMap<Picture, Packed>();
export function packedOf(picture: Picture, w: number, h: number): Packed {
  const p = packed.get(picture);
  return p ?? drew('packed', () => pack(picture, w, h), (q) => q.n * 8);
}
function pack(picture: Picture, w: number, h: number): Packed {
  let p: Packed;
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
  const d = image.data, iw = image.width;
  // Whole pixels as 32-bit words: an opaque or glowing pixel, or one over nothing, is one write.
  const px = wordsOf(image), words = new Uint32Array(rgba.buffer, rgba.byteOffset, n);
  // A picture wholly inside the image needs no pixel kept inside it.
  const within = dx >= 0 && dy >= 0 && dx + w <= iw && dy + h <= image.height;
  for (let k = 0; k < n; k++) {
    const x = xy[2 * k] + dx;
    const y = xy[2 * k + 1] + dy;
    if (!within && (x < 0 || y < 0 || x >= iw || y >= image.height)) continue;
    if (hide?.(x, y)) continue;
    const a = rgba[4 * k + 3], q = y * iw + x;
    if (a === 255 || a === GLOW_ALPHA || px[q] >>> 24 === 0) {
      px[q] = words[k];
      continue;
    }
    const o = q * 4, t = a / 255;
    d[o] = Math.round(rgba[4 * k] * t + d[o] * (1 - t));
    d[o + 1] = Math.round(rgba[4 * k + 1] * t + d[o + 1] * (1 - t));
    d[o + 2] = Math.round(rgba[4 * k + 2] * t + d[o + 2] * (1 - t));
  }
}
const words32 = new WeakMap<Uint8ClampedArray, Uint32Array>();
function wordsOf(image: Pixels): Uint32Array {
  let px = words32.get(image.data);
  if (!px) words32.set(image.data, (px = new Uint32Array(image.data.buffer, image.data.byteOffset, image.data.length >> 2)));
  return px;
}

/**
 * Where a picture's shadow falls on flat ground, cast from the sun as `World` casts it over the terrain: each painted pixel stands
 * upright over its foot (lying `flat`, each column over its lowest pixel), as high as it is drawn above it, and is sent away from
 * the light to the ground. As x, y pairs in the picture's own frame; some may lie outside it. Glowing pixels cast none.
 */
export function sunShadow(picture: Picture, w: number, h: number, foot: { x: number; y: number }, flat = false): Int16Array {
  const key = `${w},${h},${foot.x},${foot.y},${flat}`;
  const known = sunShadows.get(picture);
  if (known?.key === key) return known.xy;
  const { n, xy, rgba } = packedOf(picture, w, h);
  const rests = new Array<number>(w).fill(-1);
  for (let k = 0; k < n; k++) rests[xy[2 * k]] = Math.max(rests[xy[2 * k]], xy[2 * k + 1]);
  for (let x = 0; x < w; x++) if (!flat || rests[x] < 0) rests[x] = foot.y;
  const seen = new Set<number>();
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    if (rgba[4 * k + 3] === GLOW_ALPHA) continue;
    const x = xy[2 * k], y = xy[2 * k + 1];
    const up = (Math.max(0, rests[x] - y) / LEVEL_PX) * LEVEL_M;
    const side = (x - foot.x) / TILE_W;
    const back = (rests[x] - foot.y) / TILE_H;
    const i = side + back + up * SHADOW_RUN[0];
    const j = -side + back + up * SHADOW_RUN[1];
    const sx = Math.round(foot.x + ((i - j) * TILE_W) / 2), sy = Math.round(foot.y + ((i + j) * TILE_H) / 2);
    const at = (sy + 0x8000) * 0x10000 + sx + 0x8000;
    if (seen.has(at)) continue;
    seen.add(at);
    out.push(sx, sy);
  }
  const cast = Int16Array.from(out);
  sunShadows.set(picture, { key, xy: cast });
  return cast;
}
const sunShadows = new WeakMap<Picture, { key: string; xy: Int16Array }>();

/**
 * A picture with its sun shadow on flat ground (`sunShadow`) in the shadow colour where nothing is painted, for showing a thing
 * off the map, as the editors do. It answers outside the picture's own size too, where the shadow reaches. `shown` is painted in
 * place of the picture (with marks on it, say) while the shadow is the picture's.
 */
export function withSunShadow(picture: Picture, w: number, h: number, foot: { x: number; y: number }, flat = false, shown: Picture = picture): Picture & { bounds: { x0: number; y0: number; x1: number; y1: number } } {
  const xy = sunShadow(picture, w, h, foot, flat);
  const cast = new Set<number>();
  // The box round what is painted and its shadow.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (let k = 0; k < xy.length; k += 2) cast.add(xy[k + 1] * 0x10000 + xy[k]), grow(xy[k], xy[k + 1]);
  const { n, xy: painted } = packedOf(picture, w, h);
  for (let k = 0; k < n; k++) grow(painted[2 * k], painted[2 * k + 1]);
  return {
    bounds: { x0, y0, x1, y1 },
    get: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? shown.get(x, y) : null) ?? (cast.has(y * 0x10000 + x) ? SHADOW : null),
  };
}

/**
 * Ground shadows are collected in one mask first and laid on the ground once, so where two
 * shadows overlap the ground is not darkened twice. Each picture casts from the sun on flat ground (`sunShadow`).
 */
export function castShadow(mask: Uint8Array, mw: number, mh: number, picture: Picture, w: number, h: number, dx: number, dy: number, foot: { x: number; y: number }, flat = false): void {
  const xy = sunShadow(picture, w, h, foot, flat);
  for (let k = 0; k < xy.length; k += 2) {
    const tx = xy[k] + dx;
    const ty = xy[k + 1] + dy;
    if (tx >= 0 && ty >= 0 && tx < mw && ty < mh) mask[ty * mw + tx] = 1;
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
  /** A particle system attached to it (see particles.ts): sparks and the glow halo of a fire, a lantern's light. */
  fx?: Attach;
  /** Where ground in front hides it, it shows as a silhouette, every other pixel (the player's, so they can always be found). */
  silhouette?: boolean;
}

/** A particle system attached to a picture: the point it sits at, in the picture's pixels, and the system's id. */
export interface Attach { x: number; y: number; system: string }

/** Paints the island with everything on it: ground, all shadows at once, then things back to front. */
export function paintIsland(map: HeightMap, ground: TerrainImage, things: Thing[]): Pixels {
  const image: Pixels = { data: new Uint8ClampedArray(ground.rgba), width: ground.w, height: ground.h };
  const placed = things.map((t) => {
    const dx = footOf(ground, t.spot).x - t.foot.x;
    const dy = footOf(ground, t.spot).y - t.foot.y;
    return { ...t, dx, dy };
  });
  const mask = new Uint8Array(image.width * image.height);
  for (const t of placed) castShadow(mask, image.width, image.height, t.picture, t.w, t.h, t.dx, t.dy, t.foot, t.flat);
  layShadow(image, mask);
  placed.sort((a, b) => a.spot.i + a.spot.j - (b.spot.i + b.spot.j));
  for (const t of placed) stamp(image, t.picture, t.w, t.h, t.dx, t.dy, (x, y) => hiddenByGround(map, ground, x, y, t.spot.i, t.spot.j, t.spot.level));
  return image;
}
