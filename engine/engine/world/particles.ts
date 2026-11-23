// Particle systems: a few pixels thrown from a point of a thing (sparks off a fire, embers, motes), and the glow halo
// round that point. A system is plain data, edited in tools/particles and kept in the `pixel-particles` store (with a
// game's `src/content/store/pixel-particles.json` behind it); an asset attaches one at a point of its picture
// (`Thing.fx`, a tool item's `fx`). Particles live in ground pixels and are worked out from their age, so nothing is
// stepped, and they are drawn over the finished, lit picture, so they shine in the dark.
import { PALETTE, PALETTE_KEYS, type PaletteKey, type Tone } from '../core/palette.ts';
import { readStore, writeStore } from '../../shared/files.ts';
import { GLOW_ALPHA, GLOWING, light, TINTS, type Lamp } from './daylight.ts';
import { FLAME_COLORS, FLAME_GLOW, FLAMES, flameFrame, flicker, TORCH } from './flame.ts';
import { footOf, type Thing } from './island.ts';
export type { Attach } from './island.ts';
import { rgb } from './ocean.ts';
import type { TerrainImage } from './terrain.ts';
import type { TileLamp } from './world.ts';

/** A colour of the palette in one of its tones: particles are painted in the palette like everything else. */
export interface Paint { key: PaletteKey; tone: Tone }

export interface ParticleSystem {
  id: string;
  name: string;
  /** How many it throws a second. */
  rate: number;
  /** Where they start: this far from the point, in pixels, and up to `spread` either way at random. */
  offset: { x: number; y: number };
  spread: { x: number; y: number };
  /** How fast they set off, in pixels a second (negative y is up), and up to `jitter` faster or slower at random. */
  speed: { x: number; y: number };
  jitter: { x: number; y: number };
  /** How hard they are pulled down, in pixels a second squared; negative floats them up. */
  gravity: number;
  /** How far they sway from side to side, in pixels, and how fast (radians a second). */
  sway: { amount: number; speed: number };
  /** How long one lives, in milliseconds, shortest and longest; it fades out over its life. */
  life: { min: number; max: number };
  /** Each is one of these, picked at random. */
  colors: Paint[];
  /**
   * The light round the point, or none: how far it reaches in pixels in the open (see daylight.ts `light`), and in
   * tiles in a cave with how strong it is there, 0 to 1 (see `World.lightField`); whether it flickers like a flame,
   * and its colour (else a fire's orange).
   */
  halo: { r: number; tiles: number; amount: number; flicker: boolean; color?: Paint } | null;
}

export const PARTICLE_STORE = 'pixel-particles';

const fire = (tone: Tone = 'base'): Paint[] => (['blaze', 'flare', 'flame'] as const).map((key) => ({ key, tone }));
/** The engine's own systems, there in every game; a game's store adds to them and may change them. */
export const BUILT_IN: readonly ParticleSystem[] = [
  {
    id: 'sparks', name: 'Sparks', rate: 1.6, offset: { x: 0, y: -3 }, spread: { x: 3, y: 2 }, speed: { x: 0, y: -19 }, jitter: { x: 5, y: 7 },
    gravity: 0, sway: { amount: 1.2, speed: 9 }, life: { min: 500, max: 1000 }, colors: fire(), halo: { r: 40, tiles: 3, amount: 1, flicker: true },
  },
  {
    id: 'glow', name: 'Glow', rate: 0, offset: { x: 0, y: 0 }, spread: { x: 0, y: 0 }, speed: { x: 0, y: 0 }, jitter: { x: 0, y: 0 },
    gravity: 0, sway: { amount: 0, speed: 0 }, life: { min: 500, max: 1000 }, colors: fire(), halo: { r: 48, tiles: 4, amount: 1, flicker: false },
  },
];

// ------------------------------------------------------------------ the store

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const pair = <K extends string>(v: any, a: K, b: K, lo: number, hi: number) => ({ [a]: num(v?.[a], lo, hi, 0), [b]: num(v?.[b], lo, hi, 0) }) as Record<K, number>;
const paintOf = (v: any): Paint | null =>
  v && PALETTE_KEYS.includes(v.key) && ['base', 'shade', 'light'].includes(v.tone) ? { key: v.key, tone: v.tone } : null;

/** A system read back from storage or a file, checked and kept in range; null if it is not one. */
export function cleanSystem(v: any): ParticleSystem | null {
  if (!v || typeof v.id !== 'string' || !v.id) return null;
  const life = pair(v.life, 'min', 'max', 50, 10000);
  const halo = v.halo && typeof v.halo === 'object'
    ? { r: num(v.halo.r, 0, 200, 40), tiles: num(v.halo.tiles, 0, 12, 3), amount: num(v.halo.amount, 0, 1, 1), flicker: !!v.halo.flicker, ...(paintOf(v.halo.color) ? { color: paintOf(v.halo.color)! } : {}) }
    : null;
  return {
    id: v.id, name: typeof v.name === 'string' && v.name ? v.name : v.id, rate: num(v.rate, 0, 200, 0),
    offset: pair(v.offset, 'x', 'y', -64, 64), spread: pair(v.spread, 'x', 'y', 0, 64), speed: pair(v.speed, 'x', 'y', -200, 200), jitter: pair(v.jitter, 'x', 'y', 0, 200),
    gravity: num(v.gravity, -400, 400, 0), sway: { amount: num(v.sway?.amount, 0, 16, 0), speed: num(v.sway?.speed, 0, 40, 0) },
    life: { min: Math.min(life.min, life.max), max: Math.max(life.min, life.max) },
    colors: (Array.isArray(v.colors) ? v.colors.map(paintOf).filter((p: Paint | null): p is Paint => !!p) : []).slice(0, 16),
    halo,
  };
}

let stored: ParticleSystem[] | null = null;
/** The systems this game has: its store's, then the built-in ones it does not change. */
export function particleSystems(): ParticleSystem[] {
  stored ??= (readStore<unknown[]>(PARTICLE_STORE, []) ?? []).map(cleanSystem).filter((s): s is ParticleSystem => !!s);
  return [...stored, ...BUILT_IN.filter((b) => !stored!.some((s) => s.id === b.id))];
}
const byId = new Map<string, ParticleSystem | null>();
export function particleSystem(id: string): ParticleSystem | null {
  if (!byId.has(id)) byId.set(id, particleSystems().find((s) => s.id === id) ?? null);
  return byId.get(id)!;
}
export const isBuiltIn = (id: string) => BUILT_IN.some((b) => b.id === id);
/** Keeps a system in the store on this device (a built-in one so kept changes it). Whether storage took it. */
export function saveSystem(system: ParticleSystem): boolean {
  particleSystems();
  const list = [...stored!];
  const at = list.findIndex((s) => s.id === system.id);
  if (at >= 0) list[at] = system; else list.push(system);
  return keep(list);
}
/** Drops a system from the store; a built-in one goes back to the engine's. */
export function deleteSystem(id: string): boolean {
  return keep((stored ?? []).filter((s) => s.id !== id));
}
function keep(list: ParticleSystem[]): boolean {
  stored = list;
  byId.clear();
  return writeStore(PARTICLE_STORE, list);
}
/** Reads the store again, after another page (another editor tab) may have changed it. */
export function reloadSystems(): void {
  stored = null;
  byId.clear();
}

// ------------------------------------------------------------------ running them

/** A system at work: where its point is, in ground pixels, and a number that puts its flicker out of step with others. */
export interface Emitter { system: ParticleSystem; x: number; y: number; salt: number }

/** The particle systems attached to things (`Thing.fx`), at their points on the ground image. */
export function emittersOf(things: readonly (Thing | null | undefined)[], ground: TerrainImage): Emitter[] {
  const out: Emitter[] = [];
  for (const t of things) {
    const system = t?.fx && particleSystem(t.fx.system);
    if (!t || !system) continue;
    const f = footOf(ground, t.spot);
    out.push({ system, x: f.x - t.foot.x + t.fx!.x, y: f.y - t.foot.y + t.fx!.y, salt: t.spot.i * 3.1 + t.spot.j * 1.7 });
  }
  return out;
}

/** The halos of the emitters, as lamps in a view's pixels (daylight.ts `light`). */
export function halos(from: readonly Emitter[], view: { x: number; y: number }, ms: number): Lamp[] {
  const out: Lamp[] = [];
  for (const e of from) {
    const h = e.system.halo;
    if (!h || h.r <= 0) continue;
    out.push({ x: e.x - view.x, y: e.y - view.y, r: h.r * (h.flicker ? flicker(ms, e.salt) : 1), color: h.color && paintHex(h.color) });
  }
  return out;
}

/** A system's halo as a lamp of a cave's light field (`World.lightField`), at a point in view tiles; null without one. */
export function tileHalo(system: ParticleSystem | null, at: { i: number; j: number }, ms: number, salt = 0): TileLamp | null {
  const h = system?.halo;
  if (!h || h.tiles <= 0) return null;
  const f = h.flicker ? flicker(ms, salt) : 1;
  return { i: at.i, j: at.j, r: h.tiles * f, amount: Math.min(1, h.amount * f), ...(h.color && { color: paintHex(h.color) }) };
}

const paintHex = (p: Paint) => PALETTE[p.key][p.tone];

interface Particle { x: number; y: number; vx: number; vy: number; g: number; sway: number; swaySpeed: number; phase: number; born: number; life: number; c: number[] }
type Image = { data: Uint8ClampedArray; width: number; height: number };

/** The particles thrown so far, in ground pixels. */
export class Particles {
  private live: Particle[] = [];

  /** Throws what the emitters throw in `dt` seconds. */
  emit(from: readonly Emitter[], ms: number, dt: number): void {
    if (dt <= 0) return;
    for (const { system: s, x, y } of from) {
      if (s.rate <= 0 || !s.colors.length) continue;
      // A whole number of them, and one more by chance for what is left over.
      const due = s.rate * dt;
      for (let n = Math.floor(due) + (Math.random() < due % 1 ? 1 : 0); n > 0; n--) {
        const c = s.colors[Math.floor(Math.random() * s.colors.length)];
        const spread = (r: number) => (Math.random() * 2 - 1) * r;
        this.live.push({
          x: x + s.offset.x + spread(s.spread.x), y: y + s.offset.y + spread(s.spread.y),
          vx: s.speed.x + spread(s.jitter.x), vy: s.speed.y + spread(s.jitter.y), g: s.gravity,
          sway: s.sway.amount, swaySpeed: s.sway.speed, phase: Math.random() * Math.PI * 2,
          born: ms, life: s.life.min + Math.random() * (s.life.max - s.life.min), c: rgb(paintHex(c)),
        });
      }
    }
  }

  /** Draws them over a finished picture of the view, fading as they age, and lets go of those burnt out. */
  draw(image: Image, view: { x: number; y: number }, ms: number): void {
    let kept = 0;
    for (const p of this.live) {
      const age = ms - p.born;
      if (age >= p.life) continue;
      this.live[kept++] = p;
      const t = age / 1000;
      const x = Math.round(p.x + p.vx * t + Math.sin(t * p.swaySpeed + p.phase) * p.sway - view.x);
      const y = Math.round(p.y + p.vy * t + 0.5 * p.g * t * t - view.y);
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const o = (y * image.width + x) * 4, k = 1 - age / p.life;
      for (let n = 0; n < 3; n++) image.data[o + n] += (p.c[n] - image.data[o + n]) * k;
    }
    this.live.length = kept;
  }

  /** How many are alive. */
  get count(): number { return this.live.length; }
}

// ------------------------------------------------------------------ a preview

/** What a preview shows a system on: a campfire's flame, a torch, or nothing. */
export const PREVIEW_ON = ['flame', 'torch', 'none'] as const;
export type PreviewOn = (typeof PREVIEW_ON)[number];
const GROUND = rgb('#cdb98f');

/**
 * A small picture of a system at work on a flame or a torch (at the flame's heart, `FLAME_GLOW`), by day or at night,
 * when its halo lights the ground round it: for the particle editor and the start page. Pixels only; the page puts
 * them on a canvas.
 */
export class ParticlePreview {
  private particles = new Particles();
  private last = 0;
  constructor(readonly w: number, readonly h: number) {}

  frame(system: ParticleSystem, ms: number, o: { on: PreviewOn; night: boolean }): Image {
    const dt = this.last ? Math.min(0.1, (ms - this.last) / 1000) : 0;
    this.last = ms;
    const image: Image = { data: new Uint8ClampedArray(this.w * this.h * 4), width: this.w, height: this.h };
    for (let k = 0; k < this.w * this.h; k++) image.data.set([...GROUND, 255], k * 4);
    const at = { x: Math.round(this.w / 2), y: Math.round(this.h * 0.6) };
    const frame = flameFrame(FLAMES, ms);
    const picture = o.on === 'flame' ? { rows: frame, colors: FLAME_COLORS } : o.on === 'torch' ? { rows: flameFrame(TORCH.frames, ms), colors: TORCH.colors } : null;
    picture?.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const hex = picture.colors[ch];
      if (!hex) return;
      const px = at.x - FLAME_GLOW.x + x, py = at.y - FLAME_GLOW.y + y;
      if (px >= 0 && py >= 0 && px < this.w && py < this.h) image.data.set([...rgb(hex), GLOWING.has(hex) ? GLOW_ALPHA : 255], (py * this.w + px) * 4);
    }));
    const emitter: Emitter = { system, ...at, salt: 0 };
    if (o.night) light(image, TINTS.night, 0, halos([emitter], { x: 0, y: 0 }, ms));
    this.particles.emit([emitter], ms, dt);
    this.particles.draw(image, { x: 0, y: 0 }, ms);
    return image;
  }
}
