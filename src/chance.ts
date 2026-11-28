// What is left to chance in play, from one seed: a stream of random numbers for each part of the game, so that what one
// part draws does not shift another's. A stream's state can be read and set, so the save keeps where each had got to.
/** A stream of random numbers from 0 to 1 (mulberry32, as `rng`), whose `state` is all of it. */
export interface Stream {
  (): number;
  state: number;
}

export function stream(state: number): Stream {
  const next = (() => {
    next.state = (next.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(next.state ^ (next.state >>> 15), next.state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Stream;
  next.state = state >>> 0;
  return next;
}

/** The game's streams: where the sea leaves things, the fish, sharks and crabs, and a grab's luck. */
export interface Chance {
  shore: Stream;
  fish: Stream;
  luck: Stream;
}
/** Each stream's state when it starts from `seed`. */
export const startOf = (seed: number): number[] => [seed >>> 0, (seed ^ 0x2545f491) >>> 0, (seed ^ 0x68e31da4) >>> 0];
/** The streams, from where they stood (see `stateOf`). */
export const chanceAt = (states: readonly number[]): Chance => ({ shore: stream(states[0]), fish: stream(states[1]), luck: stream(states[2]) });
/** Sets the streams to where they stood, keeping them the same functions (the rules hold on to them). */
export function setChance(c: Chance, states: readonly number[]): void {
  [c.shore.state, c.fish.state, c.luck.state] = states.map((s) => s >>> 0);
}
export const stateOf = (c: Chance): number[] => [c.shore.state, c.fish.state, c.luck.state];
/** A new seed, for a game with none given. */
export const newSeed = () => Math.floor(Math.random() * 1e9);

