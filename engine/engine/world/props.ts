// Objects standing about in a scene: any object preset (engine/objects/object-presets.ts) or one made in
// the object editor and kept in the scene itself, drawn by the object renderer in the four camera turns.
// Each is turned its own way, a chest holds things and opens, and a crate can be picked up and carried.
import { drawObject, OBJECT_H, OBJECT_ORIGIN, OBJECT_W, type Build } from '../objects/object.ts';
import { OPENING, objectPresetById } from '../objects/object-presets.ts';
import type { Thing } from './world.ts';
import { cached } from '../core/cache.ts';
import { crop } from '../core/cropped.ts';

/** The ids of a scene's own objects, made in the object editor, start with this; their builds are in `Scene.objects`. */
export const OWN = 'own:';
/** Objects a character can pick up and carry; the rest stand where they are put. */
export const CARRIED = ['crate'];

/** The objects that lead to another scene: a hole down to a ladder below, and the ladder back up. */
export const LINKING = ['ladder', 'hole'];

export interface PlacedItem {
  /** An object preset id, or `OWN` and an id of the scene's own. */
  item: string;
  /** Where it stands, in metres from the north corner of the map. */
  i: number;
  j: number;
  /** Quarter turns, 0 to 3. */
  turn?: number;
  /** What lies in it, for a chest: ids the game knows (see loot.ts). */
  loot?: string[];
  /** For a way to another scene (see `LINKING`): its name among the scene's links, which the other end names in `to`. */
  id?: string;
  /** Where it leads: a scene (its file name) and the `id` of the object there the player arrives at. */
  to?: { scene: string; id: string };
  /** How far open it is, for one that opens: 0 shut, up to `openFrames`. The game sets it; it is not saved with the scene. */
  open?: number;
}

/** Gives a way to another scene its name (ladder1, ladder2, ...) if it has none, one no other object of `items` has. */
export function nameLink(items: readonly PlacedItem[], it: PlacedItem): void {
  if (!LINKING.includes(it.item) || it.id) return;
  let n = 1;
  while (items.some((o) => o.id === `${it.item}${n}`)) n++;
  it.id = `${it.item}${n}`;
}

/** The prop an object is drawn from: a preset, or one of the scene's own. */
export const propOf = (id: string, props?: Record<string, Build>): Build | undefined =>
  id.startsWith(OWN) ? props?.[id] : objectPresetById(id)?.prop;
/** How many frames it takes to open, 0 for one that does not open. */
export const openFrames = (id: string) => OPENING[id]?.length ?? 0;

/** How close a walker may come to an object's footprint, in metres: its parts stand a little in from the tile edges. */
export const ITEM_ROOM = 0.2;
/** An object's footprint as half its width and depth, turned with it and the view (`rot`), less the room a walker keeps. */
export function itemHalf(it: PlacedItem, rot: number, props: Record<string, Build> | undefined): [number, number] {
  const prop = propOf(it.item, props);
  const [w, d] = prop ? [prop.w, prop.d] : [1, 1];
  const [a, b] = ((it.turn ?? 0) + rot) % 2 ? [d, w] : [w, d];
  return [a / 2 - ITEM_ROOM, b / 2 - ITEM_ROOM];
}
/** Whether a view point is inside an object's footprint, turned with it and the view (`rot`). */
export function itemCovers(it: PlacedItem & { vi: number; vj: number }, rot: number, props: Record<string, Build> | undefined, i: number, j: number): boolean {
  const [a, b] = itemHalf(it, rot, props);
  return Math.abs(i - it.vi) < a && Math.abs(j - it.vj) < b;
}

// shortcut: own objects are cached by id, so one changed in the object editor shows changed after a reload; key by content if that bothers.
/** An object's picture in a camera turn (quarter turns on the ground, eighths in a character's arms), `open` frames open. */
export function itemPicture(id: string, turn: number, props?: Record<string, Build>, open = 0): Pick<Thing, 'picture' | 'w' | 'h' | 'foot'> {
  const prop = (open > 0 && OPENING[id]?.[Math.min(open, OPENING[id].length) - 1]) || propOf(id, props);
  if (!prop) return { picture: { get: () => null }, w: 1, h: 1, foot: { x: 0, y: 0 } };
  const c = cached('item', `${id}|${turn}|${open}`, () => crop(drawObject(prop, ((turn % 4) + 4) % 4).sprite, OBJECT_W, OBJECT_H, OBJECT_ORIGIN));
  return { picture: c, w: c.w, h: c.h, foot: c.foot };
}
