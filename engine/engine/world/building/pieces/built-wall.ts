// Thin walls built on a cell edge, for scenes (`Scene.walls`): a slab of brick or of stone, painted by faces.ts as
// the ground's step faces are, and a fence of posts and two rails. A slab's height counts from the higher side of the
// edge and it reaches down a step to the lower one; a fence stands on the higher side. Both can dissolve (`fade`) down
// to a stub a level high, as the cave's rock does; games keep fences from doing so (walls.ts `fades`). Drawn by rule per
// screen column like the rock wall.
import { brickAt, mix, rgbOf, stoneStep, SHEAR, WOOD, type Rgb } from '../../faces.ts';
import { LEVEL_PX } from '../../terrain.ts';
import { dissolved, HALF_H, HALF_W, mul, shadowAt, STUB_PX, TONE, wallEnds, type Box, type Edge, type EdgeKind, type Site } from '../building.ts';

/** Stone in daylight, crack to light. */
const DAY_STONE: Rgb[] = ['#4a4642', '#7f7b74', '#9a968e', '#c2beb5'].map(rgbOf);

export interface BuiltWallOptions {
  material: 'brick' | 'stone';
  /** How thick it is on the plan, in tiles: its top shows as a strip that many tiles deep. */
  thick: number;
  /** Stone's tones, crack to light (faces.ts `stoneTones`): a cave's painted ones in the dark, else daylight's. */
  tones?: Rgb[];
}

/** Where a wall's columns lie: its edge on the ground image, along the floor's outline and down its slope. */
function layout(site: Site, e: Edge, pad: number) {
  const { map, ground } = site;
  const sd = map.seed ?? { i: 0, j: 0 };
  const o = ground.origin;
  const xmin = o.x + (e.axis === 'H' ? e.i - e.j : e.i - e.j - 1) * HALF_W;
  const sy = o.y + (e.i + e.j) * HALF_H; // the row of the first end at level 0
  const tOf = (u: number) => Math.max(0, Math.min(1, e.axis === 'H' ? (u + 0.5) / 16 : 1 - (u + 0.5) / 16));
  return {
    x0: xmin - pad, sy, tOf,
    rowAt: (u: number, level: number) => Math.round(sy + HALF_H * tOf(u) - level * LEVEL_PX),
    along: (u: number) => (e.axis === 'H' ? (e.i - sd.i + e.j - sd.j) * 16 + u : (e.i - sd.i + e.j - sd.j + 1) * 16 - u - 1),
    shear: (u: number) => SHEAR * (xmin + u - o.x - (sd.i - sd.j) * HALF_W),
  };
}

/** Its shadow on the ground: a sheet from `from` (per end) up `tall` levels. */
export function sheet(site: Site, e: Edge, from: [number, number], tall: number): number[] {
  const shadow: number[] = [];
  for (let s = 0; s <= 1; s += 1 / 48) {
    const g = from[0] + (from[1] - from[0]) * s;
    const [x, y] = e.axis === 'H' ? [e.i + s, e.j] : [e.i, e.j + s];
    for (let up = 0; up <= tall; up += 1 / 10) shadowAt(site, shadow, x, y, g, up);
  }
  return shadow;
}

export const boxOf = (e: Edge, t: number): Box => (e.axis === 'H' ? { x0: e.i, x1: e.i + 1, y0: e.j - t, y1: e.j + t } : { x0: e.i - t, x1: e.i + t, y0: e.j, y1: e.j + 1 });

/** A slab of brick or stone on an edge. */
export function builtWall(opt: BuiltWallOptions): EdgeKind {
  const tones = opt.tones ?? DAY_STONE;
  const strip = Math.max(1, Math.round(opt.thick * HALF_H * 2));
  return {
    on: 'edge',
    draw(site, e, height, { cut, cap, fade = 0 }) {
      const { foot: low, high } = wallEnds(site.map, e);
      const tall = cut ? height / 2 : height;
      const pad = 1;
      const L = layout(site, e, pad);
      const lvl = (u: number, ends: [number, number]) => ends[0] + (ends[1] - ends[0]) * L.tOf(u);
      const w = 16 + 2 * pad;
      const y0 = Math.floor(L.sy - (Math.max(...high) + tall) * LEVEL_PX) - strip - 2;
      const y1 = Math.ceil(L.sy + HALF_H - Math.min(...low) * LEVEL_PX) + 2;
      const h = y1 - y0;
      const rgba = new Uint8ClampedArray(w * h * 4);
      const base = new Float32Array(w * h);
      const shaded = e.axis === 'V';
      const leftward = e.axis === 'H' ? 1 : -1;
      const turn = e.axis === 'H' ? TONE['+j'] : TONE['+i'];
      for (let u = -pad; u < 16 + pad; u++) {
        const foot = lvl(u, low), on = lvl(u, high);
        const bottom = L.rowAt(u, foot), top = L.rowAt(u, on + (cap !== undefined ? Math.min(tall, cap - on) : tall));
        const stub = L.rowAt(u, on) - STUB_PX;
        const a = L.along(u), sh = L.shear(u);
        const lx = u + pad;
        for (let y = top - strip; y <= bottom; y++) {
          if (y < stub && dissolved(L.x0 + lx, y, fade)) continue;
          const v = bottom - y, down = y - top;
          // The top strip, lit, and the stub's top where the wall over it is gone.
          const edge = y < top || (y === stub && dissolved(L.x0 + lx, y - 1, fade));
          let px: number[];
          if (opt.material === 'brick') px = edge ? brickAt(a, v, 0, false) : brickAt(a, v, down, shaded);
          else px = mul(tones[edge ? 3 : v <= 0 ? 0 : stoneStep(7919, a, v, sh, leftward)], opt.tones ? 1 : turn);
          const ly = y - y0;
          if (ly < 0 || ly >= h) continue;
          const p = ly * w + lx;
          rgba[p * 4] = px[0]; rgba[p * 4 + 1] = px[1]; rgba[p * 4 + 2] = px[2]; rgba[p * 4 + 3] = 255;
          base[p] = foot;
        }
      }
      const shadow = sheet(site, e, high, tall * (1 - fade) + fade);
      return { x: L.x0, y: y0, w, h, rgba, base, ci: e.i, cj: e.j, box: boxOf(e, opt.thick / 2), key: e.i + e.j + 0.5, edge: e, shadow };
    },
  };
}

/** A fence on an edge: a post every half cell and two rails, standing on the higher side. */
export function fence(): EdgeKind {
  return {
    on: 'edge',
    draw(site, e, height, { fade = 0 }) {
      const { high } = wallEnds(site.map, e);
      const pad = 1;
      const L = layout(site, e, pad);
      const w = 16 + 2 * pad;
      const y0 = Math.floor(L.sy - (Math.max(...high) + height) * LEVEL_PX) - 2;
      const y1 = Math.ceil(L.sy + HALF_H - Math.min(...high) * LEVEL_PX) + 2;
      const h = y1 - y0;
      const rgba = new Uint8ClampedArray(w * h * 4);
      const base = new Float32Array(w * h);
      const shaded = e.axis === 'V';
      const tall = height * LEVEL_PX;
      // Rails at these heights over the ground, in pixels, as a share of the fence's height.
      const rails = [[0.38, 0.52], [0.75, 0.9]].map(([a, b]) => [Math.round(a * tall), Math.round(b * tall)]);
      for (let u = -pad; u < 16 + pad; u++) {
        const on = high[0] + (high[1] - high[0]) * L.tOf(u);
        const bottom = L.rowAt(u, on);
        const a = L.along(u), m = ((a % 8) + 8) % 8;
        const post = m < 2 && u >= 0 && u < 16;
        const lx = u + pad;
        for (let v = 0; v <= tall; v++) {
          const rail = rails.some(([r0, r1]) => v >= r0 && v <= r1);
          if (!post && !rail) continue;
          const y = bottom - v;
          if (v > STUB_PX && dissolved(L.x0 + lx, y, fade)) continue;
          let c: Rgb = post ? (v >= tall - 1 ? WOOD.light : m < 1 ? WOOD.light : WOOD.wood) : v === rails.find(([r0, r1]) => v >= r0 && v <= r1)![0] ? WOOD.dark : WOOD.light;
          if (shaded) c = mix(c, [0, 0, 0], 0.25);
          const ly = y - y0;
          if (ly < 0 || ly >= h) continue;
          const p = ly * w + lx;
          rgba[p * 4] = c[0]; rgba[p * 4 + 1] = c[1]; rgba[p * 4 + 2] = c[2]; rgba[p * 4 + 3] = 255;
          base[p] = on;
        }
      }
      return { x: L.x0, y: y0, w, h, rgba, base, ci: e.i, cj: e.j, box: boxOf(e, 0.03), key: e.i + e.j + 0.5, edge: e, shadow: sheet(site, e, high, height * 0.6) };
    },
  };
}
