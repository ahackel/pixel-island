// What the survivor makes from what is in the bag: tools tied together, and the hut and raft built
// in stages. Plain data and rules, no pictures (those are in things.ts), so the tests can use it.

export const BAG_ITEMS = ['coconut', 'wood', 'fire', 'stone', 'spear', 'fish', 'crab', 'leaf', 'vine', 'axe', 'rope', 'cloth', 'log'] as const;
export type BagItem = (typeof BAG_ITEMS)[number];
/** Bag items that can also lie on the ground to be picked up (wash-ups, what the crate held, logs). */
export const LOOSE = ['vine', 'rope', 'cloth', 'log'] as const;
export type Loose = (typeof LOOSE)[number];

/** A thing tied from what is in the bag: one in hand, one tapped, the rest anywhere in the bag. */
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

/** What `hand` and `tapped` tie into, given the whole bag (both are in it); the smallest recipe that fits. */
export function recipeFor(hand: BagItem | null, tapped: BagItem, bag: readonly BagItem[]): Recipe | null {
  if (!hand || hand === tapped) return null;
  return RECIPES.filter((r) => r.needs.includes(hand) && r.needs.includes(tapped) && has(bag, r.needs)).sort((a, b) => a.needs.length - b.needs.length)[0] ?? null;
}

/** A structure built in stages, each taking what it needs from the bag. */
export const BUILDS = {
  /** A lean-to of driftwood, roofed with palm leaves: sleeping in it is dry. */
  hut: { stages: [['wood', 'wood', 'wood'], ['leaf', 'leaf', 'leaf']], on: 'land' },
  /** Logs lashed with rope, a stick for a mast and the cloth for a sail: on the beach, to sail away. */
  raft: { stages: [['log', 'log'], ['log', 'log', 'rope'], ['wood', 'cloth']], on: 'beach' },
} as const satisfies Record<string, { stages: readonly (readonly BagItem[])[]; on: 'land' | 'beach' }>;
export type BuildKind = keyof typeof BUILDS;
export const BUILD_KINDS = Object.keys(BUILDS) as BuildKind[];

export interface Build { kind: BuildKind; i: number; j: number; /** Stages done. */ stage: number }
export const finished = (b: Build | undefined) => !!b && b.stage >= BUILDS[b.kind].stages.length;

/** What the bag still lacks for a build's next stage, empty when it can be built. */
export function lacking(kind: BuildKind, stage: number, bag: readonly BagItem[]): BagItem[] {
  const left = [...bag];
  return (BUILDS[kind].stages[stage] ?? []).filter((n) => {
    const k = left.indexOf(n);
    if (k < 0) return true;
    left.splice(k, 1);
    return false;
  });
}
