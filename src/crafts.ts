// What the survivor makes from what is in the bag: tools tied together, and the hut and raft built
// in stages. The bag's things (content/items.json) and what they tie into (content/recipes.json) are data; the rules
// are plain, with no pictures (those are in things.ts), so the tests can use them.

import data from './content/items.json' with { type: 'json' };
import recipes from './content/recipes.json' with { type: 'json' };

/** Every thing that can be in the bag, by id: the keys of content/items.json. Its picture is in pictures.ts, its name a text. */
export type BagItem = keyof typeof data;
export const BAG_ITEMS = Object.keys(data) as BagItem[];

/** What is eaten from the bag: how much it fills, what its slot says and the thought on eating it (text ids). */
export interface Food { fills: number; label: string; yum: string }
/** One item in content/items.json. */
export interface ItemDef {
  /** It washes up, and lies on the ground as a small thing to pick up (wash-ups, driftwood, what the crate held, logs). */
  loose?: boolean;
  /** A kind it belongs to (the fish that can be caught are the `fish` group, in the order fish.ts `kind` counts them). */
  group?: string;
  food?: Food;
}
const DEFS = data as Record<BagItem, ItemDef>;
export const isBagItem = (x: unknown): x is BagItem => BAG_ITEMS.includes(x as BagItem);

/** Bag items that can also lie on the ground to be picked up. */
export const LOOSE = BAG_ITEMS.filter((k) => DEFS[k].loose);
export type Loose = BagItem;
/** The fish that can be caught, by the kind of fish swimming (engine fish.ts `kind`). */
export const FISH_ITEMS = BAG_ITEMS.filter((k) => DEFS[k].group === 'fish');
export type Fish = BagItem;

/** The groups items belong to. */
export const GROUPS = [...new Set(BAG_ITEMS.flatMap((k) => (DEFS[k].group ? [DEFS[k].group] : [])))] as string[];
/** Whether `name`, an item or a group, names `item`: "fish" is the fish and every kind of fish. */
export const isA = (item: BagItem, name: string): boolean => item === name || DEFS[item].group === name;
/** Whether `name` is an item or a group. */
export const isThing = (name: unknown): name is string => typeof name === 'string' && (isBagItem(name) || GROUPS.includes(name));
/** Whether the bag holds a thing called `name` (an item or a group). */
export const holds = (bag: readonly BagItem[], name: string): boolean => bag.some((item) => isA(item, name));
/** Takes the first thing called `name` (an item or a group) out of the bag, in place; says which, or null if there is none. */
export function takeOne(bag: BagItem[], name: string): BagItem | null {
  const k = bag.findIndex((item) => isA(item, name));
  return k < 0 ? null : bag.splice(k, 1)[0];
}

export const FOOD: Partial<Record<BagItem, Food>> = Object.fromEntries(BAG_ITEMS.flatMap((k) => (DEFS[k].food ? [[k, DEFS[k].food]] : [])));
/** What a bag slot says (a text id): how to eat it if it is food, else the thing's name. */
export const bagWords = (item: BagItem): string => FOOD[item]?.label ?? item;

export const isLoose = (x: unknown): x is Loose => LOOSE.includes(x as Loose);

/** What is wrong with the items, as lines; empty when they are fine. `loca` is the table of texts. */
export function checkItems(items: unknown, loca: object): string[] {
  if (!items || typeof items !== 'object' || Array.isArray(items)) return ['items: not an object'];
  const out: string[] = [];
  for (const [id, d] of Object.entries(items as Record<string, any>)) {
    const w = `item "${id}"`;
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(id)) out.push(`${w}: bad id`);
    if (!d || typeof d !== 'object' || Array.isArray(d)) { out.push(`${w}: not an object`); continue; }
    for (const key of Object.keys(d)) if (!['loose', 'group', 'food'].includes(key)) out.push(`${w}: unknown field "${key}"`);
    if (d.loose !== undefined && typeof d.loose !== 'boolean') out.push(`${w}: loose is true or false`);
    if (d.group !== undefined && typeof d.group !== 'string') out.push(`${w}: group is a name`);
    if (d.loose === true && !(`think.${id}` in loca)) out.push(`${w}: is loose, so needs the pickup thought "think.${id}"`);
    const f = d.food;
    if (f !== undefined) {
      if (!f || typeof f.fills !== 'number' || !(f.fills > 0 && f.fills <= 1)) out.push(`${w}: food fills 0 to 1`);
      if (!f || !(f.label in loca)) out.push(`${w}: unknown text "${f?.label}"`);
      if (!f || !(f.yum in loca)) out.push(`${w}: unknown text "${f?.yum}"`);
    } else if (!(id in loca)) out.push(`${w}: has no name, no text "${id}"`);
  }
  return out;
}

/** A thing tied from what is in the bag: one dragged onto another, the rest anywhere in the bag. */
export interface Recipe { needs: BagItem[]; makes: BagItem; thought: string }
export const RECIPES = recipes as Recipe[];

/** What is wrong with the recipes, as lines; empty when they are fine. */
export function checkRecipes(list: unknown, loca: object): string[] {
  if (!Array.isArray(list)) return ['recipes: not a list'];
  const out: string[] = [];
  list.forEach((r: any, n: number) => {
    const w = `recipe ${n + 1}`;
    if (!r || typeof r !== 'object') return void out.push(`${w}: not an object`);
    if (!Array.isArray(r.needs) || r.needs.length < 2 || r.needs.some((i: unknown) => !isBagItem(i))) out.push(`${w}: needs two or more known items`);
    if (!isBagItem(r.makes)) out.push(`${w}: unknown item "${r.makes}"`);
    else if (Array.isArray(r.needs) && r.needs.includes(r.makes)) out.push(`${w}: makes what it needs`);
    if (typeof r.thought !== 'string' || !(r.thought in loca)) out.push(`${w}: unknown text "${r.thought}"`);
  });
  return out;
}

/** `from` without one of each of `remove`, in order. */
export function without<T>(from: readonly T[], remove: readonly T[]): T[] {
  const out = [...from];
  for (const r of remove) {
    const k = out.indexOf(r);
    if (k >= 0) out.splice(k, 1);
  }
  return out;
}
const has = (bag: readonly BagItem[], needs: readonly BagItem[]) => !without(needs, bag).length;
/** Takes the needed items out of the bag, in place. */
export function takeFrom(bag: BagItem[], needs: readonly BagItem[]): void {
  for (const n of needs) bag.splice(bag.indexOf(n), 1);
}

/** What `hand` (the thing dragged) and `tapped` (the one it is dropped on) tie into, given the whole bag (both are in it); the smallest recipe that fits. */
export function recipeFor(hand: BagItem | null, tapped: BagItem, bag: readonly BagItem[]): Recipe | null {
  if (!hand || hand === tapped) return null;
  return RECIPES.filter((r) => r.needs.includes(hand) && r.needs.includes(tapped) && has(bag, r.needs)).sort((a, b) => a.needs.length - b.needs.length)[0] ?? null;
}

/** What dragging bag slot `n` onto slot `m` ties into, if anything. */
export const recipeOnto = (bag: readonly (BagItem | undefined)[], n: number, m: number) =>
  m < 0 || m === n || !bag[m] ? null : recipeFor(bag[n] ?? null, bag[m]!, bag as readonly BagItem[]);
/** The other slots tying slot `n` onto `over` would use, besides those two: the first of each further thing the recipe needs. */
export function partsOf(bag: readonly BagItem[], n: number, over: number): Set<number> {
  const parts = new Set<number>();
  const recipe = recipeOnto(bag, n, over);
  if (!recipe) return parts;
  const left = bag.map((it, k) => (k === n || k === over ? null : it));
  for (const need of without(recipe.needs, [bag[n], bag[over]])) {
    const k = left.indexOf(need);
    if (k >= 0) { parts.add(k); left[k] = null; }
  }
  return parts;
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
  const used = without(BUILDS[kind].stages[stage] ?? [], bag);
  const tools = (BUILDS[kind] as { tools?: readonly BagItem[] }).tools ?? [];
  return [...used, ...tools.filter((n) => !bag.includes(n))];
}

/**
 * The middle of the hut's 2×2 cells, where the blanket lies, so the hut is built round it. It is set from the island
 * scene's `hut` marker (`placeHut`) before anything reads it; {10, 11} on an island without one.
 */
export const HUT_AT = { i: 10, j: 11 };
/**
 * Puts the hut at a `hut` marker: the marker's cell is its first, and it takes the cells beside it toward +i and +j, so
 * the blanket lies at the corner of the marker's cell they share. Set in place: the camp rules hold on to `HUT_AT`.
 */
export function placeHut(marker: { i: number; j: number }): void {
  HUT_AT.i = Math.floor(marker.i) + 1;
  HUT_AT.j = Math.floor(marker.j) + 1;
}
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
