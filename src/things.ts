// Small hand-drawn pictures for the week's new things: palm leaves, the vine, the stone axe, what the
// crate held, logs, and the hut and raft at each stage of building.
import { PALETTE } from '@pixel/engine/core/palette.ts';
import type { Picture } from '@pixel/engine/world/island.ts';
import type { Thing } from '@pixel/engine/world/world.ts';
import { tool } from './fire.ts';
import { STONE } from './fishing.ts';
import type { BuildKind, Loose } from './crafts.ts';

type Rows = { rows: string[]; colors: Record<string, string> };
const picture = ({ rows, colors }: Rows): Picture => ({ get: (x, y) => colors[rows[y]?.[x]] ?? null });
const thing = (r: Rows) => {
  const p = picture(r);
  const w = Math.max(...r.rows.map((row) => row.length)), h = r.rows.length;
  return (spot: Thing['spot']): Thing => ({ spot, picture: p, w, h, foot: { x: Math.floor(w / 2), y: h - 1 } });
};

const GREEN = { g: '#3f7a32', G: '#78b04a' };
const WOOD = { W: PALETTE.wood.base, w: PALETTE.wood.shade };
const BARK = { b: PALETTE.bark.base, a: PALETTE.bark.shade, R: '#c9a36a', r: '#8a6a3a' };

export const LEAF: Rows = { rows: ['......gG', '....gGg.', '..gGgG..', '.gGg....', 'w.......'], colors: { ...GREEN, w: PALETTE.wood.shade } };
export const VINE: Rows = { rows: ['.gGGg...', 'g....g..', '.g..GGg.', '..gg...g', '.......g'], colors: GREEN };
export const ROPE: Rows = { rows: ['.rRRr..', 'r.rr.r.', 'r.r.rr.', '.rRRr.r', '......r'], colors: { r: '#a8844e', R: '#d8b87e' } };
export const CLOTH: Rows = { rows: ['.dddddd.', 'dCCCCCCd', 'dccccccd', '.dddddd.'], colors: { C: '#efe6d2', c: '#d8ccb2', d: '#a89e88' } };
export const LOG: Rows = { rows: ['.bbbbbbbbbR.', 'bbbbbbbbbbRr', 'aaaaaaaaaarr', '.aaaaaaaaar.'], colors: BARK };
/** The axe in the bag: a stick, a big stone lashed across its top. */
export const AXE_IN_BAG: Rows = {
  rows: ['....LLs..', '...LLssd.', '....csdd.', '...W.....', '..W......', '.W.......', 'w........'],
  colors: { ...STONE.colors, ...WOOD, c: PALETTE.straw.base },
};
/** The axe held upright in one hand, its stone head on top. */
export const AXE = tool('Axe', ['...SSS.', '...SSSS', '...WSS.', ...Array.from({ length: 11 }, (_, y) => (y === 10 ? '...w...' : '...W...'))], { S: 'stone' });

const LOOSE_THINGS: Record<Loose, (spot: Thing['spot']) => Thing> = { vine: thing(VINE), rope: thing(ROPE), cloth: thing(CLOTH), log: thing(LOG) };
export const looseThing = (kind: Loose, spot: Thing['spot']) => LOOSE_THINGS[kind](spot);

// ------------------------------------------------------------------ the hut

/** The hut, an A-frame about the survivor's height seen from the front: after stage 1 only its poles, after stage 2 a roof of leaves. */
function hutRows(roofed: boolean): Rows {
  const H = 30, W = 2 * H - 1, mid = H - 1;
  const rows = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
    const d = Math.abs(x - mid);
    if (d > y + 1) return '.';
    // Two poles leaning together, crossed at the top, and a third standing in the middle.
    if (d >= y - 1) return d === y + 1 ? 'w' : 'W';
    if (!roofed) return d === 0 ? 'W' : y === H - 1 ? '.' : '.';
    // The doorway: a dark arch in the lower half.
    if (y > H * 0.45 && d < (y - H * 0.45) * 0.55 + 1) return 'd';
    // Leaves in overlapping rows, a darker edge under each.
    return y % 4 === 3 ? 'g' : (x + Math.floor(y / 4)) % 5 === 0 ? 'g' : 'G';
  }).join(''));
  return { rows, colors: { ...WOOD, ...GREEN, d: '#2a2118' } };
}
const HUT = [thing(hutRows(false)), thing(hutRows(true))];

// ------------------------------------------------------------------ the raft

/** The raft: two logs, then four lashed with rope, then a mast with the sail. */
function raftRows(stage: number): Rows {
  const L = 26;
  // Each log seen from above-front: a lit top, a shaded side, its cut end at the right.
  const log = (n: number) => [`.${'b'.repeat(L - 3)}RR.`, `${'b'.repeat(L - 2)}Rr`, `${'a'.repeat(L - 2)}rr`, `.${'a'.repeat(L - 3)}r.`].map((r) => ' '.repeat(n) + r);
  const deck = (stage >= 2 ? [0, 1, 2, 3] : [2, 3]).flatMap((k) => log(3 - k).slice(k === 3 ? 0 : 0, k === 3 ? 4 : 2));
  const lashed = deck.map((r) => (stage >= 2 ? r.replace(/^(.{8})./, '$1y').replace(/^(.{19})./, '$1y') : r));
  const top: string[] = [];
  if (stage >= 3) {
    // The mast stands mid-deck, the sail hanging on its right, wider at the foot.
    for (let y = 0; y < 26; y++) {
      const sail = y >= 2 && y <= 21 ? 'C'.repeat(Math.min(13, 1 + Math.floor((y - 2) * 0.65))).replace(/C$/, y % 2 ? 'c' : 'C') : '';
      top.push(' '.repeat(12) + (y === 0 ? 'w' : 'W') + sail);
    }
  }
  const w = L + 3;
  const rows = [...top, ...lashed].map((r) => r.padEnd(w, '.').replace(/ /g, '.'));
  return { rows, colors: { ...BARK, ...WOOD, y: '#d8b87e', C: '#efe6d2', c: '#d8ccb2' } };
}
const RAFT = [1, 2, 3].map((s) => thing(raftRows(s)));

/** A structure as built so far (at least one stage). */
export function buildThing(kind: BuildKind, stage: number, spot: Thing['spot']): Thing {
  const pics = kind === 'hut' ? HUT : RAFT;
  return pics[Math.min(pics.length, stage) - 1](spot);
}
