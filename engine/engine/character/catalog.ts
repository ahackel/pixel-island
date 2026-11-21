import { BEARD_STYLES, beardFromBehind, catalogHairViews, stubbled, tidyBeard } from './base.ts';
import { compile } from './items.ts';
import shellFile from './data/shell-hair.json' with { type: 'json' };
import { JOB_ITEMS } from './jobs.ts';
import { editedItem } from './parts.ts';
import { ANIMAL_KEYS, FIRE_KEYS, FIXED_KEYS, PALETTE, PLANT_KEYS, SKIN_KEYS, type Cell, type PaletteKey } from '../core/palette.ts';
import type { Item, Slot, Stamp, StampPair } from '../core/puppet.ts';

/** One wearable in the wardrobe, compiled from what the model returned. */
export interface Entry {
  id: string;
  label: string;
  slot: Slot;
  /** Which format the model wrote it in. 'shell' is a hairstyle given as one shape round the head. */
  format: 'paint' | 'recipe' | 'shell';
  /** Made or found on the island, so nobody had it before the wreck. */
  island: boolean;
  item: Item;
  /** The item's own colours, most used first. These are the ones a player may swap. */
  colors: PaletteKey[];
  /** The item as the rules made it, when it was polished by hand in the parts editor. */
  original?: Item;
}

const files = import.meta.glob<unknown[]>('./data/{sprite,recipe}-*.json', { eager: true, import: 'default' });

// Sets left out of the wardrobe, with the reason. Everything else is included as returned.
const EXCLUDED: Record<string, string> = {
  'recipe-spear': 'the small-stamp spears lean and break into jagged lines',
  'recipe-shorts': 'came out as briefs because of the length scale in the first format description',
};

// Items left out one by one. Wear is now a value of the character and is applied to any item
// by rule (engine/character/wear.ts), so the candidates that were drawn ragged are no longer needed.
const WORN = 'drawn ragged; the wear level now does this to any item';
const SAME = 'the same garment as another item';
const SUPERSEDED: Record<string, string> = {
  'sprite-shirt-0': WORN, 'sprite-shirt-1': WORN, 'sprite-shirt-2': WORN,
  'recipe-shirt-0': WORN, 'recipe-shirt-1': WORN, 'recipe-shirt-2': WORN,
  'sprite-shorts-0': WORN, 'sprite-shorts-1': WORN, 'sprite-shorts-2': WORN,
  'recipe-bottoms-2': WORN, 'recipe-bottoms-4': WORN, 'recipe-tops-5': WORN, 'sprite-vest-2': WORN,
  'recipe-everyday-3': SAME, 'recipe-everyday-2': SAME,
  'recipe-shoes-0': 'colour only; replaced by the sandals of the footwear set',
  'recipe-shoes-1': 'colour only; replaced by the boots of the footwear set',
};

// Things made or found on the island. Everything else could have been in a passenger's luggage.
const ISLAND_SETS = ['leafskirt', 'vest', 'spear', 'axe', 'rod', 'bandana'];
const ISLAND_IDS = ['recipe-shoes-2', 'sprite-hat-1'];

/** Sentence case, so names from different model calls read alike. Words such as "T-shirt" keep their capital. */
const sentence = (text: string) =>
  text
    .split(' ')
    .map((word, i) => (i > 0 && /^[A-Z][a-z]+$/.test(word) ? word.toLowerCase() : word))
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());

/**
 * A copy of an item with every cell of its paint passed through `cell`: the stamps for the head,
 * its own front, back and side views, the torso and a held tool, the limb strips and the foot.
 * The one place that lists them.
 */
function mapCells(item: Item, cell: (c: Cell | null) => Cell | null): Item {
  const stamp = (s: Stamp): Stamp => s.map((row) => row.map(cell));
  const pair = (p?: StampPair): StampPair | undefined => p && { front: stamp(p.front), back: stamp(p.back) };
  const views = (v: Item['views']): Item['views'] =>
    v && Object.fromEntries(Object.entries(v).map(([view, own]) => [view, { head: stamp(own.head), ...(own.behind ? { behind: stamp(own.behind) } : {}) }]));
  return {
    ...item,
    head: pair(item.head),
    headBehind: pair(item.headBehind),
    views: views(item.views),
    left: views(item.left),
    torso: pair(item.torso),
    tool: pair(item.tool),
    arm: item.arm?.map(cell),
    leg: item.leg?.map(cell),
    foot: cell(item.foot ?? null),
    sole: item.sole === undefined ? undefined : cell(item.sole),
  };
}

function colorsOf(item: Item): PaletteKey[] {
  const tally = new Map<PaletteKey, number>();
  mapCells(item, (cell) => {
    if (cell && !SKIN_KEYS.includes(cell.key) && !FIXED_KEYS.includes(cell.key)) tally.set(cell.key, (tally.get(cell.key) ?? 0) + 1);
    return cell;
  });
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).filter(([, n]) => n / total >= 0.1).slice(0, 2).map(([key]) => key);
}

/** A copy of an item with some palette entries replaced by others. Shading is kept. */
export function recolor(item: Item, swap: Partial<Record<PaletteKey, PaletteKey>>): Item {
  if (!Object.keys(swap).length) return item;
  return mapCells(item, (c) => (c && swap[c.key] ? { ...c, key: swap[c.key]! } : c));
}

function build(): Entry[] {
  const entries: Entry[] = [];
  for (const [path, list] of Object.entries(files)) {
    const [, format, set] = path.match(/(sprite|recipe)-([\w-]+)\.json$/)!;
    if (EXCLUDED[`${format}-${set}`]) continue;
    list.forEach((raw, index) => {
      if (SUPERSEDED[`${format}-${set}-${index}`]) return;
      const result = compile(format as 'sprite' | 'recipe', raw);
      if (!result.ok) return;
      const item = result.compiled.item;
      // Rule: the back view of a beard is worked out from its front view. Both formats drew a
      // tuft at the neck there instead.
      if (item.slot === 'hair' && item.head) item.head = { front: stubbled(item.head.front), back: stubbled(item.head.back) };
      const key = item.head?.front.flat().find((c) => c && !c.mix)?.key;
      const drawn = item.slot === 'hair' && key ? catalogHairViews(`${format}-${set}-${index}`, key) : undefined;
      if (drawn) item.views = { ...item.views, ...drawn.views };
      if (drawn?.back && item.head) item.head = { ...item.head, back: drawn.back };
      if (item.slot === 'beard' && item.head) {
        const front = tidyBeard(item.head.front);
        item.head = { front, back: beardFromBehind(front) };
      }
      entries.push({
        id: `${format}-${set}-${index}`,
        label: sentence(item.name),
        slot: item.slot,
        format: format === 'sprite' ? 'paint' : 'recipe',
        island: ISLAND_SETS.includes(set) || ISLAND_IDS.includes(`${format}-${set}-${index}`),
        item,
        colors: colorsOf(item),
      });
    });
  }
  // Hairstyles written as one shape round the head replace the drawn ones of the same id (others are
  // added): every view comes from that one shape. One that fails its check leaves the drawn one in place.
  (shellFile as ({ id?: string } & Record<string, unknown>)[]).forEach(({ id, ...raw }, index) => {
    const result = compile('shell', raw);
    if (!result.ok) return console.warn(`shell ${id ?? index}: ${result.error}`);
    const item = result.compiled.item;
    const entry = entries.find((e) => e.id === id);
    if (entry) Object.assign(entry, { item, format: 'shell', colors: colorsOf(item) });
    else entries.push({ id: id ?? `shell-hair-${index}`, label: sentence(item.name), slot: 'hair', format: 'shell', island: false, item, colors: colorsOf(item) });
  });
  // Job clothes for Animal Hospital's staff.
  for (const job of JOB_ITEMS) {
    entries.push({ id: `job-${job.id}`, label: job.label, slot: job.item.slot, format: 'recipe', island: false, item: job.item, colors: colorsOf(job.item) });
  }
  // Beards drawn by hand, for the everyday shapes the model did not make.
  for (const style of BEARD_STYLES) {
    entries.push({ id: `base-beard-${style.id}`, label: style.label, slot: 'beard', format: 'paint', island: false, item: style.item, colors: colorsOf(style.item) });
  }
  // Parts polished by hand in the parts editor, on this device, laid over what the rules made.
  for (const entry of entries) {
    const item = editedItem(entry.id, entry.item);
    if (item !== entry.item) Object.assign(entry, { item, original: entry.item, colors: colorsOf(item) });
  }
  return entries;
}

export const CATALOG: Entry[] = build();
export const entryById = (id: string | null | undefined): Entry | undefined => CATALOG.find((e) => e.id === id);

/** Colours offered for clothing and hats. */
export const CLOTH_KEYS = (Object.keys(PALETTE) as PaletteKey[]).filter(
  (key) => !SKIN_KEYS.includes(key) && !FIXED_KEYS.includes(key) && !key.startsWith('hair') && !PLANT_KEYS.includes(key) && !ANIMAL_KEYS.includes(key) && !FIRE_KEYS.includes(key),
);
