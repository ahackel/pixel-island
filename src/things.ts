// Small hand-drawn pictures for the week's new things: palm leaves, the vine, the stone axe, what the
// crate held, logs, the raft at each stage of building; and the hut, laid from the engine's building pieces.
import { PALETTE } from '@pixel/engine/core/palette.ts';
import { lookOf, type State } from '@pixel/engine/character/character.ts';
import { STAND } from '@pixel/engine/core/poses.ts';
import { drawCharacter, PART_COLORS, SPRITE_H, SPRITE_W } from '@pixel/engine/core/puppet.ts';
import type { Picture } from '@pixel/engine/world/island.ts';
import type { Thing } from '@pixel/engine/world/world.ts';
import { tool } from './fire.ts';
import { STONE } from './fishing.ts';
import { HUT_AT, HUT_PLAN } from './crafts.ts';
import { cellKey, edgeKey, emptyBuilding, type Building, type PieceKind } from '@pixel/engine/world/building/building.ts';
import { plankWall } from '@pixel/engine/world/building/pieces/plank-wall.ts';
import { thatchRoof } from '@pixel/engine/world/building/pieces/thatch-roof.ts';

type Rows = { rows: string[]; colors: Record<string, string> };
const picture = ({ rows, colors }: Rows): Picture => ({ get: (x, y) => colors[rows[y]?.[x]] ?? null });
/** A thing standing on the ground from rows, its foot the middle of the bottom row. */
export const thing = (r: Rows) => {
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
/** The hammer: an iron head across a wooden handle. */
export const HAMMER: Rows = {
  rows: ['.IIIII.', 'IIIIIIi', '.iiWii.', '...W...', '...W...', '...W...', '...w...'],
  colors: { I: '#9aa3ad', i: '#646c75', ...WOOD },
};
/** The axe held upright in one hand, its stone head on top. */
export const AXE = tool('Axe', ['...SSS.', '...SSSS', '...WSS.', ...Array.from({ length: 11 }, (_, y) => (y === 10 ? '...w...' : '...W...'))], { S: 'stone' });


/**
 * The blanket the survivor sleeps on, lying flat: red, cream and blue stripes across, an edge of shade in front.
 * Long across the screen, as the survivor lies.
 */
const STRIPES = 'RRRCCBBBCC'.repeat(4).slice(0, 36);
const BLANKET_ROWS = [...Array(6).fill(STRIPES), STRIPES.toLowerCase()];
const blanketPicture = picture({ rows: BLANKET_ROWS, colors: { R: '#c8463a', r: '#8e2f27', C: '#efe2c4', c: '#b9a98a', B: '#3f6fa8', b: '#2b4d78' } });
/**
 * The blanket at `spot`. Its picture is centred on the spot, but the thing is placed half a metre back, so
 * whoever lies on it is drawn over it; it casts no shadow.
 */
export function blanketThing(spot: Thing['spot']): Thing {
  const w = BLANKET_ROWS[0].length, h = BLANKET_ROWS.length;
  // Half a metre back along i and j is 8 ground pixels up the screen.
  return { spot: { ...spot, i: spot.i - 0.5, j: spot.j - 0.5 }, picture: blanketPicture, w, h, foot: { x: Math.floor(w / 2), y: Math.floor(h / 2) - 8 }, shadow: [] };
}

const hats = new WeakMap<State, (spot: Thing['spot']) => Thing>();
/**
 * The survivor's own hat lying on the sand, just as they wear it: their 3/4 front view drawn twice, plainly
 * and in the parts colours, keeping only the pixels the parts drawing marks as hat.
 */
export function hatThing(who: State): (spot: Thing['spot']) => Thing {
  let made = hats.get(who);
  if (made) return made;
  const look = lookOf(who);
  const plain = drawCharacter(look, STAND, 0);
  const parts = drawCharacter(look, STAND, 0, { parts: true });
  const cells: [number, number, string][] = [];
  for (let y = 0; y < SPRITE_H; y++) for (let x = 0; x < SPRITE_W; x++) {
    const c = plain.get(x, y);
    if (c && parts.get(x, y) === PART_COLORS.hat) cells.push([x, y, c]);
  }
  // A hat that draws nothing in 3/4 front still needs a pixel to tap.
  if (!cells.length) cells.push([0, 0, PALETTE.straw.base]);
  const x0 = Math.min(...cells.map((c) => c[0])), y0 = Math.min(...cells.map((c) => c[1]));
  const w = Math.max(...cells.map((c) => c[0])) - x0 + 1, h = Math.max(...cells.map((c) => c[1])) - y0 + 1;
  const at = new Map(cells.map(([x, y, c]) => [`${x - x0},${y - y0}`, c]));
  const picture: Picture = { get: (x, y) => at.get(`${x},${y}`) ?? null };
  made = (spot) => ({ spot, picture, w, h, foot: { x: Math.floor(w / 2), y: h - 1 } });
  hats.set(who, made);
  return made;
}

// ------------------------------------------------------------------ the hut

/** How the hut's pieces look: driftwood planks and a hipped roof of palm thatch. */
export const PIECE_KINDS: Record<string, PieceKind> = {
  plank: plankWall({ overhang: 3, top: 'slope', seed: 1 }),
  thatch: thatchRoof({ rise: 3, eaves: 0.3, seed: 1 }),
};
/** Wall height, in levels: about the survivor's height. */
const HUT_HEIGHT = 4;

/** The hut as laid in its first `stage` stages, on the map. */
export function hutBuilding(stage: number): Building {
  const b = emptyBuilding(HUT_HEIGHT);
  const i0 = HUT_AT.i - 1, j0 = HUT_AT.j - 1;
  for (const s of HUT_PLAN.slice(0, stage)) {
    if (s === 'roof') {
      for (let j = j0; j < j0 + 2; j++) for (let i = i0; i < i0 + 2; i++) b.cells.set(cellKey(i, j), { kind: 'thatch', i, j });
    } else {
      for (const w of s) {
        const edge = { axis: w.axis, i: i0 + w.i, j: j0 + w.j };
        b.edges.set(edgeKey(edge), { kind: 'plank', edge });
      }
    }
  }
  return b;
}

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

/** The raft as built so far (at least one stage). */
export const raftThing = (stage: number, spot: Thing['spot']): Thing => RAFT[Math.min(RAFT.length, stage) - 1](spot);
