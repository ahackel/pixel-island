// The faces of ground and walls by material, as painters: stone (a few large masses split by open cracks, each broken
// into facets shaded by which way they face, with tilted strata), brick (courses of bricks each with its own shade) and
// mine (stone shored up by a post on every third edge and a beam along the top). They paint by where a pixel is along
// the outline of the floor (`a`, in pixels, i + j of the edge times a tile's half width) and up the face, not per edge,
// so faces of neighbouring cells and walls run on without a seam. The rock wall piece (building/pieces/rock-wall.ts)
// and the terrain's step faces (terrain.ts) both paint with them. No drawing of their own.

export type Rgb = [number, number, number];
/** A stone tone as a step: crack, shade, base, light. */
export type Step = 0 | 1 | 2 | 3;

/** A hash of integers to 0..1, fast enough to call per pixel. */
export function h01(seed: number, a: number, b = 0, c = 0): number {
  let x = Math.imul(seed | 0, 0x27d4eb2d) ^ Math.imul(a | 0, 0x165667b1) ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul(c | 0, 0x85ebca77);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

/** The nearest two points of a jittered grid to (u, v): the cell and place of the nearest, and both distances. */
function voronoi(seed: number, u: number, v: number, cw: number, ch: number) {
  const cx = Math.floor(u / cw), cy = Math.floor(v / ch);
  let best = Infinity, second = Infinity, bx = 0, by = 0, px = 0, py = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const gx = cx + dx, gy = cy + dy;
    const x = (gx + 0.15 + 0.7 * h01(seed, gx, gy, 1)) * cw;
    const y = (gy + 0.15 + 0.7 * h01(seed, gx, gy, 2)) * ch;
    const d = Math.hypot(u - x, (v - y) * 1.2);
    if (d < best) { second = best; best = d; bx = gx; by = gy; px = x; py = y; }
    else if (d < second) second = d;
  }
  return { gx: bx, gy: by, x: px, y: py, best, second };
}

// ------------------------------------------------------------------ stone

/** The masses' and the facets' sizes, in pixels along the face and up it. */
const MASS = [20, 15];
const FACET = [7, 6];
/** How much the field up a face shifts per screen column, so faces as far round the floor but elsewhere on screen differ. */
export const SHEAR = 0.3;

/** Whether stone has an open crack at `a` along and `v` up (sheared): most of the way along a mass's border, not all of it. */
function crackAt(line: number, a: number, v: number): boolean {
  const m = voronoi(line, a, v, MASS[0], MASS[1]);
  return m.second - m.best < 1.1 && h01(line, m.gx, m.gy, 5) < 0.8 && h01(line, Math.floor(v / 4), m.gx, 6) < 0.85;
}

/**
 * Stone's tone at `a` pixels along the outline and `v` pixels up the face (over its foot line), on the field seeded by
 * `line`; `shear` shifts the field up the face by the screen column, `leftward` (1 or -1) is which way along the face
 * is left on screen, for the light.
 */
export function stoneStep(line: number, a: number, v: number, shear: number, leftward: number): Step {
  const vs = v + shear;
  if (crackAt(line, a, vs)) return 0;
  const mass = voronoi(line, a, vs, MASS[0], MASS[1]);
  const facet = voronoi(line + 31, a, vs, FACET[0], FACET[1]);
  // A facet's tone by where it sits on its mass: high up it faces the sky; to the left it faces the light.
  const up = (facet.y - mass.y) / MASS[1];
  const left = ((mass.x - facet.x) / MASS[0]) * leftward;
  const lit = up * 1.6 + left * 0.8 + (h01(line + 31, facet.gx, facet.gy, 3) - 0.5) * 0.9;
  let step: Step = lit > 0.55 ? 3 : lit > -0.15 ? 2 : 1;
  // Strata: tilted lines through the rock, broken here and there.
  const stratum = vs + a * 0.18;
  const k = Math.round(stratum / 7);
  if (Math.abs(stratum - k * 7) < 0.5 && h01(line, k, Math.floor(a / 6), 7) < 0.55) step = 1;
  // Just under a crack its lip catches the light.
  if (v > 2 && crackAt(line, a, vs + 1)) step = 3;
  return step;
}

/** The cave's painted tones for stone as steps, crack to light, from a palette entry's three tones. */
export function stoneTones(tones: Record<'base' | 'shade' | 'light', string>): Rgb[] {
  return [scale(rgbOf(tones.shade), CRACK), rgbOf(tones.shade), rgbOf(tones.base), rgbOf(tones.light)];
}
/** A crack is the shade tone darkened this much. */
const CRACK = 0.6;

// ------------------------------------------------------------------ brick

const BRICK = {
  brick: rgbOf('#6e4840'), shade: rgbOf('#573830'), light: rgbOf('#8d6152'), dark: rgbOf('#40292a'), mortar: rgbOf('#2a2327'), crack: rgbOf('#14162a'),
};
/** Courses are this many pixels high and bricks this many long; every other course is moved half a brick. */
const COURSE = 4, BRICK_LONG = 8;

/**
 * Brick at `a` pixels along the outline and `v` up the face, `down` pixels under its top; `shaded` for a face turned
 * from the light (the right-hand faces). Each brick's shade comes from where it lies.
 */
export function brickAt(a: number, v: number, down: number, shaded: boolean): Rgb {
  const row = Math.floor(v / COURSE), off = (row & 1) * (BRICK_LONG / 2);
  const n = Math.floor((a + off) / BRICK_LONG);
  const ma = (((a + off) % BRICK_LONG) + BRICK_LONG) % BRICK_LONG, mb = v - row * COURSE;
  let c: Rgb;
  if (down < 1) c = BRICK.light;
  else if (mb < 1 || ma < 1) c = BRICK.mortar;
  else {
    const t = h01(31, n, row);
    c = t < 0.04 ? BRICK.crack : t < 0.12 ? BRICK.dark : t < 0.6 ? BRICK.brick : t < 0.9 ? BRICK.shade : BRICK.light;
    if (mb >= COURSE - 1) c = mix(c, [0, 0, 0], 0.18);
    else if (mb < 2 && t >= 0.04) c = mix(c, BRICK.light, 0.25);
  }
  return shaded ? mix(c, [0, 0, 0], 0.28) : c;
}

/** A brick floor's pavers at `u`, `v` over a cell (0 to 1 each) of cell `i`, `j`: four to a row, two rows, in the walls' bond. */
export function paverAt(u: number, v: number, i: number, j: number): Rgb {
  const a = u * 4, row = Math.floor(v * 2), b = a + (row & 1) * 0.5;
  if ((v * 2) % 1 < 0.14 || b % 1 < 0.1) return BRICK.mortar;
  return mix(BRICK.shade, BRICK.light, Math.floor(h01(61 + i, Math.floor(b), row + j * 2) * 6) / 6 * 0.8);
}

// ------------------------------------------------------------------ mine

export const WOOD = { wood: rgbOf('#6b4b2e'), dark: rgbOf('#47311e'), light: rgbOf('#8c6a43') };
/** The beam along a mine face's top, in pixels. */
const BEAM = 5;

/**
 * Mine shoring at `a` pixels along the outline and `v` up a face `down` pixels under its top: a post on every third
 * edge and a beam along the top; null where the stone shows between them.
 */
export function mineAt(a: number, v: number, down: number, shaded: boolean): Rgb | null {
  const e = Math.floor(a / 16), f = a / 16 - e;
  const post = (((e % 3) + 3) % 3) === 1 && f > 0.36 && f < 0.64;
  let c: Rgb | null = null;
  if (down >= 0 && down < BEAM) c = down < 1 ? WOOD.light : down >= BEAM - 1 ? WOOD.dark : WOOD.wood;
  else if (post) c = f < 0.42 ? WOOD.light : f > 0.58 ? WOOD.dark : WOOD.wood;
  if (!c) return null;
  if (h01(51, Math.floor(a / 3), Math.floor(v / 4)) < 0.12) c = mix(c, [0, 0, 0], 0.2);
  return shaded ? mix(c, [0, 0, 0], 0.25) : c;
}

// ------------------------------------------------------------------ colours

export function rgbOf(s: string): Rgb {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const scale = (c: number[], k: number): Rgb => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))) as Rgb;
export const mix = (a: number[], b: number[], t: number): Rgb => a.map((v, k) => Math.round(v + (b[k] - v) * t)) as Rgb;
