// The chests and doors of the scenes, as the save keeps them: what is still in each chest once opened, and the state
// each door was left in (opened, unlocked with a key, found). Plain rules over the save, no page, so the tests can use
// them (places.test.ts). A door's save key is `scene|edge` (`doorKey`), checked when the save is read (save.ts).
import type { Game } from './save.ts';
import { isBagItem, type BagItem } from './crafts.ts';

type DoorState = Game['doors'][string];
type Spot = { i: number; j: number };

/** A chest by where it stands in its scene. */
export const chestKey = (at: Spot) => `${at.i},${at.j}`;
/** A door by its scene's name and its edge's key (building.ts `edgeKey`). */
export const doorKey = (scene: string, edge: string) => `${scene}|${edge}`;

/**
 * Opens a chest into the bag as far as `room` slots allow; the rest stays in it for later. The first time, its loot is
 * what is in it. Says whether this was the first time, and what was taken.
 */
export function takeFromChest(g: Pick<Game, 'bag' | 'chests'>, key: string, loot: readonly string[] | undefined, room: number): { first: boolean; took: BagItem[] } {
  const first = !(key in g.chests);
  const inside = first ? (loot ?? []).filter(isBagItem) : g.chests[key];
  const took = inside.slice(0, Math.max(0, room - g.bag.length));
  g.bag.push(...took);
  g.chests[key] = inside.slice(took.length);
  return { first, took };
}

/** A door's state now: as the game left it, else as its scene made it. */
export const doorState = (g: Pick<Game, 'doors'>, key: string, asMade: DoorState): DoorState => g.doors[key] ?? asMade;

/** Whether a walk is planned through a door: a closed one opens on the way, a locked one only with a key in the bag. */
export const passable = (state: DoorState, bag: readonly BagItem[]) => state === 'closed' || (state === 'locked' && bag.includes('key'));

/**
 * The survivor at a door: a closed one swings open, a locked one opens with a key from the bag (which stays in the
 * lock). The new state is kept in the save. Says what happened: `unlocked` when a key was used.
 */
export function openDoor(g: Pick<Game, 'bag' | 'doors'>, key: string, state: DoorState): { state: DoorState; unlocked: boolean } {
  let unlocked = false;
  if (state === 'locked' && g.bag.includes('key')) {
    g.bag.splice(g.bag.indexOf('key'), 1);
    unlocked = true;
  }
  if (state === 'closed' || unlocked) {
    state = 'open';
    g.doors[key] = state;
  }
  return { state, unlocked };
}
