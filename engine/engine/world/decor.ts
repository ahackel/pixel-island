// Small things lying flat on the ground: starfish, shells, pebbles, coral. Each is a few pixels of
// hand-drawn art, centred on where it was placed. They are drawn on the ground, under everything
// standing, so walkers step over them and nothing sorts or blocks. A few stand up instead (crystals,
// mushrooms, a wall torch): those are drawn as things, foot on the spot, and some glow and light
// the cells round them. The wall torch is the torch (flame.ts `TORCH`), its light and sparks its particle system's.
import { GLOWING } from './daylight.ts';
import { TORCH } from './flame.ts';
import type { Attach } from './island.ts';

export interface DecorKind {
  id: string;
  /** Pixel rows, top to bottom; '.' is empty, other letters look up `colors`. */
  rows: string[];
  /** For one that moves (a torch's flame): its frames, shown in turn; `rows` is the first. */
  frames?: string[][];
  colors: Record<string, string>;
  /** Drawn standing, sorted with the things, its foot on the spot, rather than flat on the ground. */
  stands?: boolean;
  /** For a standing one: how many pixels above the ground its foot is drawn, as for a torch on a wall. */
  lift?: number;
  /**
   * It gives light: the light's colour, how far it reaches in tiles and how strong it is, whether it flickers like a
   * flame, and which of its letters glow (kept bright in the dark, see daylight.ts `GLOWING`).
   */
  glow?: { color: string; r: number; amount: number; flicker?: boolean; keys: string };
  /** A particle system attached at a point of its rows (world/particles.ts): the torch's sparks and halo. */
  fx?: Attach;
}

const STAR = ['...a...', 'aaabaaa', '..aba..', '.a...c.', 'a.....c'];

export const DECOR: DecorKind[] = [
  { id: 'starfish-orange', rows: STAR, colors: { a: '#f0793a', b: '#ffbf73', c: '#b9552c' } },
  { id: 'starfish-pink', rows: STAR, colors: { a: '#ea6f9a', b: '#ffb3cb', c: '#a8476d' } },
  { id: 'shell-spiral', rows: ['.ccc.', 'cbbac', 'cbaac', '.aaa.'], colors: { a: '#e9c49c', b: '#fff1da', c: '#b88d66' } },
  { id: 'shell-scallop', rows: ['.aba.', 'ababa', 'ababa', '..c..'], colors: { a: '#f0947f', b: '#ffd3c6', c: '#b8665a' } },
  { id: 'pebbles-grey', rows: ['.aa...', 'abba.a', '.aa.ab'], colors: { a: '#8f8b83', b: '#c9c5bd' } },
  { id: 'pebbles-brown', rows: ['.aa...', 'abba.a', '.aa.ab'], colors: { a: '#94735a', b: '#cdab88' } },
  { id: 'coral', rows: ['a.a.a', 'babab', '.bab.', '..b..'], colors: { a: '#ff9c8a', b: '#e2574c' } },
  { id: 'driftwood', rows: ['..aab...', 'abbaaaab', '.a....a.'], colors: { a: '#9c7650', b: '#c9a679' } },
  {
    id: 'crystal', stands: true, glow: { color: '#5fe6ff', r: 2.4, amount: 0.55, keys: 'abc' },
    rows: ['....b....', '...bac...', 'b..bac...', 'ba.bac..b', 'bacbac.ba', 'bacbacbac', '.acbacbac', '..cbac.c.'],
    colors: { b: '#c4fbff', a: '#5fe6ff', c: '#2a9fd6' },
  },
  {
    id: 'mushrooms', stands: true, glow: { color: '#8cf06a', r: 1.6, amount: 0.4, keys: 'abc' },
    rows: ['.bbb.......', 'baaab......', 'aaaac..bb..', '.dsd..baab.', '..s...aaac.', '..s....ds..', '.......s...'],
    colors: { b: '#e2ffb8', a: '#8cf06a', c: '#4fb04a', s: '#cfc6b0', d: '#8a8070' },
  },
  {
    // The torch, hung on a wall: its flame where the shorter wall torch's was, the stick reaching further down.
    id: 'torch', stands: true, lift: 4, rows: TORCH.frames[0], frames: TORCH.frames, colors: TORCH.colors, fx: TORCH.fx,
  },
];
for (const kind of DECOR) for (const key of kind.glow?.keys ?? '') GLOWING.add(kind.colors[key]);

export const decorById = (id: unknown) => DECOR.find((d) => d.id === id);

export interface PlacedDecor {
  /** A `DECOR` id. */
  decor: string;
  /** Where its middle lies, in metres from the north corner of the map. */
  i: number;
  j: number;
}

/** Every coloured pixel of a decoration, relative to its middle. */
export function decorPixels(kind: DecorKind): { x: number; y: number; color: string }[] {
  const h = kind.rows.length;
  const w = Math.max(...kind.rows.map((r) => r.length));
  const out: { x: number; y: number; color: string }[] = [];
  kind.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const color = kind.colors[ch];
    if (color) out.push({ x: x - Math.floor(w / 2), y: y - Math.floor(h / 2), color });
  }));
  return out;
}
