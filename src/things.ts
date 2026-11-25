// Small hand-drawn pictures for the week's new things: palm leaves, the vine, the stone axe, what the
// crate held, logs, the raft at each stage of building; and the hut, laid from the engine's building pieces.
import { PALETTE, PALETTE_KEYS } from '@pixel/engine/core/palette.ts';
import { rgb } from '@pixel/engine/world/ocean.ts';
import { lookOf, type State } from '@pixel/engine/character/character.ts';
import { STAND } from '@pixel/engine/core/poses.ts';
import { drawCharacter, PART_COLORS, SPRITE_H, SPRITE_W } from '@pixel/engine/core/puppet.ts';
import type { Picture } from '@pixel/engine/world/island.ts';
import { rasterOf, type Thing } from '@pixel/engine/world/world.ts';
import { TURNS } from '@pixel/engine/flora/flora.ts';
import { tool } from './fire.ts';
import { STONE } from './fishing.ts';
import { HUT_AT, HUT_PLAN } from './crafts.ts';
import { cellKey, edgeKey, emptyBuilding, type Building, type PieceKind } from '@pixel/engine/world/building/building.ts';
import { plankWall } from '@pixel/engine/world/building/pieces/plank-wall.ts';
import { wallKind } from '@pixel/engine/world/building/walls.ts';
import { thatchRoof } from '@pixel/engine/world/building/pieces/thatch-roof.ts';
import { picture, type Rows } from './rows.ts';

/** A thing standing on the ground from rows, its foot the middle of the bottom row. */
export const thing = (r: Rows) => {
  const p = picture(r.rows, r.colors);
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
const DRIFT_COLORS = { L: PALETTE.driftwood.light, D: PALETTE.driftwood.base, d: PALETTE.driftwood.shade };
/** A piece of driftwood in the bag: a bleached branch, forked at one end. */
export const DRIFT: Rows = { rows: ['.........LL.', '..LLLLLLDDd.', 'LDDDDDDDd...', '.ddddddd....', '.....dd.....'], colors: DRIFT_COLORS };
const driftInBag = thing(DRIFT);
/** Driftwood lying on the ground: the engine's bleached log or forked branch, small, turned by where it lies. */
export function driftThing(spot: Thing['spot']): Thing {
  const n = Math.floor(spot.i * 7 + spot.j * 13);
  const r = rasterOf({ plant: n % 2 ? 'plant-driftwood-1' : 'plant-driftwood-0', seed: n, size: 0.5, turn: n % TURNS }, 0);
  if (!r) return driftInBag(spot);
  return { spot, picture: r, w: r.w, h: r.h, foot: r.foot };
}
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
/** The crate in the bag: a small box of boards, banded. */
export const CRATE_IN_BAG: Rows = {
  rows: ['WWWWWWWW', 'WbbbbbbW', 'WWWWWWWW', 'WbbbbbbW', 'WWWWWWWW', 'wwwwwwww'],
  colors: { ...WOOD, b: PALETTE.bark.shade },
};
/** The raft quest's picture: a sail on a mast over two logs. */
export const RAFT_ICON: Rows = {
  rows: ['....W....', '....WCC..', '....WCCC.', '....WCCcc', '....W....', 'bbbbbbbbR', 'aaaaaaaar', 'bbbbbbbbR', 'aaaaaaaar'],
  colors: { ...BARK, ...WOOD, C: '#efe6d2', c: '#d8ccb2' },
};
/** The palette colour, and whether its shade, nearest a colour: held things are painted in the palette. */
function nearest(hex: string): [string, boolean] {
  const [r, g, b] = rgb(hex);
  let best: [string, boolean] = ['wood', false], d = Infinity;
  for (const key of PALETTE_KEYS) for (const shade of [false, true]) {
    const [r2, g2, b2] = rgb(PALETTE[key][shade ? 'shade' : 'base']);
    const e = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (e < d) [best, d] = [[key, shade], e];
  }
  return best;
}
/** A bag thing held in one hand, hanging from it: its bag picture repainted in palette colours. */
export function heldOf(name: string, r: Rows): ReturnType<typeof tool> {
  const letters = Object.keys(r.colors);
  const legend: Record<string, string> = {};
  const map: Record<string, string> = {};
  letters.forEach((ch, n) => {
    const [key, shade] = nearest(r.colors[ch]);
    const letter = String.fromCharCode(65 + n);
    legend[letter] = key;
    map[ch] = shade ? letter.toLowerCase() : letter;
  });
  const rows = r.rows.map((row) => [...row].map((ch) => map[ch] ?? '.').join(''));
  // The fist is round row 35: the thing hangs just below it, so it is seen.
  return tool(name, rows, legend, { bottom: 37 + rows.length, hold: 'carry', fx: r.fx });
}

/** The hammer held upright in one hand, like the axe: its iron head on top of the handle. */
export const HAMMER_HELD = tool('Hammer', ['.SSSSS.', 'SSSSSSs', '.ssWss.', ...Array.from({ length: 8 }, (_, y) => (y === 7 ? '...w...' : '...W...'))], { S: 'steel' });
/** The axe held upright in one hand, its stone head on top. */
export const AXE = tool('Axe', ['...SSS.', '...SSSS', '...WSS.', ...Array.from({ length: 11 }, (_, y) => (y === 10 ? '...w...' : '...W...'))], { S: 'stone' });


/**
 * The blanket the survivor sleeps on, lying flat: red, cream and blue stripes across, an edge of shade in front.
 * Long across the screen, as the survivor lies.
 */
const STRIPES = 'RRRCCBBBCC'.repeat(4).slice(0, 36);
const BLANKET_ROWS = [...Array(6).fill(STRIPES), STRIPES.toLowerCase()];
const blanketPicture = picture(BLANKET_ROWS, { R: '#c8463a', r: '#8e2f27', C: '#efe2c4', c: '#b9a98a', B: '#3f6fa8', b: '#2b4d78' });
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
  // The planks as frozen and painted over in the wall editor, when they are locked there.
  plank: wallKind('plank', plankWall({ overhang: 3, top: 'slope', seed: 1 })),
  thatch: thatchRoof({ rise: 3, eaves: 0.3, seed: 1 }),
  // The same thatch under another name: neighbouring cells of one kind are roofed as one rectangle, so a lone third
  // leaf beside the back two takes this, to be a small roof of its own rather than the whole roof at once.
  thatchApart: thatchRoof({ rise: 3, eaves: 0.3, seed: 2 }),
};
/** Wall height, in levels: about the survivor's height. */
const HUT_HEIGHT = 4;

const huts = new Map<string, Building>();
/**
 * The hut as laid in its first `stage` stages, on the map; `low`, its walls knee-high and no roof, to see behind it.
 * Made once for each, as it is asked for every frame.
 */
export function hutBuilding(stage: number, low = false): Building {
  const key = `${stage}|${low}`;
  let b = huts.get(key);
  if (!b) huts.set(key, (b = layHut(stage, low)));
  return b;
}
function layHut(stage: number, low: boolean): Building {
  const b = emptyBuilding(low ? 1 : HUT_HEIGHT);
  const i0 = HUT_AT.i - 1, j0 = HUT_AT.j - 1;
  const plan = HUT_PLAN.slice(0, stage);
  const leaves = plan.filter((s) => 'roof' in s).length;
  for (const s of plan) {
    if ('roof' in s) {
      // Two leaves make a rectangle and four the whole roof; the third alone is apart.
      const i = i0 + s.roof.i, j = j0 + s.roof.j;
      const kind = leaves === 3 && s.roof.j === 1 ? 'thatchApart' : 'thatch';
      if (!low) b.cells.set(cellKey(i, j), { kind, i, j });
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
  const deck = (stage >= 2 ? [0, 1, 2, 3] : [2, 3]).flatMap((k) => log(3 - k).slice(0, k === 3 ? 4 : 2));
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

/**
 * A hurricane lantern: a wire handle over an olive cap, a round glass globe glowing yellow behind its cage, and a
 * stepped foot. Wind and rain don't put it out. The globe is in the fire tones, so it glows and lights the dark.
 */
export const LANTERN: Rows = {
  rows: [
    '..hkkkh..',
    '.h.....h.',
    'h..mmm..h',
    '.kkkkkkk.',
    'kyWWkWWyk',
    'kyWWkWWyk',
    'kkkkkkkkk',
    'kyWWkWWyk',
    '.kyWkWyk.',
    '..mmmmm..',
    'kkkkkkkkk',
  ],
  colors: { h: '#c8c8c8', k: '#3b3a1e', m: '#6e6c48', y: PALETTE.flare.base, W: PALETTE.blaze.base },
  // Its light, at the middle of the globe.
  fx: { x: 4, y: 6, system: 'lantern' },
};

/** An old iron key: a ring for a bow, a long shank and two teeth, with a glint on the bow. */
export const KEY: Rows = {
  rows: [
    '.kkk.......',
    'kl..k......',
    'k...kkkkkkk',
    'k...k...d.d',
    '.kkk....d.d',
  ],
  colors: { k: '#6a6e78', l: '#c8ccd4', d: '#4a4e58' },
};

/** The arch of a cave mouth, upright, before it is laid on the cliff face. */
const ARCH = ['...rrrr...', '..rddddr..', '.rddddddr.', 'rddddddddr', 'rddddddddr', 'rddddddddr', 'rddddddddr', 'rddddddddr', 'rddddddddr', 'rddddddddr'];
/**
 * A cave mouth in a cliff face that looks down the screen to the left (the side toward +j): the arch is sheared down
 * half a pixel per pixel to the right, the way that face runs, and its foot is the middle of its bottom edge.
 */
const MOUTH_COLORS: Record<string, string> = { r: '#4e463e', d: '#120e0c' };
/** One picture for every frame, so the engine's caches keyed by picture (packing, shadow) keep it. */
const MOUTH: Picture = { get: (x, y) => MOUTH_COLORS[ARCH[y - Math.floor(x / 2)]?.[x] ?? ''] ?? null };
export function mouthThing(spot: Thing['spot']): Thing {
  const w = ARCH[0].length, h = ARCH.length + Math.floor(w / 2);
  return { spot, picture: MOUTH, w, h, foot: { x: Math.floor(w / 2), y: h - 1 - Math.floor(w / 4) } };
}
