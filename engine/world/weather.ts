// Weather as a few amounts, 0 to 1, that any game can blend: cloud, rain, wind, fog and storm.
// They turn knobs the world already has (the sea's waves and wavelets, how hard plants sway, how
// dark shadows are) and add overlays: wet ground, rain, gusts, fog and lightning. Which weather comes when is the game's.
import { GLOW_ALPHA, type Tint } from './daylight.ts';
import { ocean, rgb } from './ocean.ts';

export interface Weather {
  cloud: number;
  rain: number;
  wind: number;
  fog: number;
  /** Lightning now and then. */
  storm: number;
}

export const CLEAR: Weather = { cloud: 0, rain: 0, wind: 0, fog: 0, storm: 0 };

/** A weather between two, `k` from 0 (a) to 1 (b). */
export function mixWeather(a: Weather, b: Weather, k: number): Weather {
  const m = (x: number, y: number) => x + (y - x) * k;
  return { cloud: m(a.cloud, b.cloud), rain: m(a.rain, b.rain), wind: m(a.wind, b.wind), fog: m(a.fog, b.fog), storm: m(a.storm, b.storm) };
}

/** The sea as tuned, for calm weather; wind scales it from here. */
const CALM = { ...ocean };

/** How much the air moves: fog comes with still air. */
const airOf = (w: Weather) => w.wind * (1 - w.fog);

/**
 * Sets the sea's waves and wavelets for a weather: wind brings more wavelets, faster drift and
 * bigger, quicker waves; fog lays the sea almost flat.
 */
export function weatherSea(w: Weather): void {
  const air = airOf(w);
  const still = 1 - 0.6 * w.fog;
  ocean.ripples = Math.min(0.8, (CALM.ripples + 0.4 * air) * still);
  ocean.rippleOpacity = Math.min(0.9, CALM.rippleOpacity + 0.25 * air);
  ocean.drift = CALM.drift * (1 + 2 * air) * still;
  ocean.wavePeriod = CALM.wavePeriod / (1 + 0.7 * air) / still;
  ocean.waveReach = CALM.waveReach * (1 + 0.3 * air) * still;
  ocean.glints = CALM.glints * (1 - w.cloud) * (1 - w.fog);
}

/** The strengths plants sway at. Each needs its own pictures of every plant, so a few, not every value between. */
export const WIND_LEVELS = [0, 0.3, 0.8, 2.5];
/** Past the halfway point, how much nearer another level must be before plants change to it. */
const HOLD = 0.1;

/**
 * How hard plants sway, as one of `WIND_LEVELS`: hardly at all on a calm day, up to a storm's; not at all in fog.
 * Given the level shown so far (`last`), it stays there until another is clearly nearer, so a weather slowly
 * turning does not flick between two.
 */
export function plantWind(w: Weather, last = -1): number {
  const raw = (0.3 + 2.2 * airOf(w)) * (1 - w.fog);
  const near = WIND_LEVELS.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
  return WIND_LEVELS.includes(last) && Math.abs(last - raw) < Math.abs(near - raw) + HOLD ? last : near;
}

const GREY = rgb('#7d8796');
/** The light under cloud and rain: greyer and dimmer. Lay it with `light` as well as the time of day's tint. */
export function overcast(w: Weather): Tint {
  return { r: GREY[0], g: GREY[1], b: GREY[2], amount: Math.min(0.75, 0.5 * w.cloud + 0.1 * w.rain + 0.15 * w.storm) };
}

/** How much a shadow shows, 1 in sunshine: faint under a cloudy sky, gone in fog. */
export const shadowLight = (w: Weather) => Math.max(0.3, 1 - 1.8 * w.cloud) * Math.max(0, 1 - 2 * w.fog);

/**
 * Lays a lightning flash, `flash` 0 to 1, over a finished picture, once it is lit for the time of
 * day: for a moment the world is much starker, the light brighter and the dark nearly black. Only
 * brightness changes: a colour is darkened by scaling it and brightened toward white, so it never
 * gets more saturated.
 */
export function lightning(image: { data: Uint8ClampedArray }, flash: number): void {
  if (flash <= 0) return;
  const d = image.data;
  const gain = 1 + 3 * flash;
  const pivot = 0.4;
  const lift = 0.12 * flash;
  for (let o = 0; o < d.length; o += 4) {
    if (d[o + 3] === GLOW_ALPHA) continue;
    const l = (0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]) / 255;
    const to = Math.min(1, Math.max(0, (l - pivot) * gain + pivot + lift));
    if (to < l) {
      const k = to / l;
      for (let c = 0; c < 3; c++) d[o + c] *= k;
    } else if (l < 1) {
      const k = (to - l) / (1 - l);
      for (let c = 0; c < 3; c++) d[o + c] += (255 - d[o + c]) * k;
    }
  }
}

/** A random-looking number 0 to 1 for two whole numbers. Mixed well: neighbours must not line up, or rain falls in rows. */
function hash(a: number, b: number): number {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 0x9e37, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * How bright a lightning flash is now, 0 to 1. Each second may hold one, more often the stormier:
 * a bright flash, a flicker, a second flash, then fading.
 */
export function flashAt(ms: number, w: Weather): number {
  if (w.storm <= 0) return 0;
  const slot = Math.floor(ms / 1000);
  if (hash(slot, 1) > 0.1 * w.storm) return 0;
  const t = (ms % 1000) / 1000 - hash(slot, 2) * 0.5;
  if (t < 0) return 0;
  if (t < 0.05) return 1;
  if (t < 0.1) return 0.3;
  if (t < 0.15) return 0.8;
  return Math.max(0, 0.8 * (1 - (t - 0.15) / 0.3));
}

/** What the overlays need to know of the ground under a view pixel: water depth there (Infinity off the map), or 0 on land. */
export type DepthAt = (gx: number, gy: number) => number;

const FOG = rgb('#e6edf2');
const RAIN = rgb('#dbe8ff');
const RING = rgb('#e8f6ff');
const WET = rgb('#8a7a5a');

/** Smooth noise 0 to 1 on a grid one unit across. */
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const u = ease(x - ix), v = ease(y - iy);
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * u;
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * u;
  return top + (bottom - top) * v;
}

/** Moves a pixel toward a colour; a glowing one shines through fog, cloud and rain. */
const toward = (d: Uint8ClampedArray, o: number, c: number[], k: number) => {
  if (d[o + 3] === GLOW_ALPHA) return;
  d[o] += (c[0] - d[o]) * k;
  d[o + 1] += (c[1] - d[o + 1]) * k;
  d[o + 2] += (c[2] - d[o + 2]) * k;
};

/**
 * Lays the weather over a composed view, `view` its place on the ground image: ground first
 * (wet ground, fog), then what is in the air (rain, gusts). Cloud only greys the light (`overcast`).
 */
export function drawWeather(image: { data: Uint8ClampedArray; width: number; height: number }, view: { x: number; y: number }, depthAt: DepthAt, ms: number, w: Weather): void {
  const { width: vw, height: vh, data: d } = image;
  const t = ms / 1000;
  const wet = 0.3 * w.rain;
  if (wet > 0 || w.fog > 0) {
    for (let y = 0; y < vh; y++) {
      for (let x = 0; x < vw; x++) {
        const gx = x + view.x, gy = y + view.y;
        const o = (y * vw + x) * 4;
        if (wet > 0 && depthAt(gx, gy) === 0) toward(d, o, WET, wet);
        // Fog lies over land and sea alike, in slow banks, the same wherever the map ends.
        if (w.fog > 0) toward(d, o, FOG, w.fog * (0.55 + 0.25 * noise((gx + t * 2) / 60, gy / 34)));
      }
    }
  }
  if (w.rain > 0) {
    // Streaks falling with the wind, to the right like the gusts: short in rain, long in a storm.
    const streaks = Math.floor((w.rain * vw * vh) / 70);
    const len = 3 + Math.round(5 * w.storm);
    const slant = 0.15 + 1.1 * w.wind;
    // Steps of at most a pixel either way, so a steep or flat streak stays one unbroken line.
    const step = 1 / Math.max(1, slant);
    for (let k = 0; k < streaks; k++) {
      const speed = 160 + 80 * hash(k, 3);
      const span = vh + len + 8;
      const y0 = ((t * speed + hash(k, 4) * span) % span) - len;
      // Drops drift with the wind, to the right like the gusts, along the line their streak draws.
      const x0 = hash(k, 5) * (vw + vh * slant) - vh * slant + y0 * slant;
      for (let n = 0; n < len; n += step) {
        const x = Math.floor(x0 - n * slant), y = Math.floor(y0 - n);
        if (x >= 0 && y >= 0 && x < vw && y < vh) toward(d, (y * vw + x) * 4, RAIN, 0.5);
      }
    }
  }
  // Gusts: thin pale lines blown across, only in dry weather, so they are never taken for rain.
  if (airOf(w) > 0.4 && w.rain === 0) {
    const gusts = Math.floor(((airOf(w) - 0.4) * vw * vh) / 2500);
    for (let k = 0; k < gusts; k++) {
      const speed = 120 + 80 * hash(k, 6);
      const span = vw + 40;
      const x0 = ((t * speed + hash(k, 7) * span) % span) - 20;
      const y = Math.floor(hash(k, 8) * vh + Math.sin(t * 3 + k) * 2);
      const len = 3 + Math.floor(hash(k, 9) * 5);
      for (let n = 0; n < len; n++) {
        const x = Math.floor(x0) - n;
        if (x >= 0 && y >= 0 && x < vw && y < vh) toward(d, (y * vw + x) * 4, RING, 0.3 * (1 - n / len));
      }
    }
  }
}
