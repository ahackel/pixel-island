// Fishing: a stone lying about, tied to a stick it makes a spear, and with the spear a fish
// swimming near is caught, or a crab. Small pictures, for the ground and the bag.
import { PALETTE } from '@pixel/engine/core/palette.ts';
import { crabPixels } from '@pixel/engine/world/crab.ts';
import { fishPixels, type Pixel } from '@pixel/engine/world/fish.ts';
import type { Thing } from '@pixel/engine/world/world.ts';

type Rows = { rows: string[]; colors: Record<string, string> };

/** A sharp grey stone, lit from above. */
export const STONE: Rows = { rows: ['..LLs..', '.LLsss.', 'Lssssdd', '.ssddd.'], colors: { L: '#c9c5bd', s: '#8f8b83', d: '#5d5a55' } };
const STONE_PICTURE = { get: (x: number, y: number) => STONE.colors[STONE.rows[y]?.[x]] ?? null };
export const stoneThing = (spot: Thing['spot']): Thing => ({ spot, picture: STONE_PICTURE, w: 7, h: 4, foot: { x: 3, y: 3 } });

/** The spear in the bag: the stick, a stone tied to its tip. */
export const SPEAR_IN_BAG: Rows = {
  rows: ['........LL.', '.......Lss.', '......csd..', '.....W.....', '....W......', '...W.......', '..W........', '.W.........', 'w..........'],
  colors: { ...STONE.colors, W: PALETTE.wood.base, w: PALETTE.wood.shade, c: PALETTE.straw.base },
};

/** Rows for the bag from a model's pixels. */
function rowsOf(px: Pixel[]): Rows {
  const x0 = Math.min(...px.map((p) => p.x)), y0 = Math.min(...px.map((p) => p.y));
  const w = Math.max(...px.map((p) => p.x)) - x0 + 1, h = Math.max(...px.map((p) => p.y)) - y0 + 1;
  const letters = [...new Set(px.map((p) => p.color))];
  const grid = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  for (const p of px) grid[p.y - y0][p.x - x0] = String.fromCharCode(48 + letters.indexOf(p.color));
  return { rows: grid.map((r) => r.join('')), colors: Object.fromEntries(letters.map((c, n) => [String.fromCharCode(48 + n), c])) };
}

/** The bag items for each kind of fish in the sea (fish.ts KINDS): a mackerel, a wrasse, a snapper. */
export const FISH_ITEMS = ['fish', 'wrasse', 'snapper'] as const;
/** A caught fish in the bag, by kind: the one swimming in the sea, in its colours. */
export const FISH_IN_BAG = FISH_ITEMS.map((_, k) => rowsOf(fishPixels(0, 0, k)));
/** A caught crab in the bag, looking out. */
export const CRAB_IN_BAG = rowsOf(crabPixels(1));
