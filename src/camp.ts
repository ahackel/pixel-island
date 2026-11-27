// The survivor's camp: where they may sleep and what keeps them dry and warm (the hut, a campfire by it), what burns
// and frightens animals, the lightning that burns a palm, and when the raft can sail. Plain rules over the save and a
// spot, no page, so the tests can use them (camp.test.ts).
import type { Game } from './save.ts';
import { finished, HUT_AT } from './crafts.ts';
import type { Key } from './i18n.ts';
import { QUESTS, type Kind } from './quests.ts';
import { lay, spotsNear, type Shore } from './shore.ts';

type Spot = { i: number; j: number };
const dist = (a: Spot, b: Spot) => Math.hypot(a.i - b.i, a.j - b.j);

/** Where the survivor sleeps: the blanket, in the middle of where the hut goes. */
export const BLANKET = HUT_AT;
export const onBlanket = (at: Spot) => dist(at, BLANKET) < 0.5;

/** The hut, once finished. */
export const hutOf = (g: Pick<Game, 'builds'>) => {
  const b = g.builds.find((x) => x.kind === 'hut');
  return finished(b) ? b : undefined;
};
/** Under the finished hut's roof: on one of its 2×2 cells. */
export const sheltered = (g: Pick<Game, 'builds'>, at: Spot) =>
  !!hutOf(g) && Math.abs(Math.floor(at.i) + 0.5 - HUT_AT.i) < 1 && Math.abs(Math.floor(at.j) + 0.5 - HUT_AT.j) < 1;
/** By a burning campfire (the stump is too wild a fire to sleep by). */
export const byFire = (g: Pick<Game, 'fires'>, at: Spot) => g.fires.some((f) => dist(f, at) <= 2.5);
/** How near the hut a campfire counts as its own, in metres. */
export const HUT_FIRE = 3;
export const byHut = (at: Spot) => dist(at, HUT_AT) <= HUT_FIRE;
export const fireByHut = (g: Pick<Game, 'fires'>) => g.fires.some(byHut);
/** The fire quest is under way: after that storm the survivor does not sleep again until a campfire burns by the hut. */
export const wantsFire = (g: Pick<Game, 'quest'>) => QUESTS[g.quest.quest].goal === 'campfire' && !g.quest.done;

/**
 * Why the survivor will not lie down on the blanket now, if they will not: in the rain they sleep only under the hut's
 * roof, and after the storm night they lie awake until a campfire burns by the hut.
 */
export function sleepRefused(g: Pick<Game, 'builds' | 'fires' | 'quest'>, at: Spot, weather: { rain: number }): Key | null {
  if (weather.rain > 0.4 && !sheltered(g, at)) return 'think.rainSleep';
  if (wantsFire(g) && !fireByHut(g)) return 'think.needFire';
  return null;
}
/** In a storm, sleep out of the hut and away from a fire is broken by thunder. */
export const stormWakes = (g: Pick<Game, 'builds' | 'fires'>, at: Spot, kind: Kind) => kind === 'storm' && !byFire(g, at) && !sheltered(g, at);

/** The raft, finished, by the survivor, and the sea not stormy. */
export function canSail(g: Pick<Game, 'builds'>, at: Spot, kind: Kind): boolean {
  const r = g.builds.find((b) => b.kind === 'raft');
  return finished(r) && dist(r!, at) <= 1.5 && kind !== 'storm';
}

/** How far a fire scares animals off, in metres: a fire burning on the ground, and a torch carried about. */
export const FIRE_FEAR = 3.5;
export const TORCH_FEAR = 1.6;
export interface Burning { i: number; j: number; fear: number }
/** Every fire burning now, and how far each one frightens: the campfires, the palm lightning left alight, a torch carried at `torch`. */
export function burning(g: Pick<Game, 'fires' | 'struck'>, palms: readonly Spot[], torch: Spot | null): Burning[] {
  return [
    ...g.fires.map((f) => ({ i: f.i, j: f.j, fear: FIRE_FEAR })),
    ...(g.struck === null ? [] : [{ i: palms[g.struck].i, j: palms[g.struck].j, fear: FIRE_FEAR }]),
    ...(torch ? [{ i: torch.i, j: torch.j, fear: TORCH_FEAR }] : []),
  ];
}
/** The fire nearest an animal, if one is near enough to frighten it. */
export function fireNear(at: Spot, lit: readonly Burning[]): Burning | null {
  let best: Burning | null = null;
  let bestD = Infinity;
  for (const f of lit) {
    const d = dist(f, at);
    if (d <= f.fear && d < bestD) [best, bestD] = [f, d];
  }
  return best;
}

/** The tall palms can be felled and draw lightning; the sapling is too small. */
export const isTall = (palm: { plant: string }) => palm.plant !== 'plant-palms-2';
/** Burns the tall palm nearest `near` down to a burning stump, its crown's twigs dry wood round it. Whether there was one. */
export function burnPalm(s: Shore, g: Game, near: Spot): boolean {
  let best = -1;
  let bestD = Infinity;
  s.palms.forEach((p, k) => {
    const d = dist(p, near);
    // A sapling is too small to draw lightning.
    if (isTall(p) && !g.felled.includes(k) && d < bestD) [best, bestD] = [k, d];
  });
  if (best < 0) return false;
  g.struck = best;
  for (const twig of spotsNear(s, s.palms[best], 3, 0.8, 0.9)) lay(g, 'wood', twig);
  return true;
}
