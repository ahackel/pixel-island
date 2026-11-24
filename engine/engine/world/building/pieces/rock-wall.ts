// A wall of natural rock standing on a cell edge, for caves and cliffs. Not a stack of stones (that
// reads as masonry) but a few large masses split by open cracks, each mass broken into flat facets
// shaded by which way they face: lit on top, mid on the faces turned to the light, dark on the rest.
// Tilted strata run through it, the top is a jagged skyline, and a dark line marks where it meets
// the floor. Masses and facets come from one field over the outline of the floor (how far round it a
// wall is, i + j, and the height up it, sheared by where it is on screen), not per edge, so a run of
// edges reads as one rock face, and the rock goes on round corners without a seam. Drawn by rule per
// screen column like the plank wall. The stone is faces.ts's, and so are the brick and the mine shoring it can be
// built of instead (`material`), standing as a solid block with a straight top.
import { brickAt, h01, mineAt, SHEAR, stoneStep, type Step } from '../../faces.ts';
import { isRock, LEVEL_PX } from '../../terrain.ts';
import { dissolved, endHeights, HALF_H, HALF_W, hex, mul, shadowAt, STUB_PX, TONE, type Box, type EdgeKind } from '../building.ts';

export interface RockWallOptions {
  /** The rock's colour, shaded by the bands below. */
  color: string;
  /**
   * Or a colour already lit for where it stands (a palette entry's three tones), painted as they are: the light tone
   * on facets turned up, the base on those turned to the light, the shade on the rest and in the cracks. For caves,
   * as the old isometric games drew them: the light is in the picture, not laid over it.
   */
  tones: Record<'base' | 'shade' | 'light', string>;
  seed: number;
  /**
   * How many cells back, at most, a black top covers behind the wall, over cells lower than its foot: the rock it
   * stands for is solid, so whatever lies behind it (the faces of walls further back) does not show over its top.
   */
  cap: number;
  /** What it is built of: natural stone (the default), brick, or stone shored up as in a mine. */
  material: 'stone' | 'brick' | 'mine';
}

/** Without `tones`, how bright each step is against the colour. */
const BANDS = [0.42, 0.68, 0.88, 1.14];
/** With `tones`, the crack is the shade tone darkened this much. */
const CRACK = 0.6;
/** How much darker the top of the wall is than its foot, as if it went up into the dark. */
const FADE = 0.3;

export function rockWall(opt: Partial<RockWallOptions> = {}): EdgeKind {
  const base = hex(opt.color ?? '#7d7f86');
  const tones = opt.tones && [mul(hex(opt.tones.shade), CRACK), hex(opt.tones.shade), hex(opt.tones.base), hex(opt.tones.light)];
  const seed = opt.seed ?? 0;
  const capMax = opt.cap ?? 0;
  const material = opt.material ?? 'stone';
  return {
    on: 'edge',
    draw(site, e, height, { cut, fade = 0 }) {
      const { map, ground } = site;
      const sd = map.seed ?? { i: 0, j: 0 };
      const [h0, h1] = endHeights(map, e);
      const o = ground.origin;
      const xmin = o.x + (e.axis === 'H' ? e.i - e.j : e.i - e.j - 1) * HALF_W;
      const sy = o.y + (e.i + e.j) * HALF_H; // the row of the first end at level 0
      const pad = 1;
      const tall = (cut ? height / 2 : height) * LEVEL_PX;
      // The cap: how many cells behind the wall are rock (or ground below its foot).
      let n = 0;
      const low = Math.min(h0, h1);
      while (n < capMax) {
        const ci = e.axis === 'H' ? e.i : e.i - 1 - n, cj = e.axis === 'H' ? e.j - 1 - n : e.j;
        const level = ci >= 0 && cj >= 0 && ci < map.w && cj < map.h ? map.levels[cj * map.w + ci] : -Infinity;
        if (!isRock(level) && level >= low) break;
        n++;
      }
      const w = 16 + 2 * pad + n * HALF_W;
      const y0 = Math.floor(sy - Math.max(h0, h1) * LEVEL_PX - tall) - 12 - n * HALF_H;
      const y1 = Math.ceil(sy + HALF_H - Math.min(h0, h1) * LEVEL_PX) + 2;
      const h = y1 - y0;
      const rgba = new Uint8ClampedArray(w * h * 4);
      const baseOf = new Float32Array(w * h);
      const x0 = xmin - pad - (e.axis === 'V' ? n * HALF_W : 0);
      const ux = e.axis === 'V' ? n * HALF_W : 0; // where the wall's own columns start in the picture
      const tOf = (u: number) => Math.max(0, Math.min(1, e.axis === 'H' ? (u + 0.5) / 16 : 1 - (u + 0.5) / 16));
      const levelAt = (t: number) => h0 + (h1 - h0) * t;
      const footRow = (u: number) => {
        const t = tOf(u);
        return Math.round(sy + HALF_H * t - levelAt(t) * LEVEL_PX);
      };
      // Where round the floor's outline the wall is, in pixels: i + j at its ends, which two walls meeting at a
      // corner share, so the rock runs on round it. Up the wall the field is sheared by the screen column, so walls
      // as far round but elsewhere on screen differ.
      const line = seed * 7919;
      const along = (u: number) => (e.axis === 'H' ? (e.i - sd.i + e.j - sd.j) * 16 + u : (e.i - sd.i + e.j - sd.j + 1) * 16 - u - 1);
      const shear = (u: number) => SHEAR * (xmin + u - o.x - (sd.i - sd.j) * HALF_W);
      // Which way along the wall is left on screen, for the light.
      const leftward = e.axis === 'H' ? 1 : -1;
      const turn = e.axis === 'H' ? TONE['+j'] : TONE['+i'];
      // Flat and black just over the highest peak of the skyline, so no wall in front reaches into it; the notches
      // below it are filled black from the wall's own columns.
      const top = Math.max(h0, h1) * LEVEL_PX + tall + 2;
      if (n > 0) {
        for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
          const a = (x0 + lx + 0.5 - o.x) / HALF_W, b = (y0 + ly + 0.5 - o.y + top) / HALF_H;
          const x = (a + b) / 2, y = (b - a) / 2;
          const on = e.axis === 'H' ? x >= e.i && x <= e.i + 1 && y >= e.j - n && y <= e.j : x >= e.i - n && x <= e.i && y >= e.j && y <= e.j + 1;
          if (!on || dissolved(x0 + lx, y0 + ly, fade)) continue;
          const p = ly * w + lx;
          rgba[p * 4 + 3] = 255;
          baseOf[p] = Math.max(h0, h1);
        }
      }
      for (let u = -pad; u < 16 + pad; u++) {
        const a = along(u);
        const sh = shear(u);
        // The jagged skyline: peaks and notches along the line, a few pixels either way.
        // Built walls have a straight top.
        const sky = material !== 'stone' ? Math.round(tall) : Math.round(tall - 3 + 6 * (h01(line, Math.floor(a / 5), 9) - 0.5) + 3 * (h01(line, Math.floor(a / 2), 8) - 0.5));
        const foot = footRow(u);
        if (n > 0) for (let v = sky + 1; v <= top - levelAt(tOf(u)) * LEVEL_PX; v++) {
          const lx = u + pad + ux, ly = foot - v - y0;
          if (lx < 0 || lx >= w || ly < 0 || ly >= h || (v > STUB_PX && dissolved(x0 + lx, y0 + ly, fade))) continue;
          const p = ly * w + lx;
          rgba[p * 4] = rgba[p * 4 + 1] = rgba[p * 4 + 2] = 0; rgba[p * 4 + 3] = 255;
          baseOf[p] = levelAt(tOf(u));
        }
        for (let v = -1; v <= sky; v++) {
          // Dissolving, it goes down to a stub a level high, whose top catches the light where the rock over it is gone.
          if (v > STUB_PX && dissolved(x0 + u + pad + ux, foot - v, fade)) continue;
          // The skyline's own pixel is a lit edge, and so is the stub's where the rock over it is gone.
          const edge = v === sky || (v === STUB_PX && dissolved(x0 + u + pad + ux, foot - v - 1, fade));
          // The dark line where the rock meets the floor, else the stone.
          let step: Step = v <= 0 ? 0 : stoneStep(line, a, v, sh, leftward);
          if (edge && step > 0) step = 3;
          const dim = 1 - FADE * Math.max(0, Math.min(1, v / tall));
          let px = tones ? mul(tones[step], dim) : mul(base, BANDS[step] * turn * dim);
          if (material !== 'stone' && v > 0) {
            const down = edge ? 0 : sky - v, shaded = e.axis === 'V';
            const built = material === 'brick' ? brickAt(a, v, down, shaded) : mineAt(a, v, down, shaded);
            if (built) px = mul(built, dim);
          }
          const lx = u + pad + ux, ly = foot - v - y0;
          if (lx < 0 || lx >= w || ly < 0 || ly >= h) continue;
          const p = ly * w + lx;
          rgba[p * 4] = px[0]; rgba[p * 4 + 1] = px[1]; rgba[p * 4 + 2] = px[2]; rgba[p * 4 + 3] = 255;
          baseOf[p] = levelAt(tOf(u));
        }
      }

      // Its shadow on the ground: the wall as a sheet from its foot to its top.
      const shadow: number[] = [];
      // Dissolving, a little less of it stands to cast one.
      const levels = (tall + (STUB_PX - tall) * fade) / LEVEL_PX;
      for (let s = 0; s <= 1; s += 1 / 48) {
        const g = h0 + (h1 - h0) * s;
        const [x, y] = e.axis === 'H' ? [e.i + s, e.j] : [e.i, e.j + s];
        for (let up = 0; up <= levels; up += 1 / 10) shadowAt(site, shadow, x, y, g, up);
      }
      const t = 0.2; // a rock wall is thick on the plan
      const box: Box = e.axis === 'H' ? { x0: e.i, x1: e.i + 1, y0: e.j - t, y1: e.j + t } : { x0: e.i - t, x1: e.i + t, y0: e.j, y1: e.j + 1 };
      return { x: x0, y: y0, w, h, rgba, base: baseOf, ci: e.i, cj: e.j, box, key: e.i + e.j + 0.5, edge: e, shadow };
    },
  };
}
