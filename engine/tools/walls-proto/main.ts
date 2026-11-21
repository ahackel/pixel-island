// Throwaway prototype, not part of the published site (it is not in vite.config.ts; open it on the
// dev server at /tools/walls-proto/). A test bench for the building system in
// engine/world/building/: plank walls on the EDGES of the cells of a height map and thatch roofs
// painted on cells, over slopes, cliffs and the shore.
//
//  - the pieces are drawn by the engine's piece kinds; this page sorts and stamps them itself, with
//    the scalar key `i + j` (what compose() does now) or a box test on the plan;
//  - the walker shows what the collision padding has to be for the overhang to sort correctly.
import { Viewport } from '../../shared/viewport.ts';
import { AUTHORED } from '../../engine/core/poses.ts';
import { CHARACTER_ORIGIN as FEET, drawCharacter, SPRITE_H, SPRITE_W, type Facing, type Look } from '../../engine/core/puppet.ts';
import { defaultState, loadRoster, lookOf, pickedCharacter, type Saved } from '../../engine/character/character.ts';
import { facingOf } from '../../engine/world/actor.ts';
import {
  createHeightMap, generateIsland, heightAt, hiddenByGround, levelAt, renderTerrain, seaFloor, setLevel,
  LEVEL_PX, SEA_LEVEL, SLOPE_LEVELS, standingHeight, type HeightMap, type TerrainImage,
} from '../../engine/world/terrain.ts';
import {
  blocked, BuildingView, cellKey, edgeKey, emptyBuilding, endHeights, HALF_H, HALF_W, hex, type Axis, type Edge, type Part,
} from '../../engine/world/building/building.ts';
import { plankWall } from '../../engine/world/building/pieces/plank-wall.ts';
import { thatchRoof } from '../../engine/world/building/pieces/thatch-roof.ts';

// ------------------------------------------------------------------ state

const P = {
  height: 4,
  overhang: 3,
  top: 'slope' as 'slope' | 'stepped' | 'flat',
  sort: 'box' as 'box' | 'scalar',
  seed: 1,
  pad: 0.12,
  grid: true,
  terrain: 'proving' as 'proving' | 'island',
  islandSeed: 3,
  paint: 'walls' as 'walls' | 'roof',
  /** How far the ridge stands above the wall tops, in levels. */
  rise: 3,
  /** How far the roof reaches past the walls, in tiles. */
  eaves: 0.3,
  character: '',
};

/** Everything built on the map, as one building. */
const house = emptyBuilding(P.height);
let view: BuildingView;
const kinds = () => ({
  plank: plankWall({ overhang: P.overhang, top: P.top, seed: P.seed }),
  thatch: thatchRoof({ rise: P.rise, eaves: P.eaves, seed: P.seed }),
});
/** Draws afresh with the current options. */
const rebuild = () => { view = new BuildingView(kinds(), { map: sea, ground }); };

/** Something to stamp: a building part, or the walker (whose ground level is one number and who casts no shadow here). */
type Pic = Omit<Part, 'base' | 'shadow'> & { base: Float32Array | number; shadow?: number[] };

let shape: HeightMap; // the map the player edits
let ground: TerrainImage; // its painted picture
let sea: HeightMap; // the map as drawn: the sea floor shaped
let frame: Uint8ClampedArray<ArrayBuffer>;
let shade: Uint8Array; // per frame pixel, 1 where a shadow falls

// ------------------------------------------------------------------ terrain

function provingGround(): HeightMap {
  const n = 24;
  const map = createHeightMap(n, n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const d = Math.min(i, j, n - 1 - i, n - 1 - j);
      let l = d === 0 ? -4 : d === 1 ? -2 : d === 2 ? -1 : d === 3 ? 0 : 1;
      if (d >= 4) {
        if (i >= 6 && i <= 9 && j >= 6 && j <= 9) l = i - 4; // a ramp, one level per tile
        else if (i >= 10 && i <= 13 && j >= 6 && j <= 9) l = 5; // a plateau: cliffs all round
        else if (i >= 15 && i <= 18 && j >= 6 && j <= 9) l = 3; // a two level step
        else if (i >= 4 && i <= 10 && j >= 13) l = 1 + Math.floor((j - 13) / 2); // a gentle slope
      }
      setLevel(map, i, j, l);
    }
  }
  return map;
}

function presetWalls(): void {
  house.edges.clear();
  const add = (axis: Axis, i: number, j: number) => house.edges.set(edgeKey({ axis, i, j }), { kind: 'plank', edge: { axis, i, j } });
  for (let i = 14; i <= 16; i++) { add('H', i, 14); if (i !== 15) add('H', i, 17); } // a 3 by 3 hut with a door in the south wall
  for (let j = 14; j <= 16; j++) { add('V', 14, j); add('V', 17, j); }
  for (let i = 6; i <= 9; i++) add('H', i, 7); // up the one level ramp
  for (let i = 10; i <= 13; i++) add('H', i, 6); // along the top of a cliff
  for (let i = 15; i <= 18; i++) add('H', i, 6); // at the foot of a two level step
  for (let j = 13; j <= 19; j++) add('V', 7, j); // down the gentle slope
  for (let j = 8; j <= 12; j++) add('V', 3, j); // along the waterline
  for (let j = 9; j <= 11; j++) add('V', 2, j); // out in the water
}

function presetRoofs(): void {
  house.cells.clear();
  for (let j = 14; j <= 16; j++) for (let i = 14; i <= 16; i++) house.cells.set(cellKey(i, j), { kind: 'thatch', i, j }); // over the hut
}

function loadTerrain(): void {
  shape = P.terrain === 'proving' ? provingGround() : generateIsland(P.islandSeed, 28, 28, { peak: 6 });
  sea = seaFloor(shape);
  ground = renderTerrain(shape);
  frame = new Uint8ClampedArray(ground.w * ground.h * 4);
  shade = new Uint8Array(ground.w * ground.h);
  full.width = ground.w;
  full.height = ground.h;
  gridCache = null;
  rebuild();
  if (P.terrain === 'proving') { presetWalls(); presetRoofs(); }
  else { house.edges.clear(); house.cells.clear(); }
  walker.x = P.terrain === 'proving' ? 12.5 : shape.w / 2 + 0.5;
  walker.y = P.terrain === 'proving' ? 12.5 : shape.h / 2 + 0.5;
  if (P.terrain === 'island') nudgeToLand();
  lookAtWalker();
}

function nudgeToLand(): void {
  for (let r = 0; r < 20; r++) {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const ci = Math.floor(shape.w / 2) + i;
        const cj = Math.floor(shape.h / 2) + j;
        if (levelAt(shape, ci, cj) >= 1) { walker.x = ci + 0.5; walker.y = cj + 0.5; return; }
      }
    }
  }
}

// ------------------------------------------------------------------ the walker

const walker = { x: 12.5, y: 12.5, facing: 0 as Facing, moving: false, run: false, since: 0 };
const FIG_BOX_R = 0.04; // small, so that it stays clear of a wall's box whenever the padding is at least a little

/** The default character and the ones saved in the wardrobe on this device. */
const people = (): Saved[] => [{ id: '', name: 'Default', state: defaultState() }, ...loadRoster()];
let look: Look = lookOf(defaultState());
const frames = new Map<string, Uint8ClampedArray>();
function setCharacter(id: string): void {
  const c = people().find((p) => p.id === id) ?? people()[0];
  P.character = c.id;
  look = lookOf(c.state);
  frames.clear();

}

/** The character's frame now, as RGBA, drawn once per pose, facing and face. */
function figureFrame(ms: number): Uint8ClampedArray {
  const id = walker.moving ? (walker.run ? 'run' : 'walk') : 'idle';
  const clip = AUTHORED[id];
  const n = Math.floor(((ms - walker.since) / 1000) * clip.rate) % clip.frames.length;
  const face = clip.faces?.[n];
  const key = `${id}|${n}|${walker.facing}|${face}`;
  let rgba = frames.get(key);
  if (rgba) return rgba;
  const sprite = drawCharacter(look, clip.frames[n], walker.facing, { face, swing: clip.swing });
  rgba = new Uint8ClampedArray(SPRITE_W * SPRITE_H * 4);
  for (let p = 0; p < SPRITE_W * SPRITE_H; p++) {
    const c = sprite.pixels[p];
    if (!c) continue;
    const [r, g, b] = hex(c);
    rgba.set([r, g, b, c.length > 7 ? parseInt(c.slice(7, 9), 16) : 255], p * 4);
  }
  frames.set(key, rgba);
  return rgba;
}

function figurePic(ms: number): Pic {
  const o = ground.origin;
  const h = standingHeight(sea, walker.x, walker.y);
  const fx = Math.round(o.x + (walker.x - walker.y) * HALF_W);
  const fy = Math.round(o.y + (walker.x + walker.y) * HALF_H - h * LEVEL_PX);
  return {
    x: fx - FEET.x, y: fy - FEET.y, w: SPRITE_W, h: SPRITE_H, rgba: figureFrame(ms), base: Math.max(SEA_LEVEL, h),
    ci: Math.floor(walker.x), cj: Math.floor(walker.y),
    box: { x0: walker.x - FIG_BOX_R, x1: walker.x + FIG_BOX_R, y0: walker.y - FIG_BOX_R, y1: walker.y + FIG_BOX_R },
    key: walker.x + walker.y,
  };
}

// ------------------------------------------------------------------ collision

function tryMove(nx: number, ny: number): boolean {
  const from = levelAt(shape, Math.floor(walker.x), Math.floor(walker.y));
  const to = levelAt(shape, Math.floor(nx), Math.floor(ny));
  if (to < SEA_LEVEL || Math.abs(to - from) > SLOPE_LEVELS) return false;
  // Walls block moves across an edge; the padding keeps the walker clear of them and of their overhang.
  const pad = Math.max(0.03, P.pad);
  if (blocked(house, nx, ny, pad) && !blocked(house, walker.x, walker.y, pad)) return false;
  walker.x = nx; walker.y = ny;
  return true;
}

// ------------------------------------------------------------------ sorting

interface Item { pic: Pic }

/** Back to front. 'scalar' is the engine's i + j key; 'box' compares footprints on the plan, as Ultima 8 did. */
function paintOrder(items: Item[]): Item[] {
  const sorted = [...items].sort((a, b) => a.pic.key - b.pic.key);
  if (P.sort === 'scalar') return sorted;
  const overlaps = (a: Pic, b: Pic) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const before = (a: Pic, b: Pic) => {
    const ax = a.box.x1 <= b.box.x0, ay = a.box.y1 <= b.box.y0;
    const bx = b.box.x1 <= a.box.x0, by = b.box.y1 <= a.box.y0;
    if ((ax || ay) && !(bx || by)) return true;
    if ((bx || by) && !(ax || ay)) return false;
    return a.key < b.key;
  };
  const out: Item[] = [];
  const seen = new Set<Item>();
  const visit = (it: Item) => {
    if (seen.has(it)) return;
    seen.add(it);
    for (const o of sorted) if (o !== it && !seen.has(o) && overlaps(o.pic, it.pic) && before(o.pic, it.pic)) visit(o);
    out.push(it);
  };
  for (const it of sorted) visit(it);
  return out;
}

// ------------------------------------------------------------------ frame

let order: Item[] = [];
let gridCache: { x: number; y: number }[] | null = null;

function gridPixels(): { x: number; y: number }[] {
  if (gridCache) return gridCache;
  const out: { x: number; y: number }[] = [];
  const o = ground.origin;
  const line = (e: Edge) => {
    const [h0, h1] = endHeights(sea, e);
    const xmin = o.x + (e.axis === 'H' ? e.i - e.j : e.i - e.j - 1) * HALF_W;
    const sy = o.y + (e.i + e.j) * HALF_H;
    for (let c = 0; c < 16; c++) {
      const t = e.axis === 'H' ? (c + 0.5) / 16 : 1 - (c + 0.5) / 16;
      out.push({ x: xmin + c, y: Math.round(sy + HALF_H * t - (h0 + (h1 - h0) * t) * LEVEL_PX) });
    }
  };
  for (let j = 0; j <= shape.h; j++) {
    for (let i = 0; i <= shape.w; i++) {
      const land = (ci: number, cj: number) => levelAt(shape, ci, cj) >= SEA_LEVEL;
      if (i < shape.w && (land(i, j) || land(i, j - 1))) line({ axis: 'H', i, j });
      if (j < shape.h && (land(i, j) || land(i - 1, j))) line({ axis: 'V', i, j });
    }
  }
  return (gridCache = out);
}

function stamp(pic: Pic): void {
  const { w: gw, h: gh } = ground;
  for (let y = 0; y < pic.h; y++) {
    const gy = pic.y + y;
    if (gy < 0 || gy >= gh) continue;
    for (let x = 0; x < pic.w; x++) {
      const s = (y * pic.w + x) * 4;
      const a = pic.rgba[s + 3] / 255;
      if (!a) continue;
      const gx = pic.x + x;
      if (gx < 0 || gx >= gw) continue;
      const base = typeof pic.base === 'number' ? pic.base : pic.base[y * pic.w + x];
      if (hiddenByGround(shape, ground, gx, gy, pic.ci, pic.cj, base)) continue;
      const d = (gy * gw + gx) * 4;
      for (let k = 0; k < 3; k++) frame[d + k] += (pic.rgba[s + k] - frame[d + k]) * a;
      frame[d + 3] = 255;
    }
  }
}

function render(ms: number): void {
  frame.set(ground.rgba);
  if (P.grid) {
    for (const { x, y } of gridPixels()) {
      if (x < 0 || y < 0 || x >= ground.w || y >= ground.h) continue;
      const d = (y * ground.w + x) * 4;
      for (let k = 0; k < 3; k++) frame[d + k] += (255 - frame[d + k]) * 0.22;
    }
  }
  // Under a roof the walker sees in: the engine hides that roof and cuts its front walls.
  const parts = view.parts(house, walker);
  // Shadows darken the ground once wherever any of them fall, before anything stands on it; a hidden roof still shades.
  shade.fill(0);
  for (const part of parts) for (const p of part.shadow) shade[p] = 1;
  for (let p = 0; p < shade.length; p++) {
    if (!shade[p]) continue;
    frame[p * 4] *= 0.64; frame[p * 4 + 1] *= 0.68; frame[p * 4 + 2] *= 0.8;
  }
  const items: Item[] = parts.filter((part) => !part.hidden).map((pic) => ({ pic }));
  items.push({ pic: figurePic(ms) });
  order = paintOrder(items);
  for (const it of order) stamp(it.pic);
  full.getContext('2d')!.putImageData(new ImageData(frame, ground.w, ground.h), 0, 0);
}

// ------------------------------------------------------------------ picking and editing

/** The wall under a screen pixel, else the edge of the ground cell there that the pixel is nearest to. */
/** The topmost picture with ink at a screen pixel that passes `which`. */
function picAt(px: number, py: number, which: (p: Pic) => boolean): Pic | null {
  for (let k = order.length - 1; k >= 0; k--) {
    const pic = order[k].pic;
    if (!which(pic)) continue;
    const x = px - pic.x, y = py - pic.y;
    if (x >= 0 && y >= 0 && x < pic.w && y < pic.h && pic.rgba[(y * pic.w + x) * 4 + 3]) return pic;
  }
  return null;
}

/** The ground cell drawn at a screen pixel. */
function cellAt(px: number, py: number): { ci: number; cj: number } | null {
  if (px < 0 || py < 0 || px >= ground.w || py >= ground.h) return null;
  const cell = ground.cell[py * ground.w + px];
  return cell < 0 ? null : { ci: cell % shape.w, cj: Math.floor(cell / shape.w) };
}

function pickEdge(px: number, py: number): { edge: Edge; wall: boolean } | null {
  for (let k = order.length - 1; k >= 0; k--) {
    const pic = order[k].pic;
    if (!pic.edge) continue;
    const x = px - pic.x, y = py - pic.y;
    if (x >= 0 && y >= 0 && x < pic.w && y < pic.h && pic.rgba[(y * pic.w + x) * 4 + 3]) return { edge: pic.edge, wall: true };
  }
  if (px < 0 || py < 0 || px >= ground.w || py >= ground.h) return null;
  const cell = ground.cell[py * ground.w + px];
  if (cell < 0) return null;
  const ci = cell % shape.w, cj = Math.floor(cell / shape.w);
  const o = ground.origin;
  const cx = o.x + (ci - cj) * HALF_W;
  const cy = o.y + (ci + cj + 1) * HALF_H - heightAt(sea, ci + 0.5, cj + 0.5) * LEVEL_PX;
  const right = px + 0.5 >= cx, below = py + 0.5 >= cy;
  const edge: Edge = !below ? (right ? { axis: 'H', i: ci, j: cj } : { axis: 'V', i: ci, j: cj }) : right ? { axis: 'V', i: ci + 1, j: cj } : { axis: 'H', i: ci, j: cj + 1 };
  return { edge, wall: false };
}

let painting: boolean | null = null;

function paintRoof(px: number, py: number, start: boolean): void {
  // A press on a roof takes it away, patch by patch as the drag passes over them; elsewhere it roofs the cells dragged over.
  const hit = picAt(px, py, (p) => !!p.patch);
  if (start) painting = !hit;
  if (!painting && hit) for (const k of hit.patch!.cells) house.cells.delete(k);
  const c = cellAt(px, py);
  if (painting && c && !hit) house.cells.set(cellKey(c.ci, c.cj), { kind: 'thatch', i: c.ci, j: c.cj });
}

function paint(e: Edge, on: boolean): void {
  const k = edgeKey(e);
  if (on === house.edges.has(k)) return;
  if (on) house.edges.set(k, { kind: 'plank', edge: e });
  else house.edges.delete(k);
}

// ------------------------------------------------------------------ page

/** The whole frame, from which the viewport shows its part. */
const full = document.createElement('canvas');
const vp = new Viewport({
  zoom: 3,
  press: ({ x, y }, start) => {
    const px = Math.floor(x), py = Math.floor(y);
    if (P.paint === 'roof') return paintRoof(px, py, start);
    const hit = pickEdge(px, py);
    if (start) painting = hit ? !house.edges.has(edgeKey(hit.edge)) : null;
    if (hit && painting !== null) paint(hit.edge, painting);
  },
});
vp.canvas.style.cursor = 'crosshair';
document.querySelector('main')!.append(vp.el);

/** Puts the camera on the walker. */
function lookAtWalker(): void {
  const o = ground.origin;
  vp.cam.x = o.x + (walker.x - walker.y) * HALF_W;
  vp.cam.y = o.y + (walker.x + walker.y) * HALF_H - standingHeight(sea, walker.x, walker.y) * LEVEL_PX - 20;
}

function show(): void {
  const r = vp.rect();
  vp.ctx.fillStyle = '#0d3b66';
  vp.ctx.fillRect(0, 0, r.w, r.h);
  vp.ctx.drawImage(full, -r.x, -r.y);
}

const keys = new Set<string>();
addEventListener('keydown', (ev) => {
  if ((ev.target as HTMLElement).tagName === 'INPUT' || (ev.target as HTMLElement).tagName === 'SELECT') return;
  const k = ev.key.toLowerCase();
  if (k === 'r') return resetWalker();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'shift'].includes(k)) {
    keys.add(k);
    if (k.startsWith('arrow')) ev.preventDefault();
  }
});
addEventListener('keyup', (ev) => keys.delete(ev.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

function resetWalker(): void {
  walker.x = P.terrain === 'proving' ? 12.5 : shape.w / 2 + 0.5;
  walker.y = P.terrain === 'proving' ? 12.5 : shape.h / 2 + 0.5;
  if (P.terrain === 'island') nudgeToLand();

}

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const sx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const sy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  vp.update(dt);
  const moving = !!(sx || sy), run = keys.has('shift');
  if (moving !== walker.moving || run !== walker.run) { walker.moving = moving; walker.run = run; walker.since = now; }
  if (sx || sy) {
    const speed = run ? 80 : 44; // screen pixels per second
    const norm = sx && sy ? Math.SQRT1_2 : 1;
    const vx = ((sx * speed) / HALF_W + (sy * speed) / HALF_H) / 2 * norm;
    const vy = ((sy * speed) / HALF_H - (sx * speed) / HALF_W) / 2 * norm;
    const steps = Math.max(1, Math.ceil((Math.hypot(vx, vy) * dt) / 0.02));
    for (let s = 0; s < steps; s++) {
      tryMove(walker.x + (vx * dt) / steps, walker.y);
      tryMove(walker.x, walker.y + (vy * dt) / steps);
    }
    walker.facing = facingOf(vx, vy, walker.facing);
  }
  // The character blinks and breathes, so the frame is drawn every time.
  render(now);
  show();
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ controls

const panel = document.getElementById('panel')!;
panel.innerHTML = '<h1>Plank walls prototype</h1><p class="note">Walls on cell edges, over slopes, cliffs and the shore.</p>';

function slider(label: string, min: number, max: number, step: number, value: number, onInput: (v: number) => void, fmt = (v: number) => String(v)): void {
  const row = document.createElement('label');
  row.className = 'row';
  const val = document.createElement('span');
  val.className = 'v';
  val.textContent = fmt(value);
  const input = document.createElement('input');
  input.type = 'range';
  Object.assign(input, { min: String(min), max: String(max), step: String(step), value: String(value) });
  input.addEventListener('input', () => { val.textContent = fmt(+input.value); onInput(+input.value); });
  row.append(Object.assign(document.createElement('span'), { textContent: label }), val, input);
  panel.append(row);
}

function select<T extends string>(label: string, options: [T, string][], value: T, onChange: (v: T) => void): void {
  const row = document.createElement('label');
  row.className = 'row';
  const sel = document.createElement('select');
  for (const [v, text] of options) sel.append(Object.assign(document.createElement('option'), { value: v, textContent: text }));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value as T));
  row.append(Object.assign(document.createElement('span'), { textContent: label }), sel);
  panel.append(row);
}

function button(label: string, onClick: () => void, into: HTMLElement): void {
  const b = Object.assign(document.createElement('button'), { textContent: label });
  b.addEventListener('click', onClick);
  into.append(b);
}

select('Terrain', [['proving', 'Proving ground'], ['island', 'Generated island']], P.terrain, (v) => { P.terrain = v; loadTerrain(); });
slider('Island seed', 1, 30, 1, P.islandSeed, (v) => { P.islandSeed = v; if (P.terrain === 'island') loadTerrain(); });
slider('Wall height (levels)', 1, 8, 1, P.height, (v) => { P.height = house.height = v; });
select('Top', [['slope', 'follows the slope'], ['stepped', 'steps by whole levels'], ['flat', 'flat']], P.top, (v) => { P.top = v; rebuild(); });
slider('Overhang (px)', 0, 8, 1, P.overhang, (v) => { P.overhang = v; rebuild(); });
slider('Plank seed', 1, 40, 1, P.seed, (v) => { P.seed = v; rebuild(); });
select('Sort', [['box', 'boxes on the plan'], ['scalar', 'scalar i + j']], P.sort, (v) => { P.sort = v; });
slider('Collision padding (tiles)', 0, 0.5, 0.02, P.pad, (v) => (P.pad = v), (v) => v.toFixed(2));
select('Paint', [['walls', 'walls on edges'], ['roof', 'roof on cells']], P.paint, (v) => (P.paint = v));
slider('Roof rise (levels)', 0, 6, 1, P.rise, (v) => { P.rise = v; rebuild(); });
slider('Roof eaves (tiles)', 0, 0.6, 0.05, P.eaves, (v) => { P.eaves = v; rebuild(); }, (v) => v.toFixed(2));
setCharacter(pickedCharacter() ?? '');
select('Character', people().map((c) => [c.id, c.name] as [string, string]), P.character, setCharacter);
const check = document.createElement('label');
check.className = 'check';
const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: P.grid });
box.addEventListener('change', () => { P.grid = box.checked; });
check.append(box, 'Show cell edges');
panel.append(check);
const buttons = document.createElement('div');
buttons.className = 'buttons';
button('Clear', () => { house.edges.clear(); house.cells.clear(); }, buttons);
button('Preset', () => { if (P.terrain === 'proving') { presetWalls(); presetRoofs(); } }, buttons);
button('Reset walker', () => { resetWalker(); lookAtWalker(); }, buttons);
panel.append(buttons);
const help = document.createElement('div');
help.className = 'help';
help.innerHTML =
  'Walls: click or drag on a cell edge to add planks, on a wall to remove it. Roof: drag over cells to roof them, press a roof to take it off.<br>Pinch or Ctrl+scroll zooms, two fingers or scrolling pans.<br><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows walk, <kbd>Shift</kbd> runs, <kbd>R</kbd> resets.<br><br>' +
  'Things to try: walk along the pen and its door in the "scalar" sort and look at the corners; set padding to 0 and push the walker into a wall; raise overhang while padding stays small.';
panel.append(help);

loadTerrain();
// For poking at it from the console or a test script.
Object.assign(window, { proto: { walker, P, house, vp, rebuild } });
requestAnimationFrame(loop);
