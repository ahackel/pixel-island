// Time of day as a colour laid over a composed picture: the light's colour multiplies every pixel,
// and a fade darkens it toward black for screen transitions. Which tint shows when is the game's.
// Glowing colours, such as a flame's, give their own light and keep their colour through it all, and a
// lamp (a fire) lights a round patch around it, warm, as if the tint were lifted there.
import { FIRE_KEYS, PALETTE } from '../core/palette.ts';
import { rgb } from './ocean.ts';
import type { TileLight } from './world.ts';

/**
 * Colours that give their own light: the palette's fire tones. The time of day, the weather and
 * lightning leave them as drawn, and they cast no shadow. A game may add its own before it draws them.
 */
export const GLOWING = new Set<string>(FIRE_KEYS.flatMap((key) => Object.values(PALETTE[key])));
/** The alpha a composed pixel of a glowing colour has, so the passes that light a picture can leave it be. */
export const GLOW_ALPHA = 254;

/** A light colour and how strongly it tints, 0 (none) to 1 (full multiply). */
export interface Tint { r: number; g: number; b: number; amount: number }

const tint = (hex: string, amount: number): Tint => {
  const [r, g, b] = rgb(hex);
  return { r, g, b, amount };
};

export const TINTS = {
  day: tint('#ffffff', 0),
  /** Low sun: warm, a little dimmer. */
  sunset: tint('#ff9a5c', 0.45),
  /** Just after the sun is gone. */
  dusk: tint('#7a5c9c', 0.6),
  /** Moonlight: dark and blue. */
  night: tint('#3a4a8c', 0.72),
};

/** A tint between two, `k` from 0 (a) to 1 (b). */
export function mixTint(a: Tint, b: Tint, k: number): Tint {
  const m = (x: number, y: number) => x + (y - x) * k;
  return { r: m(a.r, b.r), g: m(a.g, b.g), b: m(a.b, b.b), amount: m(a.amount, b.amount) };
}

/** Tints a tint along a list of stops, `k` from 0 (the first) to 1 (the last). */
export function along(stops: Tint[], k: number): Tint {
  const at = Math.max(0, Math.min(1, k)) * (stops.length - 1);
  const n = Math.min(stops.length - 2, Math.floor(at));
  return mixTint(stops[n], stops[n + 1], at - n);
}

/** A light in the picture: its middle in image pixels, how far it reaches, and how warm. */
export interface Lamp { x: number; y: number; r: number; color?: string }
/** A lamp's own colour: a fire's orange. */
const LAMP = rgb('#ffb060');

/**
 * Lights a picture in place with a tint, then fades it toward black by `fade` (0 to 1). Near a lamp the tint is
 * lifted, most at its middle and none at its reach, and the light there is warmed toward the lamp's colour.
 */
export function light(image: { data: Uint8ClampedArray; width?: number }, t: Tint, fade = 0, lamps: readonly Lamp[] = []): void {
  if (t.amount <= 0 && fade <= 0) return;
  const keep = 1 - fade;
  const fr = (1 - t.amount + (t.amount * t.r) / 255) * keep;
  const fg = (1 - t.amount + (t.amount * t.g) / 255) * keep;
  const fb = (1 - t.amount + (t.amount * t.b) / 255) * keep;
  const d = image.data;
  const w = image.width ?? 0;
  const lit = w > 0 && t.amount > 0 ? lamps.map((l) => ({ ...l, c: l.color ? rgb(l.color) : LAMP })) : [];
  // Whole pixels as 32-bit words, to pass over black and glowing ones in one read.
  const px = new Uint32Array(d.buffer, d.byteOffset, d.length >> 2);
  const rows = lit.length ? px.length / w : 1, cols = lit.length ? w : px.length;
  // Away from every lamp each channel is multiplied alike: a table of the 256 values per channel, rounded as the picture
  // rounds, lights such a pixel with one write.
  const table = new Uint8ClampedArray(768);
  for (let c = 0; c < 256; c++) table[c] = c * fr, table[256 + c] = c * fg, table[512 + c] = c * fb;
  // The lamps whose patch a row crosses: with a little to spare for rounding, as the exact test below decides.
  const near: typeof lit = [];
  for (let y = 0; y < rows; y++) {
    near.length = 0;
    // And the span of the row they can reach: a pixel outside it is lit by the table.
    let from = Infinity, to = -Infinity;
    for (const l of lit) {
      const across = l.r * l.r * 1.0001 - ((y - l.y) * 1.6) ** 2;
      if (across <= 0) continue;
      near.push(l);
      from = Math.min(from, l.x - Math.sqrt(across) - 1);
      to = Math.max(to, l.x + Math.sqrt(across) + 1);
    }
    for (let x = 0, p = y * cols; x < cols; x++, p++) {
      const v = px[p];
      // Black stays black, and glowing pixels keep their own light.
      if (!(v & 0xffffff) || v >>> 24 === GLOW_ALPHA) continue;
      if (x < from || x > to) {
        // Little-endian: the red byte is the lowest.
        px[p] = (v & 0xff000000) | (table[512 + ((v >>> 16) & 255)] << 16) | (table[256 + ((v >>> 8) & 255)] << 8) | table[v & 255];
        continue;
      }
      let r = fr, g = fg, b = fb;
      for (const l of near) {
        const q = 1 - ((x - l.x) ** 2 + ((y - l.y) * 1.6) ** 2) / (l.r * l.r);
        if (q <= 0) continue;
        // The patch's edge falls off softly; at its middle, nearly day, a touch of the lamp's colour.
        const e = q * q * t.amount * keep;
        r += (keep * (l.c[0] / 255) - r) * e;
        g += (keep * (l.c[1] / 255) - g) * e;
        b += (keep * (l.c[2] / 255) - b) * e;
      }
      const k = p * 4;
      d[k] *= r;
      d[k + 1] *= g;
      d[k + 2] *= b;
    }
  }
}

/** Whether a lamp of a light field is in reach of a spot in a straight line, with a little to spare for rounding. */
function inReach(lamps: TileLight['lamps'], si: number, sj: number): boolean {
  for (let k = 0; k < lamps.length; k++) {
    const l = lamps[k], di = si - l.i, dj = sj - l.j;
    if (di * di + dj * dj <= l.r * l.r * 1.0001) return true;
  }
  return false;
}

/**
 * Lights a picture like `light`, but the lamps' light comes from a light field (`World.lightField`): each pixel is
 * lifted by the light at its spot on the map (`World.spots`), by its distance to each lamp plus the detour round walls,
 * so light stops at walls and a thing is lit as one by the light where it stands. Pixels with no spot take the tint, but
 * with `field.outside` (daylight beyond the map) those and the ones off the map keep their colour.
 */
export function lightByTile(
  image: { data: Uint8ClampedArray; width?: number },
  t: Tint,
  fade: number,
  spots: { i: Float32Array; j: Float32Array },
  field: TileLight,
): void {
  const keep = 1 - fade;
  const fr = (1 - t.amount + (t.amount * t.r) / 255) * keep;
  const fg = (1 - t.amount + (t.amount * t.g) / 255) * keep;
  const fb = (1 - t.amount + (t.amount * t.b) / 255) * keep;
  const d = image.data;
  const { w, h, open, lamps, outside } = field;
  const cells = [0, 0, 0, 0], weights = [0, 0, 0, 0];
  // A thing's pixels all take its spot: the light worked out for one serves the run of them after it.
  let lastI = NaN, lastJ = NaN, lastR = fr, lastG = fg, lastB = fb;
  // Whole pixels as 32-bit words, to pass over black (most of a cave seen from afar) and glowing ones in one read.
  const px = new Uint32Array(d.buffer, d.byteOffset, d.length >> 2);
  for (let p = 0; p < px.length; p++) {
    const v = px[p];
    // Black stays black, and glowing pixels keep their own light.
    if (!(v & 0xffffff) || v >>> 24 === GLOW_ALPHA) continue;
    const o = p * 4;
    let r = fr, g = fg, b = fb;
    const si = spots.i[p], sj = spots.j[p];
    // With daylight beyond the map, what lies off it (the open sea) is only faded.
    if (outside && !(si >= 0 && sj >= 0 && si < w && sj < h)) {
      d[o] *= keep; d[o + 1] *= keep; d[o + 2] *= keep;
      continue;
    }
    if (si === lastI && sj === lastJ) {
      r = lastR; g = lastG; b = lastB;
    } else if (si === si && inReach(lamps, si, sj)) {
      // Only where some lamp is in reach in a straight line (see below), with a little to spare for rounding.
      // The open cells among the four whose middles are round the spot, and how much each counts.
      const fi = si - 0.5, fj = sj - 0.5;
      const i0 = Math.floor(fi), j0 = Math.floor(fj);
      let n = 0, sum = 0;
      for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= w || j >= h || !open[j * w + i]) continue;
        cells[n] = j * w + i;
        weights[n] = (di ? fi - i0 : 1 - (fi - i0)) * (dj ? fj - j0 : 1 - (fj - j0));
        sum += weights[n++];
      }
      if (sum > 0) {
        // Lamps add up as light does, each pulling the colour toward its own by how much it gives.
        let dark = 1, lk = 0, lr = 0, lg = 0, lb = 0;
        for (const lamp of lamps) {
          // The detour only adds: out of a lamp's reach in a straight line is out of it. Squared first, with a little to
          // spare for rounding, as hypot is slow; the exact test after it decides.
          const di = si - lamp.i, dj = sj - lamp.j;
          if (di * di + dj * dj > lamp.r * lamp.r * 1.0001) continue;
          const straight = Math.hypot(di, dj);
          if (straight >= lamp.r) continue;
          let detour = 0;
          for (let c = 0; c < n; c++) detour += lamp.detour[cells[c]] * weights[c];
          const dist = straight + detour / sum;
          if (dist >= lamp.r) continue;
          const q = 1 - dist / lamp.r;
          const v = lamp.amount * q * q * (3 - 2 * q);
          dark *= 1 - v;
          lk += v; lr += lamp.rgb[0] * v; lg += lamp.rgb[1] * v; lb += lamp.rgb[2] * v;
        }
        if (lk > 0) {
          const e = (1 - dark) * t.amount * keep;
          r += (keep * (lr / lk / 255) - r) * e;
          g += (keep * (lg / lk / 255) - g) * e;
          b += (keep * (lb / lk / 255) - b) * e;
        }
      }
      lastI = si; lastJ = sj; lastR = r; lastG = g; lastB = b;
    }
    d[o] *= r;
    d[o + 1] *= g;
    d[o + 2] *= b;
  }
}
