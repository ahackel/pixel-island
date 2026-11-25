// A wall of driftwood planks standing on a cell edge. Drawn by rule per screen column, so a sloped
// edge needs no sloped picture; every edge shows the same tile (the seed picks it), each plank with
// its own width, height, lean, knot and nails, poking past the ends by up to `overhang` pixels.
import { hashOf, rng } from '../../../../shared/random.ts';
import { LEVEL_PX } from '../../terrain.ts';
import { dissolved, HALF_H, HALF_W, hex, mul, shadowAt, STUB_PX, TONE, wallEnds, type Box, type EdgeKind } from '../building.ts';

const WOOD = ['#b0824f', '#9e7142', '#bd9060', '#8f6439'].map(hex);
const NAIL = [74, 58, 48];

export interface PlankWallOptions {
  /** Pixels a plank may poke past the ends of its edge and lean sideways at its top. */
  overhang: number;
  /** The top line: following the slope, stepping by whole levels, or flat at the highest end. */
  top: 'slope' | 'stepped' | 'flat';
  seed: number;
}

export function plankWall(opt: PlankWallOptions): EdgeKind {
  return {
    on: 'edge',
    draw(site, e, height, { cut, cap, fade = 0 }) {
      const { map, ground } = site;
      // Its height counts from the higher side; down a step it reaches to the lower.
      const { foot: low, high: [h0, h1] } = wallEnds(map, e);
      const oh = opt.overhang;
      // One tile for every edge; a tile painted per edge would put its id in this seed.
      const random = rng(hashOf(`plank|${opt.seed}`));
      const o = ground.origin;
      const xmin = o.x + (e.axis === 'H' ? e.i - e.j : e.i - e.j - 1) * HALF_W;
      const sy = o.y + (e.i + e.j) * HALF_H; // the row of the first end at level 0
      const pad = oh + 3;
      const w = 16 + 2 * pad;
      const topMax = Math.max(h0, h1) + height;
      const y0 = Math.floor(sy - (topMax + 1) * LEVEL_PX) - 8;
      const y1 = Math.ceil(sy + HALF_H - Math.min(...low) * LEVEL_PX) + 6;
      const h = y1 - y0;
      const rgba = new Uint8ClampedArray(w * h * 4);
      const base = new Float32Array(w * h);
      const x0 = xmin - pad;
      const tOf = (c: number) => (e.axis === 'H' ? (c + 0.5) / 16 : 1 - (c + 0.5) / 16);
      const lvl = (t: number) => h0 + (h1 - h0) * t;
      const footOf = (t: number) => low[0] + (low[1] - low[0]) * t;
      const rowAt = (t: number, level: number) => Math.round(sy + HALF_H * t - level * LEVEL_PX);
      const tone = e.axis === 'H' ? TONE['+j'] : TONE['+i'];
      const put = (lx: number, ly: number, rgb: number[], level: number) => {
        if (lx < 0 || ly < 0 || lx >= w || ly >= h) return;
        const p = ly * w + lx;
        rgba[p * 4] = rgb[0]; rgba[p * 4 + 1] = rgb[1]; rgba[p * 4 + 2] = rgb[2]; rgba[p * 4 + 3] = 255;
        base[p] = level;
      };

      let c = -Math.floor(random() * (oh + 1)); // the first plank may poke out past the end
      const end = 16 + Math.floor(random() * (oh + 1));
      while (c < end) {
        const wd = 2 + Math.floor(random() * 3);
        const cs = c;
        const ce = Math.min(c + wd, end);
        c += wd;
        if (random() < 0.06 && cs > 0 && ce < 16) continue; // a missing plank
        const col = mul(WOOD[Math.floor(random() * WOOD.length)], tone);
        const jag = Math.floor(random() * 4) + (random() < 0.15 ? 5 : 0); // some planks are shorter, a few taller
        const slant = random() < 0.4 ? (random() < 0.5 ? -1 : 1) : 0;
        const lean = oh > 0 ? Math.round((random() - 0.5) * oh) : 0; // how far the top of the plank leans sideways
        const sink = random() < 0.3 ? 1 : 0;
        const knot = random() < 0.35 ? [cs + Math.floor(random() * (ce - cs)), Math.floor(random() * 12) + 4] : null;
        const mid = (cs + ce - 1) / 2;
        const steppedTop = Math.round(lvl(tOf(mid))) + height;
        const flatTop = Math.max(h0, h1) + height;
        for (let cc = cs; cc < ce; cc++) {
          const t = tOf(cc);
          const level = lvl(t), foot = footOf(t);
          const bottom = rowAt(t, foot) + sink;
          // Dissolving, it goes down to a stub a level over the higher side.
          const stub = rowAt(t, level) - STUB_PX;
          const topLevel = opt.top === 'slope' ? level + height : opt.top === 'stepped' ? steppedTop : flatTop;
          const slantPx = slant && ce - cs > 1 ? Math.round((slant * (cc - cs)) / (ce - cs - 1)) : 0;
          let top = cut ? bottom - Math.round((height * LEVEL_PX) / 2) : Math.min(bottom - 3, rowAt(t, topLevel) - jag + slantPx);
          if (cap !== undefined) top = Math.max(top, rowAt(t, cap) + 1);
          const shadeTo = cap === undefined ? -Infinity : rowAt(t, cap) + Math.round(1.5 * LEVEL_PX); // the eaves' shadow on the wall
          const span = Math.max(1, bottom - top);
          for (let y = top; y <= bottom; y++) {
            const shift = Math.round((lean * (bottom - y)) / span);
            let k = y < shadeTo ? 0.7 : 1;
            if (y === top) k *= 1.28; // the cut end of the plank
            else if (cc === cs) k *= 1.12; // its lit edge
            else if (cc === ce - 1 && ce - cs > 1) k *= 0.72; // the seam to the next one
            let px = mul(col, k);
            if (knot && cc === knot[0] && y === bottom - knot[1]) px = mul(col, 0.62);
            const nail = [bottom - Math.round(span * 0.28), bottom - Math.round(span * 0.74)];
            if (cc === Math.floor(mid) && nail.includes(y) && ce - cs > 2) px = NAIL;
            if (y < stub && dissolved(x0 + cc + shift + pad, y, fade)) continue;
            put(cc + shift + pad, y - y0, px, foot);
          }
        }
      }

      // Its shadow on the ground: the wall as a sheet from its foot to its top, sampled finer than a pixel.
      const shadow: number[] = [];
      for (let s = 0; s <= 1; s += 1 / 48) {
        const g = h0 + (h1 - h0) * s;
        const tall = (cut ? height / 2 : cap !== undefined ? Math.min(height, cap - g) : height) * (1 - fade) + fade;
        const [x, y] = e.axis === 'H' ? [e.i + s, e.j] : [e.i, e.j + s];
        for (let up = 0; up <= tall; up += 1 / 10) shadowAt(site, shadow, x, y, g, up);
      }
      const t = 0.06; // wall thickness on the plan
      const box: Box = e.axis === 'H' ? { x0: e.i, x1: e.i + 1, y0: e.j - t, y1: e.j + t } : { x0: e.i - t, x1: e.i + t, y0: e.j, y1: e.j + 1 };
      return { x: x0, y: y0, w, h, rgba, base, ci: e.i, cj: e.j, box, key: e.i + e.j + 0.5, edge: e, shadow };
    },
  };
}
