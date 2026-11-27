// Props: anything standing in the world that is not terrain and not a character (docs/props.md).
// One definition, `PropKind`, over the catalogues that already exist (flora recipes, object presets
// and saved objects, decorations, the carried crate) and the kinds made on this device. A kind says
// how its pixels are made (`source`), which of the eight directions show which view (`views`) and
// which features it opts into, whatever box it came from.
//
// Any kind can be frozen: its views are drawn once and kept as painted art, to be polished by hand.
// Freezing a catalogue kind LOCKS it: everything that draws that kind (scenes, games) shows the
// painted views from then on, until it is unlocked. Painted kinds can still sway: the wind shears
// their columns by height.
import { FRAMES, grow, drawPlantCropped, isStill, tryPlant, TURNS, type Plant } from '../flora/flora.ts';
import { crop } from '../core/cropped.ts';
import { FLORA, plantById, plantOf } from '../flora/flora-catalog.ts';
import { cleanBuild, drawObject, framesOf, OBJECT_H, OBJECT_ORIGIN, OBJECT_W, savedProps, type Build } from '../objects/object.ts';
import { OBJECT_PRESETS } from '../objects/object-presets.ts';
import { cellForHex, cleanArt, freeze, paintedView, swayed, toArt, type Art, type Drawn, type Grid, type Painted } from '../core/stamp.ts';
import { DECOR } from './decor.ts';
import { cached, forget, idOf } from '../core/cache.ts';
import { newId, readStore, writeStore } from '../../shared/files.ts';

export type Source = 'painted' | 'grown' | 'built' | 'rigged';
export const SOURCES: Source[] = ['painted', 'grown', 'built'];
/** What a kind may opt into, whatever its source. */
export const FEATURES = ['wind', 'loop', 'glow', 'blocks', 'carry'] as const;
export type Feature = (typeof FEATURES)[number];
/** How many views a kind draws; the eight directions share them. */
export const VIEW_COUNTS = [1, 2, 4, 8] as const;
export type ViewCount = (typeof VIEW_COUNTS)[number];
/** Which scene list a kind is placed into: the older lists keep what they hold, everything else is a placed prop. */
export type Place = 'plant' | 'decor' | 'item' | 'prop';

export interface PropKind {
  id: string;
  name: string;
  source: Source;
  /** Shipped with the engine: it can be hidden, locked and duplicated, not deleted or renamed in its file. */
  builtin: boolean;
  /** Walls and roofs sit on cell edges and cells; they have their own editor (tools/walls). */
  anchor: 'point' | 'edge' | 'cell';
  tags: string[];
  features: Feature[];
  views: ViewCount;
  /** The second half of the views are the first half mirrored. */
  mirror: boolean;
  /** How far the top of a painted kind sways in a breeze, in pixels. */
  flex: number;
  place: Place;
  /** grown */
  plant?: Plant;
  /** built */
  build?: Build;
  /** painted, or a frozen catalogue kind */
  art?: Art;
  /** A catalogue kind whose views are frozen. */
  locked?: boolean;
  /** For a painted kind made by freezing another one: that kind's id. */
  from?: string;
  /** For a grown kind of this device: its recipe as written. */
  recipe?: unknown;
}

/** One prop standing in a scene. */
export interface PlacedProp {
  /** A kind id. */
  kind: string;
  /** Metres from the north corner of the map. */
  i: number;
  j: number;
  /** Eighths of a turn, 0 to 7. */
  turn: number;
  /** Which variant: grown kinds have four, others one. */
  seed: number;
  size: number;
  /** Whatever the kind defines: open, a growth stage. */
  state?: string;
}

// ------------------------------------------------------------------ views

/** The view and mirroring each of the eight directions shows. */
export function viewOf(count: ViewCount, mirror: boolean, dir: number): { view: number; mirror: boolean } {
  const d = ((Math.round(dir) % 8) + 8) % 8;
  const view = Math.floor((d * count) / 8);
  if (!mirror || count === 1) return { view, mirror: false };
  const half = count / 2;
  return view < half ? { view, mirror: false } : { view: count - 1 - view, mirror: true };
}
/** How many views of a kind are drawn: with mirroring, only half of them. */
export const ownViews = (k: Pick<PropKind, 'views' | 'mirror'>) => (k.mirror && k.views > 1 ? k.views / 2 : k.views);
/** The direction a view is drawn from. */
export const dirOfView = (count: ViewCount, view: number) => (view * 8) / count;

// ------------------------------------------------------------------ storage

/** Where props made, duplicated, hidden or locked on this device are kept. The scene editor and games read it too. */
export const PROP_STORE = 'pixel-props';
interface Mine {
  id: string; name: string; source: 'painted' | 'grown' | 'built'; tags: string[]; features: Feature[];
  views: ViewCount; mirror: boolean; flex: number; art?: Art; recipe?: unknown; build?: Build; from?: string;
}
interface Over { name?: string; hidden?: boolean; features?: Feature[]; views?: ViewCount; mirror?: boolean; flex?: number; lock?: Art; tags?: string[] }
interface Store { mine: Mine[]; over: Record<string, Over> }

const features = (v: unknown): Feature[] | undefined => (Array.isArray(v) ? FEATURES.filter((f) => v.includes(f)) : undefined);
const count = (v: unknown): ViewCount | undefined => (VIEW_COUNTS.includes(v as ViewCount) ? (v as ViewCount) : undefined);
const flexOf = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(6, v)) : undefined);
const tagsOf = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 24)).slice(0, 12) : undefined);
const nameOf = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : fallback);

/** A kind of this device as read from storage or a file; null when it cannot be used. */
function cleanMine(raw: any): Mine | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = (['painted', 'grown', 'built'] as const).find((s) => s === raw.source);
  if (!source) return null;
  const art = raw.art ? cleanArt(raw.art) ?? undefined : undefined;
  if (source === 'painted' && !art) return null;
  if (source === 'grown' && !tryPlant(raw.recipe).ok) return null;
  return {
    id: typeof raw.id === 'string' && raw.id.startsWith('mine:') ? raw.id.slice(0, 40) : `mine:${newId()}`,
    name: nameOf(raw.name, 'Prop'), source, tags: tagsOf(raw.tags) ?? [], features: features(raw.features) ?? [],
    views: count(raw.views) ?? 1, mirror: raw.mirror === true, flex: flexOf(raw.flex) ?? 1.5,
    ...(art ? { art } : {}), ...(source === 'grown' ? { recipe: raw.recipe } : {}), ...(source === 'built' ? { build: cleanBuild(raw.build) } : {}),
    ...(typeof raw.from === 'string' ? { from: raw.from.slice(0, 60) } : {}),
  };
}
function cleanOver(raw: any): Over {
  if (!raw || typeof raw !== 'object') return {};
  const out: Over = {};
  if (typeof raw.name === 'string' && raw.name.trim()) out.name = raw.name.trim().slice(0, 40);
  if (raw.hidden === true) out.hidden = true;
  if (features(raw.features)) out.features = features(raw.features);
  if (count(raw.views)) out.views = count(raw.views);
  if (typeof raw.mirror === 'boolean') out.mirror = raw.mirror;
  if (flexOf(raw.flex) !== undefined) out.flex = flexOf(raw.flex);
  if (tagsOf(raw.tags)) out.tags = tagsOf(raw.tags);
  const lock = raw.lock && cleanArt(raw.lock);
  if (lock) out.lock = lock;
  return out;
}
function readProps(): Store {
  const raw = readStore<any>(PROP_STORE, null);
  const mine = (Array.isArray(raw?.mine) ? raw.mine : []).map(cleanMine).filter((m: Mine | null): m is Mine => !!m);
  const over: Record<string, Over> = {};
  for (const [id, o] of Object.entries(raw?.over ?? {})) over[id] = cleanOver(o);
  return { mine, over };
}
let store: Store = readProps();
let kinds: PropKind[] | null = null;
/** Kinds and locks a scene brought with it from another device, kept for this visit only. */
const visiting: Store = { mine: [], over: {} };

/** Writes the store back and forgets the kinds made from it. False when the browser refuses storage. */
function save(): boolean {
  kinds = null;
  return writeStore(PROP_STORE, store);
}
/** Reads storage again, after another page changed it. */
export function reloadProps(): void {
  store = readProps();
  kinds = null;
}

// ------------------------------------------------------------------ the catalogue

/** Decorations as painted art: their few hand-drawn pixels, read into palette cells. */
function decorArt(rows: string[], colors: Record<string, string>): Art {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const grid: Grid = rows.map((row) => Array.from({ length: w }, (_, x) => cellForHex(colors[row[x] ?? '.'] ?? null)));
  return toArt([grid], Math.floor(w / 2), Math.floor(h / 2));
}

function catalogue(): PropKind[] {
  const out: PropKind[] = [];
  for (const entry of FLORA) {
    const still = isStill(grow(entry.plant, { seed: 0 }));
    out.push({
      id: entry.id, name: entry.label, source: 'grown', builtin: true, anchor: 'point', tags: [entry.category, 'plant'],
      features: [...(still ? [] : ['wind' as const]), ...(entry.category === 'grass' ? [] : ['blocks' as const])],
      views: 8, mirror: false, flex: 1.5, place: 'plant', plant: entry.plant,
    });
  }
  for (const preset of OBJECT_PRESETS) {
    const carried = preset.id === 'crate';
    out.push({
      id: `object:${preset.id}`, name: preset.name, source: 'built', builtin: true, anchor: 'point', tags: [preset.prop.kind, 'object'],
      features: [...(framesOf(preset.prop) > 1 ? ['loop' as const] : []), 'blocks', ...(carried ? ['carry' as const] : [])],
      views: 4, mirror: false, flex: 0, place: 'item', build: preset.prop,
    });
  }
  for (const saved of savedProps()) {
    out.push({
      id: `my-object:${saved.id}`, name: saved.name, source: 'built', builtin: false, anchor: 'point', tags: [saved.prop.kind, 'object', 'mine'],
      features: [...(framesOf(saved.prop) > 1 ? ['loop' as const] : []), 'blocks'], views: 4, mirror: false, flex: 0, place: 'item', build: saved.prop,
    });
  }
  for (const d of DECOR) {
    out.push({
      id: `decor:${d.id}`, name: d.id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), source: 'painted', builtin: true, anchor: 'point',
      tags: ['decor', 'ground'], features: [], views: 1, mirror: false, flex: 0, place: 'decor', art: decorArt(d.rows, d.colors),
    });
  }
  return out;
}

/** Every kind: the catalogue with this device's changes, then the kinds made here. Hidden ones included; see `hidden`. */
export function propKinds(): PropKind[] {
  if (kinds) return kinds;
  const list = catalogue().map((k): PropKind => {
    const o = store.over[k.id] ?? visiting.over[k.id];
    if (!o) return k;
    // A decoration lies flat in the ground picture: it is not drawn from its art, so it cannot be locked.
    const lock = k.place === 'decor' ? undefined : o.lock;
    return {
      ...k, name: o.name ?? k.name, features: o.features ?? k.features, views: o.views ?? k.views, mirror: o.mirror ?? k.mirror,
      flex: o.flex ?? k.flex, tags: o.tags ?? k.tags, ...(lock ? { art: lock, locked: true } : {}),
    };
  });
  for (const m of [...store.mine, ...visiting.mine.filter((v) => !store.mine.some((m) => m.id === v.id))]) {
    const plant = m.source === 'grown' ? (tryPlant(m.recipe) as { ok: true; compiled: { plant: Plant } }).compiled.plant : undefined;
    list.push({
      id: m.id, name: m.name, source: m.source, builtin: false, anchor: 'point', tags: m.tags, features: m.features,
      views: m.views, mirror: m.mirror, flex: m.flex, place: 'prop', art: m.art, build: m.build, plant, recipe: m.recipe, from: m.from,
    });
  }
  return (kinds = list);
}
export const propKind = (id: string | null | undefined) => propKinds().find((k) => k.id === id);
export const isHidden = (id: string) => store.over[id]?.hidden === true;

// ------------------------------------------------------------------ changing kinds

/** Changes a kind: a catalogue kind keeps the change as an override, a kind of this device in itself. */
export function changeKind(id: string, change: Partial<Pick<PropKind, 'name' | 'features' | 'views' | 'mirror' | 'flex' | 'tags' | 'art' | 'build' | 'recipe'>>): boolean {
  const mine = store.mine.find((m) => m.id === id);
  if (mine) {
    Object.assign(mine, change);
    return save();
  }
  const o = (store.over[id] ??= {});
  if (change.name !== undefined) o.name = change.name;
  if (change.features) o.features = change.features;
  if (change.views) o.views = change.views;
  if (change.mirror !== undefined) o.mirror = change.mirror;
  if (change.flex !== undefined) o.flex = change.flex;
  if (change.tags) o.tags = change.tags;
  if (change.art && o.lock) o.lock = change.art;
  return save();
}
export function setHidden(id: string, hidden: boolean): boolean {
  const o = (store.over[id] ??= {});
  if (hidden) o.hidden = true;
  else delete o.hidden;
  return save();
}
export function deleteKind(id: string): boolean {
  store.mine = store.mine.filter((m) => m.id !== id);
  return save();
}

/** A new kind of this device: painted from a blank canvas, a copy of another kind, or its frozen views. Gives its id. */
export function addKind(kind: Omit<Mine, 'id'>): string {
  const id = `mine:${newId()}`;
  store.mine.push({ ...structuredClone(kind), id });
  save();
  return id;
}

/** A copy of a kind as a kind of this device, with the same source. Gives the new id. */
export function duplicateKind(k: PropKind, name = `${k.name} 2`): string {
  const source = k.source === 'rigged' ? 'painted' : k.source;
  const recipe = k.source === 'grown' ? (k.recipe ?? plantById(k.id)?.raw) : undefined;
  if (k.art && (k.source === 'painted' || k.locked)) {
    return addKind({ name, source: 'painted', tags: k.tags.filter((t) => t !== 'mine'), features: k.features, views: k.views, mirror: k.mirror, flex: k.flex, art: k.art, from: k.from ?? k.id });
  }
  return addKind({ name, source, tags: k.tags.filter((t) => t !== 'mine'), features: k.features, views: k.views, mirror: k.mirror, flex: k.flex, recipe, build: k.build });
}

/** A blank painted kind. */
export function newPainted(name: string, w = 32, h = 32, views: ViewCount = 1): string {
  const blank: Grid = Array.from({ length: h }, () => Array(w).fill(null));
  return addKind({ name, source: 'painted', tags: [], features: [], views, mirror: false, flex: 1.5, art: toArt(Array(views).fill(blank), Math.floor(w / 2), h - 3) });
}

/** The kind's own views drawn by its rule, at seed 0, size 1, still: what freezing captures. */
export function generatedViews(k: PropKind): Drawn[] {
  return Array.from({ length: ownViews(k) }, (_, view) => {
    const p = drawGenerated(k, dirOfView(k.views, view), 0, 0, 0, 1);
    return p ? { get: p.get, w: p.w, h: p.h, ox: p.foot.x, oy: p.foot.y } : { get: () => null, w: 1, h: 1, ox: 0, oy: 0 };
  });
}

/**
 * Freezes a kind. A catalogue kind is locked: its views are kept as art and drawn from then on.
 * A kind of this device becomes painted. Either way, gives the art to polish.
 */
export function lockKind(k: PropKind): Art {
  const art = freeze(generatedViews(k));
  const mine = store.mine.find((m) => m.id === k.id);
  if (mine) Object.assign(mine, { source: 'painted', art });
  else (store.over[k.id] ??= {}).lock = art;
  save();
  return art;
}
/** Back to the views drawn by rule. Hand edits to the locked art are lost. */
export function unlockKind(id: string): boolean {
  const o = store.over[id];
  if (o) delete o.lock;
  return save();
}

/** A painted file: one kind of this device, for export and import. */
const FILE_TYPE = 'pixel-prop';
export function propKindFile(k: PropKind): string {
  const m = store.mine.find((x) => x.id === k.id);
  const kind = m ?? { name: k.name, source: k.art ? 'painted' : k.source, tags: k.tags, features: k.features, views: k.views, mirror: k.mirror, flex: k.flex, art: k.art, build: k.build, recipe: k.recipe ?? plantById(k.id)?.raw, from: k.id };
  return JSON.stringify({ type: FILE_TYPE, version: 1, kind }, null, 1);
}
export function importPropKind(text: string): string {
  const raw = JSON.parse(text);
  if (!raw || raw.type !== FILE_TYPE) throw new Error('not a pixel-prop file');
  const m = cleanMine({ ...raw.kind, id: undefined });
  if (!m) throw new Error('that prop cannot be read');
  const { id: _, ...rest } = m;
  return addKind(rest);
}

// ------------------------------------------------------------------ drawing

/** Recipes being edited in a tool, drawn instead of the stored ones until the page is left. */
const editing = new Map<string, Plant>();
export function setEditedPlant(id: string, plant: Plant | null): void {
  if (plant) editing.set(id, plant);
  else editing.delete(id);
  forget('prop plant', `${id}|`);
}

/** A kind drawn by its rule (not from locked art) from a direction, eighths of a turn. */
function drawGenerated(k: PropKind, dir: number, frame: number, wind: number, seed: number, size: number): Painted | null {
  if (k.source === 'grown') {
    const plant = editing.get(k.id) ?? (k.builtin ? plantOf(plantById(k.id)!) : k.plant);
    if (!plant) return null;
    const moving = k.features.includes('wind') ? wind : 0;
    const f = moving ? frame % FRAMES : 0;
    const key = `${k.id}|${k.builtin ? '' : JSON.stringify(k.recipe)}|${dir}|${f}|${moving}|${seed}|${Math.round(size * 10)}`;
    return cached('prop plant', key, () => drawPlantCropped(grow(plant, { seed, size: Math.round(size * 10) / 10, turn: (dir * 360) / TURNS }), { frame: f, wind: moving }));
  }
  if (k.source === 'built' && k.build) {
    const f = k.features.includes('loop') ? frame % framesOf(k.build) : 0;
    // Eight views show the diagonals, turned an eighth; fewer keep to the four quarter turns.
    const turn = k.views === 8 ? dir / 2 : Math.floor(dir / 2) % 4;
    // Kept by the build itself, so an edited build (a new object) is drawn anew.
    const p = cached('prop object', `${idOf(k.build)}|${turn}|${f}`, () => crop(drawObject(k.build!, turn, f).sprite, OBJECT_W, OBJECT_H, OBJECT_ORIGIN));
    return p;
  }
  return null;
}

/** The sway of a painted kind's top in one wind frame, in pixels. */
const leanOf = (k: PropKind, frame: number, wind: number) =>
  (k.features.includes('wind') && wind ? Math.round(Math.sin(((frame % FRAMES) / FRAMES) * Math.PI * 2) * k.flex * Math.min(2, wind)) : 0);

/**
 * A kind's picture from a direction (eighths of a turn, the view's turn already added), in a frame
 * of the wind loop. From its art when painted or locked, else drawn by its rule.
 */
export function propPicture(k: PropKind, dir: number, frame = 0, wind = 1, seed = 0, size = 1): Painted | null {
  const { view, mirror } = viewOf(k.views, k.mirror, dir);
  if (k.art) {
    const p = swayed(paintedView(k.art, view, mirror), leanOf(k, frame, wind));
    if (!k.features.includes('loop')) return p;
    // A painted kind that loops bobs: a pixel up for half the loop.
    const up = Math.floor(frame / 4) % 2;
    return up ? { ...p, foot: { x: p.foot.x, y: p.foot.y + 1 } } : p;
  }
  const at = dirOfView(k.views, mirror ? k.views - 1 - view : view);
  const p = drawGenerated(k, at, frame, wind, seed, size);
  if (!p || !mirror) return p;
  return { ...p, foot: { x: p.w - 1 - p.foot.x, y: p.foot.y }, get: (x, y) => p.get(p.w - 1 - x, y) };
}

/** How many variants a kind has: a grown kind four, as the scene editor offers; others one. */
export const variantsOf = (k: PropKind) => (k.source === 'grown' && !k.art ? 4 : 1);

/** How far a walker keeps from a prop that blocks, in metres. */
export const blockRadius = (k: PropKind, size = 1) => {
  if (!k.features.includes('blocks')) return 0;
  if (k.build) return Math.max(0.25, Math.min(k.build.w, k.build.d) * 0.4);
  return 0.35 * size;
};

/** A placed prop as read from a scene: null when its kind is unknown here. */
export function cleanPlacedProp(raw: any, w: number, h: number): PlacedProp | null {
  if (!raw || typeof raw !== 'object' || typeof raw.kind !== 'string' || !propKind(raw.kind)) return null;
  const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback);
  const k = propKind(raw.kind)!;
  return {
    kind: raw.kind, i: num(raw.i, 0, w, w / 2), j: num(raw.j, 0, h, h / 2),
    turn: Math.round(num(raw.turn, 0, 7, 0)), seed: Math.round(num(raw.seed, 0, variantsOf(k) - 1, 0)), size: num(raw.size, 0.5, 2, 1),
    ...(typeof raw.state === 'string' ? { state: raw.state.slice(0, 24) } : {}),
  };
}

/**
 * The locked picture of a catalogue kind, for the code that draws the old lists (plants, items): null
 * when the kind is not locked, and that code draws it by rule as before.
 */
export function lockedPicture(id: string, dir: number, frame = 0, wind = 1): Painted | null {
  if (!(store.over[id] ?? visiting.over[id])?.lock) return null;
  const k = propKind(id);
  return k?.locked ? propPicture(k, dir, frame, wind) : null;
}

// ------------------------------------------------------------------ carried in scenes

/**
 * What a scene needs of this device's props to be drawn elsewhere (in a game, or on another
 * device): the kinds made here that it places, and the locked art of catalogue kinds it uses.
 */
export interface Carried { kinds: unknown[]; locks: Record<string, Art> }
export function carriedFor(ids: Iterable<string>): Carried | undefined {
  const out: Carried = { kinds: [], locks: {} };
  for (const id of new Set(ids)) {
    const mine = store.mine.find((m) => m.id === id) ?? visiting.mine.find((m) => m.id === id);
    if (mine) out.kinds.push(mine);
    const lock = (store.over[id] ?? visiting.over[id])?.lock;
    if (lock) out.locks[id] = lock;
  }
  return out.kinds.length || Object.keys(out.locks).length ? out : undefined;
}
/** Takes in what a scene carried, for this visit: kinds unknown here are added, locks of kinds not locked here apply. */
export function useCarried(input: unknown): void {
  const raw = input && typeof input === 'object' ? (input as { kinds?: unknown; locks?: unknown }) : null;
  if (!raw) return;
  for (const k of Array.isArray(raw.kinds) ? raw.kinds : []) {
    const m = cleanMine(k);
    if (m && !visiting.mine.some((v) => v.id === m.id)) visiting.mine.push(m);
  }
  for (const [id, art] of Object.entries((raw.locks ?? {}) as Record<string, unknown>)) {
    const clean = cleanArt(art);
    if (clean && !store.over[id]?.lock) visiting.over[id] = { ...visiting.over[id], lock: clean };
  }
  kinds = null;
}
