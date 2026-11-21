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
  for (let k = 0; k < d.length; k += 4) {
    if (d[k + 3] === GLOW_ALPHA) continue;
    let r = fr, g = fg, b = fb;
    if (lit.length) {
      const x = (k >> 2) % w, y = Math.floor((k >> 2) / w);
      for (const l of lit) {
        const q = 1 - ((x - l.x) ** 2 + ((y - l.y) * 1.6) ** 2) / (l.r * l.r);
        if (q <= 0) continue;
        // The patch's edge falls off softly; at its middle, nearly day, a touch of the lamp's colour.
        const e = q * q * t.amount * keep;
        r += (keep * (l.c[0] / 255) - r) * e;
        g += (keep * (l.c[1] / 255) - g) * e;
        b += (keep * (l.c[2] / 255) - b) * e;
      }
    }
    d[k] *= r;
    d[k + 1] *= g;
    d[k + 2] *= b;
  }
}

/**
 * Lights a picture like `light`, but the lamps' light comes from a light field (`World.lightField`): each pixel is
 * lifted by the light at its spot on the map (`World.spots`), by its distance to each lamp plus the detour round walls,
 * so light stops at walls and a thing is lit as one by the light where it stands. Pixels with no spot take the tint.
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
  const { w, h, open, lamps } = field;
  const cells = [0, 0, 0, 0], weights = [0, 0, 0, 0];
  for (let p = 0; p < d.length >> 2; p++) {
    const o = p * 4;
    if (d[o + 3] === GLOW_ALPHA) continue;
    let r = fr, g = fg, b = fb;
    const si = spots.i[p], sj = spots.j[p];
    if (si === si && lamps.length) {
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
          let detour = 0;
          for (let c = 0; c < n; c++) detour += lamp.detour[cells[c]] * weights[c];
          const dist = Math.hypot(si - lamp.i, sj - lamp.j) + detour / sum;
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
    }
    d[o] *= r;
    d[o + 1] *= g;
    d[o + 2] *= b;
  }
}
