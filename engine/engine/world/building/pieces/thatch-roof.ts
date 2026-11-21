// A hipped roof of golden palm thatch over a patch of cells: four slopes rising `rise` levels over
// the wall tops, the ridge along the longer side (a point over a square), each slope going on down
// past the walls by `eaves` tiles. Drawn as a height field sampled finer than a pixel, the nearest
// sample (largest i + j) winning each pixel. The thatch is laid in courses along the eaves, each a
// row of fine strands in three tones whose ragged tips hang over the top of the course below,
// which lies in their shadow; the eaves edge hangs in uneven clumps.
import { hashOf, rng } from '../../../../shared/random.ts';
import { LEVEL_PX } from '../../terrain.ts';
import { HALF_H, HALF_W, hex, mul, shadowAt, TONE, type CellKind } from '../building.ts';

const THATCH = ['#d6a443', '#e3b65a', '#c3913a'].map(hex);
/** Depth of one course, in tiles of slope. */
const COURSE = 0.3;

export interface ThatchRoofOptions {
  /** How far the ridge stands above the wall tops, in levels. */
  rise: number;
  /** How far the roof reaches past the walls, in tiles. */
  eaves: number;
  seed: number;
}

export function thatchRoof(opt: ThatchRoofOptions): CellKind {
  return {
    on: 'cell',
    covers: true,
    draw(site, r, floor, height) {
      const o = site.ground.origin;
      const eave = floor + height;
      const shadow: number[] = [];
      const alongI = r.i1 - r.i0 >= r.j1 - r.j0; // the ridge runs along i
      // u across the ridge, v along it, in map units.
      const [a0, a1] = alongI ? [r.j0, r.j1 + 1] : [r.i0, r.i1 + 1];
      const [b0, b1] = alongI ? [r.i0, r.i1 + 1] : [r.j0, r.j1 + 1];
      const midU = (a0 + a1) / 2, midV = (b0 + b1) / 2, half = (a1 - a0) / 2, halfV = (b1 - b0) / 2;
      const ov = opt.eaves;
      const toXY = (u: number, v: number) => (alongI ? [v, u] : [u, v]);
      const random = rng(hashOf(`roof|${opt.seed}`));
      const strandHash = Array.from({ length: 4096 }, () => random());
      const strand = (k: number) => strandHash[((k % 4096) + 4096) % 4096];

      const samples: { x: number; y: number; d: number; rgb: number[] }[] = [];
      const step = 1 / 40;
      const hang = (k: number, c: number) => 0.1 + strand(k * 7 + c * 13) * 0.3; // how far a strand's tip hangs below its course
      for (let v = b0 - ov; v <= b1 + ov; v += step) {
        for (let u = a0 - ov; u <= a1 + ov; u += step) {
          const eSide = half + ov - Math.abs(u - midU); // up the long slope from its eaves
          const eEnd = halfV + ov - Math.abs(v - midV); // up the hip end from its eaves
          const side = eSide <= eEnd;
          const e = Math.min(eSide, eEnd);
          // Strands run down each slope, so across them is v on the long slopes and u on the hip ends; each about a pixel wide.
          const k = side ? Math.floor((v - b0 + 4) * 14) : 900 + Math.floor((u - a0 + 4) * 14);
          // The eaves edge is ragged: clumps of a few strands hang lower or end short, each strand a little on its own.
          const clump = Math.floor(k / 3) + Math.floor(strand(k) * 2);
          if (e < (strand(clump * 5 + 3) ** 2 * 0.8 + strand(k * 7) * 0.3) * COURSE) continue;
          const pos = e / COURSE + 0.4;
          let c = Math.floor(pos);
          const f = pos - c; // 0 at the bottom of course c, 1 at its top
          let k2 = 1;
          if (f > 1 - hang(k, c + 1)) { c++; k2 = 1.08; } // a tip of the course above, hanging over
          else if (f > 0.62) k2 = 0.8; // in the shadow of those tips
          if (Math.abs(eSide - eEnd) < 0.05 || (side && Math.abs(u - midU) < 0.06)) k2 = 0.86; // the hips and the ridge, capped
          const facing = side ? (u > midU ? '+' : '-') : v > midV ? '+' : '-';
          const tone = TONE[`${facing}${side === alongI ? 'j' : 'i'}` as keyof typeof TONE];
          const col = THATCH[Math.floor(strand(k * 31 + c * 17) * THATCH.length)];
          const z = eave + (opt.rise * (e - ov)) / half;
          const [x, y] = toXY(u, v);
          samples.push({ x: Math.round(o.x + (x - y) * HALF_W), y: Math.round(o.y + (x + y) * HALF_H - z * LEVEL_PX), d: x + y, rgb: mul(col, tone * k2) });
          shadowAt(site, shadow, x, y, floor, z - floor);
          shadowAt(site, shadow, x, y, floor, 0); // and the ground right under it
        }
      }

      const xs = samples.map((p) => p.x), ys = samples.map((p) => p.y);
      const x0 = Math.min(...xs), y0 = Math.min(...ys);
      const w = Math.max(...xs) - x0 + 1, h = Math.max(...ys) - y0 + 1;
      const rgba = new Uint8ClampedArray(w * h * 4);
      const base = new Float32Array(w * h);
      const depth = new Float32Array(w * h).fill(-Infinity);
      for (const p of samples) {
        const q = (p.y - y0) * w + (p.x - x0);
        if (p.d <= depth[q]) continue;
        depth[q] = p.d;
        rgba.set([p.rgb[0], p.rgb[1], p.rgb[2], 255], q * 4);
        base[q] = eave;
      }
      const [x1, y1] = alongI ? [b1 + ov, a1 + ov] : [a1 + ov, b1 + ov];
      const [xa, ya] = alongI ? [b0 - ov, a0 - ov] : [a0 - ov, b0 - ov];
      return { x: x0, y: y0, w, h, rgba, base, ci: r.i1, cj: r.j1, box: { x0: xa, x1, y0: ya, y1 }, key: x1 + y1, shadow };
    },
  };
}
