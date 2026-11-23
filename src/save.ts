// The saved game: written when the survivor falls asleep, read back on load. Storage may hold
// anything, so everything read is checked and a bad save starts a new game.
import { readStore, writeStore } from '@pixel/shared/files.ts';
import type { PlacedItem } from '@pixel/engine/world/props.ts';
import { CARRIED } from '@pixel/engine/world/props.ts';
import { cleanState, type State } from '@pixel/engine/character/character.ts';
import { BUILDS, BUILD_KINDS, HUT_AT, isBagItem, type BagItem, type Build } from './crafts.ts';
import { KINDS, QUESTS, type Kind, type Progress } from './quests.ts';
import { kindFor } from './weather.ts';

export const BAG_SLOTS = 6;

export interface Game {
  day: number;
  hunger: number;
  energy: number;
  bag: BagItem[];
  /** Washed-up things, crates for now. */
  items: PlacedItem[];
  /** The palm (index in the scene's plants) lightning burnt down to a stump, or null before the first storm. */
  struck: number | null;
  /** Campfires burning, in scene metres. */
  fires: { i: number; j: number }[];
  /** Bag items lying on the ground, in scene metres: coconuts, sticks, stones, wash-ups, what the crate held, logs, and whatever was put down. */
  lying: Lying[];
  /** Palms cut down (indices in the scene's plants). */
  felled: number[];
  /** The hut and raft, as far as they are built. */
  builds: Build[];
  at: { i: number; j: number };
  /** Where the survivor's hat lies, washed off with them, until they pick it up; null once worn (or with no hat). */
  hat: { i: number; j: number } | null;
  /** The survivor as made in the character editor. */
  who: State;
  /** Where the story stands (quests.ts). */
  quest: Progress;
  /** The weather, set when the quest started and the same every day until the next one begins (weather.ts). */
  weather: Kind;
  /** Chests opened, by where they stand (`i,j` in their scene): what is still in each, left when the bag was full. */
  chests: Record<string, BagItem[]>;
}

export interface Lying { item: BagItem; i: number; j: number }

const KEY = 'pixel-island-save';
/**
 * 4: more sea round the island, so every place on it has moved; older saves start a new game. 5: the roof is laid a
 * leaf at a time. 6: coconuts, sticks and stones lie with everything else in `lying`.
 */
const VERSION = 6;
/** In a version 4 save the hut's roof was one stage, its fifth: done then means done now. */
const hutStageFrom4 = (stage: number) => (stage >= 5 ? BUILDS.hut.stages.length : stage);

const num = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && num(v, lo, hi);
const spot = (v: any, size: number) => v && num(v.i, 0, size) && num(v.j, 0, size);
const spots = (v: unknown, size: number) => (Array.isArray(v) ? v.filter((c) => spot(c, size)).map((c) => ({ i: c.i, j: c.j })) : []);

/** Reads the saved game; fields older saves lack start empty. */
export function loadGame(size: number, palms: number): Game | null {
  const g = readStore<any>(KEY, null);
  if (!g || ![4, 5, VERSION].includes(g.v) || !num(g.day, 1, 1e6) || !num(g.hunger, 0, 1) || !num(g.energy, 0, 1) || !spot(g.at, size)) return null;
  if (!Array.isArray(g.bag) || !Array.isArray(g.items)) return null;
  const q = g.quest;
  if (!q || !int(q.quest, 0, QUESTS.length - 1) || !int(q.count, 0, 99) || typeof q.done !== 'boolean') return null;
  return {
    day: Math.floor(g.day),
    hunger: g.hunger,
    energy: g.energy,
    bag: g.bag.filter(isBagItem).slice(0, BAG_SLOTS),
    struck: int(g.struck, 0, palms - 1) ? g.struck : null,
    fires: spots(g.fires, size),
    lying: [
      ...(Array.isArray(g.lying) ? g.lying.filter((it: any) => spot(it, size) && isBagItem(it.item) && it.item !== 'fire').map((it: any) => ({ item: it.item, i: it.i, j: it.j })) : []),
      // Before version 6 these lay apart.
      ...([['coconut', 'coconuts'], ['wood', 'wood'], ['stone', 'stones']] as const).flatMap(([item, key]) => spots(g[key], size).map((s) => ({ item, ...s }))),
    ],
    felled: Array.isArray(g.felled) ? [...new Set<number>(g.felled.filter((k: unknown) => int(k, 0, palms - 1)))] : [],
    builds: Array.isArray(g.builds)
      ? g.builds
        .map((b: any) => (g.v === 4 && b?.kind === 'hut' && Number.isInteger(b.stage) ? { ...b, stage: hutStageFrom4(b.stage) } : b))
        .filter((b: any) => spot(b, size) && BUILD_KINDS.includes(b.kind) && int(b.stage, 1, BUILDS[b.kind as Build['kind']].stages.length))
        .map((b: any) => (b.kind === 'hut' ? { kind: b.kind, ...HUT_AT, stage: b.stage } : { kind: b.kind, i: b.i, j: b.j, stage: b.stage }))
      : [],
    items: g.items.filter((it: any) => spot(it, size) && CARRIED.includes(it?.item)).map((it: any) => ({ item: it.item, i: it.i, j: it.j })),
    at: { i: g.at.i, j: g.at.j },
    hat: spot(g.hat, size) ? { i: g.hat.i, j: g.hat.j } : null,
    who: cleanState(g.who),
    quest: { quest: q.quest, count: q.count, done: q.done },
    // Saves from before the weather lasted get the one their quest would have brought.
    weather: KINDS.includes(g.weather) ? g.weather : kindFor(q.quest, g.day),
    chests: Object.fromEntries(Object.entries(g.chests && typeof g.chests === 'object' ? g.chests : {})
      .filter(([k, v]) => /^[\d.]+,[\d.]+$/.test(k) && Array.isArray(v))
      .map(([k, v]) => [k, (v as unknown[]).filter(isBagItem)])),
  };
}

export const saveGame = (g: Game): boolean => writeStore(KEY, { v: VERSION, ...g });

export const clearGame = () => writeStore(KEY, null);
