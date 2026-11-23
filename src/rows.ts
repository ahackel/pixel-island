// Small hand-drawn pictures as rows of letters, each letter a colour and '.' empty. No game imports, so every
// module that draws its own small pictures (fire.ts, fishing.ts, things.ts, main.ts) can share it without a cycle.
import type { Picture } from '@pixel/engine/world/island.ts';

export type Point = { x: number; y: number };
/** `glow`: where its light sits, in its rows (a lantern's globe), for a thing that gives light. */
export type Rows = { rows: readonly string[]; colors: Record<string, string>; glow?: Point };

/** Rows of letters as a picture, '.' empty. */
export const picture = (rows: readonly string[], colors: Record<string, string>): Picture => ({ get: (x, y) => colors[rows[y]?.[x]] ?? null });
