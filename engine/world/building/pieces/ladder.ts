// A ladder leaning on the face of a step (ways.ts): two rails a little off the face, a rung every six pixels, standing
// on the lower floor and reaching a level and a half over the top. Down a hole it reaches into the hole's dark, fading
// into it as the hole's own faces do. Drawn as a Part, so it sorts and hides behind nearer ground as walls do.
import { mix, WOOD, type Rgb } from '../../faces.ts';
import { LEVEL_PX, toScreen } from '../../terrain.ts';
import { LADDER_OFF, type LadderView } from '../../ways.ts';
import { TONE, type Part, type Site } from '../building.ts';

/** How deep into a hole the ladder reaches, and over how many levels it fades into the dark, as the hole's faces do. */
const HOLE_REACH = 6, HOLE_FADE = 3.2;
/** How far over the top floor the rails stand, in levels. */
const OVER = 1.5;
/** Along the edge, where the two rails stand. */
const RAILS = [0.28, 0.72];

export function ladderPart(site: Site, L: LadderView): Part {
  const o = site.ground.origin;
  const e = L.edge;
  // Off the face, toward the foot.
  const ni = (L.foot[0] - L.top[0]) * LADDER_OFF, nj = (L.foot[1] - L.top[1]) * LADDER_OFF;
  const along = (s: number): [number, number] => (e.axis === 'H' ? [e.i + s + ni, e.j + nj] : [e.i + ni, e.j + s + nj]);
  const top = L.high + OVER, bottom = L.hole ? L.low - HOLE_REACH : L.low;
  const at = (p: [number, number], level: number) => {
    const s = toScreen(p[0], p[1], level);
    return { x: Math.round(o.x + s.x), y: Math.round(o.y + s.y) };
  };
  const [r0, r1] = RAILS.map(along);
  const ends = [at(r0, top), at(r1, top), at(r0, bottom), at(r1, bottom)];
  const x0 = Math.min(...ends.map((p) => p.x)) - 1, x1 = Math.max(...ends.map((p) => p.x)) + 2;
  const y0 = Math.min(...ends.map((p) => p.y)) - 1, y1 = Math.max(...ends.map((p) => p.y)) + 1;
  const w = x1 - x0, h = y1 - y0;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const base = new Float32Array(w * h);
  // Its face's light: a ladder on a face toward +i is in the shade as such a face is.
  const tone = e.axis === 'V' ? TONE['+i'] : TONE['+j'];
  // Down a hole: its dark, and the faces of the ground behind it that reach down into it.
  const g = site.ground, mw = site.map.w, [hi, hj] = L.foot;
  const pit = new Set([hj * mw + hi, hj * mw + hi - 1, (hj - 1) * mw + hi]);
  const put = (x: number, y: number, c: Rgb, level: number) => {
    const lx = x - x0, ly = y - y0;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) return;
    // Below a hole's rim it shows only down the hole itself, never past the ground round it.
    if (L.hole && level < L.low - 0.05 && (x < 0 || y < 0 || x >= g.w || y >= g.h || !pit.has(g.cell[y * g.w + x]))) return;
    let col = c.map((v) => v * tone);
    if (L.hole && level < L.low) col = mix(col, [0, 0, 0], Math.min(1, Math.round(((L.low - level) / HOLE_FADE) * 10) / 10));
    const p = ly * w + lx;
    rgba[p * 4] = col[0]; rgba[p * 4 + 1] = col[1]; rgba[p * 4 + 2] = col[2]; rgba[p * 4 + 3] = 255;
    // Down a hole, what is below the rim stands that low, so the ground in front of the hole hides it.
    base[p] = L.hole ? Math.min(level, L.low) : L.low;
  };
  for (const r of [r0, r1]) {
    const a = at(r, top), b = at(r, bottom);
    for (let y = a.y; y <= b.y; y++) {
      const level = top - (y - a.y) / LEVEL_PX;
      put(a.x, y, y === a.y ? WOOD.light : WOOD.wood, level);
      put(a.x + 1, y, WOOD.dark, level);
    }
  }
  for (let level = bottom + 0.6; level < top - 0.2; level += 0.75) {
    const a = at(r0, level), b = at(r1, level);
    const n = Math.abs(b.x - a.x);
    // A rung, lit on top, with its shade under it.
    for (let s = 2; s < n; s++) {
      const x = a.x + Math.sign(b.x - a.x) * s, y = Math.round(a.y + ((b.y - a.y) * s) / n);
      put(x, y, WOOD.light, level);
      put(x, y + 1, WOOD.dark, level - 1 / LEVEL_PX);
    }
  }
  // On the plan a thin strip along the face, on the foot's side, so whoever climbs it (a little further out) is in front.
  const fi = L.foot[0] - L.top[0], fj = L.foot[1] - L.top[1];
  const box = e.axis === 'H'
    ? { x0: e.i, x1: e.i + 1, y0: Math.min(e.j, e.j + fj * 0.12), y1: Math.max(e.j, e.j + fj * 0.12) }
    : { x0: Math.min(e.i, e.i + fi * 0.12), x1: Math.max(e.i, e.i + fi * 0.12), y0: e.j, y1: e.j + 1 };
  return { x: x0, y: y0, w, h, rgba, base, ci: L.foot[0], cj: L.foot[1], box, key: (box.x0 + box.x1 + box.y0 + box.y1) / 2, shadow: [], edge: e };
}
