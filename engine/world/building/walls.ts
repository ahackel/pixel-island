// Wall pieces as content: the rule-drawn walls the engine ships and the walls painted on this device,
// for the wall editor (tools/walls) and the games. A rule wall can be frozen into painted art and
// polished by hand; a frozen built-in wall is LOCKED, and `wallKind` hands games the painted version
// in its place until it is unlocked. A painted wall can also be exported and kept with a game's content.
import { cleanArt, type Art } from '../../core/stamp.ts';
import { newId, readStore, writeStore } from '../../../shared/files.ts';
import type { EdgeKind } from './building.ts';
import { paintedWall } from './pieces/painted-wall.ts';
import { plankWall, type PlankWallOptions } from './pieces/plank-wall.ts';

export interface WallKind {
  id: string;
  name: string;
  /** Rule-drawn by one of the engine's pieces, or painted. */
  source: 'rule' | 'painted';
  builtin: boolean;
  /** For a rule wall: which piece and its options. */
  rule?: { piece: 'plank'; options: PlankWallOptions };
  /** For a painted wall, or a locked built-in one. */
  art?: Art;
  locked?: boolean;
  /** The wall height, in levels, it is shown and frozen at. */
  height: number;
}

/**
 * The walls the engine ships. The hut's planks are the options the island game builds with. Rock walls
 * for caves are drawn by the cave code and will join this list when it moves into the engine.
 */
export const BUILTIN_WALLS: WallKind[] = [
  { id: 'plank', name: 'Plank wall (hut)', source: 'rule', builtin: true, rule: { piece: 'plank', options: { overhang: 3, top: 'slope', seed: 1 } }, height: 4 },
];

export const WALL_STORE = 'pixel-walls';
interface Store { mine: WallKind[]; locks: Record<string, Art> }

const TOPS = ['slope', 'stepped', 'flat'] as const;
function cleanRule(raw: any): WallKind['rule'] {
  const o = raw?.options ?? {};
  const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  return { piece: 'plank', options: { overhang: int(o.overhang, 0, 6, 2), top: TOPS.includes(o.top) ? o.top : 'slope', seed: int(o.seed, 0, 9999, 1) } };
}
function cleanWall(raw: any): WallKind | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw.source === 'painted' ? 'painted' : raw.source === 'rule' ? 'rule' : null;
  if (!source) return null;
  const art = raw.art ? cleanArt(raw.art) ?? undefined : undefined;
  if (source === 'painted' && !art) return null;
  return {
    id: typeof raw.id === 'string' && raw.id.startsWith('wall:') ? raw.id.slice(0, 40) : `wall:${newId()}`,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : 'Wall',
    source, builtin: false, height: typeof raw.height === 'number' ? Math.max(1, Math.min(8, Math.round(raw.height))) : 3,
    ...(source === 'rule' ? { rule: cleanRule(raw.rule) } : { art }),
  };
}
function read(): Store {
  const raw = readStore<any>(WALL_STORE, null);
  const locks: Record<string, Art> = {};
  for (const [id, a] of Object.entries(raw?.locks ?? {})) {
    const art = cleanArt(a);
    if (art && BUILTIN_WALLS.some((w) => w.id === id)) locks[id] = art;
  }
  return { mine: (Array.isArray(raw?.mine) ? raw.mine : []).map(cleanWall).filter((w: WallKind | null): w is WallKind => !!w), locks };
}
let store = read();
const save = () => writeStore(WALL_STORE, store);
export const reloadWalls = () => { store = read(); };

export function wallKinds(): WallKind[] {
  return [
    ...BUILTIN_WALLS.map((w) => (store.locks[w.id] ? { ...w, art: store.locks[w.id], locked: true } : w)),
    ...store.mine,
  ];
}
export const wallById = (id: string) => wallKinds().find((w) => w.id === id);

/** How a wall kind is drawn: from its art when painted or locked, else by its rule. */
const drawn = new WeakMap<object, EdgeKind>();
export function edgeKindOf(w: WallKind): EdgeKind {
  const key = (w.art ?? w.rule ?? w) as object;
  let kind = drawn.get(key);
  if (!kind) drawn.set(key, (kind = w.art ? paintedWall(w.art) : plankWall(w.rule!.options)));
  return kind;
}

/**
 * For games: the piece to build a built-in wall with. The painted version when it is locked on this
 * device, else the game's own rule-drawn piece.
 */
export function wallKind(id: string, fallback: EdgeKind): EdgeKind {
  const lock = store.locks[id];
  return lock ? edgeKindOf({ ...BUILTIN_WALLS.find((w) => w.id === id)!, art: lock }) : fallback;
}

export function addWall(w: Omit<WallKind, 'id' | 'builtin'>): string {
  const id = `wall:${newId()}`;
  store.mine.push({ ...structuredClone(w), id, builtin: false });
  save();
  return id;
}
export function changeWall(id: string, change: Partial<Pick<WallKind, 'name' | 'art' | 'rule' | 'height'>>): boolean {
  const mine = store.mine.find((w) => w.id === id);
  if (mine) Object.assign(mine, change);
  else if (change.art && store.locks[id]) store.locks[id] = change.art;
  return save();
}
export function deleteWall(id: string): boolean {
  store.mine = store.mine.filter((w) => w.id !== id);
  return save();
}
/** Freezes a wall: a built-in one is locked with the art, one of this device becomes painted. */
export function lockWall(id: string, art: Art): boolean {
  const mine = store.mine.find((w) => w.id === id);
  if (mine) Object.assign(mine, { source: 'painted', art, rule: undefined });
  else store.locks[id] = art;
  return save();
}
export function unlockWall(id: string): boolean {
  delete store.locks[id];
  return save();
}

const FILE_TYPE = 'pixel-wall';
export const wallFile = (w: WallKind) => JSON.stringify({ type: FILE_TYPE, version: 1, wall: { name: w.name, source: w.art ? 'painted' : 'rule', rule: w.rule, art: w.art, height: w.height } }, null, 1);
/** Reads an exported wall; a game can keep the file with its content and build with `edgeKindOf`. */
export function readWallFile(text: string): WallKind {
  const raw = JSON.parse(text);
  if (!raw || raw.type !== FILE_TYPE) throw new Error('not a pixel-wall file');
  const w = cleanWall(raw.wall);
  if (!w) throw new Error('that wall cannot be read');
  return w;
}
