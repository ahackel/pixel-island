// Animals, drawn by rules in the puppet's look (docs/animal-spec.md). An animal is a short
// description: a body plan, sizes, part kinds, marks and five colours. It is built as rounded 3D
// masses (ellipsoids, and chains of spheres for legs, necks, tails, trunks and horns), posed for
// each frame, ray-cast in the 2:1 view and lit like the plants: light from the upper left and a
// little from the front, in the three tones of the master palette. No outlines.
import { PAINT_KEYS, PALETTE, type PaletteKey, type Tone } from '../core/palette.ts';
import { cellHash } from '../../shared/random.ts';
import { savedList } from '../../shared/files.ts';

import { FACING_VIEWS, type Facing } from '../core/puppet.ts';

// ------------------------------------------------------------------ the description

export const PLANS = ['quad', 'biped', 'ape'] as const;
export const EARS = ['none', 'tiny', 'round', 'pointed', 'tall', 'lop', 'flap'] as const;
export const TAILS = ['none', 'stub', 'thin', 'tuft', 'bushy', 'thick', 'plume'] as const;
export const HORNS = ['none', 'horns', 'nose', 'tusks'] as const;
export const FEATURES = ['blush', 'teeth', 'spines', 'wings', 'beak'] as const;
export const MARKS = ['belly', 'chest', 'muzzle', 'face', 'blaze', 'hood', 'saddle', 'stripe', 'bands', 'spots', 'patches', 'socks', 'tailTip'] as const;
export const ROLES = ['fur', 'second', 'third', 'nose', 'horn'] as const;
export type Plan = (typeof PLANS)[number];
export type Ears = (typeof EARS)[number];
export type Tail = (typeof TAILS)[number];
export type Horns = (typeof HORNS)[number];
export type Feature = (typeof FEATURES)[number];
export type Mark = (typeof MARKS)[number];
export type Role = (typeof ROLES)[number];

/** Every number of the description, with its range. The editor's sliders and the file check both read this. */
export const NUMBERS = {
  scale: { min: 0.5, max: 2, step: 0.05, group: 'body' },
  /** How shaggy the fur is: 0 smooth skin (pig, elephant), 1 a yak. Ragged edges and strands. */
  fur: { min: 0, max: 1, step: 0.1, group: 'body' },
  length: { min: 1, max: 40, step: 0.5, group: 'body' },
  girth: { min: 1.5, max: 20, step: 0.25, group: 'body' },
  width: { min: 0.5, max: 1.4, step: 0.05, group: 'body' },
  tilt: { min: -20, max: 90, step: 1, group: 'body' },
  legs: { min: 0.5, max: 30, step: 0.5, group: 'body' },
  legWidth: { min: 0.5, max: 6, step: 0.1, group: 'body' },
  arms: { min: 0, max: 30, step: 0.5, group: 'body' },
  hump: { min: 0, max: 14, step: 0.25, group: 'body' },
  humpAt: { min: 0, max: 1, step: 0.05, group: 'body' },
  neck: { min: 0, max: 25, step: 0.5, group: 'head' },
  neckWidth: { min: 0.5, max: 10, step: 0.1, group: 'head' },
  neckAngle: { min: -10, max: 90, step: 1, group: 'head' },
  head: { min: 1.5, max: 12, step: 0.25, group: 'head' },
  muzzle: { min: 0, max: 12, step: 0.25, group: 'head' },
  /** Eye size against the head: 1 as the head gives it, less for small-eyed animals (pigs). */
  eye: { min: 0.3, max: 1.5, step: 0.1, group: 'head' },
  muzzleWidth: { min: 0.5, max: 7, step: 0.1, group: 'head' },
  snoutDown: { min: -20, max: 80, step: 1, group: 'head' },
  earSize: { min: 0.5, max: 10, step: 0.1, group: 'ears' },
  tailLength: { min: 0, max: 40, step: 0.5, group: 'ears' },
  tailUp: { min: -60, max: 110, step: 1, group: 'ears' },
  tailCurl: { min: -360, max: 360, step: 5, group: 'ears' },
  hornSize: { min: 0, max: 10, step: 0.1, group: 'extras' },
  trunk: { min: 0, max: 30, step: 0.5, group: 'extras' },
} as const;
export type NumberKey = keyof typeof NUMBERS;

export interface Animal extends Record<NumberKey, number> {
  plan: Plan;
  ears: Ears;
  earColor: Role;
  tail: Tail;
  horns: Horns;
  features: Feature[];
  marks: Mark[];
  colors: Record<Role, PaletteKey>;
  /** The run is a hop: hind legs together, the body in an arc. */
  hops: boolean;
  /** Small enough for a character to pick up and carry in Play. */
  pickable: boolean;
}

export const DEFAULT_ANIMAL: Animal = {
  plan: 'quad', scale: 1, fur: 0.5, length: 8, girth: 3.5, width: 0.85, tilt: 0, legs: 5, legWidth: 1.1, arms: 0, hump: 0, humpAt: 0.5,
  neck: 1.5, neckWidth: 2, neckAngle: 45, head: 3, muzzle: 2, eye: 1, muzzleWidth: 1.3, snoutDown: 10,
  ears: 'pointed', earSize: 1.6, earColor: 'fur', tail: 'bushy', tailLength: 8, tailUp: 10, tailCurl: 0,
  horns: 'none', hornSize: 0, trunk: 0, features: [], marks: [],
  colors: { fur: 'orange', second: 'white', third: 'brown', nose: 'black', horn: 'cream' },
  hops: false,
  pickable: false,
};

/** Colours an animal may use: the whole palette apart from the face colours with a fixed meaning. */
export const COLOR_KEYS = PAINT_KEYS;

const isOf = <T extends string>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

/** An animal from storage or a file, checked field by field; anything unknown keeps the default. */
export function cleanAnimal(input: unknown): Animal {
  const out: Animal = structuredClone(DEFAULT_ANIMAL);
  const src = input as Partial<Animal> | null;
  if (!src || typeof src !== 'object') return out;
  for (const [key, range] of Object.entries(NUMBERS) as [NumberKey, (typeof NUMBERS)[NumberKey]][]) {
    const v = src[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(range.max, Math.max(range.min, v));
  }
  if (isOf(PLANS, src.plan)) out.plan = src.plan;
  if (isOf(EARS, src.ears)) out.ears = src.ears;
  if (isOf(ROLES, src.earColor)) out.earColor = src.earColor;
  if (isOf(TAILS, src.tail)) out.tail = src.tail;
  if (isOf(HORNS, src.horns)) out.horns = src.horns;
  if (Array.isArray(src.features)) out.features = [...new Set(src.features.filter((f) => isOf(FEATURES, f)))];
  if (Array.isArray(src.marks)) out.marks = [...new Set(src.marks.filter((m) => isOf(MARKS, m)))];
  for (const role of ROLES) {
    const key = src.colors?.[role];
    if (isOf(COLOR_KEYS, key)) out.colors[role] = key;
  }
  out.hops = src.hops === true;
  out.pickable = src.pickable === true;
  return out;
}

// ------------------------------------------------------------------ clips and poses

export const CLIP_IDS = ['idle', 'walk', 'run', 'sit', 'eat', 'lie'] as const;
export type ClipId = (typeof CLIP_IDS)[number];
export const CLIPS: Record<ClipId, { name: string; rate: number; frames: number }> = {
  idle: { name: 'Idle', rate: 6, frames: 12 },
  walk: { name: 'Walk', rate: 8, frames: 8 },
  run: { name: 'Run', rate: 11, frames: 6 },
  sit: { name: 'Sit', rate: 4, frames: 8 },
  eat: { name: 'Eat', rate: 5, frames: 8 },
  lie: { name: 'Lie', rate: 3, frames: 8 },
};

type Mode = 'stand' | 'sit' | 'lie';
interface Pose {
  mode: Mode;
  /** Body up, in units of the leg length. */
  bob: number;
  /** Spine turned nose-up, degrees. */
  pitch: number;
  /** Swing (forward positive) and bend per limb, degrees. quad: hindL hindR frontL frontR; biped: L R; ape: legL legR armL armR. */
  limbs: [number, number][];
  /** Neck angle instead of the animal's own, degrees above level. */
  neck?: number;
  neckAdd: number;
  /** Head turned down, degrees. */
  head: number;
  /** Tail wag: its swing at the tip in degrees, beats per clip and phase. The swing travels from root to tip. */
  tail: number;
  tailBeat: number;
  tailPhase: number;
  ears: number;
  trunk: number;
  blink: boolean;
  /** Where in the clip, 0 to 1. */
  t: number;
  /**
   * Secondary motion: how the body moved a frame ago, -1 to 1 (up and nose-up positive). Ears and
   * tail trail behind it, so they lift as the body drops and flop back as it rises.
   */
  drag: number;
}

const still = (mode: Mode = 'stand'): Pose => ({ mode, bob: 0, pitch: 0, limbs: [[0, 0], [0, 0], [0, 0], [0, 0]], neckAdd: 0, head: 0, tail: 0, tailBeat: 1, tailPhase: 0, ears: 0, trunk: 0, blink: false, t: 0, drag: 0 });
const TAU = Math.PI * 2;

/** The pose of one frame. Everything is worked out from the phase, so every animal moves by the same rules. */
function poseAt(a: Animal, clip: ClipId, frame: number, secondary = true): Pose {
  const n = CLIPS[clip].frames;
  frame = ((frame % n) + n) % n;
  const t = frame / n;
  const p = still();
  p.t = t;
  const wave = (phase: number) => Math.sin(TAU * (t + phase));
  const lift = (phase: number) => Math.max(0, Math.cos(TAU * (t + phase)));
  const gait = (phases: number[], swing: number, bend: number) => {
    p.limbs = phases.map((ph) => [swing * wave(ph), bend * lift(ph)]);
  };
  switch (clip) {
    case 'idle':
      Object.assign(p, { tail: 14, tailBeat: 2 });
      p.ears = frame === 4 || frame === 5 ? 1 : 0;
      p.trunk = 10 * Math.sin(TAU * t);
      p.blink = frame === 10;
      if (a.plan === 'ape') p.limbs = [[0, 0], [0, 0], [4, 10], [4, 10]];
      break;
    case 'walk':
      Object.assign(p, { tail: 12, tailPhase: 0.25 });
      p.trunk = 8 * wave(0);
      // Two footfalls a stride: the body dips on each.
      p.bob = 0.035 * Math.cos(2 * TAU * t);
      if (a.plan === 'quad') gait([0, 0.5, 0.25, 0.75], 20, 45);
      else if (a.plan === 'biped') {
        gait([0, 0.5], 26, 55);
        p.neckAdd = -6 * Math.abs(wave(0));
      } else {
        gait([0, 0.5, 0.5, 0], 22, 40);
        p.limbs[2][1] = p.limbs[3][1] = 15;
      }
      break;
    case 'run':
      p.tail = 8;
      if (a.hops && a.plan === 'quad') {
        // Crouch, push off, fly, land on the front feet, gather the hind feet under.
        const keys: [number, number, [number, number][]][] = [
          [0, 0, [[18, 30], [18, 30], [-6, 0], [-6, 0]]],
          [0.25, 10, [[-45, 0], [-45, 0], [25, 10], [25, 10]]],
          [0.45, 4, [[-35, 25], [-35, 25], [45, 20], [45, 20]]],
          [0.2, -10, [[-15, 30], [-15, 30], [15, 0], [15, 0]]],
          [0.05, -4, [[30, 45], [30, 45], [-15, 0], [-15, 0]]],
          [0, 0, [[22, 35], [22, 35], [-8, 0], [-8, 0]]],
        ];
        const [bob, pitch, limbs] = keys[frame % keys.length];
        Object.assign(p, { bob, pitch, limbs });
      } else if (a.plan === 'quad') {
        gait([0, 0.08, 0.5, 0.58], 38, 70);
        p.pitch = 5 * wave(0.1);
        p.bob = 0.12 * Math.max(0, wave(0.3));
      } else if (a.plan === 'biped') {
        gait([0, 0.5], 42, 85);
        p.bob = 0.06 * Math.abs(wave(0));
        p.pitch = -5;
      } else {
        gait([0, 0.5, 0.5, 0], 35, 60);
        p.limbs[2][1] = p.limbs[3][1] = 60;
        p.bob = 0.06 * Math.abs(wave(0));
      }
      break;
    case 'sit':
      p.mode = 'sit';
      p.tail = 9;
      p.blink = frame === 6;
      break;
    case 'eat':
      if (a.plan === 'ape') {
        // Sitting, the hand goes to the mouth and back.
        p.mode = 'sit';
        p.limbs = [[0, 0], [0, 0], [5, 10], [frame % 4 < 2 ? 70 : 55, frame % 4 < 2 ? 120 : 100]];
        p.head = frame % 2 ? 6 : 0;
      } else {
        p.neck = -55;
        p.head = 45 + (frame % 2 ? 8 : 0);
        p.pitch = -8;
        p.trunk = frame % 4 < 2 ? 30 : 10;
        if (a.plan === 'quad') p.limbs = [[0, 0], [0, 0], [-6, 0], [-6, 0]];
      }
      p.tail = 7;
      break;
    case 'lie':
      p.mode = 'lie';
      p.neck = 15;
      p.head = 10;
      p.blink = frame === 5;
      p.tail = 5;
      break;
  }
  if (secondary) {
    // The body's movement one frame back: a frame of delay is what makes ears and tail follow through.
    const [b, c] = [poseAt(a, clip, frame - 1, false), poseAt(a, clip, frame - 2, false)];
    p.drag = Math.max(-1, Math.min(1, (b.bob - c.bob) * 9 + (b.pitch - c.pitch) / 12));
  }
  return p;
}

// ------------------------------------------------------------------ geometry

type V = [number, number, number];
const v = (x: number, y: number, z: number): V => [x, y, z];
const add = (a: V, b: V, s = 1): V => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V): V => mul(a, 1 / (len(a) || 1));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rad = (deg: number) => (deg * Math.PI) / 180;
const UP: V = [0, 1, 0];
const FWD: V = [0, 0, 1];
/** Forward and down by an angle: 0 is level forward, 90 straight up. */
const ahead = (deg: number): V => [0, Math.sin(rad(deg)), Math.cos(rad(deg))];
/** A hanging limb swung forward by an angle. */
const hang = (deg: number): V => [0, -Math.cos(rad(deg)), Math.sin(rad(deg))];

/** Axes of a part whose length runs along `z`. */
function basis(z: V): [V, V, V] {
  const zz = norm(z);
  let x = cross(UP, zz);
  x = len(x) < 1e-4 ? [1, 0, 0] : norm(x);
  return [x, cross(zz, x), zz];
}

type Part = 'body' | 'neck' | 'head' | 'muzzle' | 'ear' | 'tail' | 'leg' | 'foot' | 'hump' | 'horn' | 'trunk' | 'wing' | 'arm';
/** One rounded mass. Parts with the same `mass` blend into one another; others are separated by a shade line. */
interface Prim {
  c: V;
  r: V;
  axes: [V, V, V];
  part: Part;
  role: Role;
  mass: number;
  /** On the far side, drawn in shade. */
  far?: boolean;
  /** Position along a limb or tail, 0 at the root. */
  t?: number;
}

export const ANCHORS = ['eye', 'nose', 'mouth', 'top', 'head', 'body', 'back', 'foot'] as const;
export type AnchorName = (typeof ANCHORS)[number];

interface Model {
  prims: Prim[];
  points: Record<AnchorName | 'eyeL' | 'cheekR' | 'cheekL' | 'toothA' | 'toothB', V>;
  hasNose: boolean;
  headR: number;
  noseR: number;
  /** For the patterns: the body's side radius and the head's forward direction. */
  side: number;
  headDir: V;
}

/** Builds the posed masses of one frame, in the animal's own space: x right, y up, z forward, feet on y = 0. */
function build(a: Animal, pose: Pose): Model {
  const s = a.scale;
  const L = a.length * s, g = a.girth * s, w = g * a.width, legs = a.legs * s, lw = a.legWidth * s;
  const hr = a.head * s, mz = a.muzzle * s, mw = a.muzzleWidth * s, er = a.earSize * s;
  const prims: Prim[] = [];
  let mass = 0;
  const TORSO = mass++;
  const blob = (c: V, r: V, z: V, part: Part, role: Role, m: number, extra: Partial<Prim> = {}) =>
    prims.push({ c, r, axes: basis(z), part, role, mass: m, ...extra });
  /** A chain of spheres through `points`, with the radius along it. */
  const chain = (points: V[], radius: (t: number) => number, part: Part, role: Role, m: number, extra: Partial<Prim> = {}) => {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += len(sub(points[i], points[i - 1]));
    let done = 0;
    for (let i = 1; i < points.length; i++) {
      const seg = len(sub(points[i], points[i - 1]));
      const steps = Math.max(1, Math.ceil(seg / 0.35));
      for (let k = i === 1 ? 0 : 1; k <= steps; k++) {
        const t = total ? (done + (seg * k) / steps) / total : 0;
        const r = radius(t);
        prims.push({ c: add(points[i - 1], sub(points[i], points[i - 1]), k / steps), r: [r, r, r], axes: basis(FWD), part, role, mass: m, t, ...extra });
      }
      done += seg;
    }
  };

  // ---- spine: hips H, chest C
  const lie = pose.mode === 'lie';
  const sit = pose.mode === 'sit';
  const bob = pose.bob * legs;
  let H: V, C: V;
  if (lie) {
    const y = g * 0.95;
    H = v(0, y, -L / 2);
    C = v(0, y, L / 2);
  } else if (a.plan === 'quad') {
    const y = legs + g * 0.6 + bob;
    if (sit) {
      C = v(0, y + Math.sin(rad(a.tilt)) * L, L * 0.3);
      const drop = Math.min(0.95, (C[1] - g * 0.85) / L);
      const angle = Math.asin(drop);
      H = sub(C, mul(v(0, Math.sin(angle), Math.cos(angle)), L));
    } else {
      H = v(0, y, -L / 2);
      C = add(H, ahead(a.tilt + pose.pitch), L);
    }
  } else if (a.plan === 'biped') {
    const mid = v(0, sit ? g * 0.95 : legs + g * 0.55 + bob, 0);
    const dir = ahead((sit ? 0 : a.tilt) + pose.pitch);
    H = add(mid, dir, -L / 2);
    C = add(mid, dir, L / 2);
  } else {
    H = v(0, sit ? g * 0.6 : legs + g * 0.25 + bob, 0);
    C = add(H, ahead(a.tilt + pose.pitch), L);
  }
  const spine = norm(sub(C, H));
  const mid = mul(add(H, C), 0.5);
  const upright = a.plan === 'ape' && !lie;

  // ---- body
  if (upright) {
    blob(mid, v(w, g * 0.8, L / 2 + g * 0.3), spine, 'body', 'fur', TORSO);
    blob(C, v(w * 1.12, g * 0.95, g), FWD, 'body', 'fur', TORSO);
    blob(H, v(w * 0.9, g * 0.8, g * 0.8), FWD, 'body', 'fur', TORSO);
  } else {
    blob(mid, v(w, g, L / 2 + g * 0.35), spine, 'body', 'fur', TORSO);
    if (a.plan !== 'biped') {
      blob(H, v(w * 0.95, g * 0.95, g * 0.95), spine, 'body', 'fur', TORSO);
      blob(C, v(w * 1.02, g * 1.02, g * 0.95), spine, 'body', 'fur', TORSO);
    }
  }
  if (a.hump > 0) {
    const hump = a.hump * s;
    const at = add(H, sub(C, H), a.humpAt);
    const top = upright ? add(at, FWD, -g * 0.5) : add(at, UP, g * 0.75);
    blob(top, v(hump * 0.8 * a.width + w * 0.25, hump, hump * 1.1), spine, 'hump', 'fur', TORSO);
  }
  if (a.features.includes('wings')) {
    for (const sx of [-1, 1]) blob(add(mid, v(sx * w * 0.85, g * 0.15, -g * 0.1)), v(g * 0.28, g * 0.62, L / 2 + g * 0.15), spine, 'wing', 'second', mass++, { far: sx < 0 });
  }

  // ---- neck and head
  const S = upright ? add(C, spine, g * 0.75) : add(add(C, UP, g * (a.plan === 'biped' ? 0.2 : 0.45)), spine, g * 0.35);
  const neckDir = ahead(pose.neck ?? a.neckAngle + pose.neckAdd);
  const neck = a.neck * s;
  const Hc = neck > 0 ? add(S, neckDir, neck + hr * 0.55) : add(add(S, neckDir, hr * 0.45), FWD, hr * 0.35);
  if (neck > 0) {
    const nw = a.neckWidth * s;
    chain([S, Hc], (t) => lerp(nw, Math.min(nw, hr * 0.75), t), 'neck', 'fur', TORSO);
  }
  const headDir = norm(hang(90 - pose.head));
  const hb = basis(headDir);
  const onHead = (x: number, y: number, z: number): V => add(add(add(Hc, hb[0], x), hb[1], y), hb[2], z);
  const headR = v(hr * 0.92, hr * 0.9, hr);
  blob(Hc, headR, headDir, 'head', 'fur', TORSO);
  /** A point on the head's surface in a direction given in the head's own axes. */
  const surface = (x: number, y: number, z: number) => {
    const u = norm(v(x, y, z));
    return onHead(u[0] * headR[0], u[1] * headR[1], u[2] * headR[2]);
  };
  const beak = a.features.includes('beak');
  const muzzleDir = hang(90 - pose.head - a.snoutDown);
  let nose: V, mouth: V;
  let noseR = 0;
  let muzzleC = Hc;
  let muzzleR: V = v(0, 0, 0);
  if (mz > 0) {
    muzzleC = add(add(Hc, muzzleDir, hr * 0.65 + mz * 0.5), UP, -hr * 0.1);
    muzzleR = v(mw, mw * 0.85, Math.max(mz * 0.55, mw * 0.8));
    blob(muzzleC, muzzleR, muzzleDir, 'muzzle', beak ? 'horn' : 'fur', TORSO);
    nose = add(add(muzzleC, muzzleDir, muzzleR[2] * 0.97), UP, mw * 0.25);
    mouth = add(add(muzzleC, muzzleDir, muzzleR[2] * 0.6), UP, -mw * 0.7);
    noseR = mw;
  } else {
    nose = surface(0, -0.1, 1);
    mouth = surface(0, -0.45, 0.9);
    noseR = hr * 0.3;
  }

  // ---- ears
  for (const sx of [-1, 1]) {
    const m = mass++;
    const far = sx < 0;
    const tw = pose.ears * sx;
    const drag = pose.drag;
    const ear = (x: number, y: number, z: number) => onHead(x * sx, y, z);
    switch (a.ears) {
      case 'tiny':
        blob(ear(0.55 * hr, 0.75 * hr, -0.2 * hr), v(er * 0.5, er * 0.5, er * 0.5), headDir, 'ear', a.earColor, m, { far });
        break;
      case 'round':
        blob(ear(0.6 * hr, 0.75 * hr, -0.15 * hr), v(er * 0.85, er, er * 0.45), headDir, 'ear', a.earColor, m, { far });
        break;
      case 'pointed': {
        const base = ear(0.45 * hr, 0.72 * hr, -0.1 * hr);
        const tip = ear(0.45 * hr + (0.22 + tw * 0.3) * er, 0.72 * hr + (1.7 - 0.25 * drag) * er, -0.1 * hr - (0.15 + 0.45 * drag) * er);
        chain([base, tip], (t) => lerp(er * 0.6, er * 0.18, t), 'ear', a.earColor, m, { far });
        break;
      }
      case 'tall': {
        const base = ear(0.3 * hr, 0.8 * hr, -0.3 * hr);
        const tip = ear(0.3 * hr + (0.15 + tw * 0.4) * er, 0.8 * hr + (2.6 - 0.5 * drag) * er, -0.3 * hr - (0.7 + 1.1 * drag) * er);
        chain([base, tip], (t) => lerp(er * 0.42, er * 0.34, t), 'ear', a.earColor, m, { far });
        break;
      }
      case 'lop': {
        const base = ear(0.6 * hr, 0.55 * hr, -0.2 * hr);
        const bend = ear(0.6 * hr + 0.35 * er, 0.55 * hr + 0.25 * er, -0.2 * hr);
        // A hanging ear lags most: it lifts and flares as the head drops, swings low as it rises.
        const tip = ear(0.6 * hr + (0.5 + tw * 0.3 + 0.35 * Math.abs(drag)) * er, 0.55 * hr - (1.9 + 0.7 * drag) * er, -0.1 * hr - 0.4 * drag * er);
        chain([base, bend, tip], (t) => lerp(er * 0.48, er * 0.5, t), 'ear', a.earColor, m, { far });
        break;
      }
      case 'flap':
        blob(ear(0.85 * hr + tw * 0.4 + Math.abs(drag) * er * 0.25, 0.05 * hr - drag * er * 0.2, -0.45 * hr), v(er * 0.22, er, er * 0.8), headDir, 'ear', a.earColor, m, { far });
        break;
    }
  }

  // ---- horns, tusks, trunk
  const hs = a.hornSize * s;
  if (hs > 0) {
    for (const sx of a.horns === 'nose' ? [0] : [-1, 1]) {
      const m = mass++;
      const far = sx < 0;
      if (a.horns === 'horns') {
        const base = onHead(sx * 0.6 * hr, 0.6 * hr, 0);
        chain([base, add(base, v(sx * hs, hs * 0.1, 0)), add(base, v(sx * hs * 1.35, hs * 0.95, hs * 0.2))], (t) => lerp(hs * 0.42, hs * 0.12, t), 'horn', 'horn', m, { far });
      } else if (a.horns === 'tusks' && mz > 0) {
        const base = add(add(muzzleC, v(sx * mw * 0.6, 0, 0)), UP, -mw * 0.45);
        const out = add(base, add(muzzleDir, UP, -0.3), hs * 1.2);
        chain([base, out, add(out, add(FWD, UP, 1.2), hs * 0.7)], (t) => lerp(hs * 0.3, hs * 0.14, t), 'horn', 'horn', m, { far });
      } else if (a.horns === 'nose' && mz > 0) {
        const base = add(add(muzzleC, muzzleDir, muzzleR[2] * 0.55), UP, mw * 0.7);
        chain([base, add(add(base, UP, hs * 1.8), FWD, hs * 0.5)], (t) => lerp(hs * 0.55, 0.3, t), 'horn', 'horn', m);
        const back = add(add(muzzleC, muzzleDir, -muzzleR[2] * 0.2), UP, mw * 0.8);
        chain([back, add(back, UP, hs * 0.9)], (t) => lerp(hs * 0.4, 0.3, t), 'horn', 'horn', m);
      }
    }
  }
  const tr = a.trunk * s;
  if (tr > 0) {
    // Down from the snout, curling forward at the tip, swaying.
    const start = mz > 0 ? add(muzzleC, muzzleDir, muzzleR[2] * 0.6) : nose;
    const points: V[] = [start];
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const angle = (90 - pose.head - a.snoutDown) * (1 - Math.min(1, k * 1.8)) + (25 + pose.trunk) * k * k;
      points.push(add(points[i - 1], add(hang(angle), v(Math.sin(rad(pose.trunk)) * 0.15, 0, 0)), tr / steps));
    }
    chain(points, (t) => lerp(Math.max(mw * 0.75, 0.6), Math.max(0.6, mw * 0.4), t), 'trunk', 'fur', TORSO);
    nose = points[steps];
    mouth = add(start, UP, -mw * 0.9);
  }

  // ---- tail
  const tl = a.tailLength * s;
  if (a.tail !== 'none' && tl > 0) {
    const T = upright ? add(add(H, FWD, -g * 0.7), UP, -g * 0.2) : a.plan === 'biped' ? add(H, spine, -g * 0.2) : add(add(H, spine, -g * 0.85), UP, g * 0.35);
    const m = mass++;
    if (a.tail === 'stub') {
      const r = Math.max(0.9, tl * 0.5);
      blob(add(T, FWD, -r * 0.4), v(r, r, r), FWD, 'tail', 'fur', m, { t: 1 });
    } else {
      const points: V[] = [T];
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const k = (i - 0.5) / steps;
        // The wag travels from root to tip (the tip a beat behind), and the tail trails the body's bounce.
        const wag = rad(pose.tail * (0.3 + 0.7 * k) * Math.sin(TAU * (pose.tailBeat * pose.t + pose.tailPhase) - 2.2 * k));
        const angle = rad(a.tailUp + a.tailCurl * k + (lie ? -a.tailUp * 0.6 : 0) - pose.drag * 35 * k);
        // Backwards and up in the plane of the spine, then turned sideways by the wag.
        const back = -Math.cos(angle);
        points.push(add(points[i - 1], v(Math.sin(wag) * -back, Math.sin(angle), Math.cos(wag) * back), tl / steps));
      }
      const thin = Math.max(0.5, g * 0.12);
      const R = Math.max(1, g * 0.4);
      const radius: Record<Exclude<Tail, 'none' | 'stub'>, (t: number) => number> = {
        thin: (t) => thin * (1 - 0.3 * t),
        tuft: (t) => (t > 0.85 ? thin * 1.8 : thin * (1 - 0.3 * t)),
        bushy: (t) => R * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(0.95, 0.2 + t * 0.8))),
        thick: (t) => lerp(g * 0.6, Math.max(0.5, g * 0.12), t),
        plume: (t) => lerp(g * 0.25, g * 0.5, Math.min(1, t * 1.4)) * (t > 0.85 ? 0.8 : 1),
      };
      chain(points, radius[a.tail], 'tail', a.tail === 'plume' ? 'second' : 'fur', m);
    }
  }

  // ---- limbs
  const footOf = (J: V, length: number, swing: number, bend: number, knee: number) => {
    const upper = hang(swing + knee);
    const K = add(J, upper, length / 2);
    return { K, F: add(K, hang(swing - knee - bend), length / 2) };
  };
  /**
   * A four-legged animal's hind leg bends backwards at the hock: thigh forward to the knee, shin
   * back to the hock, then the long foot down to the ground. What makes it read as an animal, not a table.
   * Fractions of the leg's length and angles from straight down; their heights add up to HOCK_REACH.
   */
  const HOCK: [number, number][] = [[0.38, 25], [0.32, -35], [0.3, 8]];
  const HOCK_REACH = HOCK.reduce((sum, [f, deg]) => sum + f * Math.cos(rad(deg)), 0);
  const hindOf = (J: V, length: number, swing: number, bend: number): V[] => {
    const turns = [swing + HOCK[0][1], swing + HOCK[1][1] - bend * 0.6, swing + HOCK[2][1] + bend * 0.4];
    const points = [J];
    turns.forEach((deg, i) => points.push(add(points[i], hang(deg), length * HOCK[i][0])));
    return points;
  };
  interface Limb { J: V; length: number; knee: number; kind: 'leg' | 'arm'; far: boolean; front: boolean }
  const limbs: Limb[] = [];
  /** Leg length that reaches the ground from a joint at height y when standing. */
  const reach = (y: number, knee: number) => (y - lw) / Math.cos(rad(knee));
  if (a.plan === 'quad') {
    const standH = legs + g * 0.6;
    const standC = standH + Math.sin(rad(a.tilt)) * L;
    for (const [front, base, y] of [[false, H, standH - g * 0.25], [true, C, standC - g * 0.35]] as const) {
      for (const sx of [-1, 1]) {
        limbs.push({ J: add(base, v(sx * w * 0.55, -g * (front ? 0.35 : 0.25), front ? g * 0.05 : -g * 0.1)), length: reach(y, 0) / (front ? 1 : HOCK_REACH), knee: 0, kind: 'leg', far: sx < 0, front });
      }
    }
  } else if (a.plan === 'biped') {
    const y = legs + g * 0.55 - g * 0.3;
    for (const sx of [-1, 1]) limbs.push({ J: add(add(mid, spine, -L * 0.1), v(sx * w * 0.55, -g * 0.3, 0)), length: reach(y, 22), knee: 22, kind: 'leg', far: sx < 0, front: false });
  } else {
    const y = legs + g * 0.25 - g * 0.35;
    for (const sx of [-1, 1]) limbs.push({ J: add(H, v(sx * w * 0.55, -g * 0.35, 0)), length: reach(y, 0), knee: 0, kind: 'leg', far: sx < 0, front: false });
    const shoulder = upright ? add(C, spine, g * 0.3) : add(C, UP, g * 0.1);
    for (const sx of [-1, 1]) limbs.push({ J: add(shoulder, v(sx * (w * 1.05 + lw * 0.6), 0, 0)), length: a.arms * s, knee: 0, kind: 'arm', far: sx < 0, front: true });
  }
  limbs.forEach((limb, i) => {
    const [swing, bend] = pose.limbs[i] ?? [0, 0];
    const { J, length } = limb;
    let K: V, F: V;
    const ground = lw;
    if (lie && (limb.front || a.plan === 'ape')) {
      // Front legs (and the ape's arms) forward on the bed, the ape's legs stretched out behind.
      const dir = limb.kind === 'leg' ? -1 : 1;
      const top = v(J[0], Math.max(J[1], ground), J[2]);
      K = v(J[0], ground, J[2] + dir * length * 0.3);
      F = v(J[0], ground, J[2] + dir * length * 0.6);
      chain([top, K, F], (t) => lerp(lw * 1.15, lw, t), limb.kind, 'fur', mass++, { far: limb.far });
      blob(F, v(lw * 1.05, lw, lw * 1.2), FWD, 'foot', 'fur', mass - 1, { far: limb.far, t: 1 });
      return;
    }
    if ((lie || sit) && limb.kind === 'leg' && !(sit && limb.front)) {
      // Folded under the body: thigh forward along the ground, foot under the hip.
      if (sit && a.plan === 'ape') {
        K = v(J[0] * 1.1, ground + lw * 0.3, J[2] + length * 0.5);
        F = v(J[0] * 1.1, ground, J[2] + length * 0.9);
      } else {
        K = v(J[0] * 1.15, ground, J[2] + length * 0.35);
        F = v(J[0] * 1.1, ground * 0.9, J[2] + length * 0.1);
      }
    } else if (limb.kind === 'arm') {
      const upper = hang(swing);
      K = add(J, upper, length / 2);
      F = add(K, hang(swing + bend), length / 2);
      if (!upright && !lie && F[1] < lw) F = v(F[0], lw, F[2]);
    } else if (a.plan === 'quad' && !limb.front) {
      const points = hindOf(J, length, swing, bend);
      const m = mass++;
      chain(points, (t) => lerp(lw * 1.45, lw * 0.9, t), limb.kind, 'fur', m, { far: limb.far });
      blob(points[3], v(lw * 1.05, lw, lw * 1.15), FWD, 'foot', 'fur', m, { far: limb.far, t: 1 });
      return;
    } else {
      ({ K, F } = footOf(J, length, swing, bend, limb.knee));
    }
    const m = mass++;
    const thick = a.plan === 'biped' ? (t: number) => lerp(lw * 1.9, lw * 0.6, Math.min(1, t * 1.6)) : (t: number) => lerp(lw * 1.3, lw, t);
    chain([J, K, F], thick, limb.kind, 'fur', m, { far: limb.far });
    if (limb.kind === 'arm') blob(F, v(lw * 1.2, lw * 1.2, lw * 1.2), FWD, 'foot', 'fur', m, { far: limb.far, t: 1 });
    else if (a.plan === 'quad') blob(F, v(lw * 1.05, lw, lw * 1.15), FWD, 'foot', 'fur', m, { far: limb.far, t: 1 });
    else blob(add(F, FWD, lw * 0.6), v(lw * 0.85, lw * 0.6, lw * (a.plan === 'biped' ? 1.8 : 1.4)), FWD, 'foot', 'fur', m, { far: limb.far, t: 1 });
  });
  if (a.plan === 'biped' && a.arms > 0) {
    // Small arms in front of the chest.
    for (const sx of [-1, 1]) {
      const J = add(add(C, spine, -g * 0.1), v(sx * w * 0.75, -g * 0.2, g * 0.3));
      const K = add(J, hang(60), a.arms * s * 0.5);
      chain([J, K, add(K, hang(120), a.arms * s * 0.5)], () => Math.max(0.5, lw * 0.45), 'arm', 'fur', mass++, { far: sx < 0 });
    }
  }

  const footLimb = limbs.filter((l) => !l.far && l.kind === 'leg').at(-1)!;
  const nearFoot = prims.filter((p) => p.part === 'foot' && !p.far).at(-1)?.c ?? footLimb.J;
  return {
    prims,
    points: {
      eye: surface(0.6, 0.12, 0.78),
      eyeL: surface(-0.6, 0.12, 0.78),
      cheekR: surface(0.6, -0.25, 0.72),
      cheekL: surface(-0.6, -0.25, 0.72),
      nose,
      mouth,
      toothA: add(mouth, FWD, 0.4),
      toothB: add(mouth, FWD, -1.2),
      top: add(Hc, UP, hr * 0.9),
      head: Hc,
      body: upright ? add(mid, FWD, g * 0.8) : add(mid, v(w * 0.95, 0, 0)),
      back: upright ? add(C, FWD, -g * 0.9) : add(mid, UP, g * 0.95),
      foot: nearFoot,
    },
    hasNose: tr <= 0 && !beak,
    headR: hr,
    noseR,
    side: w,
    headDir,
  };
}

// ------------------------------------------------------------------ drawing

/** The drawing canvas. Room for the largest animal in every clip; a bake trims it. */
export const ANIMAL_W = 128;
export const ANIMAL_H = 112;
/** The ground point under the animal: the line between the two middle columns, with room below for tails that point at the viewer. */
const OX = ANIMAL_W / 2;
const OY = ANIMAL_H - 28;
export const ANIMAL_ORIGIN = { x: OX, y: OY };
/** As on the plants: from the upper left and a little from the front, in view space. */
const LIGHT: V = norm([-0.55, 0.75, 0.35]);

export class AnimalSprite {
  readonly w = ANIMAL_W;
  readonly h = ANIMAL_H;
  readonly pixels: (string | null)[] = new Array(ANIMAL_W * ANIMAL_H).fill(null);
  set(x: number, y: number, color: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.pixels[y * this.w + x] = color;
  }
  get(x: number, y: number): string | null {
    return this.pixels[y * this.w + x] ?? null;
  }
  mirrored(): AnimalSprite {
    const out = new AnimalSprite();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.pixels[y * this.w + (this.w - 1 - x)] = this.pixels[y * this.w + x];
    return out;
  }
}

export interface Anchor {
  x: number;
  y: number;
  /** False when the point is hidden behind the animal itself in this frame. */
  visible: boolean;
}

export interface AnimalFrame {
  sprite: AnimalSprite;
  anchors: Record<AnchorName, Anchor>;
}

/**
 * View axes for the drawn facings, from where the nose points on screen as (across, towards the
 * viewer): facing 0 to the lower right, 3 to the upper right, 4 at the viewer, 6 away, 7 right.
 */
const nose = (across: number, toward: number) => ({ right: [-toward, across] as [number, number], toward: [across, toward] as [number, number] });
const VIEW: Record<0 | 3 | 4 | 6 | 7, { right: [number, number]; toward: [number, number] }> = {
  0: nose(Math.SQRT1_2, Math.SQRT1_2),
  3: nose(Math.SQRT1_2, -Math.SQRT1_2),
  4: nose(0, 1),
  6: nose(0, -1),
  7: nose(1, 0),
};

const hash = cellHash;

/**
 * Side on, the head would sit as high as the back. In the diagonal views whatever is further forward
 * also sits lower on screen, so there the head reads low and in front; side on, everything ahead of
 * the front legs is lowered by as much.
 */
function lowerHead(model: Model): void {
  const SIDE_DROP = 0.35;
  const legs = model.prims.filter((p) => p.part === 'leg');
  if (!legs.length) return;
  const front = Math.max(...legs.map((p) => p.c[2]));
  const drop = (q: V): V => (q[2] > front ? [q[0], q[1] - SIDE_DROP * (q[2] - front), q[2]] : q);
  for (const p of model.prims) if (p.part !== 'leg' && p.part !== 'foot') p.c = drop(p.c);
  for (const key of Object.keys(model.points) as (keyof Model['points'])[]) model.points[key] = drop(model.points[key]);
}

/** How far apart the eyes are seen head on, as a share of where the head's shape puts them; never closer than a pixel either side of the middle. */
const EYES_HEAD_ON = 0.4;

/** Per animal and facing, how many pixels each eye was pulled in on the standing frame; null when it did not fit. */
const EYE_PULLS = new Map<string, (number | null | undefined)[]>();

/** Draws one frame. Facings 1, 2 and 5 are the mirror images of 0, 3 and 7. */
export function drawAnimal(a: Animal, clip: ClipId, frame: number, facing: Facing): AnimalFrame {
  const seen = FACING_VIEWS[facing];
  if (seen.mirror) {
    const drawn = drawAnimal(a, clip, frame, seen.drawn);
    const anchors = Object.fromEntries(Object.entries(drawn.anchors).map(([k, p]) => [k, { ...p, x: ANIMAL_W - 1 - p.x }])) as Record<AnchorName, Anchor>;
    return { sprite: drawn.sprite.mirrored(), anchors };
  }
  const model = build(a, poseAt(a, clip, frame));
  if (facing === 7) lowerHead(model);
  const view = VIEW[seen.drawn];
  // Animal space to view space: x across the screen, y up, z towards the viewer. One unit
  // across the screen is one pixel, one unit up is one pixel, one unit towards the viewer half a pixel down.
  const toView = (p: V): V => [p[0] * view.right[0] + p[2] * view.right[1], p[1], p[0] * view.toward[0] + p[2] * view.toward[1]];
  const toAnimal = (p: V): V => [p[0] * view.right[0] + p[2] * view.toward[0], p[1], p[0] * view.right[1] + p[2] * view.toward[1]];
  // Facing the viewer or away, the animal is mirror-symmetric about the line between the middle
  // columns: a point on a pixel edge goes to the pixel nearer that line, on either side alike.
  const headOn = seen.drawn === 4 || seen.drawn === 6;
  const column = (x: number) => (headOn && x < OX ? Math.ceil(x) - 1 : Math.floor(x));
  const screen = (p: V) => ({ x: column(OX + p[0]), y: Math.floor(OY - p[1] + 0.5 * p[2]), t: p[2] / 2 });

  const W = ANIMAL_W, Hh = ANIMAL_H;
  const depth = new Float32Array(W * Hh).fill(-Infinity);
  const owner = new Int32Array(W * Hh).fill(-1);
  const keyAt: (PaletteKey | null)[] = new Array(W * Hh).fill(null);
  const toneAt: Tone[] = new Array(W * Hh).fill('base');
  const spiny: boolean[] = new Array(W * Hh).fill(false);
  const marks = new Set(a.marks);
  const spines = a.features.includes('spines');
  const s = a.scale;
  const stripeHalf = Math.max(0.7, model.side * 0.3);
  const patch = Math.max(1.5, a.girth * s * 0.9);

  /** Which colour a hit on a part takes, by the marks. */
  const roleAt = (p: Prim, P: V, n: V, px: number): Role => {
    if (p.role !== 'fur') return p.role;
    const torso = p.part === 'body' || p.part === 'hump' || p.part === 'neck';
    const headish = p.part === 'head' || p.part === 'muzzle';
    const along = dot(n, model.headDir);
    if (marks.has('socks') && (p.part === 'leg' || p.part === 'foot' || p.part === 'arm') && (p.t ?? 0) > 0.55) return 'third';
    if (marks.has('muzzle') && p.part === 'muzzle') return 'second';
    if (marks.has('face') && headish && along > 0.35) return 'second';
    if (marks.has('blaze') && headish && Math.abs(P[0]) < Math.max(0.5, a.head * s * 0.22) && along > 0.1) return 'second';
    if (marks.has('hood') && (p.part === 'head' || p.part === 'neck')) return 'third';
    if (marks.has('tailTip') && p.part === 'tail' && (p.t ?? 0) > 0.7) return 'second';
    if (marks.has('stripe') && (torso || p.part === 'head' || p.part === 'tail') && Math.abs(P[0]) < stripeHalf && n[1] > 0) return 'second';
    if (marks.has('spots') && (torso || p.part === 'leg' || p.part === 'tail') && n[1] > -0.3) {
      // A spot is a pixel or two, scattered: implied, not printed all over.
      const k = 2.4;
      const cell = P.map((v) => Math.floor(v / k)) as V;
      if (hash(cell[0], cell[1], cell[2]) < 0.5 && Math.abs(P[2] - (cell[2] + 0.5) * k) < 0.5 && Math.abs(P[1] - (cell[1] + 0.5) * k) < 0.6) return 'third';
    }
    if (marks.has('bands') && (torso || p.part === 'tail' || p.part === 'head') && n[1] > 0.1) {
      // Straight stripes one pixel wide, on the upper half only: the column where the stripe's plane meets this pixel.
      const z = Math.round(P[2] / 2.6) * 2.6;
      if (Math.floor(OX + toView([P[0], P[1], z])[0]) === px) return 'third';
    }
    if (marks.has('patches') && (torso || headish)) {
      const h = hash(Math.floor(P[0] / patch + 0.5), Math.floor(P[1] / patch), Math.floor(P[2] / patch));
      if (h < 0.3) return 'third';
      if (h < 0.55) return 'second';
    }
    if (marks.has('saddle') && torso && (a.plan === 'ape' ? -n[2] > 0.3 && n[1] > -0.3 : n[1] > 0.5)) return 'third';
    if (marks.has('chest') && (p.part === 'body' || p.part === 'neck') && n[2] > 0.45 && n[1] < 0.5) return 'second';
    if (marks.has('belly') && (torso || headish || p.part === 'tail') && n[1] < -0.45) return 'second';
    return 'fur';
  };

  // ---- the masses, nearest wins
  const inView = model.prims.map((p) => ({ c: toView(p.c), axes: p.axes.map(toView) as [V, V, V], small: Math.min(...p.r) }));
  const byMass = new Map<number, number[]>();
  model.prims.forEach((p, i) => byMass.set(p.mass, [...(byMass.get(p.mass) ?? []), i]));
  const blend = Math.max(1, a.girth * s * 0.3);
  // Beyond this distance a part is too far to count below (its gap over blend * 3): the axes are at right angles and of
  // unit length, so the part's own scaled distance is at least the plain one over its largest radius. 0.1% to spare
  // for rounding, so only parts the exact test would skip are skipped by this one.
  const reach2 = model.prims.map((p, j) => (Math.max(...p.r) * (1 + (blend * 3) / inView[j].small) * 1.001) ** 2);
  /**
   * The surface normal at a point, blended over every part of the same mass near it, so a body
   * built from several blobs is lit as one smooth shape (one highlight, no seams), not as a cluster of balls.
   */
  // Written out in numbers, not small arrays: it runs for every pixel and every part near it. Same sums, same order.
  const normalAt = (P: V, own: number): V => {
    let s0 = 0, s1 = 0, s2 = 0;
    for (const j of byMass.get(model.prims[own].mass)!) {
      const { c, axes: [a, b, e], small } = inView[j];
      const r = model.prims[j].r;
      const f0 = P[0] - c[0], f1 = P[1] - c[1], f2 = P[2] - c[2];
      if (f0 * f0 + f1 * f1 + f2 * f2 > reach2[j]) continue;
      const u0 = (f0 * a[0] + f1 * a[1] + f2 * a[2]) / r[0];
      const u1 = (f0 * b[0] + f1 * b[1] + f2 * b[2]) / r[1];
      const u2 = (f0 * e[0] + f1 * e[1] + f2 * e[2]) / r[2];
      const q = Math.hypot(u0, u1, u2);
      const gap = Math.max(0, (q - 1) * small);
      if (gap > blend * 3) continue;
      const k0 = u0 / r[0], k1 = u1 / r[1], k2 = u2 / r[2];
      const n0 = 0 + a[0] * k0 + b[0] * k1 + e[0] * k2;
      const n1 = 0 + a[1] * k0 + b[1] * k1 + e[1] * k2;
      const n2 = 0 + a[2] * k0 + b[2] * k1 + e[2] * k2;
      const inv = 1 / (Math.hypot(n0, n1, n2) || 1);
      const w = Math.exp(-gap / blend);
      s0 = s0 + n0 * inv * w;
      s1 = s1 + n1 * inv * w;
      s2 = s2 + n2 * inv * w;
    }
    return norm([s0, s1, s2]);
  };
  // The box round every hit, for the passes after this one.
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  model.prims.forEach((p, index) => {
    const { c, axes } = inView[index];
    const R = Math.max(...p.r);
    // Legs and feet are never thinner than a pixel, or the rays slip between them and a foot floats.
    const hitR = p.part === 'leg' || p.part === 'foot' ? p.r.map((r) => Math.max(r, 0.6)) : p.r;
    const cx = OX + c[0];
    const cy = OY - c[1] + 0.5 * c[2];
    // The ray through a pixel: x fixed, and every step towards the viewer one up and two forward. Its direction in the
    // part's own axes is the same for every pixel; written out in numbers, as it runs for every pixel of every part.
    const [a, b, e] = axes;
    const dl0 = (0 * a[0] + 1 * a[1] + 2 * a[2]) / hitR[0];
    const dl1 = (0 * b[0] + 1 * b[1] + 2 * b[2]) / hitR[1];
    const dl2 = (0 * e[0] + 1 * e[1] + 2 * e[2]) / hitR[2];
    const qa = 0 + dl0 * dl0 + dl1 * dl1 + dl2 * dl2;
    for (let py = Math.floor(cy - R * 1.15) - 1; py <= Math.ceil(cy + R * 1.15) + 1; py++) {
      if (py < 0 || py >= Hh) continue;
      for (let px = Math.floor(cx - R) - 1; px <= Math.ceil(cx + R) + 1; px++) {
        if (px < 0 || px >= W) continue;
        const f0 = px + 0.5 - OX - c[0], f1 = OY - (py + 0.5) - c[1], f2 = 0 - c[2];
        const ol0 = (f0 * a[0] + f1 * a[1] + f2 * a[2]) / hitR[0];
        const ol1 = (f0 * b[0] + f1 * b[1] + f2 * b[2]) / hitR[1];
        const ol2 = (f0 * e[0] + f1 * e[1] + f2 * e[2]) / hitR[2];
        const qb = 0 + ol0 * dl0 + ol1 * dl1 + ol2 * dl2;
        const qc = -1 + ol0 * ol0 + ol1 * ol1 + ol2 * ol2;
        const disc = qb * qb - qa * qc;
        if (disc < 0) continue;
        const t = (-qb + Math.sqrt(disc)) / qa;
        const at = py * W + px;
        if (t <= depth[at]) continue;
        depth[at] = t;
        owner[at] = index;
        if (px < X0) X0 = px;
        if (px > X1) X1 = px;
        if (py < Y0) Y0 = py;
        if (py > Y1) Y1 = py;
      }
    }
  });
  // Everything below works on what the rays hit and the pixels round it: the box round the hits, with room for what the
  // clean-up adds next to them (a filled notch, a tuft above, a clump below), not the whole canvas.
  X0 = Math.max(0, X0 - 3); X1 = Math.min(W - 1, X1 + 3); Y0 = Math.max(0, Y0 - 3); Y1 = Math.min(Hh - 1, Y1 + 3);
  // ---- colour and tone of what is seen
  // Painted the way the people's hair is: a calm base, light only on the big masses, and on fur the
  // tone edges broken into diagonal strands so they read as hair, not as a band hugging the outline.
  const shag = a.fur;
  const dir = seen.back ? -1 : 1;
  /** Head on, the left half repeats the right in mirror: strokes and scatter by this column make a symmetric pattern. */
  const across = (px: number) => (headOn && px < OX ? W - 1 - px : px);
  /** Head on, the light comes from straight above and in front, so neither flank is darker. */
  const light: V = headOn ? norm([0, LIGHT[1], LIGHT[2]]) : LIGHT;
  /** Whether a part is on the side turned from the viewer; head on, neither side is. */
  const far = (o: number) => !headOn && !!model.prims[o].far;
  const hitAt: V[] = new Array(W * Hh);
  const upAt = new Float32Array(W * Hh);
  const thinPart = (o: number) => Math.min(...model.prims[o].r) < 1.3;
  /** Parts that carry fur (ragged edges, strands): not legs, ears, snouts or horns. */
  const furry = (o: number) => {
    const p = model.prims[o];
    return shag > 0 && p.role === 'fur' && !far(o) && (p.part === 'body' || p.part === 'hump' || p.part === 'neck' || p.part === 'head' || (p.part === 'tail' && !thinPart(o)));
  };
  const onStrand = (px: number, py: number) => (across(px) * dir + py + 3 * W) % 3 === 0;
  for (let py = Y0; py <= Y1; py++) {
    for (let px = X0; px <= X1; px++) {
      const at = py * W + px;
      if (owner[at] < 0) continue;
      const p = model.prims[owner[at]];
      const viewHit: V = [px + 0.5 - OX, OY - (py + 0.5) + depth[at], 2 * depth[at]];
      const nv = normalAt(viewHit, owner[at]);
      const n = toAnimal(nv);
      const P = toAnimal(viewHit);
      hitAt[at] = P;
      upAt[at] = nv[1];
      const role = roleAt(p, P, n, px);
      const lit = dot(nv, light);
      const strand = furry(owner[at]) && onStrand(px, py) ? shag : 0;
      const big = Math.min(...p.r) >= 2;
      // Three planes, as on the reference sprites: a lit top, the flank in base, the lower third in shade.
      const below = nv[1] < -0.3 + 0.12 * strand;
      let tone: Tone = big && lit > 0.95 - 0.08 * strand ? 'light' : lit < 0.2 + 0.14 * strand || below ? 'shade' : 'base';
      if (far(owner[at])) tone = tone === 'light' ? 'base' : 'shade';
      // Feet in the darkest tone: it grounds the animal.
      if (p.part === 'foot') tone = 'shade';
      keyAt[at] = a.colors[role];
      spiny[at] = spines && role === 'fur' && (p.part === 'body' || p.part === 'hump' || (p.part === 'head' && dot(n, model.headDir) < 0.2)) && n[1] > -0.35;
      if (spiny[at]) {
        // Spines implied: broken diagonal strokes in shade, not a weave over the whole back.
        // Each stroke has a pale tip beside it, so the spines stand out from the coat.
        const cell = hash(Math.floor(Math.abs(P[0]) / 1.6), Math.floor(P[1] / 1.6), Math.floor(P[2] / 1.6)) < 0.6;
        const k = (across(px) * dir + py + 3 * W) % 3;
        tone = cell && k === 0 ? 'shade' : cell && k === 1 ? (tone === 'shade' ? 'base' : 'light') : tone === 'shade' ? 'shade' : 'base';
      }
      toneAt[at] = tone;
    }
  }

  // ---- clean-up, as a pixel artist would after a render
  const onCanvas = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < Hh;
  const painted = (x: number, y: number) => onCanvas(x, y) && owner[y * W + x] >= 0;
  const massOf = (x: number, y: number) => (painted(x, y) ? model.prims[owner[y * W + x]].mass : -1);
  const N4 = [[1, 0], [-1, 0], [0, -1], [0, 1]] as const;
  const N8 = [...N4, [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;
  // The same as plain offsets, for the loops that run for every pixel.
  const DX = N8.map(([dx]) => dx), DY = N8.map(([, dy]) => dy);
  const copy = (to: number, from: number, tone?: Tone) => {
    owner[to] = owner[from];
    depth[to] = depth[from];
    keyAt[to] = keyAt[from];
    toneAt[to] = tone ?? toneAt[from];
    hitAt[to] = hitAt[from];
    upAt[to] = upAt[from];
  };
  const clear = (at: number) => {
    owner[at] = -1;
    keyAt[at] = null;
    depth[at] = -Infinity;
    spiny[at] = false;
  };
  // Silhouette: single pixels poking out of a body are cut, one-pixel notches into it filled.
  const cuts: number[] = [];
  const fills: [number, number][] = [];
  for (let py = Y0; py <= Y1; py++) {
    for (let px = X0; px <= X1; px++) {
      const at = py * W + px;
      // Counted without making arrays: this runs for every pixel of the canvas.
      let n4 = 0;
      for (let k = 0; k < 4; k++) if (painted(px + DX[k], py + DY[k])) n4++;
      if (owner[at] >= 0) {
        if (n4 <= 1 && !thinPart(owner[at])) cuts.push(at);
      } else if (n4 >= 3) {
        const around = N4.filter(([dx, dy]) => painted(px + dx, py + dy));
        const m = massOf(px + around[0]?.[0], py + around[0]?.[1]);
        if (around.length >= 3 && around.every(([dx, dy]) => massOf(px + dx, py + dy) === m && keyAt[(py + dy) * W + px + dx] === keyAt[(py + around[0][1]) * W + px + around[0][0]])) {
          fills.push([at, (py + around[0][1]) * W + px + around[0][0]]);
        }
      }
    }
  }
  cuts.forEach(clear);
  for (const [to, from] of fills) copy(to, from);
  // Doubles: on a one-pixel line (a thin tail, an ostrich leg) the corner pixel of an L is dropped, so the diagonal stays crisp.
  for (let py = Y0; py <= Y1; py++) {
    for (let px = X0; px <= X1; px++) {
      const at = py * W + px;
      if (owner[at] < 0 || !thinPart(owner[at])) continue;
      const m = model.prims[owner[at]].mass;
      let near = 0, level = false, upright = false;
      for (let k = 0; k < 8; k++) if (massOf(px + DX[k], py + DY[k]) === m) near++, level ||= DY[k] === 0, upright ||= DX[k] === 0;
      if (near === 2 && level && upright) clear(at);
    }
  }
  // Specks: a lone pixel of a tone none of its neighbours share takes theirs.
  const retone: [number, Tone][] = [];
  for (let py = Y0; py <= Y1; py++) {
    for (let px = X0; px <= X1; px++) {
      const at = py * W + px;
      if (owner[at] < 0 || spiny[at]) continue;
      // Most pixels share a tone with a neighbour of their colour: told apart before any list is made.
      let alike = 0, shared = false;
      for (let k = 0; k < 8; k++) {
        const o = (py + DY[k]) * W + px + DX[k];
        if (painted(px + DX[k], py + DY[k]) && keyAt[o] === keyAt[at]) alike++, shared ||= toneAt[o] === toneAt[at];
      }
      if (alike < 5 || shared) continue;
      const same = N8.map(([dx, dy]) => (py + dy) * W + px + dx).filter((o, i) => painted(px + N8[i][0], py + N8[i][1]) && keyAt[o] === keyAt[at]);
      if (same.length < 5 || same.some((o) => toneAt[o] === toneAt[at])) continue;
      const count = (t: Tone) => same.filter((o) => toneAt[o] === t).length;
      retone.push([at, (['base', 'shade', 'light'] as Tone[]).reduce((b, t) => (count(t) > count(b) ? t : b))]);
    }
  }
  for (const [at, tone] of retone) toneAt[at] = tone;
  // Fur, as the hair is cut: a tuft breaking the top outline here and there, clumps hanging in shade
  // under the belly and the tail. Placed by the spot on the body, so they move with it.
  if (shag > 0) {
    const tufts: number[] = [];
    const clumps: number[] = [];
    for (let py = Math.max(1, Y0); py <= Math.min(Hh - 2, Y1); py++) {
      for (let px = X0; px <= X1; px++) {
        const at = py * W + px;
        if (owner[at] < 0 || !furry(owner[at]) || spiny[at]) continue;
        const P = hitAt[at];
        const h = hash(Math.floor(Math.abs(P[0]) / 1.3) + 17, Math.floor(P[1] / 1.3), Math.floor(P[2] / 1.3));
        if (!painted(px, py - 1) && upAt[at] > 0.25 && h < 0.24 * shag && tufts.at(-1) !== at - W - 1) tufts.push(at);
        if (!painted(px, py + 1) && upAt[at] < -0.25 && h > 1 - 0.45 * shag) clumps.push(at);
      }
    }
    for (const at of tufts) copy(at - W, at, toneAt[at] === 'light' ? 'base' : toneAt[at]);
    for (const at of clumps) copy(at + W, at, 'shade');
  }
  // Inner ears: a stroke of the nose colour down the middle of an ear wide enough to have one.
  if (a.ears === 'pointed' || a.ears === 'tall' || a.ears === 'round') {
    const inner: number[] = [];
    for (let py = Math.max(1, Y0); py <= Y1; py++) {
      for (let px = Math.max(1, X0); px <= Math.min(W - 2, X1); px++) {
        const at = py * W + px;
        const o = owner[at];
        if (o < 0 || model.prims[o].part !== 'ear' || far(o)) continue;
        const m = model.prims[o].mass;
        if ([[1, 0], [-1, 0], [0, -1]].every(([dx, dy]) => massOf(px + dx, py + dy) === m)) inner.push(at);
      }
    }
    for (const at of inner) {
      keyAt[at] = a.colors.nose;
      toneAt[at] = 'base';
    }
  }
  // Rim light: the top edge of every big part in the light tone, so the shape reads without an outline.
  const rim: number[] = [];
  for (let py = Y0; py <= Y1; py++) {
    for (let px = X0; px <= X1; px++) {
      const at = py * W + px;
      const o = owner[at];
      if (o < 0 || thinPart(o) || spiny[at] || far(o) || model.prims[o].part === 'foot') continue;
      if (!painted(px, py - 1)) rim.push(at);
    }
  }
  for (const at of rim) toneAt[at] = 'light';
  // Sel-out: the edge away from the light (right and below) in the shade of its own colour, never black.
  const selOut: number[] = [];
  for (let py = Y0; py <= Y1; py++) {
    for (let px = X0; px <= X1; px++) {
      const at = py * W + px;
      if (owner[at] < 0 || thinPart(owner[at]) || spiny[at]) continue;
      if (!painted(px + 1, py) || !painted(px, py + 1)) selOut.push(at);
    }
  }
  for (const at of selOut) toneAt[at] = 'shade';

  const sprite = new AnimalSprite();
  // No ground shadow in the picture: it is cast from the sun where the animal stands.
  // ---- colour, with a shade line on a part where a nearer, different part covers its neighbour
  for (let py = Y0; py <= Y1; py++) {
    for (let px = X0; px <= X1; px++) {
      const at = py * W + px;
      const key = keyAt[at];
      if (!key) continue;
      let tone = toneAt[at];
      const me = model.prims[owner[at]];
      for (let k = 0; k < 4; k++) {
        const nx = px + DX[k], ny = py + DY[k];
        if (!onCanvas(nx, ny)) continue;
        const other = owner[ny * W + nx];
        if (other < 0 || keyAt[ny * W + nx] !== key) continue;
        if (model.prims[other].mass !== me.mass && depth[ny * W + nx] > depth[at] + 1.5) tone = 'shade';
      }
      sprite.set(px, py, PALETTE[key][tone]);
      // Spikes stand out of the silhouette along the top of the back.
      if (spiny[at] && py > 0 && owner[at - W] < 0 && hash(across(px), py, 7) < 0.55) sprite.set(px, py - 1, PALETTE[key].shade);
    }
  }

  // ---- face: eyes, nose, cheeks, teeth, drawn where the point is on the visible surface
  const visible = (p: V) => {
    const q = screen(toView(p));
    if (q.x < 0 || q.y < 0 || q.x >= W || q.y >= Hh) return { ...q, visible: false };
    return { ...q, visible: q.t >= depth[q.y * W + q.x] - 0.8 };
  };
  const dotAt = (p: V, color: string, tall = false, wide = false) => {
    const q = visible(p);
    if (!q.visible) return;
    sprite.set(q.x, q.y, color);
    if (tall) sprite.set(q.x, q.y - 1, color);
    if (wide) sprite.set(q.x + 1, q.y, color);
  };
  const pose = poseAt(a, clip, frame);
  const big = model.headR >= 5;
  /** Whether a pixel and all four neighbours are the face (head or muzzle): a mark there never sits on the outline. */
  const onFace = (x: number, y: number) => {
    const o = x >= 0 && y >= 0 && x < W && y < Hh ? owner[y * W + x] : -1;
    return o >= 0 && (model.prims[o].part === 'head' || model.prims[o].part === 'muzzle');
  };
  const inside = (x: number, y: number, tall = false) =>
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => onFace(x + dx, y + dy) && (!tall || onFace(x + dx, y + dy - 1)));
  // Eyes as Lop Hop draws them: a dark mark two pixels tall (one on a small head), no white, a
  // line when blinking. Kept inside the face, moved towards the head's middle until it is.
  const eyeR = model.headR * a.eye;
  const tall = eyeR >= 2.2;
  const wide = eyeR >= 5.4; // (large heads: 2×2 with a glint, as big as Lop Hop's eye is on its smaller head)
  const middle = screen(toView(model.points.head));
  // Eyes are placed at a rounded offset from the head's middle, not rounded on their own, so they
  // move with the head as one and keep their spacing from frame to frame.
  const exact = (p: V) => {
    const q = toView(p);
    return { x: q[0], y: -q[1] + 0.5 * q[2] };
  };
  const away = (d: number) => Math.sign(d) * Math.round(Math.abs(d));
  let eyeAt: Anchor | null = null;
  const reference = clip === 'idle' && frame === 0;
  const steadyKey = `${facing}|${JSON.stringify(a)}`;
  if (!reference && !EYE_PULLS.has(steadyKey)) drawAnimal(a, 'idle', 0, facing);
  const steady = reference ? undefined : EYE_PULLS.get(steadyKey);
  const pulls: (number | null | undefined)[] = [];
  for (const [side, eye] of [model.points.eye, model.points.eyeL].entries()) {
    const q = visible(eye);
    if (!q.visible) continue;
    const e = exact(eye);
    const m = exact(model.points.head);
    // Head on, the eyes sit closer than the head's width would put them: across the snout, not on the cheeks.
    let x = column(OX + m.x + (headOn ? Math.sign(e.x - m.x) * Math.max(1, Math.round(Math.abs(e.x - m.x) * EYES_HEAD_ON)) : away(e.x - m.x)));
    let y = middle.y + away(e.y - m.y);
    // How far the eye is pulled in comes from the standing frame, so a bobbing outline does not
    // move one eye and not the other.
    const fixed = steady?.[side];
    const pull = () => {
      x += Math.sign(middle.x - x);
      y += Math.sign(middle.y - y);
    };
    let k = 0;
    if (fixed === undefined) for (; k < 4 && !inside(x, y, tall); k++) pull();
    else if (fixed !== null) for (; k < fixed; k++) pull();
    // A wide eye's second column goes outwards: to the right, or head on, away from the middle.
    const out = headOn && x < OX ? -1 : 1;
    const fits = fixed === undefined ? inside(x, y, tall) && (!wide || inside(x + out, y, tall)) : fixed !== null && onFace(x, y);
    pulls[side] = fits ? k : null;
    if (!fits || (eyeAt && Math.abs(eyeAt.x - x) < (wide ? 3 : 2))) continue;
    if (pose.blink) for (let dx = 0; dx <= (wide ? 1 : 0); dx++) sprite.set(x + dx * out, y, PALETTE[keyAt[y * W + x]!].shade);
    else {
      sprite.set(x, y, PALETTE.ink.base);
      if (tall) sprite.set(x, y - 1, PALETTE.ink.base);
      if (wide) {
        for (const dy of [0, -1]) sprite.set(x + out, y + dy, PALETTE.ink.base);
        sprite.set(x, y - 1, PALETTE.white.base); // (the glint, towards the light)
      }
    }
    eyeAt ??= { x, y, visible: true };
  }
  if (reference) {
    if (EYE_PULLS.size > 200) EYE_PULLS.clear();
    EYE_PULLS.set(steadyKey, pulls);
  }
  if (model.hasNose) {
    // The nose may sit on the outline, but on the snout: pulled back onto it when the point falls just off.
    const q = visible(model.points.nose);
    let { x, y } = q;
    for (let k = 0; k < 2 && q.visible && !onFace(x, y); k++) {
      x += Math.sign(middle.x - x);
      y += Math.sign(middle.y - y);
    }
    if (q.visible && onFace(x, y)) {
      sprite.set(x, y, PALETTE[a.colors.nose].base);
      if (model.noseR >= 2.6 && onFace(x + 1, y)) sprite.set(x + 1, y, PALETTE[a.colors.nose].base);
    }
  }
  if (a.features.includes('blush')) for (const cheek of [model.points.cheekR, model.points.cheekL]) {
    const q = visible(cheek);
    if (q.visible && inside(q.x, q.y)) dotAt(cheek, PALETTE.blush.base, false, big);
  }
  if (a.features.includes('teeth')) for (const tooth of [model.points.toothA, model.points.toothB]) dotAt(tooth, PALETTE.tooth.base);

  const anchors = Object.fromEntries(ANCHORS.map((name) => {
    if (name === 'eye' && eyeAt) return [name, eyeAt];
    const q = visible(model.points[name]);
    return [name, { x: q.x, y: q.y, visible: q.visible }];
  })) as Record<AnchorName, Anchor>;
  return { sprite, anchors };
}

/** Rows from the top of the drawn animal to the ground, standing: what the size classes go by. */
export function heightOf(a: Animal): number {
  const { sprite } = drawAnimal(a, 'idle', 0, 0);
  for (let y = 0; y < ANIMAL_H; y++) {
    for (let x = 0; x < ANIMAL_W; x++) if (sprite.get(x, y)) return OY - y;
  }
  return 0;
}

export const SIZE_CLASSES = [
  { id: 'small', upTo: 15, tiles: 1 },
  { id: 'medium', upTo: 23, tiles: 1 },
  { id: 'large', upTo: 36, tiles: 2 },
  { id: 'huge', upTo: Infinity, tiles: 3 },
] as const;
export const sizeClassOf = (height: number) => SIZE_CLASSES.find((c) => height <= c.upTo)!;

// ------------------------------------------------------------------ files

/** Where the animal editor keeps its work on this device: the animal being worked on, My things, and which of them is picked. */
export const ANIMAL_STORE = { draft: 'pixel-animal-draft', roster: 'pixel-animals', current: 'pixel-animals-current' } as const;
/** The animals in My things. */
export const savedAnimals = () => savedList(ANIMAL_STORE.roster, 'animal', cleanAnimal);

const FILE_TYPE = 'pixel-animal';
export const animalFile = (name: string, animal: Animal) => JSON.stringify({ type: FILE_TYPE, version: 1, name, animal }, null, 2);

/** Reads an animal file; throws with a short reason when it is not one. */
export function readAnimalFile(text: string): { name: string; animal: Animal } {
  const data = JSON.parse(text);
  if (data?.type !== FILE_TYPE || typeof data.name !== 'string') throw new Error('not an animal file');
  return { name: data.name.slice(0, 40), animal: cleanAnimal(data.animal) };
}
