// Hand-painted pictures: a grid of palette cells per view, kept as text. Shared by everything that can
// be painted or frozen: props (engine/world/prop.ts), wall pieces (engine/world/building/pieces/
// painted-wall.ts) and wardrobe parts (engine/character/parts.ts). A cell is a palette entry in one of
// its tones, never a free colour, so a painted thing can still be recoloured and lit.
import { hexOf, PALETTE, PALETTE_KEYS, SHADOW, type Cell, type PaletteKey, type Tone } from './palette.ts';

/** A small pixel image: rows of cells, null where nothing is painted. The same type the puppet draws. */
export type Grid = (Cell | null)[][];

/**
 * Several views of one painted thing on one canvas size, kept as text: every view is a list of rows,
 * one character per pixel, '.' empty, every other character looked up in the shared legend. A legend
 * value is a palette key, with '-' for its shade tone or '+' for its highlight.
 */
export interface Art {
  w: number;
  h: number;
  /** The pivot: the pixel that stands on the ground point (or the wall's foot). */
  ox: number;
  oy: number;
  legend: Record<string, string>;
  views: string[][];
}

export const MAX_ART = 160;
export const MAX_VIEWS = 8;
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=?@^~';

export const toneOf = (c: Cell): Tone => (c.shade ? 'shade' : c.light ? 'light' : 'base');
const codeOf = (c: Cell) => `${c.key}${c.shade ? '-' : c.light ? '+' : ''}`;
function cellOf(code: string): Cell | null {
  const m = /^([A-Za-z]+)([-+]?)$/.exec(code);
  if (!m || !(m[1] in PALETTE)) return null;
  return { key: m[1] as PaletteKey, shade: m[2] === '-', ...(m[2] === '+' ? { light: true } : {}) };
}

export const blankGrid = (w: number, h: number): Grid => Array.from({ length: h }, () => Array<Cell | null>(w).fill(null));
export const copyGrid = (g: Grid): Grid => g.map((row) => row.map((c) => (c ? { ...c } : null)));

/** Grids of one size to text, with one legend for all of them. */
export function toArt(grids: Grid[], ox: number, oy: number): Art {
  const h = grids[0]?.length ?? 1;
  const w = grids[0]?.[0]?.length ?? 1;
  const legend: Record<string, string> = {};
  const chars = new Map<string, string>();
  const charOf = (c: Cell) => {
    const code = codeOf(c);
    let ch = chars.get(code);
    if (!ch) {
      ch = CHARS[chars.size] ?? '.';
      chars.set(code, ch);
      legend[ch] = code;
    }
    return ch;
  };
  const views = grids.map((g) => g.map((row) => row.map((c) => (c ? charOf(c) : '.')).join('')));
  return { w, h, ox, oy, legend, views };
}

/** Text back to grids. */
export function gridsOf(art: Art): Grid[] {
  const cells = Object.fromEntries(Object.entries(art.legend).map(([ch, code]) => [ch, cellOf(code)]));
  return art.views.map((rows) => Array.from({ length: art.h }, (_, y) =>
    Array.from({ length: art.w }, (_, x) => {
      const c = cells[rows[y]?.[x] ?? '.'];
      return c ? { ...c } : null;
    })));
}

const int = (v: unknown, lo: number, hi: number, fallback: number) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback);

/** Reads art from storage or a file: sizes clamped, rows padded or cut, unknown characters left empty. */
export function cleanArt(input: unknown): Art | null {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!raw || !Array.isArray(raw.views) || !raw.views.length) return null;
  const w = int(raw.w, 1, MAX_ART, 16);
  const h = int(raw.h, 1, MAX_ART, 16);
  const legend: Record<string, string> = {};
  for (const [ch, code] of Object.entries((raw.legend ?? {}) as Record<string, unknown>)) {
    if (ch.length === 1 && ch !== '.' && typeof code === 'string' && cellOf(code)) legend[ch] = code;
  }
  const views = raw.views.slice(0, MAX_VIEWS).map((rows) => {
    const list = Array.isArray(rows) ? rows : [];
    return Array.from({ length: h }, (_, y) => {
      const row = typeof list[y] === 'string' ? (list[y] as string) : '';
      return [...row.padEnd(w, '.').slice(0, w)].map((ch) => (legend[ch] ? ch : '.')).join('');
    });
  });
  return { w, h, ox: int(raw.ox, 0, w - 1, Math.floor(w / 2)), oy: int(raw.oy, 0, h - 1, h - 1), legend, views };
}

// ------------------------------------------------------------------ freezing

/** Every colour of the palette in every tone, to find the cell a drawn colour came from. */
const TONES: Tone[] = ['base', 'shade', 'light'];
const exact = new Map<string, Cell>();
const all: { rgb: number[]; cell: Cell }[] = [];
for (const key of PALETTE_KEYS) for (const tone of TONES) {
  const hex = PALETTE[key][tone].toLowerCase();
  const cell: Cell = { key, shade: tone === 'shade', ...(tone === 'light' ? { light: true } : {}) };
  if (!exact.has(hex)) exact.set(hex, cell);
  all.push({ rgb: rgbOf(hex), cell });
}
function rgbOf(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
const nearCache = new Map<string, Cell>();

/**
 * The palette cell for a drawn colour: exactly the one it was drawn in where it is a palette tone, else
 * the nearest. Ground shadows and mostly see-through pixels give null: the world casts shadows itself.
 */
export function cellForHex(hex: string | null): Cell | null {
  if (!hex || hex === SHADOW) return null;
  const lower = hex.toLowerCase();
  if (lower.length === 9 && parseInt(lower.slice(7, 9), 16) < 128) return null;
  const solid = lower.slice(0, 7);
  const hit = exact.get(solid) ?? nearCache.get(solid);
  if (hit) return { ...hit };
  const rgb = rgbOf(solid);
  let best = all[0];
  let bestD = Infinity;
  for (const entry of all) {
    // Weighted towards green, as the eye is.
    const d = 2 * (entry.rgb[0] - rgb[0]) ** 2 + 4 * (entry.rgb[1] - rgb[1]) ** 2 + 3 * (entry.rgb[2] - rgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = entry; }
  }
  nearCache.set(solid, best.cell);
  return { ...best.cell };
}

/** Anything drawn by rule: a colour per pixel or null. */
export interface Drawn { get(x: number, y: number): string | null; w: number; h: number; ox: number; oy: number }

/**
 * Freezes drawn views into art: every view read into palette cells and cut to one shared box round
 * all of them, with a margin, keeping each view's pivot on the same pixel.
 */
export function freeze(views: Drawn[], margin = 2): Art {
  let left = 0, right = 0, up = 0, down = 0;
  for (const v of views) for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) {
    if (!cellForHex(v.get(x, y))) continue;
    left = Math.max(left, v.ox - x); right = Math.max(right, x - v.ox);
    up = Math.max(up, v.oy - y); down = Math.max(down, y - v.oy);
  }
  left += margin; right += margin; up += margin; down += margin;
  const w = Math.min(MAX_ART, left + right + 1);
  const h = Math.min(MAX_ART, up + down + 1);
  const grids = views.map((v) => {
    const g = blankGrid(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = x - left + v.ox, sy = y - up + v.oy;
      if (sx >= 0 && sy >= 0 && sx < v.w && sy < v.h) g[y][x] = cellForHex(v.get(sx, sy));
    }
    return g;
  });
  return toArt(grids, left, up);
}

// ------------------------------------------------------------------ drawing

/** A painted view as a picture the world can stamp, mirrored if asked. Kept per art and view. */
export interface Painted { get(x: number, y: number): string | null; w: number; h: number; foot: { x: number; y: number } }
const pictures = new WeakMap<Art, Map<string, Painted>>();
export function paintedView(art: Art, view: number, mirror = false): Painted {
  let byView = pictures.get(art);
  if (!byView) pictures.set(art, (byView = new Map()));
  const key = `${view}|${mirror}`;
  let out = byView.get(key);
  if (!out) {
    const grid = gridsOf(art)[Math.max(0, Math.min(art.views.length - 1, view))] ?? blankGrid(art.w, art.h);
    const hexes = grid.map((row) => row.map((c) => (c ? hexOf(c) : null)));
    const w = art.w;
    out = {
      w, h: art.h, foot: { x: mirror ? w - 1 - art.ox : art.ox, y: art.oy },
      get: (x, y) => hexes[y]?.[mirror ? w - 1 - x : x] ?? null,
    };
    byView.set(key, out);
  }
  return out;
}

/**
 * A picture swaying in the wind: every row is pushed sideways by how high above the foot it is,
 * squared, so the base stays put and the top moves most. `lean` is the top's push in pixels.
 */
export function swayed(p: Painted, lean: number): Painted {
  if (!lean) return p;
  const tall = Math.max(1, p.foot.y);
  const shift = (y: number) => Math.round(lean * Math.max(0, (p.foot.y - y) / tall) ** 2);
  return { ...p, get: (x, y) => p.get(x - shift(y), y) };
}
