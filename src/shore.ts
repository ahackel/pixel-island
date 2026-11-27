// What the island gives and where things go on it: coconuts under the palms, sticks, driftwood and stones on the
// beach, what a quest brings, and where the hut or raft can be built. Plain rules over the save: the island's ground
// comes in as a few questions (`Shore`), so the tests can use it without a page or the engine.
import type { Game } from './save.ts';
import { BUILDS, finished, HUT_AT, isLoose, lacking, type BagItem, type Build, type BuildKind } from './crafts.ts';
import { QUESTS, stonesOut } from './quests.ts';

type Spot = { i: number; j: number };

/** The island's ground, as these rules need it. */
export interface Shore {
  /** The middle of every beach tile. */
  beach: readonly Spot[];
  /** Every palm, by the index the save uses (`plant` is its flora id). */
  palms: readonly (Spot & { plant: string })[];
  /** On land, above the water. */
  dry(p: Spot): boolean;
  /** The ground there is high enough over the sea that what lies on it shows. */
  aboveWater(p: Spot): boolean;
  /** The ground's surface at a spot ('beach', ...). */
  surface(p: Spot): string;
  random(): number;
}

/** How many sticks, and pieces of driftwood, the sea leaves lying on the beach at most. */
export const WOOD_LYING = 4;
export const DRIFT_LYING = 3;
/** How many stones there should always be on the island, once a quest has brought them. */
export const STONES_OUT = 2;
/** How near the hut's middle the survivor builds it, in metres: inside it or just outside its walls. */
const HUT_REACH = 2.2;

/** How many of a thing lie on the ground. */
export const lyingCount = (g: Game, item: BagItem) => g.lying.filter((l) => l.item === item).length;
/** Lays a thing on the ground at a spot. */
export const lay = (g: Game, item: BagItem, at: Spot) => g.lying.push({ item, i: at.i, j: at.j });

/** A random spot `r` to `r + span` metres from a point, if it is dry and clear of the palms' trunks. */
export function spotNear(s: Shore, p: Spot, r: number, span: number): Spot | null {
  const a = s.random() * Math.PI * 2;
  const d = r + s.random() * span;
  const c = { i: p.i + Math.cos(a) * d, j: p.j + Math.sin(a) * d };
  return s.dry(c) && !s.palms.some((q) => Math.hypot(q.i - c.i, q.j - c.j) < 0.6) ? c : null;
}
/** Up to `n` such spots (see `spotNear`), in at most `tries` tries. */
export function spotsNear(s: Shore, p: Spot, n: number, r: number, span: number, tries = 40): Spot[] {
  const out: Spot[] = [];
  for (let k = 0; k < tries && out.length < n; k++) {
    const c = spotNear(s, p, r, span);
    if (c) out.push(c);
  }
  return out;
}

/** Somewhere on the beach, anywhere in its tile; there must be beach. */
function onBeach(s: Shore): Spot {
  // The shore runs through the beach tiles: only a spot whose ground is above the water, so what lies there is seen.
  let at = { i: 0, j: 0 };
  for (let n = 0; n < 50; n++) {
    const b = s.beach[Math.floor(s.random() * s.beach.length)];
    at = { i: b.i - 0.3 + s.random() * 0.6, j: b.j - 0.3 + s.random() * 0.6 };
    if (s.aboveWater(at)) break;
  }
  return at;
}

/** A coconut falls from a palm, near its foot, never more than three under one; a burnt or felled palm has none. */
export function dropCoconuts(s: Shore, g: Game): void {
  const bearing = s.palms.filter((p, k) => k !== g.struck && !g.felled.includes(k) && g.lying.filter((c) => c.item === 'coconut' && Math.hypot(c.i - p.i, c.j - p.j) < 1.8).length < 3);
  if (!bearing.length) return;
  for (const c of spotsNear(s, bearing[Math.floor(s.random() * bearing.length)], 1, 0.7, 0.6, 20)) lay(g, 'coconut', c);
}

/** What the sea brings: the items given. A crate stands on the beach; the small things lie there to be picked up. */
export function washUp(s: Shore, g: Game, items: readonly string[]): void {
  if (!s.beach.length) return;
  for (const item of items) {
    if (isLoose(item)) lay(g, item, onBeach(s));
    else g.items.push({ item, ...onBeach(s) });
  }
}

/** Each morning the sea leaves a stick or two and a piece of driftwood, dry by the time they are found. */
export function washWood(s: Shore, g: Game): void {
  if (!s.beach.length) return;
  for (let n = 0; n < 2 && lyingCount(g, 'wood') < WOOD_LYING; n++) lay(g, 'wood', onBeach(s));
  if (lyingCount(g, 'drift') < DRIFT_LYING) lay(g, 'drift', onBeach(s));
}

/** What quest `k` brings as it starts: its stones and wash-ups (its lightning is the game's to strike). */
export function bring(s: Shore, g: Game, k: number): void {
  const q = QUESTS[k];
  for (let n = 0; n < (q.stones ?? 0) && s.beach.length; n++) lay(g, 'stone', onBeach(s));
  washUp(s, g, q.washUps ?? []);
}

/** The morning's gifts: a coconut once the last is eaten, and the sea's wood. */
export function morningGifts(s: Shore, g: Game): void {
  if (!lyingCount(g, 'coconut') && !g.bag.includes('coconut')) dropCoconuts(s, g);
  washWood(s, g);
}

/** Once a quest has brought stones there are always STONES_OUT to find, lying about or in the bag (one in a spear or axe is used up). */
export function topUpStones(s: Shore, g: Game): void {
  if (!stonesOut(g.quest.quest) || !s.beach.length) return;
  for (let n = lyingCount(g, 'stone') + g.bag.filter((it) => it === 'stone').length; n < STONES_OUT; n++) lay(g, 'stone', onBeach(s));
}

/** The hut (at its fixed place) or raft that could be built, or built further, standing at `at` with what is in the bag. */
export function buildSpot(s: Shore, g: Game, kind: BuildKind, at: Spot): Build | 'new' | null {
  const b = g.builds.find((o) => o.kind === kind);
  if (finished(b) || lacking(kind, b?.stage ?? 0, g.bag).length) return null;
  if (kind === 'hut') return Math.hypot(HUT_AT.i - at.i, HUT_AT.j - at.j) <= HUT_REACH ? b ?? 'new' : null;
  if (b) return Math.hypot(b.i - at.i, b.j - at.j) <= 1.5 ? b : null;
  const surface = s.surface(at);
  const fits = BUILDS[kind].on === 'beach' ? surface === 'beach' : s.dry(at) && surface !== 'beach';
  const clear = !s.palms.some((q, k) => !g.felled.includes(k) && Math.hypot(q.i - at.i, q.j - at.j) < 1.2) && !g.builds.some((o) => Math.hypot(o.i - at.i, o.j - at.j) < 2);
  return fits && clear ? 'new' : null;
}

/**
 * A spot `d` metres to the side on screen from `p`: lying, the body lies across the screen, and +i -j is screen
 * right. `side` -1 is left, 1 right.
 */
export const sideways = (p: Spot, side: number, d: number) => ({ i: p.i + (side * d) / Math.SQRT2, j: p.j - (side * d) / Math.SQRT2 });
/** Half of head to feet, in metres: the lying sprite is some 26 pixels long, and a tile's 32 pixels across are 1.4 metres. */
export const HALF_BODY = 0.6;
/** The side of the screen the head goes, lying at `p`: on dry ground, the feet (if one side must be) toward the water. */
export function headSide(dry: (p: Spot) => boolean, p: Spot): -1 | 1 {
  // Near the body first, then a metre further out: with both ends dry, the head goes inland, the feet toward the sea.
  const score = (side: number) =>
    [HALF_BODY, 1.2].reduce((n, d, k) => n + (k ? 1 : 3) * ((dry(sideways(p, side, d)) ? 2 : 0) + (dry(sideways(p, -side, d)) ? 0 : 1)), 0);
  return score(1) > score(-1) ? 1 : -1;
}

/**
 * Where a new game's survivor wakes washed ashore: on the beach nearest `spawn` (the island's middle) with the sea beside
 * it on screen, so they lie along the water's edge, the feet toward the sea, all of them on the sand (`dry`). With a
 * `hat`, it came off in the sea and lies on the sand beyond their head, if there is sand there.
 */
export function washedUp(s: Shore, spawn: Spot, dry: (p: Spot) => boolean, hat: boolean): { at: Spot; hat: Spot | null } {
  const seaSide = (b: Spot) => [-1, 1].find((side) => !dry(sideways(b, side, 0.9)) && dry(sideways(b, -side, 0.9)));
  const far = (b: Spot) => Math.hypot(b.i - spawn.i, b.j - spawn.j);
  const shore = s.beach.filter((b) => seaSide(b) !== undefined).sort((a, b) => far(a) - far(b))[0] ?? spawn;
  const side = seaSide(shore);
  let at = { ...shore };
  // Up the sand from the sea until head and feet are both on dry ground, with a little to spare.
  const ends = HALF_BODY + 0.4;
  if (side) for (let d = 0.05; d < 1.5 && !(dry(sideways(at, side, ends)) && dry(sideways(at, -side, ends))); d += 0.05) at = sideways(shore, -side, d);
  if (!dry(at)) at = { ...shore };
  const hatAt = side ? sideways(at, -side, 2 * HALF_BODY) : spotNear(s, at, 0.6, 0.3);
  return { at, hat: hat && hatAt && dry(hatAt) ? hatAt : null };
}
