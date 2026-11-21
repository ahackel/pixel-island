// Wardrobe parts polished by hand. Every item, whatever format the model wrote it in, ends as stamps
// of palette cells (engine/core/puppet.ts `Item`): head, front and back, its own side views, a torso,
// a held tool, the sleeve and trouser strips. The parts editor (tools/parts) paints over those
// stamps; the edits are kept on this device per catalogue id and laid over the item when the
// catalogue is built (catalog.ts), so the wardrobe, scenes and games here wear the polished part.
import { cleanArt, gridsOf, toArt, type Art, type Grid } from '../core/stamp.ts';
import type { Cell } from '../core/palette.ts';
import type { Item, Stamp } from '../core/puppet.ts';
import { readStore, writeStore } from '../../shared/files.ts';

/** One paintable layer of an item: a stamp, or a limb strip shown as a column, or a single cell. */
export interface Layer {
  key: string;
  /** How it is shown, as words for the picker. */
  what: { en: string; de: string };
  get(item: Item): Grid | null;
  set(item: Item, grid: Grid): void;
}

const VIEW_WORDS: Record<string, [string, string]> = { S: ['front', 'vorn'], N: ['back', 'hinten'], E: ['side', 'Seite'], '0': ['front right', 'vorn rechts'], '3': ['back right', 'hinten rechts'] };
const stampLayer = (path: string[], en: string, de: string): Layer => ({
  key: path.join('.'),
  what: { en, de },
  get: (item) => {
    let at: any = item;
    for (const p of path) at = at?.[p];
    return Array.isArray(at) && Array.isArray(at[0]) ? (at as Stamp) : null;
  },
  set: (item, grid) => {
    let at: any = item;
    for (const p of path.slice(0, -1)) at = at[p];
    at[path[path.length - 1]] = grid;
  },
});
const stripLayer = (key: 'arm' | 'leg', en: string, de: string): Layer => ({
  key, what: { en, de },
  get: (item) => (item[key] ? item[key]!.map((c) => [c]) : null),
  set: (item, grid) => { item[key] = grid.map((row) => row[0] ?? null); },
});
const cellLayer = (key: 'foot' | 'sole', en: string, de: string): Layer => ({
  key, what: { en, de },
  get: (item) => (item[key] ? [[item[key] as Cell]] : null),
  set: (item, grid) => { item[key] = grid[0]?.[0] ?? null; },
});

/** Every layer an item has, in the order the editor offers them. */
export function layersOf(item: Item): Layer[] {
  const out: Layer[] = [];
  const pair = (name: 'head' | 'headBehind' | 'torso' | 'tool', en: string, de: string) => {
    if (!item[name]) return;
    out.push(stampLayer([name, 'front'], `${en}, front`, `${de}, vorn`), stampLayer([name, 'back'], `${en}, back`, `${de}, hinten`));
  };
  pair('head', 'Head', 'Kopf');
  pair('headBehind', 'Behind the body', 'Hinter dem Körper');
  for (const group of ['views', 'left'] as const) {
    for (const view of Object.keys(item[group] ?? {})) {
      const [en, de] = VIEW_WORDS[view] ?? [view, view];
      const lefty = group === 'left' ? [' (left)', ' (links)'] : ['', ''];
      out.push(stampLayer([group, view, 'head'], `Head, own ${en} view${lefty[0]}`, `Kopf, eigene Ansicht ${de}${lefty[1]}`));
      if ((item[group] as any)[view].behind) out.push(stampLayer([group, view, 'behind'], `Behind, own ${en} view${lefty[0]}`, `Dahinter, eigene Ansicht ${de}${lefty[1]}`));
    }
  }
  pair('torso', 'Torso', 'Rumpf');
  pair('tool', 'Tool', 'Werkzeug');
  if (item.arm) out.push(stripLayer('arm', 'Sleeve, shoulder to hand', 'Ärmel, Schulter bis Hand'));
  if (item.leg) out.push(stripLayer('leg', 'Trouser leg, hip to ankle', 'Hosenbein, Hüfte bis Knöchel'));
  if (item.foot) out.push(cellLayer('foot', 'Shoe', 'Schuh'));
  if (item.sole) out.push(cellLayer('sole', 'Sole', 'Sohle'));
  return out;
}

/** A deep copy, so drawing caches keyed by stamp see an edited item as new. */
export const copyItem = (item: Item): Item => structuredClone(item);

// ------------------------------------------------------------------ storage

/** Edited parts on this device: per catalogue id, the layers painted over, as art. */
export const PARTS_STORE = 'pixel-parts';
type Edits = Record<string, Record<string, Art>>;
let edits: Edits = read();
function read(): Edits {
  const raw = readStore<any>(PARTS_STORE, null);
  const out: Edits = {};
  for (const [id, layers] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const clean: Record<string, Art> = {};
    for (const [key, art] of Object.entries(layers && typeof layers === 'object' ? (layers as object) : {})) {
      const a = cleanArt(art);
      if (a) clean[key] = a;
    }
    if (Object.keys(clean).length) out[id] = clean;
  }
  return out;
}
export const reloadParts = () => { edits = read(); };
export const isEdited = (id: string) => !!edits[id];

/**
 * The item with this device's edits laid over it. A layer is only taken where the item has it and
 * the sizes agree, so an edit made against another version of the item cannot break it.
 */
export function editedItem(id: string, item: Item): Item {
  const mine = edits[id];
  if (!mine) return item;
  const out = copyItem(item);
  for (const layer of layersOf(out)) {
    const art = mine[layer.key];
    const now = layer.get(out);
    if (!art || !now || art.w !== (now[0]?.length ?? 0) || art.h !== now.length) continue;
    layer.set(out, gridsOf(art)[0]);
  }
  return out;
}

/** Keeps an item's edited layers: those that differ from the original. */
export function saveEdits(id: string, original: Item, edited: Item): boolean {
  const layers: Record<string, Art> = {};
  const before = layersOf(original);
  for (const layer of layersOf(edited)) {
    const g = layer.get(edited);
    const was = before.find((l) => l.key === layer.key)?.get(original);
    if (g && JSON.stringify(g) !== JSON.stringify(was)) layers[layer.key] = toArt([g], 0, 0);
  }
  if (Object.keys(layers).length) edits[id] = layers;
  else delete edits[id];
  return writeStore(PARTS_STORE, edits);
}
export function dropEdits(id: string): boolean {
  delete edits[id];
  return writeStore(PARTS_STORE, edits);
}

const FILE_TYPE = 'pixel-part';
export const partFile = (id: string) => JSON.stringify({ type: FILE_TYPE, version: 1, id, layers: edits[id] ?? {} }, null, 1);
/** Reads exported edits back; gives the id they belong to. */
export function importPart(text: string): string {
  const raw = JSON.parse(text);
  if (!raw || raw.type !== FILE_TYPE || typeof raw.id !== 'string') throw new Error('not a pixel-part file');
  const layers: Record<string, Art> = {};
  for (const [key, art] of Object.entries(raw.layers ?? {})) {
    const a = cleanArt(art);
    if (a) layers[key] = a;
  }
  edits[raw.id] = layers;
  writeStore(PARTS_STORE, edits);
  return raw.id;
}
