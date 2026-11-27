// The pictures of the bag's things: in the bag's slots, lying on the ground, and the quests' pictures in the corner;
// and how near a tap must come to a thing on the ground to pick it.
import type { Thing } from '@pixel/engine/world/world.ts';
import { ICONS, PAINT } from '@pixel/shared/game-ui.ts';
import { BAG_ITEMS, FISH_ITEMS, type BagItem, type Fish } from './crafts.ts';
import { CRAB_IN_BAG, FISH_IN_BAG, SPEAR_IN_BAG, STONE } from './fishing.ts';
import { TORCH_IN_BAG, WOOD_COLORS, WOOD_ROWS, woodThing } from './fire.ts';
import type { QuestIcon } from './quests.ts';
import { picture, type Rows } from './rows.ts';
import { AXE_IN_BAG, CLOTH, CRATE_IN_BAG, DRIFT, driftThing, HAMMER, KEY, LANTERN, LEAF, LOG, RAFT_ICON, ROPE, thing, VINE } from './things.ts';

// A husked coconut: egg-shaped, a little lumpy, its point up to the right, a fibre streak along it.
const COCO_ROWS = ['..bbbb..', '.bBBbbbb', 'bBBbfbbd', 'bbbbbbdd', '.dbbbdd.', '..ddd...'];
const COCO_COLORS: Record<string, string> = { b: '#7a4a24', B: '#b07a44', f: '#93603a', d: '#4e2e16' };
const COCO = picture(COCO_ROWS, COCO_COLORS);
const coconutThing = (spot: Thing['spot']): Thing => ({ spot, picture: COCO, w: 8, h: 6, foot: { x: 3, y: 5 } });

/** Each bag thing's picture in its slot (and hanging from the hand). */
export const BAG_PICTURES: Record<BagItem, Rows> = {
  coconut: { rows: COCO_ROWS, colors: COCO_COLORS }, wood: { rows: WOOD_ROWS, colors: WOOD_COLORS }, fire: TORCH_IN_BAG,
  stone: STONE, spear: SPEAR_IN_BAG, ...(Object.fromEntries(FISH_ITEMS.map((f, k) => [f, FISH_IN_BAG[k]])) as Record<Fish, Rows>), crab: CRAB_IN_BAG,
  leaf: LEAF, vine: VINE, axe: AXE_IN_BAG, rope: ROPE, cloth: CLOTH, log: LOG, hammer: HAMMER, crate: CRATE_IN_BAG, drift: DRIFT, lantern: LANTERN, key: KEY,
};
/** The quests' pictures in the corner. */
export const QUEST_PICTURES: Record<QuestIcon, Rows> = {
  coconut: BAG_PICTURES.coconut, moon: { rows: ICONS.moon, colors: PAINT }, fish: FISH_IN_BAG[0], crab: CRAB_IN_BAG, crate: CRATE_IN_BAG, hammer: HAMMER,
  storm: { rows: ICONS.storm, colors: PAINT }, fire: BAG_PICTURES.fire, axe: AXE_IN_BAG, raft: RAFT_ICON,
};
/** Bag things on the ground: in the bag's pictures, but for the coconut, the stick and driftwood, which have their own. */
export const LYING = {
  ...Object.fromEntries(BAG_ITEMS.map((k) => [k, thing(BAG_PICTURES[k])])), coconut: coconutThing, wood: woodThing, drift: driftThing,
} as Record<BagItem, ReturnType<typeof thing>>;
/** How near a tap must be to a thing on the ground to pick it, in pixels, round a point `up` pixels over its foot: driftwood is a big piece. */
export const PICK_NEAR: Partial<Record<BagItem, [r: number, up: number]>> = { coconut: [5, 2], wood: [5, 1], stone: [5, 1], drift: [12, 3] };
