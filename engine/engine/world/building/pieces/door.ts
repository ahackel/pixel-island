// A door on a cell edge (ways.ts `SceneDoor`): two posts and a lintel as tall as the wall it stands in, and a leaf of
// planks between them that swings back, away from the camera, as it opens (`open`, 0 to 1). Locked, the leaf shows two
// iron bands and a lock. A low one (in a fence) is a gate: posts and a leaf, no lintel. It dissolves down to a stub with
// the run of wall it stands in (`fade`). A hidden door is not drawn by this: it takes the look of the wall beside it.
import { mix, WOOD, type Rgb } from '../../faces.ts';
import { toScreen } from '../../terrain.ts';
import { dissolved, STUB_PX, TONE, wallEnds, type EdgeKind } from '../building.ts';
import { boxOf, sheet } from './built-wall.ts';

const IRON: Rgb = [74, 78, 88], BRASS: Rgb = [216, 168, 64];
/** How far a door's leaf swings at its widest, in radians: not quite a right angle. */
const SWING = 1.45;
/** Up to this height a door is a gate, in levels. */
const GATE = 3;

export function door(): EdgeKind {
  return {
    on: 'edge',
    draw(site, e, height, { fade = 0, open = 0, locked = false }) {
      const o = site.ground.origin;
      const fl = Math.max(...wallEnds(site.map, e).high);
      const gate = height <= GATE;
      const leafTop = fl + (gate ? height * 0.85 : Math.min(height, 5) * 0.84), top = fl + height;
      const dir: [number, number] = e.axis === 'H' ? [1, 0] : [0, 1];
      const back: [number, number] = e.axis === 'H' ? [0, -1] : [-1, 0];
      const at = (t: number): [number, number] => [e.i + dir[0] * t, e.j + dir[1] * t];
      const scr = (p: [number, number], level: number) => {
        const s = toScreen(p[0], p[1], level);
        return { x: o.x + s.x, y: o.y + s.y };
      };
      // The picture's frame: the edge from the floor to the top, and the leaf swung back.
      const reach = [scr(at(0), top), scr(at(1), top), scr(at(0), fl), scr(at(1), fl), scr([e.i + back[0], e.j + back[1]], top), scr([e.i + back[0] + dir[0], e.j + back[1] + dir[1]], fl)];
      const x0 = Math.floor(Math.min(...reach.map((p) => p.x))) - 2, x1 = Math.ceil(Math.max(...reach.map((p) => p.x))) + 2;
      const y0 = Math.floor(Math.min(...reach.map((p) => p.y))) - 2, y1 = Math.ceil(Math.max(...reach.map((p) => p.y))) + 2;
      const w = x1 - x0, h = y1 - y0;
      const rgba = new Uint8ClampedArray(w * h * 4);
      const base = new Float32Array(w * h);
      const edgeTone = e.axis === 'H' ? TONE['+j'] : TONE['+i'];
      /** A flat upright quad from map point a to b, between two levels, each pixel by where it lies on it (s along, r up). */
      const quad = (a: [number, number], b: [number, number], h0: number, h1: number, tone: number, shade: (s: number, r: number) => Rgb) => {
        const pa = scr(a, 0), pb = scr(b, 0);
        const n = Math.max(1, Math.round(Math.abs(pb.x - pa.x)));
        for (let k = 0; k <= n; k++) {
          const s = k / n;
          const p: [number, number] = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
          const lo = scr(p, h0), hi = scr(p, h1), stub = scr(p, fl).y - STUB_PX;
          const x = Math.round(lo.x);
          for (let y = Math.round(hi.y); y <= Math.round(lo.y); y++) {
            if (y < stub && dissolved(x, y, fade)) continue;
            const r = (lo.y - y) / Math.max(1, lo.y - hi.y);
            const c = shade(s, r).map((v) => v * tone);
            const lx = x - x0, ly = y - y0;
            if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue;
            const q = ly * w + lx;
            rgba[q * 4] = c[0]; rgba[q * 4 + 1] = c[1]; rgba[q * 4 + 2] = c[2]; rgba[q * 4 + 3] = 255;
            base[q] = fl;
          }
        }
      };
      // The leaf first: swung back, it lies behind the frame.
      const angle = open * SWING, hinge = at(0.1), len = 0.8;
      const end: [number, number] = [hinge[0] + len * (dir[0] * Math.cos(angle) + back[0] * Math.sin(angle)), hinge[1] + len * (dir[1] * Math.cos(angle) + back[1] * Math.sin(angle))];
      const turned = e.axis === 'H' ? TONE['+i'] : TONE['+j'];
      const leafTone = edgeTone + (turned - edgeTone) * Math.sin(angle);
      const seed = (e.i * 31 + e.j * 17 + (e.axis === 'H' ? 7 : 0)) >>> 0;
      quad(hinge, end, fl, leafTop, leafTone, (s, r) => {
        if (locked && (Math.abs(r - 0.22) < 0.05 || Math.abs(r - 0.72) < 0.05)) return IRON;
        if (locked && Math.abs(s - 0.8) < 0.07 && Math.abs(r - 0.45) < 0.06) return BRASS;
        const plank = Math.floor(s * 5);
        if ((s * 5) % 1 < 0.18) return WOOD.dark;
        if (r > 0.97) return WOOD.light;
        return ((plank * 7 + Math.floor(r * 9) * 3 + seed) % 5) === 0 ? WOOD.light : WOOD.wood;
      });
      // The frame: a post at each end, the lintel over the leaf.
      const post = (s: number, r: number) => (r > 0.985 || s < 0.3 ? WOOD.light : WOOD.dark);
      quad(at(0), at(0.1), fl, top, edgeTone, post);
      quad(at(0.9), at(1), fl, top, edgeTone, post);
      if (!gate) quad(at(0.1), at(0.9), leafTop, top, edgeTone, (_, r) => (r > 0.8 ? WOOD.light : r < 0.25 ? mix(WOOD.dark, [0, 0, 0], 0.3) : WOOD.wood));
      // Its shadow, as a wall's: a sheet the door's height (the leaf's swing does not show in it).
      const shadow = sheet(site, e, [fl, fl], height * (1 - fade) + fade);
      return { x: x0, y: y0, w, h, rgba, base, ci: e.i, cj: e.j, box: boxOf(e, 0.06), key: e.i + e.j + 0.5, edge: e, shadow };
    },
  };
}
