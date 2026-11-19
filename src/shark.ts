// Sharks in the deep water round the island. All that is ever seen of one is its dorsal fin cutting
// the surface: a thin plate laid out in 3D (forward, side, up; pixels, 0 up is the water) and seen
// in the 2:1 view from any of 8 headings, like the fish and the crabs. They keep to water deep
// enough to hide the body, turn away from the shallows, and are the reason the survivor cannot
// simply swim off the island.
import { PALETTE } from '@pixel/engine/core/palette.ts';
import type { Pixel } from '@pixel/engine/world/fish.ts';
import type { Picture } from '@pixel/engine/world/island.ts';
import { heightAt, inside, SEA_LEVEL, type HeightMap } from '@pixel/engine/world/terrain.ts';
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
}

/** Sharks keep to water at least this many levels deep: out past the shallows, where fish swim. */
export const SHARK_DEPTH = 1.6;
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
    out.push({ i, j, a: random() * Math.PI * 2, turn: 0, speed: SPEED[0] + random() * (SPEED[1] - SPEED[0]) });
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
const GREY = PALETTE.grey;
type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** Light from the upper left and a little from the front, in screen axes (right, up, toward the viewer). */
const LIGHT = unit([-0.55, 0.75, 0.35]);

/**
 * The pixels of a fin on a shark heading `dir` eighths of a turn round the map from +i (screen lower
 * right; 2 is +j, lower left), relative to the point where it cuts the water.
 */
function drawFin(dir: number): Pixel[] {
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
  const depth = new Map<string, { near: number; color: string }>();
  const plot = (f: number, s: number, u: number, normal: V3, tone?: 'light' | 'shade') => {
    const p = project(f, s, u);
    const k = `${Math.floor(p.x)},${Math.floor(p.y)}`;
    const was = depth.get(k);
    if (was && was.near >= p.near) return;
    // A fin is thin: whichever of its two faces is toward the viewer is the one the light falls on.
    const n = toScreen(...normal);
    const lit = dot(n[2] < 0 ? [-n[0], -n[1], -n[2]] : n, LIGHT);
    depth.set(k, { near: p.near, color: GREY[tone ?? (lit > 0.55 ? 'light' : lit > 0 ? 'base' : 'shade')] });
  };
  const STEP = 0.25;
  /** The fin's outline at height `u`: the leading edge sweeping back, the trailing edge hollow, a point at the top. */
  const edges = (u: number) => {
    const k = u / FIN.high;
    return { front: FIN.front - (FIN.front + 2.2) * Math.pow(k, 0.75), back: -FIN.back + (FIN.back - 2.4) * k * k };
  };
  // Both faces lie flat along the swimming line, so the whole blade takes the light as one (as the fish's fins do).
  const FACE: V3 = [0, 1, 0];
  for (let u = 0; u <= FIN.high; u += STEP) {
    const { front, back } = edges(u);
    if (front < back) continue;
    const thick = FIN.thick * (1 - u / FIN.high) + 0.15;
    // The blade is not flat: it curves over to one side toward the tip, so even end on it is a fin and not a post.
    const lean = FIN.lean * (u / FIN.high) ** 2;
    for (let f = back; f <= front; f += STEP) for (let s = -thick; s <= thick; s += STEP) {
      // Only the very tip is picked out lighter; the rest of the blade is one tone, a dark shape on the water.
      plot(f, s + lean, u, FACE, u > FIN.high - STEP * 1.5 ? 'light' : undefined);
    }
  }
  return [...depth].map(([k, v]) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y, color: v.color };
  });
}

interface Art { picture: Picture; w: number; h: number; foot: { x: number; y: number } }
const arts = new Map<number, Art>();
function artOf(dir: number): Art {
  let art = arts.get(dir);
  if (!art) {
    const px = drawFin(dir);
    const x0 = Math.min(...px.map((p) => p.x)), y0 = Math.min(...px.map((p) => p.y));
    const w = Math.max(...px.map((p) => p.x)) - x0 + 1, h = Math.max(...px.map((p) => p.y)) - y0 + 1;
    const grid = new Map(px.map((p) => [(p.y - y0) * w + p.x - x0, p.color]));
    art = { picture: { get: (x, y) => (x < 0 || x >= w ? null : (grid.get(y * w + x) ?? null)) }, w, h, foot: { x: -x0, y: -y0 } };
    arts.set(dir, art);
  }
  return art;
}

/** A shark's fin to draw: standing on the water where it swims, rising and dipping a little as it goes. */
export function finThing(s: Shark, ms: number): Thing {
  const dir = ((Math.round(s.a / (Math.PI / 4)) % 8) + 8) % 8;
  const art = artOf(dir);
  // A slow swell: the fin shows a touch more, then a touch less.
  const bob = Math.sin(ms / 900 + s.i + s.j) * 0.04;
  return { ...art, spot: { i: s.i, j: s.j, level: SEA_LEVEL + bob } };
}
