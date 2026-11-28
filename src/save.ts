// The saved game: written when the survivor falls asleep, read back on load. Storage may hold
// anything, so everything read is checked and a bad save starts a new game.
import { readStore, writeStore } from '@pixel/shared/files.ts';
import { hashOf } from '@pixel/shared/random.ts';
import type { PlacedItem } from '@pixel/engine/world/props.ts';
import { CARRIED } from '@pixel/engine/world/props.ts';
import { DOOR_STATES, type DoorState } from '@pixel/engine/world/ways.ts';
import { cleanState, type State } from '@pixel/engine/character/character.ts';
import { BUILDS, BUILD_KINDS, HUT_AT, isBagItem, type BagItem, type Build } from './crafts.ts';
import { bundleOf, isStory } from './islands.ts';
import { KINDS, type Kind, type Progress } from './quests.ts';
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
  /** Which island's story the game is on (islands.ts): the quests `quest` counts in. */
  story: string;
  /** The weather, set when the quest started and the same every day until the next one begins (weather.ts). */
  weather: Kind;
  /** Chests opened, by where they stand (`i,j` in their scene): what is still in each, left when the bag was full. */
  chests: Record<string, BagItem[]>;
  /** Doors opened, unlocked or found, by scene and edge (`scene|H3,4`): the state each is in now. */
  doors: Record<string, DoorState>;
  /** The seed the game's chance came from (see `chance.ts`); older saves have none and get a new one. */
  seed?: number;
  /** Where each of its streams had got to when saved, so a game loaded from the save goes on the same way every time. */
  chance?: number[];
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

/**
 * Reads the saved game; fields older saves lack start empty. `island` is the fingerprint of the island played now
 * (`islandId`): a save of another island is no use on this one. Saves from before the fingerprint count as this island's.
 */
export function loadGame(size: number, palms: number, island: number): Game | null {
  const g = readStore<any>(KEY, null);
  if (!g || (g.island !== undefined && g.island !== island)) return null;
  if (![4, 5, VERSION].includes(g.v) || !num(g.day, 1, 1e6) || !num(g.hunger, 0, 1) || !num(g.energy, 0, 1) || !spot(g.at, size)) return null;
  if (!Array.isArray(g.bag) || !Array.isArray(g.items)) return null;
  const story = isStory(g.story) ? g.story : 'tutorial';
  const quests = bundleOf(story).quests;
  const q = g.quest;
  if (!q || !int(q.quest, 0, quests.length - 1) || !int(q.count, 0, 99) || typeof q.done !== 'boolean') return null;
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
    story,
    // Saves from before the weather lasted get the one their quest would have brought.
    weather: KINDS.includes(g.weather) ? g.weather : kindFor(quests, q.quest, g.day),
    chests: Object.fromEntries(Object.entries(g.chests && typeof g.chests === 'object' ? g.chests : {})
      .filter(([k, v]) => /^[\d.]+,[\d.]+$/.test(k) && Array.isArray(v))
      .map(([k, v]) => [k, (v as unknown[]).filter(isBagItem)])),
    doors: Object.fromEntries(Object.entries(g.doors && typeof g.doors === 'object' ? g.doors : {})
      .filter(([k, v]) => /^[\w-]{1,60}\|[HV]-?\d+,-?\d+$/.test(k) && (DOOR_STATES as readonly unknown[]).includes(v))) as Record<string, DoorState>,
    ...(int(g.seed, 0, 2 ** 32 - 1) ? { seed: g.seed } : {}),
    ...(Array.isArray(g.chance) && g.chance.length === 3 && g.chance.every((c: unknown) => int(c, 0, 2 ** 32 - 1)) ? { chance: [...g.chance] } : {}),
  };
}

/** Saves the game on island `island` (`islandId`). False when the browser refused it. */
export const saveGame = (g: Game, island: number): boolean => writeStore(KEY, { v: VERSION, island, ...g });

/** A fingerprint of an island: its ground and where its palms stand, which is what the save's places and palm numbers depend on. */
export const islandId = (levels: readonly number[], palms: readonly { plant: string; i: number; j: number }[]) =>
  hashOf(JSON.stringify([levels, palms.map((p) => [p.plant, p.i, p.j])]));
