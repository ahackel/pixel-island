// Small hand-drawn pictures as rows of letters, each letter a colour and '.' empty. No game imports, so every
// module that draws its own small pictures (fire.ts, fishing.ts, things.ts, main.ts) can share it without a cycle.
import type { Attach, Picture } from '@pixel/engine/world/island.ts';

/** `fx`: a particle system attached at a point of its rows (a lantern's light at its globe). */
export type Rows = { rows: readonly string[]; colors: Record<string, string>; fx?: Attach };

/** Rows of letters as a picture, '.' empty. */
export const picture = (rows: readonly string[], colors: Record<string, string>): Picture => ({ get: (x, y) => colors[rows[y]?.[x]] ?? null });
