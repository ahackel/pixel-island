// Throwaway mockup, not part of the published site (it is not in vite.config.ts; open it on the dev server at
// /tools/areas-proto/, or /engine/tools/areas-proto/ in a game). How a scene of several areas could be edited on one
// shared ground: every scene file of the project is drawn as an area of one scene, by the engine's own renderer.
//
//  - drag an area's name tab to move it (whole tiles; it may not overlap another);
//  - drag a thing (plant, decoration, object, person, animal) into another area and it moves there;
//  - holes and ladders show their links as lines; drag from the diamond above one onto another to link the two,
//    or onto open ground of another area to make the other end there; a click on the diamond unlinks;
//  - areas not being changed are drawn once and kept as pictures, so a large shared ground stays cheap.
// Nothing is saved: reload to start again.
import { createCave, createScene, CAVE_OPEN, readSceneFile, type PlacedPerson, type Scene } from '../../engine/world/scene.ts';
import { World, type Thing } from '../../engine/world/world.ts';
import { caveThings } from '../../engine/world/cave.ts';
import { footOf } from '../../engine/world/island.ts';
import { heightAt, LEVEL_PX, standingHeight, TILE_H, TILE_W, toScreen } from '../../engine/world/terrain.ts';
import { Actor } from '../../engine/world/actor.ts';
import { lookOf } from '../../engine/character/character.ts';
import { turnFacing } from '../../engine/core/puppet.ts';
import { LINKING, nameLink, type PlacedItem } from '../../engine/world/props.ts';

// ------------------------------------------------------------------ areas

type P = { i: number; j: number };
type XY = { x: number; y: number };

interface Area {
  /** The file name the area came from; ways name their other end by it (in the real thing: the area's id). */
  key: string;
  scene: Scene;
  world: World;
  /** Where the area's north corner lies on the shared ground, in tiles (before the view is turned). Editor only. */
  at: P;
  /** The area as last drawn, and whether it must be drawn again. */
  picture: HTMLCanvasElement;
  dirty: boolean;
  tab: HTMLElement;
}

/** How far a drawn area reaches past its ground picture: up for tall things on the back rows, aside for wide ones. */
const PAD = { x: 24, y: 72 };
/** How far above its foot a way's link handle sits, in ground pixels. */
const HANDLE_UP = 20;

const files = Object.entries(import.meta.glob('/src/content/scenes/*.json', { eager: true, import: 'default' }))
  .map(([file, data]) => ({ key: file.slice(file.lastIndexOf('/') + 1, -5), text: JSON.stringify(data) }))
  // The island and its cave first, side by side.
  .sort((a, b) => order(a.key) - order(b.key));
function order(key: string): number {
  const k = ['rocky-island', 'smuggler-cave'].indexOf(key);
  return k < 0 ? 9 : k;
}

let rot = 0;
const areas: Area[] = [];

function addArea(key: string, scene: Scene): Area {
  const tab = document.createElement('div');
  tab.className = `tab${scene.cave ? ' cave' : ''}`;
  tab.innerHTML = `<span>${scene.cave ? '◣' : '◆'} ${scene.name}</span><small>${scene.cave ? 'cave' : 'island'} · ${scene.w}×${scene.h}</small>`;
  document.body.append(tab);
  const a: Area = { key, scene, world: new World(scene, rot), at: { i: 0, j: 0 }, picture: document.createElement('canvas'), dirty: true, tab };
  a.at = besideTheOthers(scene);
  areas.push(a);
  tabGestures(a);
  return a;
}

/** Right of the last area on screen, at the same height, two tiles clear of it. */
function besideTheOthers(s: { w: number; h: number }): P {
  const last = areas[areas.length - 1];
  if (!last) return { i: 0, j: 0 };
  const centre = last.at.i + last.scene.w / 2 + last.at.j + last.scene.h / 2;
  let at = { i: Math.max(...areas.map((a) => a.at.i + a.scene.w)) + 3, j: 0 };
  at.j = Math.round(centre - at.i - s.w / 2 - s.h / 2);
  while (areas.some((a) => overlaps(a, at, s))) at = { i: at.i + 1, j: at.j - 1 };
  return at;
}

const overlaps = (a: Area, at: P, s: { w: number; h: number }, gap = 1) =>
  at.i < a.at.i + a.scene.w + gap && a.at.i < at.i + s.w + gap && at.j < a.at.j + a.scene.h + gap && a.at.j < at.j + s.h + gap;
const fits = (moving: Area, at: P) => !areas.some((a) => a !== moving && overlaps(a, at, moving.scene));

// ------------------------------------------------------------------ the shared ground and the view

/** A point of the shared ground as seen with the view turned (each quarter turn: (i, j) to (-j, i), as `World.toView`). */
function turned(p: P, r = rot): P {
  let { i, j } = p;
  for (let k = 0; k < r; k++) [i, j] = [-j, i];
  return { i, j };
}
function unturned(p: P, r = rot): P {
  let { i, j } = p;
  for (let k = 0; k < r; k++) [i, j] = [j, -i];
  return { i, j };
}
/** The area's north corner as seen: where its world's view point 0, 0 lies on the turned shared ground. */
function seenCorner(a: Area): P {
  const corners = [[0, 0], [a.scene.w, 0], [0, a.scene.h], [a.scene.w, a.scene.h]].map(([i, j]) => turned({ i: a.at.i + i, j: a.at.j + j }));
  return { i: Math.min(...corners.map((c) => c.i)), j: Math.min(...corners.map((c) => c.j)) };
}
/** Where a pixel of the area's ground picture is on the desk (the shared ground's pixels). */
function offsetOf(a: Area): XY {
  const c = seenCorner(a);
  const s = toScreen(c.i, c.j, 0);
  return { x: s.x - a.world.ground.origin.x, y: s.y - a.world.ground.origin.y };
}
/** The area's outline on the desk at the water line: north, east, south, west corners. */
function diamond(a: Area): XY[] {
  const c = seenCorner(a);
  const [w, h] = rot % 2 ? [a.scene.h, a.scene.w] : [a.scene.w, a.scene.h];
  return [[0, 0], [w, 0], [w, h], [0, h]].map(([i, j]) => toScreen(c.i + i, c.j + j, 0));
}
/** What of the area's picture is shown: its ground, and room above the back edges for what stands there. */
function clipShape(a: Area): XY[] {
  const [n, e, s, w] = diamond(a);
  const up = PAD.y - 8;
  return [{ x: w.x, y: w.y - up }, { x: n.x, y: n.y - up }, { x: e.x, y: e.y - up }, e, { x: s.x, y: s.y + 6 }, w];
}
function insideShape(shape: XY[], p: XY): boolean {
  let hit = false;
  for (let k = 0, m = shape.length - 1; k < shape.length; m = k++) {
    const [a, b] = [shape[k], shape[m]];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const ctx = canvas.getContext('2d')!;
/** The desk pixel at the middle of the canvas, and device pixels per desk pixel. */
const cam = { x: 0, y: 0 };
let zoom = 1;
const ZOOMS = [0.25, 0.5, 1, 2, 3, 4, 5, 6, 8];
const dpr = () => window.devicePixelRatio || 1;

function fit(): void {
  canvas.width = Math.round(innerWidth * dpr());
  canvas.height = Math.round(innerHeight * dpr());
}
fit();
addEventListener('resize', () => { fit(); paint(); });

const toCanvas = (p: XY): XY => ({ x: (p.x - cam.x) * zoom + canvas.width / 2, y: (p.y - cam.y) * zoom + canvas.height / 2 });
const toDesk = (e: { clientX: number; clientY: number }): XY => ({ x: (e.clientX * dpr() - canvas.width / 2) / zoom + cam.x, y: (e.clientY * dpr() - canvas.height / 2) / zoom + cam.y });

/** Everything in view, at the largest whole zoom that fits it. */
function showAll(): void {
  const pts = areas.flatMap(clipShape);
  const [x0, x1] = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))];
  const [y0, y1] = [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))];
  cam.x = (x0 + x1) / 2;
  cam.y = (y0 + y1) / 2;
  const room = Math.min(canvas.width / (x1 - x0 + 80), canvas.height / (y1 - y0 + 120));
  zoom = [...ZOOMS].reverse().find((z) => z <= room) ?? ZOOMS[0];
}

// ------------------------------------------------------------------ drawing an area

const actors = new WeakMap<PlacedPerson, Actor>();
function personThing(a: Area, p: PlacedPerson): Thing {
  let actor = actors.get(p);
  if (!actor) actors.set(p, (actor = new Actor(lookOf(p.state), p)));
  actor.frozen = p.pose ?? null;
  Object.assign(actor, a.world.toView(p));
  actor.facing = turnFacing(0, 2 * (p.turn + rot));
  actor.heading = (p.turn + rot) * (Math.PI / 2);
  return actor.thing(a.world, 0);
}

function thingsOf(a: Area): Thing[] {
  const w = a.world;
  return [
    ...w.plantThings(0), ...w.decorThings(0), ...w.animalThings(0), ...w.itemThings(), ...w.propThings(0),
    ...a.scene.people.map((p) => personThing(a, p)),
    ...(a.scene.cave ? caveThings(w) : []),
  ];
}

/**
 * Draws the area into its kept picture (a cave as when editing: lit, so it can be seen into). Only its ground and what
 * stands on it are kept: beyond the map's tiles a pixel shows only where a thing covers it (the sea or a cave's dark
 * void around it would cover the desk and the areas behind).
 */
function draw(a: Area): void {
  const g = a.world.ground;
  const view = { x: -PAD.x, y: -PAD.y, w: g.w + 2 * PAD.x, h: g.h + PAD.y + 8 };
  // The bare ground first (kept by the world, so the second picture costs only its things), then with the things.
  // (Its things first: a cave sets up its dark void the first time they are asked for.)
  const things = thingsOf(a);
  const bare = a.world.compose(view, [], undefined, false, 0, false).data.slice();
  const image = a.world.compose(view, things, undefined, false, 0, false);
  const out = new Uint8ClampedArray(image.data);
  // The area's outline at the water line, on its ground picture; ground above the water line may rise out of it.
  const o = offsetOf(a);
  const outline = diamond(a).map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
  for (let y = 0; y < view.h; y++) for (let x = 0; x < view.w; x++) {
    const [gx, gy] = [x + view.x, y + view.y];
    const on = gx >= 0 && gy >= 0 && gx < g.w && gy < g.h ? gy * g.w + gx : -1;
    if (insideShape(outline, { x: gx + 0.5, y: gy + 0.5 }) || (on >= 0 && g.cell[on] >= 0 && g.height[on] > 0)) continue;
    const k = (y * view.w + x) * 4;
    if (out[k] === bare[k] && out[k + 1] === bare[k + 1] && out[k + 2] === bare[k + 2]) out[k + 3] = 0;
  }
  a.picture.width = view.w;
  a.picture.height = view.h;
  a.picture.getContext('2d')!.putImageData(new ImageData(out, view.w, view.h), 0, 0);
  a.dirty = false;
}

// ------------------------------------------------------------------ finding things under the pointer

/** The area under a desk point, the front-most where the room above one reaches over another. */
function areaAt(p: XY): Area | null {
  const hits = areas.filter((a) => insideShape(clipShape(a), p));
  return hits.sort((a, b) => diamond(b)[2].y - diamond(a)[2].y)[0] ?? null;
}

/** The point of an area's ground under a desk point, in the area's own (scene) metres, or null off its ground. */
function groundPoint(a: Area, p: XY): P | null {
  const o = offsetOf(a);
  const g = { x: p.x - o.x, y: p.y - o.y };
  const tile = a.world.tileAt(g.x, g.y);
  const level = tile ? standingHeight(a.world.map, tile.i + 0.5, tile.j + 0.5) : 0;
  const x = (g.x - a.world.ground.origin.x) / (TILE_W / 2);
  const y = (g.y - a.world.ground.origin.y + level * LEVEL_PX) / (TILE_H / 2);
  let v = { i: (x + y) / 2, j: (y - x) / 2 };
  if (tile) v = { i: Math.min(tile.i + 0.98, Math.max(tile.i + 0.02, v.i)), j: Math.min(tile.j + 0.98, Math.max(tile.j + 0.02, v.j)) };
  if (v.i < 0 || v.j < 0 || v.i >= a.world.map.w || v.j >= a.world.map.h) return null;
  return a.world.toData(v);
}

/** Where a point of an area (scene metres) is on the desk, standing on its ground. */
function deskOf(a: Area, p: P): XY {
  const v = a.world.toView(p);
  const s = a.world.screenOf(v.i, v.j);
  const o = offsetOf(a);
  return { x: s.x + o.x, y: s.y + o.y };
}

type Kind = 'plants' | 'decor' | 'items' | 'props' | 'people' | 'animals';
type Held = { kind: Kind; obj: P };

function covers(a: Area, thing: Thing, x: number, y: number): boolean {
  const at = footOf(a.world.ground, thing.spot);
  const px = Math.floor(x) - (at.x - thing.foot.x);
  const py = Math.floor(y) - (at.y - thing.foot.y);
  return px >= 0 && py >= 0 && px < thing.w && py < thing.h && !!thing.picture.get(px, py);
}

/** The placed thing under a desk point in an area, the front-most; decorations lie flat, so they come last. */
function thingAt(a: Area, p: XY): Held | null {
  const o = offsetOf(a);
  const [x, y] = [p.x - o.x, p.y - o.y];
  const w = a.world;
  const s = a.scene;
  const found: [Held, Thing][] = [
    ...w.itemThings().map((t, k): [Held, Thing] => [{ kind: 'items', obj: s.items[k] }, t]),
    ...w.propThings(0).map((t, k): [Held, Thing] => [{ kind: 'props', obj: s.props![k] }, t]),
    ...s.people.map((q): [Held, Thing] => [{ kind: 'people', obj: q }, personThing(a, q)]),
    ...s.animals.map((q, k): [Held, Thing] => [{ kind: 'animals', obj: q }, w.animalSprite(q, k, 0)]),
  ];
  let best: Held | null = null;
  let front = -Infinity;
  for (const [held, t] of found) if (t.spot.i + t.spot.j > front && covers(a, t, x, y)) [best, front] = [held, t.spot.i + t.spot.j];
  const plant = w.plantAt(x, y);
  if (plant) {
    const v = w.toView(plant);
    if (v.i + v.j > front) best = { kind: 'plants', obj: plant };
  }
  if (best) return best;
  const k = w.viewDecor().findIndex((d) => {
    const at = footOf(w.ground, { i: d.vi, j: d.vj, level: heightAt(w.floor, d.vi, d.vj) });
    return Math.abs(x - at.x) <= 3 && Math.abs(y - at.y) <= 3;
  });
  return k >= 0 ? { kind: 'decor', obj: s.decor[k] } : null;
}

// ------------------------------------------------------------------ ways

const ways = (a: Area) => a.scene.items.filter((it) => LINKING.includes(it.item));
const areaByKey = (key: string) => areas.find((a) => a.key === key) ?? null;
function wayEnd(it: PlacedItem): { area: Area; it: PlacedItem } | null {
  const area = it.to && areaByKey(it.to.scene);
  const end = area?.scene.items.find((o) => o.id === it.to!.id);
  return area && end ? { area, it: end } : null;
}
const handleOf = (a: Area, it: PlacedItem): XY => {
  const f = deskOf(a, it);
  return { x: f.x, y: f.y - HANDLE_UP };
};
function handleAt(p: XY): { area: Area; it: PlacedItem } | null {
  for (const area of areas) for (const it of ways(area)) {
    const h = handleOf(area, it);
    if (Math.hypot(p.x - h.x, p.y - h.y) * zoom <= Math.max(7, 4 * zoom)) return { area, it };
  }
  return null;
}
/** The way whose picture or foot is at a desk point. */
function wayAt(p: XY): { area: Area; it: PlacedItem } | null {
  const area = areaAt(p);
  const held = area && thingAt(area, p);
  if (area && held?.kind === 'items' && LINKING.includes((held.obj as PlacedItem).item)) return { area, it: held.obj as PlacedItem };
  return null;
}
/** Drops a way's link, and the other end's link back to it. */
function unlink(area: Area, it: PlacedItem): void {
  const end = wayEnd(it);
  if (end && end.it.to?.scene === area.key && end.it.to.id === it.id) delete end.it.to;
  delete it.to;
}
function link(a: { area: Area; it: PlacedItem }, b: { area: Area; it: PlacedItem }): void {
  unlink(a.area, a.it);
  unlink(b.area, b.it);
  nameLink(a.area.scene.items, a.it);
  nameLink(b.area.scene.items, b.it);
  a.it.to = { scene: b.area.key, id: b.it.id! };
  b.it.to = { scene: a.area.key, id: a.it.id! };
}

// ------------------------------------------------------------------ moving a thing to another area

/** Moves a thing to a point of an area, into that area's lists if it is another; ways keep their links. */
function moveThing(held: Held, from: Area, to: Area, at: P): void {
  const o = held.obj as P & { id?: string; item?: string };
  if (from !== to) {
    const list = from.scene[held.kind] as unknown[];
    list.splice(list.indexOf(o), 1);
    const into = (to.scene[held.kind] ??= [] as never) as unknown[];
    const oldId = o.id;
    if (held.kind === 'items' && o.id && LINKING.includes(o.item!)) {
      // Its name must be free in the area it comes into; whatever led to it follows it there.
      if (to.scene.items.some((x) => x.id === o.id)) { delete o.id; nameLink(to.scene.items, o as PlacedItem); }
      for (const a of areas) for (const it of a.scene.items) if (it.to?.scene === from.key && it.to.id === oldId) it.to = { scene: to.key, id: o.id! };
    }
    into.push(o);
    from.dirty = true;
  }
  o.i = at.i;
  o.j = at.j;
  to.dirty = true;
}

// ------------------------------------------------------------------ painting the desk

let hover: { area: Area | null; at: P | null } = { area: null, at: null };
let gesture:
  | { kind: 'pan'; start: XY; cam: XY; id: number }
  | { kind: 'thing'; held: Held; area: Area; home: Area; homeAt: P; moved: boolean; id: number }
  | { kind: 'link'; from: { area: Area; it: PlacedItem }; to: XY; moved: boolean; id: number }
  | { kind: 'area'; area: Area; start: XY; at: P; ok: boolean; id: number }
  | null = null;

function path(shape: XY[]): void {
  ctx.beginPath();
  shape.forEach((p, k) => {
    const c = toCanvas(p);
    if (k) ctx.lineTo(c.x, c.y);
    else ctx.moveTo(c.x, c.y);
  });
  ctx.closePath();
}

function paint(): void {
  for (const a of areas) if (a.dirty) draw(a);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1b1a24';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // A dotted desk, so it reads as open space and not as a part of any area.
  const step = 32 * zoom;
  if (step >= 12) {
    ctx.fillStyle = '#2a2836';
    const ox = ((canvas.width / 2 - cam.x * zoom) % step + step) % step;
    const oy = ((canvas.height / 2 - cam.y * zoom) % step + step) % step;
    for (let x = ox; x < canvas.width; x += step) for (let y = oy; y < canvas.height; y += step) ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
  ctx.imageSmoothingEnabled = false;
  // Back to front, so the room above a front area's back edge goes over the area behind it.
  const sorted = [...areas].sort((a, b) => diamond(a)[2].y - diamond(b)[2].y);
  for (const a of sorted) {
    const o = offsetOf(a);
    const c = toCanvas({ x: o.x - PAD.x, y: o.y - PAD.y });
    ctx.drawImage(a.picture, Math.round(c.x), Math.round(c.y), a.picture.width * zoom, a.picture.height * zoom);
  }
  for (const a of sorted) {
    const moving = gesture?.kind === 'area' && gesture.area === a;
    const hot = hover.area === a || moving || (gesture?.kind === 'thing' && gesture.area === a);
    path(diamond(a));
    ctx.lineWidth = Math.max(1, zoom * (hot ? 1 : 0.5));
    ctx.strokeStyle = moving && !(gesture as { ok: boolean }).ok ? '#e0332e' : hot ? '#ffffffcc' : '#ffffff33';
    ctx.setLineDash(hot ? [] : [4 * zoom, 4 * zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  paintLinks();
  // The tabs follow their areas.
  for (const a of areas) {
    const n = toCanvas(clipShape(a)[1]);
    a.tab.style.left = `${n.x / dpr()}px`;
    a.tab.style.top = `${n.y / dpr() + 6}px`;
    a.tab.classList.toggle('hot', hover.area === a);
  }
  showStatus();
}

function paintLinks(): void {
  const done = new Set<PlacedItem>();
  ctx.lineCap = 'round';
  for (const area of areas) for (const it of ways(area)) {
    const h = toCanvas(handleOf(area, it));
    const end = wayEnd(it);
    const both = !!end && end.it.to?.scene === area.key && end.it.to.id === it.id;
    if (end && !done.has(it)) {
      done.add(it);
      if (both) done.add(end.it);
      const e = toCanvas(handleOf(end.area, end.it));
      const lift = Math.min(160 * zoom, Math.hypot(e.x - h.x, e.y - h.y) * 0.35);
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.bezierCurveTo(h.x, h.y - lift, e.x, e.y - lift, e.x, e.y);
      ctx.lineWidth = Math.max(2, zoom * 1.5);
      ctx.strokeStyle = both ? '#f0b35acc' : '#e0332ecc';
      ctx.setLineDash(both ? [] : [6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // The handle: gold when linked both ways, red when the other end does not lead back (or is missing), grey when free.
    const r = Math.max(4, 3 * zoom);
    ctx.beginPath();
    ctx.moveTo(h.x, h.y - r);
    ctx.lineTo(h.x + r, h.y);
    ctx.lineTo(h.x, h.y + r);
    ctx.lineTo(h.x - r, h.y);
    ctx.closePath();
    ctx.fillStyle = !it.to ? '#9d97b0' : both ? '#f0b35a' : '#e0332e';
    ctx.fill();
    ctx.lineWidth = Math.max(1, zoom / 2);
    ctx.strokeStyle = '#1b1a24';
    ctx.stroke();
  }
  if (gesture?.kind === 'link' && gesture.moved) {
    const h = toCanvas(handleOf(gesture.from.area, gesture.from.it));
    const to = toCanvas(gesture.to);
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(to.x, to.y);
    ctx.lineWidth = Math.max(2, zoom * 1.5);
    ctx.strokeStyle = linkTarget(gesture.to, gesture.from) ? '#f0b35a' : '#ffffff88';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

const status = document.createElement('div');
status.className = 'status';
document.body.append(status);
function showStatus(): void {
  const a = hover.area;
  const what = gesture?.kind === 'thing' ? `moving into <b>${gesture.area.scene.name}</b>`
    : gesture?.kind === 'link' ? 'drop on a hole or ladder, or on open ground of another area'
    : gesture?.kind === 'area' ? (gesture.ok ? 'moving area' : 'too close to another area')
    : a ? `<b>${a.scene.name}</b>${hover.at ? ` · ${hover.at.i.toFixed(1)}, ${hover.at.j.toFixed(1)}` : ''}` : 'desk';
  status.innerHTML = `${what} · zoom ${zoom}× · ${areas.length} areas`;
}

// ------------------------------------------------------------------ gestures

/** What a link dragged to a desk point would join: a way of another area, or open ground of another area (a new way there). */
function linkTarget(p: XY, from: { area: Area; it: PlacedItem }): { area: Area; it?: PlacedItem; at?: P } | null {
  const way = handleAt(p) ?? wayAt(p);
  if (way && way.it !== from.it) return way;
  const area = areaAt(p);
  if (!area || area === from.area) return null;
  const at = groundPoint(area, p);
  return at ? { area, at } : null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (gesture) return;
  canvas.setPointerCapture(e.pointerId);
  const p = toDesk(e);
  const handle = handleAt(p);
  if (handle && e.button === 0) return void (gesture = { kind: 'link', from: handle, to: p, moved: false, id: e.pointerId });
  const area = e.button === 0 ? areaAt(p) : null;
  const held = area && thingAt(area, p);
  if (area && held) return void (gesture = { kind: 'thing', held, area, home: area, homeAt: { i: held.obj.i, j: held.obj.j }, moved: false, id: e.pointerId });
  gesture = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, cam: { ...cam }, id: e.pointerId };
});

canvas.addEventListener('pointermove', (e) => {
  const p = toDesk(e);
  const area = areaAt(p);
  hover = { area, at: area && groundPoint(area, p) };
  if (gesture?.kind === 'pan' && gesture.id === e.pointerId) {
    cam.x = gesture.cam.x - ((e.clientX - gesture.start.x) * dpr()) / zoom;
    cam.y = gesture.cam.y - ((e.clientY - gesture.start.y) * dpr()) / zoom;
  } else if (gesture?.kind === 'thing' && gesture.id === e.pointerId) {
    // Into whatever area is under the pointer; off every area's ground it stays where it last was.
    const at = area && groundPoint(area, p);
    if (area && at) {
      moveThing(gesture.held, gesture.area, area, at);
      gesture.area = area;
      gesture.moved = true;
    }
  } else if (gesture?.kind === 'link' && gesture.id === e.pointerId) {
    gesture.to = p;
    gesture.moved = true;
  }
  canvas.style.cursor = gesture?.kind === 'pan' ? 'grabbing' : gesture ? 'grabbing' : handleAt(p) || (area && thingAt(area, p)) ? 'grab' : 'default';
  paint();
});

function release(e: PointerEvent): void {
  if (!gesture || gesture.id !== e.pointerId) return;
  if (gesture.kind === 'link') {
    const g = gesture;
    if (!g.moved) unlink(g.from.area, g.from.it);
    else {
      const t = linkTarget(g.to, g.from);
      if (t?.it) link(g.from, { area: t.area, it: t.it });
      else if (t?.at) {
        // A new other end: a ladder up from below a hole, a hole down from above a ladder.
        const it: PlacedItem = { item: g.from.it.item === 'hole' ? 'ladder' : 'hole', i: t.at.i, j: t.at.j };
        t.area.scene.items.push(it);
        link(g.from, { area: t.area, it });
        t.area.dirty = true;
      }
    }
  }
  gesture = null;
  paint();
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const before = toDesk(e);
  const k = ZOOMS.indexOf(zoom);
  zoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, k + (e.deltaY < 0 ? 1 : -1)))];
  const after = toDesk(e);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
  paint();
}, { passive: false });

/** Moving an area by its tab: by whole tiles, kept where it was if let go too near another. */
function tabGestures(a: Area): void {
  a.tab.addEventListener('pointerdown', (e) => {
    if (gesture) return;
    a.tab.setPointerCapture(e.pointerId);
    a.tab.classList.add('dragging');
    gesture = { kind: 'area', area: a, start: toDesk(e), at: { ...a.at }, ok: true, id: e.pointerId };
  });
  a.tab.addEventListener('pointermove', (e) => {
    if (gesture?.kind !== 'area' || gesture.area !== a || gesture.id !== e.pointerId) return;
    const p = toDesk(e);
    const [dx, dy] = [(p.x - gesture.start.x) / (TILE_W / 2), (p.y - gesture.start.y) / (TILE_H / 2)];
    const d = unturned({ i: Math.round((dx + dy) / 2), j: Math.round((dy - dx) / 2) });
    a.at = { i: gesture.at.i + d.i, j: gesture.at.j + d.j };
    gesture.ok = fits(a, a.at);
    a.tab.classList.toggle('bad', !gesture.ok);
    paint();
  });
  const up = (e: PointerEvent) => {
    if (gesture?.kind !== 'area' || gesture.area !== a || gesture.id !== e.pointerId) return;
    if (!gesture.ok) a.at = gesture.at;
    a.tab.classList.remove('dragging', 'bad');
    gesture = null;
    paint();
  };
  a.tab.addEventListener('pointerup', up);
  a.tab.addEventListener('pointercancel', up);
  a.tab.addEventListener('wheel', (e) => canvas.dispatchEvent(new WheelEvent('wheel', e)), { passive: true });
}

/** Turns the whole shared ground a quarter, keeping the point in the middle of the view where it is. */
function turn(by: number): void {
  const middle = { x: cam.x / (TILE_W / 2), y: cam.y / (TILE_H / 2) };
  const plane = unturned({ i: (middle.x + middle.y) / 2, j: (middle.y - middle.x) / 2 });
  rot = (rot + by + 4) % 4;
  for (const a of areas) {
    a.world.setRotation(rot);
    a.dirty = true;
  }
  const v = turned(plane);
  const s = toScreen(v.i, v.j, 0);
  cam.x = s.x;
  cam.y = s.y;
  paint();
}

addEventListener('keydown', (e) => {
  if (e.key === 'q' || e.key === 'Q') turn(-1);
  if (e.key === 'e' || e.key === 'E') turn(1);
  if (e.key === 'f' || e.key === 'F') { showAll(); paint(); }
});

// ------------------------------------------------------------------ panel

function newArea(cave: boolean): void {
  const n = areas.filter((a) => !!a.scene.cave === cave).length + 1;
  let scene: Scene;
  if (cave) {
    scene = createCave(`Cave ${n}`, 16, 12);
    // A room carved out, so there is floor to drop things on.
    for (let j = 2; j < scene.h - 2; j++) for (let i = 2; i < scene.w - 2; i++) scene.paint[j * scene.w + i] = CAVE_OPEN;
  } else scene = createScene(`Island ${n}`, 24, 24, true);
  const a = addArea(`new-${scene.id}`, scene);
  a.world.setRotation(rot);
  const c = diamond(a);
  cam.x = (c[1].x + c[3].x) / 2;
  cam.y = (c[0].y + c[2].y) / 2;
  paint();
}

const panel = document.createElement('div');
panel.className = 'panel';
panel.innerHTML = `
  <h1>One scene, several areas</h1>
  <p>Mockup: every scene file of the project as an area on one shared ground. Nothing is saved.</p>
  <ul>
    <li>Drag an area's <b>tab</b> to move it</li>
    <li>Drag a <b>thing</b> into another area to move it there</li>
    <li>Drag from a way's <b>◆</b> onto another hole or ladder to link them, or onto open ground of another area to make the other end; click ◆ to unlink</li>
    <li>Drag the desk to pan, wheel to zoom, <kbd>Q</kbd>/<kbd>E</kbd> turn, <kbd>F</kbd> show all</li>
  </ul>
  <div class="buttons"><button data-a="island">+ Island</button><button data-a="cave">+ Cave</button><button data-a="all">Show all</button><button data-a="hide">Hide help</button></div>`;
document.body.append(panel);
panel.addEventListener('click', (e) => {
  const what = (e.target as HTMLElement).dataset.a;
  if (what === 'island' || what === 'cave') newArea(what === 'cave');
  if (what === 'all') { showAll(); paint(); }
  if (what === 'hide') {
    panel.classList.toggle('closed');
    (e.target as HTMLElement).textContent = panel.classList.contains('closed') ? 'Show help' : 'Hide help';
  }
});

for (const f of files) {
  try { addArea(f.key, readSceneFile(f.text)); } catch (e) { console.warn('not a scene', f.key, e); }
}
if (!areas.length) addArea('island', createScene('Island', 24, 24, true));
showAll();
paint();
