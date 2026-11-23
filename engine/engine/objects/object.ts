// Objects: furniture, devices, the fountain and the cars, built from boxes, cylinders and balls on a
// tile footprint and drawn by rule in the engine's look (docs/object-spec.md). Ray-cast per pixel in the
// 2:1 view, lit with the flora light as the animals are, in all four camera turns.
import { PAINT_KEYS, PALETTE, type PaletteKey, type Tone } from '../core/palette.ts';
import { cellHash } from '../../shared/random.ts';
import { savedList } from '../../shared/files.ts';


export const SHAPES = ['box', 'cylinder', 'ball'] as const;
/** The axis a cylinder lies along: standing (y), or lying along the footprint's width (x) or depth (z). */
export const AXES = ['y', 'x', 'z'] as const;
/** `dark`: always in its shade tone, wherever it faces, for insides and holes. */
export const PAINTS = ['solid', 'glow', 'water', 'dark'] as const;
export const LOOPS = ['none', 'blink', 'flow', 'bob'] as const;
export const KINDS = ['furniture', 'device', 'garden', 'car'] as const;
export type Shape = (typeof SHAPES)[number];
export type Axis = (typeof AXES)[number];
export type Paint = (typeof PAINTS)[number];
export type Loop = (typeof LOOPS)[number];
export type Kind = (typeof KINDS)[number];
export type Turn = 0 | 1 | 2 | 3;

/** One part. It fills the box from (x, y, z) to (x + w, y + h, z + d): across the floor in 1/16 of a tile edge, up in pixels. */
export interface Part {
  shape: Shape;
  axis: Axis;
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  color: PaletteKey;
  paint: Paint;
  loop: Loop;
}
/** A named point (a bed, a screen, a seat), in the same units as the parts. */
export interface Point { name: string; x: number; y: number; z: number }
export interface Build {
  kind: Kind;
  /** Footprint in tiles: along x (width) and z (depth). */
  w: number;
  d: number;
  parts: Part[];
  points: Point[];
}

/** Units across one tile edge. */
export const UNIT = 16;
export const MAX_TILES = 4;
export const MAX_HEIGHT = 80;
export const MAX_PARTS = 80;
export const COLOR_KEYS = PAINT_KEYS;
export const LOOP_FRAMES = 8;
export const LOOP_RATE = 6;

export const newPart = (over: Partial<Part> = {}): Part => ({ shape: 'box', axis: 'y', x: 4, y: 0, z: 4, w: 8, h: 8, d: 8, color: 'wood', paint: 'solid', loop: 'none', ...over });
export const DEFAULT_BUILD: Build = { kind: 'furniture', w: 1, d: 1, parts: [newPart()], points: [] };

const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback);
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Reads an object from untrusted JSON: every field checked, anything unknown or out of range replaced. */
export function cleanBuild(input: unknown): Build {
  const raw = obj(input);
  const w = num(raw.w, 1, MAX_TILES, 1);
  const d = num(raw.d, 1, MAX_TILES, 1);
  const reach = MAX_TILES * UNIT + 8;
  const parts = (Array.isArray(raw.parts) ? raw.parts : []).slice(0, MAX_PARTS).map((p) => {
    const q = obj(p);
    const y = num(q.y, 0, MAX_HEIGHT - 1, 0);
    return {
      shape: pick(q.shape, SHAPES, 'box'), axis: pick(q.axis, AXES, 'y'),
      x: num(q.x, -8, reach, 0), y, z: num(q.z, -8, reach, 0),
      w: num(q.w, 1, reach, 4), h: num(q.h, 1, MAX_HEIGHT - y, 4), d: num(q.d, 1, reach, 4),
      color: pick(q.color, COLOR_KEYS, 'grey'), paint: pick(q.paint, PAINTS, 'solid'), loop: pick(q.loop, LOOPS, 'none'),
    };
  });
  const points = (Array.isArray(raw.points) ? raw.points : []).slice(0, 8).flatMap((p) => {
    const q = obj(p);
    if (typeof q.name !== 'string' || !/^[a-z][a-z0-9]{0,15}$/.test(q.name)) return [];
    return [{ name: q.name, x: num(q.x, -8, reach, 0), y: num(q.y, 0, MAX_HEIGHT, 0), z: num(q.z, -8, reach, 0) }];
  });
  return { kind: pick(raw.kind, KINDS, 'furniture'), w, d, parts, points };
}

export const framesOf = (prop: Build) => (prop.parts.some((p) => p.loop !== 'none') ? LOOP_FRAMES : 1);

// ------------------------------------------------------------------ drawing

/** The drawing canvas: room for a 4×4 footprint and the tallest object. A bake trims it. */
export const OBJECT_W = 160;
export const OBJECT_H = 160;
/** The pivot: the middle of the footprint on the floor. */
const OX = OBJECT_W / 2;
const OY = OBJECT_H - 40;
export const OBJECT_ORIGIN = { x: OX, y: OY };
/** As on the plants and animals: from the upper left and a little from the front, in view space (x right, y up, z towards the viewer). */
const LIGHT = (() => { const l = [-0.55, 0.75, 0.35]; const n = Math.hypot(...l); return l.map((v) => v / n); })();

export class ObjectSprite {
  readonly w = OBJECT_W;
  readonly h = OBJECT_H;
  readonly pixels: (string | null)[] = new Array(OBJECT_W * OBJECT_H).fill(null);
  set(x: number, y: number, color: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.pixels[y * this.w + x] = color;
  }
  get(x: number, y: number): string | null {
    return this.pixels[y * this.w + x] ?? null;
  }
}
export interface Anchor { x: number; y: number; visible: boolean }
export interface ObjectFrame {
  sprite: ObjectSprite;
  points: Record<string, Anchor>;
  /** Which part each pixel shows (-1: none), for picking in the editor. */
  partAt: Int16Array;
}

type V = [number, number, number];
/**
 * A quarter turn of a floor vector, `turn` times. Whole turns are exact; what is left of a
 * fractional turn (an eighth, for something a character carries) is turned by angle.
 */
const rotate = (u: number, v: number, turn: number): [number, number] => {
  const whole = Math.floor(turn);
  for (let i = 0; i < whole; i++) [u, v] = [-v, u];
  const rest = (turn - whole) * (Math.PI / 2);
  if (rest) [u, v] = [u * Math.cos(rest) - v * Math.sin(rest), u * Math.sin(rest) + v * Math.cos(rest)];
  return [u, v];
};

/** Where the ray leaves a part towards the viewer (the largest s), with the normal there; null on a miss. */
function hit(p: Part, o: V, dir: V, y0: number): { s: number; n: V } | null {
  const lo: V = [p.x, y0, p.z];
  const size: V = [p.w, p.h, p.d];
  if (p.shape === 'box') {
    let near = -Infinity, far = Infinity, axis = 0;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(dir[i]) < 1e-9) {
        if (o[i] < lo[i] || o[i] > lo[i] + size[i]) return null;
        continue;
      }
      const a = (lo[i] - o[i]) / dir[i], b = (lo[i] + size[i] - o[i]) / dir[i];
      near = Math.max(near, Math.min(a, b));
      if (Math.max(a, b) < far) { far = Math.max(a, b); axis = i; }
    }
    if (near > far) return null;
    const n: V = [0, 0, 0];
    n[axis] = Math.sign(dir[axis]);
    return { s: far, n };
  }
  const c: V = [lo[0] + size[0] / 2, lo[1] + size[1] / 2, lo[2] + size[2] / 2];
  const r: V = [size[0] / 2, size[1] / 2, size[2] / 2];
  // Round in the axes it is round in: all three for a ball, the two across a cylinder.
  const along = p.shape === 'cylinder' ? AXES_INDEX[p.axis] : -1;
  let qa = 0, qb = 0, qc = -1;
  for (let i = 0; i < 3; i++) {
    if (i === along) continue;
    const ol = (o[i] - c[i]) / r[i], dl = dir[i] / r[i];
    qa += dl * dl; qb += ol * dl; qc += ol * ol;
  }
  const disc = qb * qb - qa * qc;
  if (disc < 0 || qa === 0) return null;
  let far = (-qb + Math.sqrt(disc)) / qa;
  const near = (-qb - Math.sqrt(disc)) / qa;
  let cap = false;
  if (along >= 0) {
    const a = (c[along] - r[along] - o[along]) / dir[along], b = (c[along] + r[along] - o[along]) / dir[along];
    const lo2 = Math.min(a, b), hi2 = Math.max(a, b);
    if (Math.max(near, lo2) > Math.min(far, hi2)) return null;
    if (hi2 < far) { far = hi2; cap = true; }
  }
  const P: V = [o[0] + dir[0] * far, o[1] + dir[1] * far, o[2] + dir[2] * far];
  const n: V = [0, 0, 0];
  if (cap) n[along] = Math.sign(dir[along]);
  else for (let i = 0; i < 3; i++) if (i !== along) n[i] = (P[i] - c[i]) / (r[i] * r[i]);
  return { s: far, n };
}
const AXES_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 };

const hash = cellHash;

/** Draws one frame of an object in one camera turn. A half turn (0.5, 1.5…) is an eighth turn, for an object in a character's arms. */
export function drawObject(prop: Build, turn: Turn | number, frame = 0): ObjectFrame {
  const W = OBJECT_W, H = OBJECT_H;
  const f = ((frame % LOOP_FRAMES) + LOOP_FRAMES) % LOOP_FRAMES;
  const cx = (prop.w * UNIT) / 2, cz = (prop.d * UNIT) / 2;
  const back = (4 - turn) % 4;
  // Screen from a turned floor point (u, v) about the middle: x = u - v, y = -height + (u + v) / 2.
  // A pixel's ray, then: u - v = a, height = (u + v) / 2 - b, and s = u + v grows towards the viewer.
  const ray = (px: number, py: number): { o: V; dir: V } => {
    const a = px + 0.5 - OX, b = py + 0.5 - OY;
    const [ou, ov] = rotate(a / 2, -a / 2, back);
    const [du, dv] = rotate(0.5, 0.5, back);
    return { o: [ou + cx, -b, ov + cz], dir: [du, 0.5, dv] };
  };
  const project = (x: number, y: number, z: number) => {
    const [u, v] = rotate(x - cx, z - cz, turn);
    return { x: Math.floor(OX + u - v), y: Math.floor(OY - y + (u + v) / 2), s: u + v };
  };
  const yOf = (p: Part) => p.y + (p.loop === 'bob' && f >= 2 && f < 6 ? 1 : 0);
  /** Each part's box on screen, so a pixel only tries the parts that can cover it. */
  const boxes = prop.parts.map((p) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const x of [p.x, p.x + p.w]) for (const y of [yOf(p), yOf(p) + p.h]) for (const z of [p.z, p.z + p.d]) {
      const q = project(x, y, z);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }
    return [x0 - 1, y0 - 1, x1 + 1, y1 + 1];
  });

  const depth = new Float32Array(W * H).fill(-Infinity);
  const owner = new Int16Array(W * H).fill(-1);
  const normal: V[] = new Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const at = py * W + px;
      let r: ReturnType<typeof ray> | null = null;
      prop.parts.forEach((p, i) => {
        const [x0, y0, x1, y1] = boxes[i];
        if (px < x0 || px > x1 || py < y0 || py > y1) return;
        r ??= ray(px, py);
        const h = hit(p, r.o, r.dir, yOf(p));
        if (!h || h.s <= depth[at]) return;
        depth[at] = h.s;
        owner[at] = i;
        normal[at] = h.n;
      });
    }
  }

  // ---- tone of what is seen
  const toneAt: Tone[] = new Array(W * H).fill('base');
  const thin = prop.parts.map((p) => Math.min(p.w * Math.SQRT2, p.h, p.d * Math.SQRT2) < 3);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const at = py * W + px;
      const i = owner[at];
      if (i < 0) continue;
      const p = prop.parts[i];
      // To view space: across the floor a unit is √2 pixels long, so the normal's floor part shrinks by √2 first.
      const n = normal[at];
      const [nu, nv] = rotate(n[0] / Math.SQRT2, n[2] / Math.SQRT2, turn);
      const view: V = [(nu - nv) / Math.SQRT2, n[1], (nu + nv) / Math.SQRT2];
      const len = Math.hypot(...view) || 1;
      const lit = (view[0] * LIGHT[0] + view[1] * LIGHT[1] + view[2] * LIGHT[2]) / len;
      const flat = p.shape === 'box' || Math.abs(n[AXES_INDEX[p.axis]]) > 0.99;
      let tone: Tone = lit > (flat ? 0.7 : 0.8) ? 'light' : lit < (flat ? 0.2 : 0.25) ? 'shade' : 'base';
      if (p.paint === 'glow') tone = 'light';
      if (p.paint === 'dark') tone = 'shade';
      if (p.paint === 'water') {
        // Ripples across a surface, streaks down a falling jet; they run when the part flows.
        const run = p.loop === 'flow' ? f : 0;
        const top = view[1] / len > 0.5;
        const ripple = top
          ? (px + 2 * py + 800 - run) % 8 === 0 && hash(Math.floor((px - 2 * py) / 5), 3, 5) < 0.7
          : (py - run + ((px * 5) % 4) + 400) % 4 === 0;
        tone = ripple ? 'light' : tone === 'shade' ? 'shade' : 'base';
      }
      if (p.loop === 'blink' && f >= 4) tone = 'shade';
      toneAt[at] = tone;
    }
  }

  // ---- clean-up, as on the animals
  const onCanvas = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const painted = (x: number, y: number) => onCanvas(x, y) && owner[y * W + x] >= 0;
  const plain = (i: number) => !thin[i] && prop.parts[i].paint === 'solid' && prop.parts[i].loop !== 'blink';
  const rim: number[] = [];
  const selOut: number[] = [];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const at = py * W + px;
      const i = owner[at];
      if (i < 0 || !plain(i)) continue;
      // Rim light on the top edge of round parts (boxes have their lit top already); sel-out away from the light.
      if (prop.parts[i].shape !== 'box' && !painted(px, py - 1)) rim.push(at);
      if (!painted(px + 1, py) || !painted(px, py + 1)) selOut.push(at);
    }
  }
  for (const at of rim) toneAt[at] = 'light';
  for (const at of selOut) toneAt[at] = 'shade';

  const sprite = new ObjectSprite();
  // No ground shadow in the picture: it is cast from the sun where the object stands.
  // ---- colour, with a shade line on a part where a nearer part of the same colour covers it
  const N4 = [[1, 0], [-1, 0], [0, -1], [0, 1]] as const;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const at = py * W + px;
      const i = owner[at];
      if (i < 0) continue;
      const p = prop.parts[i];
      let tone = toneAt[at];
      if (plain(i)) for (const [dx, dy] of N4) {
        const o = onCanvas(px + dx, py + dy) ? owner[(py + dy) * W + px + dx] : -1;
        if (o >= 0 && o !== i && prop.parts[o].color === p.color && depth[(py + dy) * W + px + dx] > depth[at] + 2) tone = 'shade';
      }
      sprite.set(px, py, PALETTE[p.color][tone]);
    }
  }

  const points = Object.fromEntries(prop.points.map((pt) => {
    const q = project(pt.x, pt.y, pt.z);
    const seen = onCanvas(q.x, q.y) && q.s >= depth[q.y * W + q.x] - 1.5;
    return [pt.name, { x: q.x, y: q.y, visible: seen }];
  }));
  return { sprite, points, partAt: owner };
}

/** Rows from the top of the drawn object to the floor at its middle, turn 0. */
export function heightOf(prop: Build): number {
  const { sprite } = drawObject(prop, 0);
  for (let y = 0; y < OBJECT_H; y++) for (let x = 0; x < OBJECT_W; x++) if (sprite.get(x, y)) return OY - y;
  return 0;
}

// ------------------------------------------------------------------ files

/** Where the object editor keeps its work on this device: the object being worked on, My things, and which of them is picked. */
export const OBJECT_STORE = { draft: 'pixel-object-draft', roster: 'pixel-objects', current: 'pixel-objects-current' } as const;
/** The objects in My things. */
export const savedProps = () => savedList(OBJECT_STORE.roster, 'prop', cleanBuild);

const FILE_TYPE = 'pixel-object';
export const propFile = (name: string, prop: Build) => JSON.stringify({ type: FILE_TYPE, version: 1, name, object: prop }, null, 2);
export function readPropFile(text: string): { name: string; prop: Build } {
  const raw = JSON.parse(text);
  if (!raw || raw.type !== FILE_TYPE) throw new Error('not a pixel-object file');
  return { name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : 'Object', prop: cleanBuild(raw.object) };
}
