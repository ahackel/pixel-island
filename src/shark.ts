// Sharks in the deep water round the island. All that is ever seen of one is its dorsal fin cutting
// the surface: a thin plate laid out in 3D (forward, side, up; pixels, 0 up is the water) and seen
// in the 2:1 view from any of 8 headings, like the fish and the crabs. They keep to water deep
// enough to hide the body, turn away from the shallows, and are the reason the survivor cannot
// simply swim off the island. Below the water the blade widens toward the body and fades into the
// blue, with a light line where it cuts the surface; now and then a shark sinks out of sight a while.
import { PALETTE } from '@pixel/engine/core/palette.ts';
import { tint } from '@pixel/engine/world/actor.ts';
import { ocean, rgb } from '@pixel/engine/world/ocean.ts';
import type { Pixel } from '@pixel/engine/world/fish.ts';
import type { Picture } from '@pixel/engine/world/island.ts';
import { heightAt, inside, LEVEL_PX, SEA_LEVEL, type HeightMap } from '@pixel/engine/world/terrain.ts';
import type { Thing } from '@pixel/engine/world/world.ts';

export interface Shark {
  /** Where it is, in metres on the map (view coordinates). */
  i: number;
  j: number;
  /** Heading in radians on the map. */
  a: number;
  /** How fast it turns now, radians a second; it drifts, so the circling wanders. */
  turn: number;
  /** Metres a second. */
  speed: number;
  /** Where in its round of diving and surfacing it is, 0 to 1, so they do not all dive at once. */
  phase: number;
}

/** Sharks keep to water at least this many levels deep: the dark blue open sea, past where fish swim. */
export const SHARK_DEPTH = 2.8;
const SPEED = [0.5, 0.8] as const;
/** How far ahead a shark looks for the shallows, in metres: a wide turn, not a fish's flick. */
const AHEAD = 1.6;

/** Whether a shark may be at a map point. */
export const sharky = (map: HeightMap, i: number, j: number) =>
  inside(map, Math.floor(i), Math.floor(j)) && SEA_LEVEL - heightAt(map, i, j) >= SHARK_DEPTH;

/** Up to `count` sharks at random spots deep enough for them. */
export function spawnSharks(map: HeightMap, count: number, random: () => number): Shark[] {
  const out: Shark[] = [];
  for (let tries = 0; out.length < count && tries < count * 300; tries++) {
    const i = random() * map.w;
    const j = random() * map.h;
    if (!sharky(map, i, j)) continue;
    out.push({ i, j, a: random() * Math.PI * 2, turn: 0, speed: SPEED[0] + random() * (SPEED[1] - SPEED[0]), phase: random() });
  }
  return out;
}

/** Moves every shark on by `dt` seconds: a slow drift of a turn, and a wide one away from the shallows. */
export function cruise(sharks: Shark[], map: HeightMap, dt: number, random: () => number): void {
  for (const s of sharks) {
    s.turn += (random() - 0.5) * 1.6 * dt;
    s.turn *= Math.exp(-dt);
    s.a += s.turn * dt;
    if (!sharky(map, s.i + Math.cos(s.a) * AHEAD, s.j + Math.sin(s.a) * AHEAD)) {
      // Turn whichever way is open, or around.
      const left = sharky(map, s.i + Math.cos(s.a - 1) * AHEAD, s.j + Math.sin(s.a - 1) * AHEAD);
      s.a += left ? -2 * dt : 2 * dt;
      if (!sharky(map, s.i + Math.cos(s.a) * 0.2, s.j + Math.sin(s.a) * 0.2)) continue;
    }
    s.i += Math.cos(s.a) * s.speed * dt;
    s.j += Math.sin(s.a) * s.speed * dt;
  }
}

/** The nearest shark to a map point, within `r` metres, if any. */
export function sharkNear(sharks: readonly Shark[], at: { i: number; j: number }, r: number): Shark | null {
  let best: Shark | null = null;
  let bestD = r;
  for (const s of sharks) {
    const d = Math.hypot(s.i - at.i, s.j - at.j);
    if (d <= bestD) [best, bestD] = [s, d];
  }
  return best;
}

// ------------------------------------------------------------------ the picture

/** The view looks down 30 degrees, which is what makes the ground 2:1 (as in the engine's fish and crabs). */
const DOWN = Math.PI / 6;
/** The fin: how far it reaches forward and back at the water, how tall, and how thick at its foot. */
const FIN = { front: 2.2, back: 3.2, high: 8, thick: 0.7, lean: 1 };
/** Pixels under the line over which the blade fades into the water: some way, so there seems more of it below. */
const FADE = 7;
/** A round of diving, in seconds: how long all told, and how long of it spent under and going down or up. */
const DIVE = { round: 45, under: 9, sink: 2.5 };
const GREY = PALETTE.grey;
type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** Light from the upper left and a little from the front, in screen axes (right, up, toward the viewer). */
const LIGHT = unit([-0.55, 0.75, 0.35]);
const NIGHT = [24, 32, 48];

/**
 * The pixels of a fin on a shark heading `dir` eighths of a turn round the map from +i (screen lower
 * right; 2 is +j, lower left), relative to the point where it cuts the water.
 */
function drawFin(dir: number): (Pixel & { u: number })[] {
  const a = (dir * Math.PI) / 4;
  // The fin's axes on the map in screen terms: map +i is screen (1, 1/2), +j is (-1, 1/2).
  const across = (di: number, dj: number) => (di - dj) / Math.SQRT2;
  const toward = (di: number, dj: number) => (di + dj) / Math.SQRT2;
  const fwd = [across(Math.cos(a), Math.sin(a)), toward(Math.cos(a), Math.sin(a))];
  const side = [across(-Math.sin(a), Math.cos(a)), toward(-Math.sin(a), Math.cos(a))];
  const project = (f: number, s: number, u: number) => {
    const r = f * fwd[0] + s * side[0];
    const t = f * fwd[1] + s * side[1];
    return { x: r, y: t * Math.sin(DOWN) - u * Math.cos(DOWN), near: t * Math.cos(DOWN) + u * Math.sin(DOWN) };
  };
  /** A direction of the fin in the screen axes the light is given in. */
  const toScreen = (f: number, s: number, u: number): V3 => {
    const p = project(f, s, u);
    return [p.x, -p.y, p.near];
  };
  const depth = new Map<string, { near: number; color: string; u: number }>();
  const plot = (f: number, s: number, u: number, normal: V3, tone?: 'light' | 'shade') => {
    const p = project(f, s, u);
    const k = `${Math.floor(p.x)},${Math.floor(p.y)}`;
    const was = depth.get(k);
    if (was && was.near >= p.near) return;
    // A fin is thin: whichever of its two faces is toward the viewer is the one the light falls on.
    const n = toScreen(...normal);
    const lit = dot(n[2] < 0 ? [-n[0], -n[1], -n[2]] : n, LIGHT);
    depth.set(k, { near: p.near, color: GREY[tone ?? (lit > 0.55 ? 'light' : lit > 0 ? 'base' : 'shade')], u });
  };
  const STEP = 0.25;
  /** The fin's outline at height `u`: the leading edge sweeping back, the trailing edge hollow, a point at the top. */
  const edges = (u: number) => {
    const k = u / FIN.high;
    return { front: FIN.front - (FIN.front + 2.2) * Math.pow(k, 0.75), back: -FIN.back + (FIN.back - 2.4) * k * k };
  };
  // Both faces lie flat along the swimming line, so the whole blade takes the light as one (as the fish's fins do).
  const FACE: V3 = [0, 1, 0];
  // Below its foot the blade goes on down and widens toward the back it stands on; the water hides how far.
  for (let u = -FADE; u <= FIN.high; u += STEP) {
    const e = edges(Math.max(0, u));
    const front = e.front - Math.min(0, u) * 0.3, back = e.back + Math.min(0, u) * 0.6;
    if (front < back) continue;
    const thick = FIN.thick * (1 - Math.max(0, u) / FIN.high) + 0.15;
    // The blade is not flat: it curves over to one side toward the tip, so even end on it is a fin and not a post.
    const lean = FIN.lean * (Math.max(0, u) / FIN.high) ** 2;
    for (let f = back; f <= front; f += STEP) for (let s = -thick; s <= thick; s += STEP) {
      // Only the very tip is picked out lighter; the rest of the blade is one tone, a dark shape on the water.
      plot(f, s + lean, u, FACE, u > FIN.high - STEP * 1.5 ? 'light' : undefined);
    }
  }
  // A shade darker than the grey ramp, as a wet shark is.
  return [...depth].map(([k, v]) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y, color: tint(v.color, NIGHT, 0.3), u: v.u };
  });
}

interface Art { pixels: (Pixel & { u: number })[]; w: number; h: number; foot: { x: number; y: number }; x0: number; y0: number }
const arts = new Map<number, Art>();
function artOf(dir: number): Art {
  let art = arts.get(dir);
  if (!art) {
    const pixels = drawFin(dir);
    const x0 = Math.min(...pixels.map((p) => p.x)), y0 = Math.min(...pixels.map((p) => p.y));
    const w = Math.max(...pixels.map((p) => p.x)) - x0 + 1, h = Math.max(...pixels.map((p) => p.y)) - y0 + 1;
    art = { pixels, w, h, foot: { x: -x0, y: -y0 }, x0, y0 };
    arts.set(dir, art);
  }
  return art;
}

/**
 * The fin with the water `line` pixels up its blade, as a wading character: above it as it is, the
 * line itself light, below it bluer and more see-through until it is gone, `FADE` pixels down.
 */
const wet = new Map<string, Picture>();
function wetFin(dir: number, line: number): Picture {
  const key = `${dir}|${line}`;
  let picture = wet.get(key);
  if (!picture) {
    const art = artOf(dir);
    const sea = rgb(ocean.open), foam = rgb(ocean.wave);
    const grid = new Map<number, string>();
    for (const p of art.pixels) {
      const under = line - p.u;
      if (under >= FADE) continue;
      // Under the line: tinted by the water and fading out, so the real sea, waves and all, shows through more the deeper.
      const k = under / FADE;
      // 254 is the engine's mark for a glowing pixel, so the fade stops short of it.
      const alpha = Math.min(253, Math.round(255 * (1 - k) ** 1.5)).toString(16).padStart(2, '0');
      const color = under > 0 ? tint(p.color, sea, 0.25 + 0.35 * k) + alpha : under > -1 ? tint(p.color, foam, 0.55) : p.color;
      grid.set((p.y - art.y0) * art.w + p.x - art.x0, color);
    }
    const w = art.w;
    wet.set(key, (picture = { get: (x, y) => (x < 0 || x >= w ? null : (grid.get(y * w + x) ?? null)) }));
  }
  return picture;
}

/** How many pixels of the fin are under water at `ms`: a little swell, and now and then the whole of it, for a while. */
function sunk(s: Shark, ms: number): number {
  const t = ((ms / 1000 / DIVE.round + s.phase) % 1) * DIVE.round;
  const swell = Math.sin(ms / 900 + s.phase * 40);
  // Down over `sink` seconds, under, then up again; smoothstep so it eases in and out.
  const down = Math.min(1, t / DIVE.sink, (DIVE.under + 2 * DIVE.sink - t) / DIVE.sink);
  const k = t < DIVE.under + 2 * DIVE.sink ? down * down * (3 - 2 * down) : 0;
  return Math.round(swell + k * (FIN.high + FADE));
}

/** A shark's fin to draw: cutting the water where it swims, the line moving up and down its blade. */
export function finThing(s: Shark, ms: number): Thing {
  const dir = ((Math.round(s.a / (Math.PI / 4)) % 8) + 8) % 8;
  const art = artOf(dir);
  const line = sunk(s, ms);
  // The fin's foot sinks with it (a pixel up the blade is cos DOWN of one on screen), so the water stays at sea level.
  return { picture: wetFin(dir, line), w: art.w, h: art.h, foot: art.foot, spot: { i: s.i, j: s.j, level: SEA_LEVEL - (line * Math.cos(DOWN)) / LEVEL_PX } };
}
