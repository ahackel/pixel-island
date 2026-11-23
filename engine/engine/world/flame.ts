// A small flame, as on a torch or a campfire, and the stick a torch is: hand-drawn rows of letters,
// shared by the game's torch in hand and the torches hung on cave walls, so both are the same torch.
import { PALETTE } from '../core/palette.ts';

/** A flame's colours: the palette's fire tones, which glow (the same by day and night, in any weather). */
export const FLAME_COLORS: Record<string, string> = { W: PALETTE.blaze.base, y: PALETTE.flare.base, o: PALETTE.flame.base, r: PALETTE.flame.shade };
/** Three frames of flicker, 7 wide. */
export const FLAMES = [
  ['...y...', '..yo...', '..ooy..', '.oyyo..', '.oyWyo.', 'oyWWyo.', 'oyWWyyo', '.ryyyr.'],
  ['....y..', '...oy..', '..oyo..', '..oyyo.', '.oyWyo.', '.oyWWyo', 'oyWWyyo', '.ryyyr.'],
  ['.......', '..y....', '..oy...', '.oyyo..', '.oyWyo.', 'oyWWyo.', 'oyyWWyo', '.ryyyr.'],
];
/** The heart of the flame in every frame of FLAMES: where its light sits. */
export const FLAME_GLOW = { x: 3, y: 5 };
/** One of a flame's frames at a time: every fire flickers at the same pace, `salt` putting one out of step. */
export const flameFrame = <T>(frames: readonly T[], ms: number, salt = 0) => frames[Math.floor(ms / 140 + salt) % frames.length];
/** A stick `n` rows long, not quite straight: its top bends aside, a stub of a twig halfway down. W wood, w its shade. */
export const shaft = (n: number) => Array.from({ length: n }, (_, y) =>
  y === n - 1 ? '...w...' : y < Math.round(n / 4) ? '....W..' : y === Math.round(n / 2) ? '..wW...' : '...W...');
/** A torch's rows, a frame of flame on a stick, with the flame in its own letters (B blaze, Y flare, F flame, f shade) so W can be the wood. */
export const torchRows = (frame: readonly string[], stick: number) =>
  [...frame.map((r) => r.replace(/[Wyor]/g, (c) => ({ W: 'B', y: 'Y', o: 'F', r: 'f' })[c]!)), ...shaft(stick)];
