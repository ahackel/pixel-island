import type { Cell } from '../core/palette.ts';
import { hashOf } from '../../shared/random.ts';
import { HEAD_FRAME, HEAD_STAMP, LIMB_CELLS, TORSO_FRAME, type Item, type OwnView, type Stamp, type StampPair } from '../core/puppet.ts';

/**
 * How long a character has been on the island, from 0 to 3. It is a value of the character, not of an item:
 * every piece of clothing, the shoes, the hat and the hair are aged by rule from their one neat
 * drawing, so no item needs a second, ragged version.
 */
export type Wear = number;
/** The scale runs from 0 (neat) to 3 (tattered) and may take any value in between. */
export const WEAR_MAX = 3;

/** A value from a table with one entry per named level, interpolated for levels in between. */
function at(table: number[], level: Wear): number {
  const low = Math.floor(level);
  const high = Math.min(table.length - 1, low + 1);
  return table[low] + (table[high] - table[low]) * (level - low);
}

/**
 * A fixed random number from 0 to 1 for one pixel of one item. Damage appears where this falls
 * under a limit that rises with the level, so each level keeps the damage of the one before.
 */
function chance(seed: number, x: number, y: number, kind: number): number {
  let n = seed ^ Math.imul(x + 11, 374761393) ^ Math.imul(y + 7, 668265263) ^ Math.imul(kind + 3, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1103515245);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

const copy = (stamp: Stamp): Stamp => stamp.map((row) => row.slice());
const dull = (cell: Cell): Cell => ({ ...cell, shade: true, light: false });
const lowest = (stamp: Stamp, col: number): number => {
  for (let row = stamp.length - 1; row >= 0; row--) if (stamp[row][col]) return row;
  return -1;
};

const HOLES = [0, 0.015, 0.04, 0.08];
const STAINS = [0, 0.05, 0.1, 0.16];
const SLEEVE = [1, 0.9, 0.65, 0.42];
const hipRow = TORSO_FRAME.ay + 11;

/** Cloth on the torso: an uneven hem, stains in small blocks, holes, and from 'ragged' on a patch. */
function wornCloth(stamp: Stamp, seed: number, level: Wear, hem: boolean, firstHoleRow: number, patch: Cell | null): Stamp {
  const out = copy(stamp);
  const width = out[0]?.length ?? 0;
  for (let row = 0; row < out.length; row++) {
    for (let col = 0; col < width; col++) {
      const cell = out[row][col];
      if (!cell) continue;
      if (chance(seed, col >> 1, row >> 1, 3) < at(STAINS, level)) out[row][col] = dull(cell);
      if (row >= firstHoleRow && chance(seed, col, row, 2) < at(HOLES, level)) out[row][col] = null;
    }
  }
  if (patch && level >= 2) {
    const col = TORSO_FRAME.ax - 3 + Math.floor(chance(seed, 0, 0, 5) * 5);
    const row = Math.max(firstHoleRow, TORSO_FRAME.ay + 5) + Math.floor(chance(seed, 1, 0, 5) * 4);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      if (stamp[row + dy]?.[col + dx]) out[row + dy][col + dx] = { ...patch, shade: dx === 1 && dy === 1 };
    }
  }
  if (hem) {
    for (let col = 0; col < width; col++) {
      const cut = Math.floor(chance(seed, col, 0, 1) * (level + 0.6));
      for (let n = 0; n < cut; n++) {
        const row = lowest(out, col);
        // A column is never cut away entirely.
        if (row < 0 || !out[row - 3]?.[col]) break;
        out[row][col] = null;
      }
      const row = lowest(out, col);
      if (cut && row >= 0) out[row][col] = dull(out[row][col]!);
    }
  }
  return out;
}

/** A sleeve or trouser leg, shortened from its free end, with a darker frayed last cell. */
function wornStrip(strip: (Cell | null)[], seed: number, level: Wear, least: number): (Cell | null)[] {
  const length = strip.reduce((n, cell, i) => (cell ? i + 1 : n), 0);
  const keep = Math.max(Math.min(length, least), Math.round(length * at(SLEEVE, level)));
  return strip.map((cell, i) => {
    if (!cell || i >= keep) return null;
    if (keep < length && i === keep - 1) return dull(cell);
    return chance(seed, i, 40, 3) < at(STAINS, level) ? dull(cell) : cell;
  });
}

/** A boot's shaft, which is painted on the ankle end of the leg strip, slumps and loses its cuff. */
function wornShaft(strip: (Cell | null)[], level: Wear): (Cell | null)[] {
  const first = strip.findIndex(Boolean);
  if (first < 0) return strip;
  const height = LIMB_CELLS - first;
  const keep = [height, height, Math.max(1, height - 1), Math.ceil(height / 2)][Math.floor(level)];
  const body = strip[LIMB_CELLS - 1] ?? strip[first]!;
  return strip.map((cell, i) => {
    if (!cell || i < LIMB_CELLS - keep) return null;
    return keep < height && i === LIMB_CELLS - keep ? dull(body) : cell;
  });
}

/** A hat frays at its edge, where it is at least three pixels thick, and picks up stains. */
function wornHat(stamp: Stamp, seed: number, level: Wear): Stamp {
  const out = copy(stamp);
  const fray = at([0, 0, 0.1, 0.2], level);
  stamp.forEach((cells, row) => cells.forEach((cell, col) => {
    if (!cell) return;
    if (chance(seed, col >> 1, row >> 1, 3) < at(STAINS, level) * 0.8) out[row][col] = dull(cell);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const open = !stamp[row + dy]?.[col + dx];
      const thick = stamp[row - dy]?.[col - dx] && stamp[row - 2 * dy]?.[col - 2 * dx];
      if (open && thick && chance(seed, col, row, 4) < fray) out[row][col] = null;
    }
  }));
  return out;
}

/** An item's front, back and side stamps, each changed by `change`; `behind` marks what hangs behind the body. */
function views(item: Item, change: (stamp: Stamp, view: OwnView, behind: boolean) => Stamp): Item['views'] {
  if (!item.views) return undefined;
  return Object.fromEntries(Object.entries(item.views).map(([view, v]) => [view, {
    head: change(v.head, view as OwnView, false),
    ...(v.behind ? { behind: change(v.behind, view as OwnView, true) } : {}),
  }]));
}

// The part of the head frame where the face is, in the front view. Hair may not grow into it.
const dx = HEAD_FRAME.ax - HEAD_STAMP.ax;
const dy = HEAD_FRAME.ay - HEAD_STAMP.ay;
const FACE = { x0: 4 + dx, x1: 17 + dx, y0: 10 + dy, y1: 22 + dy };
const inFace = (col: number, row: number) => col >= FACE.x0 && col <= FACE.x1 && row >= FACE.y0 && row <= FACE.y1;

/**
 * Hair that has not seen a comb or scissors: stray pixels break the outline, the gloss goes,
 * the ends grow down in clumps, and the fringe creeps over the forehead.
 */
function unkempt(stamp: Stamp, seed: number, level: Wear, front: boolean, strays = true): Stamp {
  const out = stamp.map((row) => row.map((cell) => (cell && level >= 2 ? { ...cell, light: false } : cell)));
  const width = out[0]?.length ?? 0;
  const plain = (cell: Cell): Cell => ({ key: cell.key, shade: false, ...(cell.mix ? { shade: true, mix: cell.mix } : {}) });
  if (strays) {
    const limit = at([0, 0.12, 0.2, 0.3], level);
    for (let row = 0; row < stamp.length; row++) {
      for (let col = 0; col < width; col++) {
        if (stamp[row][col] || (front && inFace(col, row))) continue;
        const beside = stamp[row + 1]?.[col] ?? stamp[row][col - 1] ?? stamp[row][col + 1];
        if (beside && chance(seed, col, row, 6) < limit) out[row][col] = plain(beside);
      }
    }
  }
  for (let col = 0; col < width; col++) {
    const row = lowest(stamp, col);
    if (row < 0) continue;
    const overFace = front && col >= FACE.x0 && col <= FACE.x1;
    // Clumps two pixels wide. Over the face only the fringe grows, and never past the brows.
    const grow = overFace
      ? Math.min(Math.max(0, FACE.y0 + (level >= 3 ? 1 : 0) - row), level >= 2 && chance(seed, col >> 1, 0, 7) < 0.5 ? 1 : 0)
      : Math.max(0, Math.round(chance(seed, col >> 1, 0, 7) * (level - 1) + (level >= 3 ? 0.5 : 0)));
    for (let n = 1; n <= grow; n++) {
      if (row + n < out.length && !out[row + n][col]) out[row + n][col] = { ...stamp[row][col]!, light: false };
    }
  }
  return out;
}

const cache = new WeakMap<Item, Map<number, Item>>();

/** The item as it looks at a wear level. Level 0 is the item as drawn. Tools do not age. */
export function weathered(item: Item, level: Wear): Item {
  level = Math.max(0, Math.min(WEAR_MAX, level));
  if (!level || item.slot === 'tool') return item;
  const known = cache.get(item) ?? new Map<number, Item>();
  cache.set(item, known);
  const hit = known.get(level);
  if (hit) return hit;
  const seed = hashOf(item.name + item.slot);
  const pair = (p: StampPair | undefined, each: (stamp: Stamp, front: boolean) => Stamp): StampPair | undefined =>
    p && { front: each(p.front, true), back: each(p.back, false) };
  const out: Item = { ...item };

  if (item.slot === 'top') {
    const patch: Cell = { key: item.torso?.front.flat().find(Boolean)?.key === 'tan' ? 'cream' : 'tan', shade: false };
    out.torso = pair(item.torso, (stamp) => wornCloth(stamp, seed, level, true, TORSO_FRAME.ay + 5, patch));
    if (item.arm) out.arm = wornStrip(item.arm, seed, level, 1);
  } else if (item.slot === 'bottom') {
    // Trousers keep their seat whole and lose length; a skirt frays at the hem.
    const skirt = !item.leg;
    out.torso = pair(item.torso, (stamp) => wornCloth(stamp, seed, level, skirt, skirt ? hipRow + 1 : stamp.length, null));
    if (item.leg) out.leg = wornStrip(item.leg, seed, level, 2);
  } else if (item.slot === 'shoes') {
    if (item.foot && level >= 2) out.foot = dull(item.foot);
    if (item.foot && level >= 3 && !item.footOpen) out.footOpen = 'toe';
    if (item.leg) out.leg = wornShaft(item.leg, level);
  } else if (item.slot === 'hat') {
    out.head = pair(item.head, (stamp) => wornHat(stamp, seed, level));
  } else if (item.slot === 'hair') {
    out.head = pair(item.head, (stamp, front) => unkempt(stamp, seed, level, front));
    out.headBehind = pair(item.headBehind, (stamp) => unkempt(stamp, seed, level, false, false));
    // Face on and side on the hair keeps off the face, as in front; from behind it grows freely.
    out.views = views(item, (stamp, view, behind) => unkempt(stamp, seed, level, view !== 'N' && !behind, !behind));
    out.left = item.left && views({ ...item, views: item.left }, (stamp, _view, behind) => unkempt(stamp, seed, level, !behind, !behind));
  } else if (item.slot === 'beard' && level >= 2 && !item.short) {
    // A beard only grows longer. It has no back view.
    out.head = item.head && { front: unkempt(item.head.front, seed, level, false, false), back: item.head.back };
    out.views = views(item, (stamp) => unkempt(stamp, seed, level, false, false));
  }
  known.set(level, out);
  return out;
}
