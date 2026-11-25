// A wall drawn from painted art on a cell edge. The art is kept in wall space: one column per screen
// column along the edge (the edge's 16 and whatever pokes past its ends), each column's rows counted
// up from where that column meets the ground. Drawing stands every column on the ground under it, so
// one picture follows slopes and stands on top across a cliff, as the rule-drawn walls do. A V edge
// shows the same columns in the shade of its side (TONE). Made by hand, or by freezing a rule wall
// (`freezeWall`) and polishing it in the wall editor (tools/walls).
import { hexOf } from '../../../core/palette.ts';
import { blankGrid, cellForHex, gridsOf, toArt, type Art, type Grid } from '../../../core/stamp.ts';
import { createHeightMap, LEVEL_PX, renderTerrain } from '../../terrain.ts';
import { dissolved, endHeights, HALF_H, HALF_W, hex, mul, shadowAt, STUB_PX, TONE, type Box, type EdgeKind } from '../building.ts';

/** The row the foot of edge column `c` stands on, at level 0, from the first end's row `sy`. */
const tOf = (axis: 'H' | 'V', c: number) => (axis === 'H' ? (c + 0.5) / 16 : 1 - (c + 0.5) / 16);

export function paintedWall(art: Art): EdgeKind {
  const grid: Grid = gridsOf(art)[0] ?? blankGrid(art.w, art.h);
  const rgbs = grid.map((row) => row.map((c) => (c ? hex(hexOf(c)) : null)));
  // How tall the painting stands over its foot, in levels: for its shadow.
  let top = art.oy;
  for (let y = 0; y < art.h && top === art.oy; y++) if (rgbs[y].some(Boolean)) top = y;
  const tall = (art.oy - top) / LEVEL_PX;
  return {
    on: 'edge',
    draw(site, e, height, { cut, cap, fade = 0 }) {
      const { map, ground } = site;
      const [h0, h1] = endHeights(map, e);
      const o = ground.origin;
      const xmin = o.x + (e.axis === 'H' ? e.i - e.j : e.i - e.j - 1) * HALF_W;
      const sy = o.y + (e.i + e.j) * HALF_H;
      const w = art.w;
      const x0 = xmin - art.ox;
      const lvl = (t: number) => h0 + (h1 - h0) * t;
      const rowAt = (t: number, level: number) => Math.round(sy + HALF_H * t - level * LEVEL_PX);
      const y0 = Math.floor(sy - Math.max(h0, h1) * LEVEL_PX) - art.oy - HALF_H - 2;
      const y1 = Math.ceil(sy + HALF_H * 2 - Math.min(h0, h1) * LEVEL_PX) + (art.h - art.oy) + 2;
      const h = y1 - y0;
      const rgba = new Uint8ClampedArray(w * h * 4);
      const base = new Float32Array(w * h);
      const tone = e.axis === 'H' ? TONE['+j'] : TONE['+i'];
      for (let c = 0; c < w; c++) {
        const t = tOf(e.axis, c - art.ox);
        const level = lvl(t);
        const foot = rowAt(t, level);
        const cutTo = cut ? foot - Math.round((height * LEVEL_PX) / 2) : -Infinity;
        const capTo = cap === undefined ? -Infinity : rowAt(t, cap) + 1;
        const shadeTo = cap === undefined ? -Infinity : rowAt(t, cap) + Math.round(1.5 * LEVEL_PX);
        for (let r = 0; r < art.h; r++) {
          const rgb = rgbs[r][c];
          if (!rgb) continue;
          const y = foot - (art.oy - r);
          if (y < cutTo || y < capTo || (y < foot - STUB_PX && dissolved(x0 + c, y, fade))) continue;
          const ly = y - y0;
          if (ly < 0 || ly >= h) continue;
          const px = mul(rgb, tone * (y < shadeTo ? 0.7 : 1));
          const p = ly * w + c;
          rgba[p * 4] = px[0]; rgba[p * 4 + 1] = px[1]; rgba[p * 4 + 2] = px[2]; rgba[p * 4 + 3] = 255;
          base[p] = level;
        }
      }
      // Its shadow: the wall as a sheet from its foot to the top of the painting.
      const shadow: number[] = [];
      for (let s = 0; s <= 1; s += 1 / 48) {
        const g = h0 + (h1 - h0) * s;
        const up = cut ? Math.min(tall, height / 2) : cap !== undefined ? Math.min(tall, cap - g) : tall;
        const [x, y] = e.axis === 'H' ? [e.i + s, e.j] : [e.i, e.j + s];
        for (let u = 0; u <= up; u += 1 / 10) shadowAt(site, shadow, x, y, g, u);
      }
      const th = 0.06;
      const box: Box = e.axis === 'H' ? { x0: e.i, x1: e.i + 1, y0: e.j - th, y1: e.j + th } : { x0: e.i - th, x1: e.i + th, y0: e.j, y1: e.j + 1 };
      return { x: x0, y: y0, w, h, rgba, base, ci: e.i, cj: e.j, box, key: e.i + e.j + 0.5, edge: e, shadow };
    },
  };
}

/**
 * Freezes a rule-drawn wall into wall-space art: it is drawn on flat ground along an H edge, `height`
 * levels tall, and every column is read off from its foot up, in palette cells.
 */
export function freezeWall(kind: EdgeKind, height: number): Art {
  const map = createHeightMap(6, 6, 2);
  const ground = renderTerrain(map);
  const e = { axis: 'H' as const, i: 2, j: 3 };
  const part = kind.draw({ map, ground }, e, height, { cut: false });
  const o = ground.origin;
  const xmin = o.x + (e.i - e.j) * HALF_W;
  const sy = o.y + (e.i + e.j) * HALF_H;
  const level = 2;
  const footOf = (px: number) => Math.round(sy + HALF_H * tOf('H', part.x + px - xmin) - level * LEVEL_PX);
  let up = 0, down = 0;
  const cell = (px: number, py: number) => {
    const k = (py * part.w + px) * 4;
    if (part.rgba[k + 3] < 128) return null;
    return cellForHex('#' + [0, 1, 2].map((n) => part.rgba[k + n].toString(16).padStart(2, '0')).join(''));
  };
  for (let px = 0; px < part.w; px++) for (let py = 0; py < part.h; py++) {
    if (!cell(px, py)) continue;
    const foot = footOf(px) - part.y;
    up = Math.max(up, foot - py);
    down = Math.max(down, py - foot);
  }
  up += 2;
  const h = up + down + 1;
  const grid = blankGrid(part.w, h);
  for (let px = 0; px < part.w; px++) {
    const foot = footOf(px) - part.y;
    for (let r = 0; r < h; r++) {
      const py = foot - (up - r);
      if (py >= 0 && py < part.h) grid[r][px] = cell(px, py);
    }
  }
  return toArt([grid], xmin - part.x, up);
}
