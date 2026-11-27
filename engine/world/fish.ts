// Fish under the water: small fish that wander where it is deep enough, turning back before
// the shallows. They are drawn on the ground image with the water over them, like decor, so they
// never cover the beach, waves or anything standing.
import { PALETTE, type PaletteKey } from '../core/palette.ts';
import { heightAt, inside, waterOf, type HeightMap } from './terrain.ts';

export interface Fish {
  /** Where it is, in metres from the north corner of the map. */
  i: number;
  j: number;
  /** Heading in radians on the map. */
  a: number;
  /** How fast it turns now, radians a second; it drifts so the path wanders. */
  turn: number;
  /** Metres a second. */
  speed: number;
  /** Which kind of fish, by its colours (see `fishPixels`). */
  kind: number;
}

/** Fish keep to water at least this many levels deep. */
export const FISH_DEPTH = 0.4;
const SPEED = [0.35, 0.7] as const;

/** Whether a fish may be at a map point. */
export const swimmable = (map: HeightMap, i: number, j: number) =>
  inside(map, Math.floor(i), Math.floor(j)) && waterOf(map) - heightAt(map, i, j) >= FISH_DEPTH;

/** Up to `count` fish at random spots deep enough for them. */
export function spawnFish(map: HeightMap, count: number, random: () => number): Fish[] {
  const out: Fish[] = [];
  for (let tries = 0; out.length < count && tries < count * 200; tries++) {
    const i = random() * map.w;
    const j = random() * map.h;
    if (!swimmable(map, i, j)) continue;
    out.push({ i, j, a: random() * Math.PI * 2, turn: 0, speed: SPEED[0] + random() * (SPEED[1] - SPEED[0]), kind: Math.floor(random() * KINDS.length) });
  }
  return out;
}

/** Moves every fish on by `dt` seconds: wandering, and turning away where the water ends. */
export function swim(fish: Fish[], map: HeightMap, dt: number, random: () => number): void {
  for (const f of fish) {
    f.turn += (random() - 0.5) * 6 * dt;
    f.turn *= Math.exp(-dt);
    f.a += f.turn * dt;
    const ahead = 0.6;
    if (!swimmable(map, f.i + Math.cos(f.a) * ahead, f.j + Math.sin(f.a) * ahead)) {
      // Turn the way that is open, or around.
      const left = swimmable(map, f.i + Math.cos(f.a - 1) * ahead, f.j + Math.sin(f.a - 1) * ahead);
      f.a += left ? -3 * dt : 3 * dt;
      if (!swimmable(map, f.i + Math.cos(f.a) * 0.1, f.j + Math.sin(f.a) * 0.1)) continue;
    }
    f.i += Math.cos(f.a) * f.speed * dt;
    f.j += Math.sin(f.a) * f.speed * dt;
  }
}

// ------------------------------------------------------------------ the picture

/**
 * A fish is drawn like the animals: a small 3D body in the 2:1 view, lit from the upper left in the
 * palette's three tones, no outline. The body is an egg tapering to the tail, with a back fin and a
 * forked tail fin that swings as it swims. Sizes are in pixels.
 */
const BODY = { front: 4.8, back: 5.2, wide: 1.5, high: 2.4 };
/** Each kind of fish: its back, its belly and its fins. */
const KINDS: { back: PaletteKey; belly: PaletteKey; fin: PaletteKey }[] = [
  { back: 'navy', belly: 'steel', fin: 'blue' }, // a mackerel
  { back: 'green', belly: 'lime', fin: 'teal' }, // a wrasse
  { back: 'red', belly: 'orange', fin: 'orange' }, // a snapper
];
type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** Light from the upper left and a little from the front, as on the animals; in screen axes (right, up, toward the viewer). */
const LIGHT = unit([-0.55, 0.75, 0.35]);
/** The view looks down 30 degrees, which is what makes the ground 2:1. */
const DOWN = Math.PI / 6;

export type Pixel = { x: number; y: number; color: string };
const drawn = new Map<string, Pixel[]>();

/**
 * The pixels of a fish relative to its middle, heading `dir` eighths of a turn round the map from
 * +i (screen lower right; 2 is +j, lower left), its tail swung by `frame`, in the colours of `kind`.
 */
export function fishPixels(frame: number, dir: number, kind = 0): Pixel[] {
  dir = ((dir % 8) + 8) % 8;
  const swing = [0, 1, 0, -1][frame % 4];
  const key = `${dir}|${swing}|${kind % KINDS.length}`;
  let out = drawn.get(key);
  if (!out) drawn.set(key, (out = drawFish(dir, swing, KINDS[kind % KINDS.length])));
  return out;
}

function drawFish(dir: number, swing: number, colors: (typeof KINDS)[number]): Pixel[] {
  // The fish's axes on the map (forward, left) in screen terms: map +i is screen (1, 1/2), +j is (-1, 1/2),
  // so a map direction (di, dj) runs (di - dj) to the right and (di + dj) / 2 toward the viewer, unscaled across.
  const a = (dir * Math.PI) / 4;
  const across = (di: number, dj: number) => (di - dj) / Math.SQRT2;
  const toward = (di: number, dj: number) => (di + dj) / Math.SQRT2;
  const fwd = [across(Math.cos(a), Math.sin(a)), toward(Math.cos(a), Math.sin(a))];
  const side = [across(-Math.sin(a), Math.cos(a)), toward(-Math.sin(a), Math.cos(a))];
  /** A point of the fish (forward, side, up) as screen right, screen down and nearness to the viewer. */
  const project = (f: number, s: number, u: number) => {
    const r = f * fwd[0] + s * side[0];
    const t = f * fwd[1] + s * side[1];
    return { x: r, y: t * Math.sin(DOWN) - u * Math.cos(DOWN), near: t * Math.cos(DOWN) + u * Math.sin(DOWN) };
  };
  /** A direction of the fish in the screen axes the light is given in. */
  const toScreen = (f: number, s: number, u: number): V3 => {
    const p = project(f, s, u);
    return [p.x, -p.y, p.near];
  };
  const depth = new Map<string, { near: number; color: string }>();
  const plot = (f: number, s: number, u: number, normal: V3, role: 'back' | 'belly' | 'fin') => {
    const p = project(f, s, u);
    const k = `${Math.floor(p.x)},${Math.floor(p.y)}`;
    const was = depth.get(k);
    if (was && was.near >= p.near) return;
    const n = toScreen(...normal);
    // A fin is thin: lit from whichever side faces the viewer.
    const lit = dot(n[2] < 0 && role === 'fin' ? [-n[0], -n[1], -n[2]] : n, LIGHT);
    const tone = lit > 0.55 ? 'light' : lit > 0 ? 'base' : 'shade';
    depth.set(k, { near: p.near, color: PALETTE[colors[role]][tone] });
  };
  const STEP = 0.25;
  // The tail bends with the swing, more the further back.
  const bend = (f: number) => (f < 0 ? swing * 0.35 * (f / BODY.back) ** 2 * BODY.back : 0);
  for (let f = -BODY.back; f <= BODY.front; f += STEP) {
    const long = f >= 0 ? f / BODY.front : f / BODY.back;
    // Slimmer toward the tail than the head.
    const taper = f >= 0 ? 1 : 1 - 0.55 * long * long;
    const ring = Math.sqrt(Math.max(0, 1 - long * long)) * taper;
    for (let s = -BODY.wide; s <= BODY.wide; s += STEP) for (let u = -BODY.high; u <= BODY.high; u += STEP) {
      const q = (s / (BODY.wide * ring || 1)) ** 2 + (u / (BODY.high * ring || 1)) ** 2;
      if (ring <= 0 || q > 1) continue;
      const normal = unit([long / BODY.front, s / BODY.wide ** 2, u / BODY.high ** 2]);
      plot(f, s + bend(f), u, normal, u < -0.5 * BODY.high * ring ? 'belly' : 'back');
    }
  }
  // The back fin, a low ridge over the middle of the back.
  for (let f = -1.5; f <= 1.2; f += STEP) for (let u = 0; u <= 1.2 * (1 - Math.abs(f + 0.2) / 1.5); u += STEP) {
    plot(f, bend(f), BODY.high * 0.95 + u, [0, 1, 0], 'fin');
  }
  // The tail fin: two lobes spreading back from the stalk, a notch between them.
  for (let f = -BODY.back - 2.6; f <= -BODY.back + 0.4; f += STEP) {
    const spread = 0.4 + (-BODY.back + 0.4 - f) * 0.75;
    for (let u = -spread; u <= spread; u += STEP) {
      if (f < -BODY.back - 1.4 && Math.abs(u) < 0.6) continue;
      plot(f, bend(f) + swing * 0.3, u, [0, 1, 0], 'fin');
    }
  }
  // The eyes, a dark pixel each side of the head where it is seen.
  for (const side3 of [-1, 1]) {
    const f = BODY.front * 0.55, u = BODY.high * 0.2;
    const ring = Math.sqrt(1 - 0.55 * 0.55);
    const s = side3 * BODY.wide * ring * 0.95;
    const p = project(f, s, u);
    const k = `${Math.floor(p.x)},${Math.floor(p.y)}`;
    const at = depth.get(k);
    if (at && at.near <= p.near + 0.3) at.color = PALETTE.ink.base;
  }
  return [...depth].map(([k, v]) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y, color: v.color };
  });
}
