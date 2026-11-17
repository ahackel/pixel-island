// The saved game: written when the survivor falls asleep, read back on load. Storage may hold
// anything, so everything read is checked and a bad save starts a new game.
import { readStore, writeStore } from '@pixel/shared/files.ts';
import type { PlacedItem } from '@pixel/engine/world/props.ts';
import { itemById } from '@pixel/engine/world/props.ts';

export const BAG_SLOTS = 6;
export type BagItem = 'coconut';

export interface Game {
  day: number;
  hunger: number;
  energy: number;
  bag: BagItem[];
  /** Coconuts lying on the ground, in scene metres. */
  coconuts: { i: number; j: number }[];
  /** Washed-up things, crates for now. */
  items: PlacedItem[];
  at: { i: number; j: number };
}

const KEY = 'pixel-island-save';

const num = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const spot = (v: any, size: number) => v && num(v.i, 0, size) && num(v.j, 0, size);

export function loadGame(size: number): Game | null {
  const g = readStore<any>(KEY, null);
  if (!g || g.v !== 1 || !num(g.day, 1, 1e6) || !num(g.hunger, 0, 1) || !num(g.energy, 0, 1) || !spot(g.at, size)) return null;
  if (!Array.isArray(g.bag) || !Array.isArray(g.coconuts) || !Array.isArray(g.items)) return null;
  return {
    day: Math.floor(g.day),
    hunger: g.hunger,
    energy: g.energy,
    bag: g.bag.filter((b: unknown) => b === 'coconut').slice(0, BAG_SLOTS),
    coconuts: g.coconuts.filter((c: unknown) => spot(c, size)).map((c: any) => ({ i: c.i, j: c.j })),
    items: g.items.filter((it: any) => spot(it, size) && itemById(it?.item)).map((it: any) => ({ item: it.item, i: it.i, j: it.j })),
    at: { i: g.at.i, j: g.at.j },
  };
}

export const saveGame = (g: Game): boolean => writeStore(KEY, { v: 1, ...g });

export const clearGame = () => writeStore(KEY, null);
