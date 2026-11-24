// Crabs on the beach and in the shallows. Each walks up out of the deep water first; then they
// scuttle sideways, rest, freeze when someone comes near and run off sideways when they come too near. Seen from 8 headings like the animals, and
// covered by the water as deep as they walk, like a wading character.
import { darker, PALETTE } from '../core/palette.ts';
import { wading } from './actor.ts';
import type { Pixel } from './fish.ts';
import { footOf, type Picture } from './island.ts';
import { heightAt, inside, LEVEL_PX, standingHeight, surfaceAt, waterOf } from './terrain.ts';
import type { Thing, World } from './world.ts';

export interface Crab {
  /** Where it is, in metres on the map (view coordinates). */
  i: number;
  j: number;
  /** Which way its eyes look, radians on the map; it walks at right angles to this. */
  a: number;
  /** Walking to its left (1), its right (-1), or standing (0). */
  walk: number;
  /** Seconds until it decides again. */
  until: number;
  /** Running away: as fast as it can, until `until`. */
  fleeing: boolean;
  /** Where it is walking up out of the deep to, minding nothing else on the way; gone once it is there. */
  ashore?: { i: number; j: number };
}

/** Metres: it freezes when someone is this near, and runs when nearer still. */
export const CRAB_FREEZE = 2;
export const CRAB_FLEE = 1;
/** Metres a second, ambling and running. */
const SPEED = { walk: 0.35, run: 1.4 };
/** The deepest water a crab walks in, in levels. */
const DEPTH = 1.5;

/** Whether a crab may be at a map point: the beach, sand, or water not too deep. */
export function crabby(world: World, i: number, j: number): boolean {
  if (!inside(world.map, Math.floor(i), Math.floor(j))) return false;
  const s = surfaceAt(world.map, Math.floor(i), Math.floor(j));
  return (s === 'beach' || s === 'sand' || s === 'shallow') && waterOf(world.floor) - heightAt(world.floor, i, j) <= DEPTH;
}

/** How deep, in levels, the water is where a crab starts its walk up the beach: deep enough to hide it all but faintly. */
const FROM_DEEP = 2.8;
/** How far out, in metres, a crab may start from the spot it walks to. */
const FROM_FAR = 8;

/**
 * A crab coming up out of the deep water to a random spot it may be, or null if none was found.
 * It starts out where the water is deep and walks straight in, so the way there is open sea floor.
 */
export function spawnCrab(world: World, random: () => number): Crab | null {
  for (let tries = 0; tries < 400; tries++) {
    const i = random() * world.map.w, j = random() * world.map.h;
    if (!crabby(world, i, j)) continue;
    const out = random() * Math.PI * 2;
    for (let r = 0.5; r <= FROM_FAR; r += 0.25) {
      const si = i + Math.cos(out) * r, sj = j + Math.sin(out) * r;
      if (!inside(world.floor, Math.floor(si), Math.floor(sj)) || heightAt(world.floor, si, sj) >= waterOf(world.floor)) break;
      if (waterOf(world.floor) - heightAt(world.floor, si, sj) < FROM_DEEP) continue;
      // Walking to its left toward the shore: its eyes look 90 degrees right of the way in.
      return { i: si, j: sj, a: out + Math.PI / 2, walk: 1, until: 0, fleeing: false, ashore: { i, j } };
    }
  }
  return null;
}

/** Sends a crab running from a point, sideways as crabs do. */
export function scare(c: Crab, from: { i: number; j: number }): void {
  const away = Math.atan2(c.j - from.j, c.i - from.i);
  // Walking to its left is heading a + 90 degrees, so face 90 degrees right of away.
  c.a = away - Math.PI / 2;
  c.walk = 1;
  c.fleeing = true;
  c.until = 1.5;
}

/** Moves every crab on by `dt` seconds, minding `near` (the character), if there is one. */
export function scuttle(crabs: Crab[], world: World, dt: number, random: () => number, near: { i: number; j: number } | null): void {
  for (const c of crabs) {
    if (c.ashore) {
      const left = Math.hypot(c.ashore.i - c.i, c.ashore.j - c.j);
      const step = Math.min(left, SPEED.walk * dt);
      const h = Math.atan2(c.ashore.j - c.j, c.ashore.i - c.i);
      c.i += Math.cos(h) * step;
      c.j += Math.sin(h) * step;
      if (left - step < 0.05) [c.ashore, c.walk, c.until] = [undefined, 0, 1];
      continue;
    }
    const d = near ? Math.hypot(c.i - near.i, c.j - near.j) : Infinity;
    c.until -= dt;
    if (near && d < CRAB_FLEE && !c.fleeing) scare(c, near);
    else if (c.fleeing && c.until <= 0) c.fleeing = false;
    if (!c.fleeing && d < CRAB_FREEZE) c.walk = 0;
    else if (!c.fleeing && c.until <= 0) {
      // Rest a while, or amble a little to one side, turning a bit now and then.
      c.walk = random() < 0.45 ? 0 : random() < 0.5 ? 1 : -1;
      if (random() < 0.3) c.a += (random() - 0.5) * Math.PI;
      c.until = c.walk ? 0.5 + random() * 1.5 : 1 + random() * 4;
    }
    if (!c.walk) continue;
    const h = c.a + (c.walk * Math.PI) / 2;
    const step = (c.fleeing ? SPEED.run : SPEED.walk) * dt;
    const to = { i: c.i + Math.cos(h) * step, j: c.j + Math.sin(h) * step };
    if (crabby(world, to.i, to.j) && world.canWalk(c, to)) Object.assign(c, to);
    // Blocked: the other way, or stop if it was running.
    else if (c.fleeing) c.walk = -c.walk;
    else [c.walk, c.until] = [0, 1];
  }
}

// ------------------------------------------------------------------ the picture

/**
 * A crab is laid out in 3D (forward toward the eyes, left, up; pixels; 0 up is the ground) and seen
 * in the 2:1 view from any of 8 headings, but drawn crisply as pixel art: a small lit dome of a shell,
 * legs and claw arms as one-pixel lines, claws as a fixed little stamp, eyes one black pixel each on
 * stalks. Parts are drawn far to near, so the far legs go behind the shell.
 */
const DOWN = Math.PI / 6;
type P3 = [number, number, number];
/** The shell, as an ellipsoid: middle height and its three radii. */
const SHELL = { u: 2.6, f: 2.6, s: 4.2, h: 1.4 };
/** A claw from above: two orange fingers over a red palm. */
const CLAW = ['O.O', 'RRR'];

function drawCrab(dir: number, step: number): Pixel[] {
  const a = (dir * Math.PI) / 4;
  // The model's axes on screen: map +i is screen (1, 1/2), +j is (-1, 1/2).
  const fwd = [(Math.cos(a) - Math.sin(a)) / Math.SQRT2, (Math.cos(a) + Math.sin(a)) / Math.SQRT2];
  const side = [(-Math.sin(a) - Math.cos(a)) / Math.SQRT2, (-Math.sin(a) + Math.cos(a)) / Math.SQRT2];
  const project = ([f, s, u]: P3) => {
    const t = f * fwd[1] + s * side[1];
    return { x: f * fwd[0] + s * side[0], y: t * Math.sin(DOWN) - u * Math.cos(DOWN), near: t * Math.cos(DOWN) + u * Math.sin(DOWN) };
  };
  const red = PALETTE.red;
  const colors: Record<string, string> = { R: red.base, O: PALETTE.orange.base };
  const leg = darker(red.shade);
  const out = new Map<string, string>();
  const put = (x: number, y: number, color: string) => out.set(`${Math.round(x)},${Math.round(y)}`, color);
  /** A one-pixel line through points. */
  const line = (pts: P3[], color: string) => {
    for (let k = 1; k < pts.length; k++) {
      const [p, q] = [project(pts[k - 1]), project(pts[k])];
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y))));
      for (let t = 0; t <= n; t++) put(p.x + ((q.x - p.x) * t) / n, p.y + ((q.y - p.y) * t) / n, color);
    }
  };
  const parts: { near: number; draw: () => void }[] = [];
  const part = (at: P3, draw: () => void) => parts.push({ near: project(at).near, draw });
  part([0, 0, SHELL.u], () => {
    // Lit from above: the top light, the sides red, the underside shaded; nearer points win.
    const shell = new Map<string, { near: number; color: string }>();
    for (let f = -SHELL.f; f <= SHELL.f; f += 0.2) for (let s = -SHELL.s; s <= SHELL.s; s += 0.2) for (let u = -SHELL.h; u <= SHELL.h; u += 0.2) {
      const q = (f / SHELL.f) ** 2 + (s / SHELL.s) ** 2 + (u / SHELL.h) ** 2;
      if (q > 1) continue;
      const p = project([f, s, SHELL.u + u]);
      const k = `${Math.round(p.x)},${Math.round(p.y)}`;
      const was = shell.get(k);
      if (was && was.near >= p.near) continue;
      shell.set(k, { near: p.near, color: u > 0.45 * SHELL.h ? red.light : u > -0.3 * SHELL.h ? red.base : red.shade });
    }
    for (const [k, v] of shell) out.set(k, v.color);
  });
  for (const sd of [-1, 1]) {
    // Hip, knee and foot forward of the middle: the legs fan out, so seen end on they stay apart.
    [[-1.4, -2.4, -3.6], [-0.2, -0.4, -0.8], [1, 1.6, 2.2]].forEach(([hip, knee, foot], n) => {
      // Legs on alternate sides and places lift together. Knees high, feet wide: a crab's outline.
      const up = step && n % 2 === (sd > 0 ? 0 : 1) ? 1 : 0;
      part([knee, sd * 6, 2], () => line([[hip, sd * 3.6, 2.2], [knee, sd * 6, 3.6 + up], [foot, sd * 7.2, up]], leg));
    });
    // A claw held up in front on its arm.
    const claw: P3 = [4.2, sd * 3, 3.4];
    part(claw, () => {
      line([[1.8, sd * 2.2, 2.4], claw], red.shade);
      const c = project(claw);
      CLAW.forEach((row, y) => [...row].forEach((ch, x) => colors[ch] && put(c.x + x - 1, c.y + y - 1, colors[ch])));
    });
    // An eye on a stalk.
    const eye: P3 = [2.4, sd * 1.4, 6.2];
    part(eye, () => {
      line([[2.2, sd * 1.3, 3.8], eye], red.shade);
      const e = project(eye);
      put(e.x, e.y, PALETTE.ink.base);
    });
  }
  parts.sort((p, q) => p.near - q.near).forEach((p) => p.draw());
  return [...out].map(([k, color]) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y, color };
  });
}

/** The pixels of a crab heading `dir` eighths of a turn round the map from +i, in leg step `step`; for a bag or a menu. */
export const crabPixels = (dir: number, step = 0) => drawCrab(((dir % 8) + 8) % 8, step % 2);

interface Art { picture: Picture; w: number; h: number; foot: { x: number; y: number } }
const arts = new Map<string, Art>();
const wet = new Map<string, Picture>();

function artOf(dir: number, step: number): Art {
  const key = `${dir}|${step}`;
  let art = arts.get(key);
  if (!art) {
    const px = crabPixels(dir, step);
    const x0 = Math.min(...px.map((p) => p.x)), y0 = Math.min(...px.map((p) => p.y));
    const w = Math.max(...px.map((p) => p.x)) - x0 + 1, h = Math.max(...px.map((p) => p.y)) - y0 + 1;
    const grid = new Map(px.map((p) => [(p.y - y0) * w + p.x - x0, p.color]));
    art = { picture: { get: (x, y) => (x < 0 || x >= w ? null : (grid.get(y * w + x) ?? null)) }, w, h, foot: { x: -x0, y: -y0 } };
    arts.set(key, art);
  }
  return art;
}

/** How deep, in levels, the water a crab stands in is. */
const depthOf = (world: World, c: Crab) => Math.max(0, waterOf(world.floor) - heightAt(world.floor, c.i, c.j));

/** A crab to draw: on land on the ground, in the water on the sea floor and covered as deep as it is. */
export function crabThing(world: World, c: Crab, ms: number): Thing {
  const dir = ((Math.round(c.a / (Math.PI / 4)) % 8) + 8) % 8;
  const step = c.walk ? Math.floor(ms / (c.fleeing ? 60 : 130)) % 2 : 0;
  const art = artOf(dir, step);
  const depth = depthOf(world, c);
  if (depth <= 0) return { ...art, spot: { i: c.i, j: c.j, level: standingHeight(world.map, c.i, c.j) } };
  const rows = Math.round(depth * LEVEL_PX);
  const key = `${dir}|${step}|${rows}`;
  let picture = wet.get(key);
  if (!picture) wet.set(key, (picture = wading(art.picture, rows, art.foot.y)));
  return { ...art, picture, spot: { i: c.i, j: c.j, level: waterOf(world.floor) - depth } };
}

/** The crab nearest a pixel of the ground image, within `r` pixels of the middle of its picture, if any. */
export function crabAt(world: World, crabs: Crab[], p: { x: number; y: number }, r: number): Crab | null {
  let best: Crab | null = null;
  let bestD = r;
  for (const c of crabs) {
    const at = footOf(world.ground, crabThing(world, c, 0).spot);
    const d = Math.hypot(p.x - at.x, p.y - (at.y - 2));
    if (d <= bestD) [best, bestD] = [c, d];
  }
  return best;
}
