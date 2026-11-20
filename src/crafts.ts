// What the survivor makes from what is in the bag: tools tied together, and the hut and raft built
// in stages. Plain data and rules, no pictures (those are in things.ts), so the tests can use it.

export const BAG_ITEMS = ['coconut', 'wood', 'fire', 'stone', 'spear', 'fish', 'wrasse', 'snapper', 'crab', 'leaf', 'vine', 'axe', 'rope', 'cloth', 'log', 'hammer', 'crate', 'drift', 'lantern'] as const;
export type BagItem = (typeof BAG_ITEMS)[number];
/** Bag items that can also lie on the ground to be picked up (wash-ups, driftwood, what the crate held, logs). */
export const LOOSE = ['vine', 'rope', 'cloth', 'log', 'hammer', 'drift'] as const;
export type Loose = (typeof LOOSE)[number];

/** A thing tied from what is in the bag: one dragged onto another, the rest anywhere in the bag. */
export interface Recipe { needs: BagItem[]; makes: BagItem; thought: string }
export const RECIPES: Recipe[] = [
  { needs: ['wood', 'stone'], makes: 'spear', thought: 'think.spear' },
  { needs: ['wood', 'stone', 'vine'], makes: 'axe', thought: 'think.axe' },
];

const has = (bag: readonly BagItem[], needs: readonly BagItem[]) => {
  const left = [...bag];
  return needs.every((n) => {
    const k = left.indexOf(n);
    return k >= 0 && left.splice(k, 1);
  });
};
/** Takes the needed items out of the bag, in place. */
export function takeFrom(bag: BagItem[], needs: readonly BagItem[]): void {
  for (const n of needs) bag.splice(bag.indexOf(n), 1);
}

/** What `hand` (the thing dragged) and `tapped` (the one it is dropped on) tie into, given the whole bag (both are in it); the smallest recipe that fits. */
export function recipeFor(hand: BagItem | null, tapped: BagItem, bag: readonly BagItem[]): Recipe | null {
  if (!hand || hand === tapped) return null;
  return RECIPES.filter((r) => r.needs.includes(hand) && r.needs.includes(tapped) && has(bag, r.needs)).sort((a, b) => a.needs.length - b.needs.length)[0] ?? null;
}

/** A structure built in stages, each taking what it needs from the bag. */
export const BUILDS = {
  /**
   * A 2×2 hut of driftwood (not sticks) round the blanket, one side at a time (HUT_PLAN), roofed with palm leaves,
   * one leaf over each of its cells: sleeping in it is dry. Nailed together: the hammer must be in the bag, and stays there.
   */
  hut: { stages: [['drift'], ['drift'], ['drift'], ['drift'], ['leaf'], ['leaf'], ['leaf'], ['leaf']], on: 'land', tools: ['hammer'] },
  /** Logs lashed with rope, a stick for a mast and the cloth for a sail: on the beach, to sail away. */
  raft: { stages: [['log', 'log'], ['log', 'log', 'rope'], ['wood', 'cloth']], on: 'beach' },
} as const satisfies Record<string, { stages: readonly (readonly BagItem[])[]; on: 'land' | 'beach'; tools?: readonly BagItem[] }>;
export type BuildKind = keyof typeof BUILDS;
export const BUILD_KINDS = Object.keys(BUILDS) as BuildKind[];

export interface Build { kind: BuildKind; i: number; j: number; /** Stages done. */ stage: number }
export const finished = (b: Build | undefined) => !!b && b.stage >= BUILDS[b.kind].stages.length;

/** What the bag still lacks for a build's next stage, empty when it can be built: what the stage uses up, then the tools it needs. */
export function lacking(kind: BuildKind, stage: number, bag: readonly BagItem[]): BagItem[] {
  const left = [...bag];
  const used = (BUILDS[kind].stages[stage] ?? []).filter((n) => {
    const k = left.indexOf(n);
    if (k < 0) return true;
    left.splice(k, 1);
    return false;
  });
  const tools = (BUILDS[kind] as { tools?: readonly BagItem[] }).tools ?? [];
  return [...used, ...tools.filter((n) => !bag.includes(n))];
}

/** The middle of the hut's 2×2 cells, where the blanket lies, so the hut is built round it. */
// shortcut: one fixed place on the first island's hilltop (the island sits four tiles in from the map's edge,
// see island.ts); let the player choose once there are more islands.
export const HUT_AT = { i: 10, j: 11 };
/** A wall on a cell edge, relative to the hut's first cell (see engine/world/building). */
export interface HutWall { axis: 'H' | 'V'; i: number; j: number }
/** A leaf of the roof over one of the hut's cells, relative to its first cell. */
export interface HutLeaf { roof: { i: number; j: number } }
/** What each of the hut's stages lays: the back, the two sides, the front with its doorway on the left, then a leaf over each cell, back ones first. */
export const HUT_PLAN: (HutWall[] | HutLeaf)[] = [
  [{ axis: 'H', i: 0, j: 0 }, { axis: 'H', i: 1, j: 0 }],
  [{ axis: 'V', i: 0, j: 0 }, { axis: 'V', i: 0, j: 1 }],
  [{ axis: 'V', i: 2, j: 0 }, { axis: 'V', i: 2, j: 1 }],
  [{ axis: 'H', i: 1, j: 2 }],
  { roof: { i: 0, j: 0 } },
  { roof: { i: 1, j: 0 } },
  { roof: { i: 0, j: 1 } },
  { roof: { i: 1, j: 1 } },
];
