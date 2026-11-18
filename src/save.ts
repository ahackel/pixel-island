// The saved game: written when the survivor falls asleep, read back on load. Storage may hold
// anything, so everything read is checked and a bad save starts a new game.
import { readStore, writeStore } from '@pixel/shared/files.ts';
import type { PlacedItem } from '@pixel/engine/world/props.ts';
import { itemById } from '@pixel/engine/world/props.ts';
import { BAG_ITEMS, BUILDS, BUILD_KINDS, LOOSE, type BagItem, type Build, type Loose } from './crafts.ts';

export const BAG_SLOTS = 6;
export { BAG_ITEMS, type BagItem };

export interface Game {
  day: number;
  hunger: number;
  energy: number;
  bag: BagItem[];
  /** Coconuts lying on the ground, in scene metres. */
  coconuts: { i: number; j: number }[];
  /** Dry driftwood lying on the beach. */
  wood: { i: number; j: number }[];
  /** Stones lying about, for a spear's point. */
  stones: { i: number; j: number }[];
  /** Washed-up things, crates for now. */
  items: PlacedItem[];
  /** The palm (index in the scene's plants) lightning burnt down to a stump, or null before the first storm. */
  struck: number | null;
  /** Campfires burning, in scene metres. */
  fires: { i: number; j: number }[];
  /** Bag items lying on the ground: wash-ups, what the crate held, logs. */
  lying: { item: Loose; i: number; j: number }[];
  /** Palms cut down (indices in the scene's plants). */
  felled: number[];
  /** The hut and raft, as far as they are built. */
  builds: Build[];
  at: { i: number; j: number };
}

const KEY = 'pixel-island-save';

const num = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const spot = (v: any, size: number) => v && num(v.i, 0, size) && num(v.j, 0, size);
const spots = (v: unknown, size: number) => (Array.isArray(v) ? v.filter((c) => spot(c, size)).map((c) => ({ i: c.i, j: c.j })) : []);

/** Reads the saved game; fields older saves lack start empty. */
export function loadGame(size: number, palms: number): Game | null {
  const g = readStore<any>(KEY, null);
  if (!g || g.v !== 1 || !num(g.day, 1, 1e6) || !num(g.hunger, 0, 1) || !num(g.energy, 0, 1) || !spot(g.at, size)) return null;
  if (!Array.isArray(g.bag) || !Array.isArray(g.coconuts) || !Array.isArray(g.items)) return null;
  return {
    day: Math.floor(g.day),
    hunger: g.hunger,
    energy: g.energy,
    bag: g.bag.filter((b: unknown) => BAG_ITEMS.includes(b as BagItem)).slice(0, BAG_SLOTS),
    coconuts: spots(g.coconuts, size),
    wood: spots(g.wood, size),
    stones: spots(g.stones, size),
    struck: Number.isInteger(g.struck) && num(g.struck, 0, palms - 1) ? g.struck : null,
    fires: spots(g.fires, size),
    lying: Array.isArray(g.lying) ? g.lying.filter((it: any) => spot(it, size) && LOOSE.includes(it.item)).map((it: any) => ({ item: it.item, i: it.i, j: it.j })) : [],
    felled: Array.isArray(g.felled) ? [...new Set<number>(g.felled.filter((k: unknown) => Number.isInteger(k) && num(k, 0, palms - 1)))] : [],
    builds: Array.isArray(g.builds)
      ? g.builds.filter((b: any) => spot(b, size) && BUILD_KINDS.includes(b.kind) && Number.isInteger(b.stage) && num(b.stage, 1, BUILDS[b.kind as Build['kind']].stages.length))
        .map((b: any) => ({ kind: b.kind, i: b.i, j: b.j, stage: b.stage }))
      : [],
    items: g.items.filter((it: any) => spot(it, size) && itemById(it?.item)).map((it: any) => ({ item: it.item, i: it.i, j: it.j })),
    at: { i: g.at.i, j: g.at.j },
  };
}

export const saveGame = (g: Game): boolean => writeStore(KEY, { v: 1, ...g });

export const clearGame = () => writeStore(KEY, null);
