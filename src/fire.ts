// Fire on the island: dry wood to pick up, a palm burnt down to a stump by lightning, flames that
// flicker, a campfire. All small hand-drawn pictures; the stump is cut from the palm's own picture.
import { PALETTE, SHADOW } from '@pixel/engine/core/palette.ts';
import { GLOW_ALPHA } from '@pixel/engine/world/daylight.ts';
import { rgb } from '@pixel/engine/world/ocean.ts';
import type { Picture } from '@pixel/engine/world/island.ts';
import type { Thing } from '@pixel/engine/world/world.ts';
import { compileSprite } from '@pixel/engine/character/items.ts';
import { FLAME_COLORS, FLAMES, flameFrame, shaft, torchRows } from '@pixel/engine/world/flame.ts';
import { picture } from './rows.ts';

const FLAME_PICTURES = FLAMES.map((rows) => picture(rows, FLAME_COLORS));

// A stick lying on the ground: the one held in hand (STICK), laid down along the ground's slope,
// in the same wood with its darker end.
export const WOOD_ROWS = ['..........WW', '.......WWW..', '....w.W.....', '...WWW......', '.WW.........', 'w...........'];
export const WOOD_COLORS: Record<string, string> = { W: PALETTE.wood.base, w: PALETTE.wood.shade };
const WOOD = picture(WOOD_ROWS, WOOD_COLORS);
export const woodThing = (spot: Thing['spot']): Thing => ({ spot, picture: WOOD, w: 12, h: 6, foot: { x: 6, y: 3 } });

/**
 * The stick and the torch held upright in one hand, like the spear: tool items in the wardrobe's
 * sprite format, the shaft in the spear's column, gripped near its foot (the hand is at row 35).
 * Short, so they are told to be held as a pole, not carried in both arms.
 */
export function tool(name: string, rows: string[], more: Record<string, string> = {}, o: { bottom?: number; hold?: 'pole' | 'carry' } = {}): ReturnType<typeof compileSprite>['item'] {
  const top = (o.bottom ?? 40) - rows.length;
  // Centred on the spear's column, however wide.
  const w = Math.max(...rows.map((r) => r.length));
  const grid = (x: number) => Array.from({ length: 48 }, (_, y) => {
    const r = (rows[y - top] ?? '').padEnd(w, '.');
    return ('.'.repeat(x - Math.floor(w / 2)) + r).padEnd(32, '.').slice(0, 32);
  });
  const legend = { W: 'wood', F: 'flame', Y: 'flare', B: 'blaze', ...more };
  return compileSprite({ name, slot: 'tool', legend, front: grid(9), back: grid(23), hold: o.hold ?? 'pole' }).item;
}
export const STICK = tool('Stick', shaft(14));
/** The torch, one item per frame of the flame on the stump: in the palette's letters (B blaze, Y flare, F flame, f its shade). */
const TORCHES = FLAMES.map((rows) => tool('Torch', torchRows(rows, 10)));
export const torchAt = (ms: number) => flameFrame(TORCHES, ms);
// Fire carried in the bag: the same burning stick.
export const TORCH_ROWS = [...FLAMES[0], ...shaft(4)];
export const TORCH_COLORS: Record<string, string> = { ...FLAME_COLORS, ...WOOD_COLORS };

// A campfire: crossed logs with a flame on them.
const LOGS = ['.a.....a.', 'aba...aba', '.abaaaba.', '..ab.ba..'];
const LOG_COLORS: Record<string, string> = { a: PALETTE.bark.shade, b: PALETTE.bark.base, ...FLAME_COLORS };
// The flame's last row sits in the logs' first.
const CAMPFIRES = FLAMES.map((rows) => picture([...rows.slice(0, -1).map((r) => `.${r}.`), ...LOGS], LOG_COLORS));
export function campfireThing(spot: Thing['spot'], ms: number): Thing {
  return { spot, picture: flameFrame(CAMPFIRES, ms, spot.i * 7), w: 9, h: 11, foot: { x: 4, y: 9 } };
}

/** Charcoal by how bright the burnt pixel was. */
const CHAR = ['#141110', '#241e1a', '#3a302a'];
/** How much of a palm is left standing, in pixels above its root. */
const STUMP_PX = 14;

/**
 * A palm struck by lightning, from its standing thing: the top gone, the rest charred black, embers
 * at the break and a flame burning on it. Made once per palm (a stump does not sway), its pixels
 * kept, so its shadow is worked out once too.
 */
const stumps = new Map<string, { stump: Picture; top: { x: number; y: number } }>();
function stumpOf(palm: Thing): { stump: Picture; top: { x: number; y: number } } {
  const key = `${palm.spot.i},${palm.spot.j}`;
  let s = stumps.get(key);
  if (!s) {
    const cut = palm.foot.y - STUMP_PX;
    const xs: number[] = [];
    for (let x = 0; x < palm.w; x++) if (palm.picture.get(x, cut) && palm.picture.get(x, cut) !== SHADOW) xs.push(x);
    const top = { x: xs.length ? Math.round((xs[0] + xs[xs.length - 1]) / 2) : palm.foot.x, y: cut };
    const char = (hex: string) => {
      const [r, g, b] = rgb(hex);
      return CHAR[Math.min(2, Math.floor(((0.3 * r + 0.59 * g + 0.11 * b) / 255) * 4))];
    };
    const pixels = Array.from({ length: palm.w * palm.h }, (_, p) => {
      const x = p % palm.w, y = Math.floor(p / palm.w);
      const c = y < cut ? null : palm.picture.get(x, y);
      if (!c || c === SHADOW) return c;
      return y < cut + 2 ? (x % 2 === y % 2 ? FLAME_COLORS.r : FLAME_COLORS.o) : char(c);
    });
    // Only the size is kept, not the palm: the stump outlives the palm's wind-frame picture.
    const { w, h } = palm;
    const stump: Picture = { get: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : pixels[y * w + x]) };
    stumps.set(key, (s = { stump, top }));
  }
  return s;
}
/** Where a palm breaks, in ground pixels from its foot: where lightning strikes and the stump burns. */
export function breakOf(palm: Thing): { dx: number; dy: number } {
  const { top } = stumpOf(palm);
  return { dx: top.x - palm.foot.x, dy: top.y - palm.foot.y };
}
export function stumpThings(palm: Thing, ms: number): Thing[] {
  const s = stumpOf(palm);
  const flame: Thing = {
    // A hair in front, so it is drawn over the stump.
    spot: { ...palm.spot, i: palm.spot.i + 0.001, j: palm.spot.j + 0.001 },
    picture: flameFrame(FLAME_PICTURES, ms),
    w: 7,
    h: 8,
    foot: { x: 3 - (s.top.x - palm.foot.x), y: 7 + (palm.foot.y - s.top.y) - 1 },
  };
  return [{ ...palm, picture: s.stump }, flame];
}

// ------------------------------------------------------------------ the strike

type Image = { data: Uint8ClampedArray; width: number; height: number };
type Rect = { x: number; y: number };
/** Moves a pixel of the view toward a colour, given in ground pixels; drawn over everything, glowing or not. */
function dot(image: Image, view: Rect, gx: number, gy: number, c: number[], k = 1): void {
  const x = Math.round(gx - view.x), y = Math.round(gy - view.y);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const o = (y * image.width + x) * 4;
  for (let n = 0; n < 3; n++) image.data[o + n] += (c[n] - image.data[o + n]) * k;
}

const WHITE = rgb('#ffffff');
const HALO = rgb('#bcd4ff');
const SOOT = rgb('#000000');
/** How long the bolt shows, in ms: on, a flicker off, on again, as the flash does. */
const BOLT = [[0, 100], [150, 320]];

interface Bit { x: number; y: number; vx: number; vy: number; floor: number; life: number }

/**
 * Lightning striking a palm: a jagged white bolt from the sky down to where it breaks, and the
 * crown bursting into black bits that fly out fast and are gone in a moment. All in ground pixels,
 * worked out from the time since the strike, so nothing needs stepping.
 */
export class Strike {
  private bolt: { x: number; y: number }[][] = [];
  private bits: Bit[] = [];
  constructor(hit: { x: number; y: number }, ground: number, private start: number) {
    // The main stroke from far above, zigzagging, and two short forks off it.
    const main = [{ ...hit }];
    let { x, y } = hit;
    const drift = (Math.random() - 0.5) * 0.8;
    while (y > hit.y - 700) {
      y -= 4 + Math.random() * 6;
      x += (Math.random() - 0.5) * 9 + drift * 6;
      main.push({ x, y });
    }
    this.bolt.push(main);
    for (let f = 0; f < 2; f++) {
      const from = main[3 + Math.floor(Math.random() * 10)];
      const fork = [{ ...from }];
      const side = Math.random() < 0.5 ? -1 : 1;
      for (let n = 0, fx = from.x, fy = from.y; n < 4; n++) fork.push({ x: (fx += side * (3 + Math.random() * 5)), y: (fy += 3 + Math.random() * 5) });
      this.bolt.push(fork);
    }
    for (let n = 0; n < 40; n++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 90;
      this.bits.push({ x: hit.x, y: hit.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, floor: ground + (Math.random() - 0.5) * 8, life: 0.25 + Math.random() * 0.35 });
    }
  }

  done(ms: number): boolean { return ms - this.start > 700; }

  /** Draws the bits and the bolt over the finished, lit picture. */
  draw(image: Image, view: Rect, ms: number): void {
    const e = ms - this.start;
    const t = e / 1000;
    for (const b of this.bits) {
      if (t > b.life) continue;
      const y = Math.min(b.floor, b.y + b.vy * t + 200 * t * t);
      dot(image, view, b.x + b.vx * t, y, SOOT, 1 - t / b.life);
    }
    if (!BOLT.some(([a, z]) => e >= a && e < z)) return;
    for (const stroke of this.bolt) {
      for (let n = 1; n < stroke.length; n++) {
        const p = stroke[n - 1], q = stroke[n];
        const steps = Math.ceil(Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)));
        for (let k = 0; k <= steps; k++) {
          const x = p.x + ((q.x - p.x) * k) / steps, y = p.y + ((q.y - p.y) * k) / steps;
          dot(image, view, x - 1, y, HALO, 0.5);
          dot(image, view, x + 1, y, HALO, 0.5);
          dot(image, view, x, y, WHITE);
        }
      }
    }
  }
}

/**
 * Bits bursting from a point, flying out and up, falling back to the ground and fading: splinters of the crate
 * smashed. In ground pixels, worked out from the time since the start.
 */
export class Burst {
  private bits: (Bit & { c: number[] })[] = [];
  constructor(at: { x: number; y: number }, ground: number, private start: number, colors: string[], n = 24) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 20 + Math.random() * 45;
      this.bits.push({
        x: at.x + (Math.random() - 0.5) * 6, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 45 - Math.random() * 30,
        floor: ground + (Math.random() - 0.5) * 6, life: 0.5 + Math.random() * 0.5, c: rgb(colors[k % colors.length]),
      });
    }
  }

  done(ms: number): boolean { return ms - this.start > 1000; }

  draw(image: Image, view: Rect, ms: number): void {
    const t = (ms - this.start) / 1000;
    for (const b of this.bits) {
      if (t > b.life) continue;
      const y = Math.min(b.floor, b.y + b.vy * t + 160 * t * t);
      const k = Math.min(1, 3 * (1 - t / b.life));
      dot(image, view, b.x + b.vx * t, y, b.c, k);
    }
  }
}

// ------------------------------------------------------------------ sparks

/** How many sparks each pixel along a flame's top edge throws, per second. */
const SPARK_RATE = 0.2;
const SPARK_COLORS = [PALETTE.blaze.base, PALETTE.flare.base, PALETTE.flame.base].map((hex) => rgb(hex));
interface Spark { x: number; y: number; vx: number; vy: number; born: number; life: number; c: number[] }

/**
 * Sparks rising from any fire: a pixel now and then from the top edge of what glows (the stump's
 * flame, a campfire, the torch in hand), drifting up and fading. Kept in ground pixels.
 */
export class Sparks {
  private sparks: Spark[] = [];

  /** Lets the flames in a composed picture throw sparks, `dt` seconds after the last call. */
  spawn(image: Image, view: Rect, ms: number, dt: number): void {
    if (this.sparks.length) this.sparks = this.sparks.filter((s) => ms - s.born < s.life);
    const { width: w, height: h, data: d } = image;
    const chance = SPARK_RATE * dt;
    if (chance <= 0) return;
    for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (d[o + 3] !== GLOW_ALPHA || d[o - w * 4 + 3] === GLOW_ALPHA || Math.random() >= chance) continue;
      this.sparks.push({
        x: x + view.x, y: y + view.y - 1, vx: (Math.random() - 0.5) * 10, vy: -(12 + Math.random() * 14),
        born: ms, life: 500 + Math.random() * 500, c: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
      });
    }
  }

  /** Draws the sparks over the finished, lit picture. */
  draw(image: Image, view: Rect, ms: number): void {
    for (const s of this.sparks) {
      const t = (ms - s.born) / 1000;
      dot(image, view, s.x + s.vx * t + Math.sin(t * 9 + s.vx) * 1.2, s.y + s.vy * t, s.c, 1 - (ms - s.born) / s.life);
    }
  }
}
