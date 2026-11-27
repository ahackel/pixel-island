// The one vocabulary of what happens in the game's content. An interaction (a hand on a thing, interactions.ts) and a
// quest as it starts (quests.ts) are both short lists of these effects, done in the order written. What an effect does
// to the game is main.ts's (the `Doer`); what a list may say, and its checks, are here. Plain rules, no page or engine
// code, so the tests can use them.
import { BAG_ITEMS, isThing, type BagItem } from './crafts.ts';

/** The weather of a day. */
export const KINDS = ['sunny', 'cloudy', 'windy', 'fog', 'rain', 'storm'] as const;
export type Kind = (typeof KINDS)[number];

export const LOCA_ID = /^[A-Za-z][\w.-]*$/;

/** What only the game can do, by name (main.ts has one function for each). Everything else is an effect in the data. */
export const HANDLERS = ['smashCrate', 'priseCrate', 'removeItem', 'fell', 'lightTorch', 'lightFire'] as const;
export type Handler = (typeof HANDLERS)[number];

/**
 * One step, written as an object with one key:
 * - `think`: a thought (a text id).
 * - `reach`: a quest goal reached (a goal is any name; a quest waits for it).
 * - `give`: a thing into the bag.
 * - `take`: the first thing called so (an item, or a group such as `fish`) out of the bag.
 * - `call`: a named handler (`HANDLERS`).
 * - `room`: stop here, saying so, if the bag is full.
 * - `weather`: the weather that lasts from now.
 * - `washUp`: things the sea leaves on the beach: a list, or `{ items, near }` for those within `near` metres of the survivor
 *   (on an island too big to leave them anywhere).
 * - `stones`: stones laid on the beach, a number or `{ n, near }` likewise; from then on there is always one to find.
 * - `strike`: lightning waits to strike a palm.
 */
export type Effect =
  | { think: string }
  | { reach: string }
  | { give: BagItem }
  | { take: string }
  | { call: Handler }
  | { room: true }
  | { weather: Kind }
  | { washUp: string[] | { items: string[]; near?: number } }
  | { stones: number | { n: number; near?: number } }
  | { strike: true };

/** What an effect does to the game. */
export interface Doer {
  think(id: string): void;
  reach(goal: string): void;
  give(item: BagItem): void;
  take(name: string): void;
  /** Whether the bag is full. */
  full(): boolean;
  call(handler: Handler): void;
  weather(kind: Kind): void;
  /** `near`: within so many metres of the survivor. */
  washUp(items: readonly string[], near?: number): void;
  stones(n: number, near?: number): void;
  strike(): void;
}

/** A doer that does nothing: spread it and fill in what matters (`{ ...idle, stones }`). */
export const idle: Doer = {
  think() {}, reach() {}, give() {}, take() {}, full: () => false, call() {}, weather() {}, washUp() {}, stones() {}, strike() {},
};

/** Does effects in order. A `room` effect with a full bag says so and stops there. */
export function run(effects: readonly Effect[], d: Doer): void {
  for (const e of effects) {
    if ('think' in e) d.think(e.think);
    else if ('reach' in e) d.reach(e.reach);
    else if ('give' in e) d.give(e.give);
    else if ('take' in e) d.take(e.take);
    else if ('call' in e) d.call(e.call);
    else if ('weather' in e) d.weather(e.weather);
    else if ('washUp' in e) (Array.isArray(e.washUp) ? d.washUp(e.washUp) : d.washUp(e.washUp.items, e.washUp.near));
    else if ('stones' in e) (typeof e.stones === 'number' ? d.stones(e.stones) : d.stones(e.stones.n, e.stones.near));
    else if ('strike' in e) d.strike();
    else if (d.full()) return d.think('think.full');
  }
}

/** The goals a list of effects reaches. */
export const goalsOf = (effects: readonly Effect[]): string[] => effects.flatMap((e) => ('reach' in e ? [e.reach] : []));

/** Where a list stands, which says what it may use: a hand on a thing (`rule`), or a quest as it starts (`start`). */
export type Where = 'rule' | 'start';
const ALLOWED: Record<Where, readonly string[]> = {
  rule: ['think', 'reach', 'give', 'take', 'call', 'room'],
  start: ['think', 'give', 'take', 'call', 'weather', 'washUp', 'stones', 'strike'],
};
const ALL = ['think', 'reach', 'give', 'take', 'call', 'room', 'weather', 'washUp', 'stones', 'strike'];
const NAMES: Record<Where, string> = { rule: 'an interaction', start: "a quest's start" };

/** The farthest `near` may say, in metres. */
const MAX_NEAR = 40;
/** Whether an effect's object form has no key but its own and a sensible `near` (or none). */
const nearOk = (v: any): boolean =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((k) => ['items', 'n', 'near'].includes(k)) && (v.near === undefined || (typeof v.near === 'number' && v.near >= 1 && v.near <= MAX_NEAR));

/** What a list's effects may name: the texts, the goals that exist, and the items the sea may wash up. */
export interface Known { loca: object; goals: readonly string[]; items: readonly string[] }

/** What is wrong with a list of effects, as lines starting with `label`; empty when it is fine. */
export function checkEffects(effects: unknown, where: Where, label: string, known: Known): string[] {
  if (!Array.isArray(effects) || !effects.length) return [`${label}: needs a list of effects`];
  const out: string[] = [];
  effects.forEach((e: any, k: number) => {
    const x = `${label}, effect ${k + 1}`;
    const keys = e && typeof e === 'object' ? Object.keys(e) : [];
    if (keys.length !== 1) return void out.push(`${x}: needs exactly one of ${ALL.join(', ')}`);
    const [key] = keys;
    const v = e[key];
    if (!ALL.includes(key)) return void out.push(`${x}: unknown effect "${key}"`);
    if (!ALLOWED[where].includes(key)) return void out.push(`${x}: "${key}" is not for ${NAMES[where]}`);
    if (key === 'think' && !(typeof v === 'string' && LOCA_ID.test(v) && v in known.loca)) out.push(`${x}: unknown text "${v}"`);
    else if (key === 'reach' && !known.goals.includes(v)) out.push(`${x}: unknown goal "${v}"`);
    else if (key === 'give' && !BAG_ITEMS.includes(v)) out.push(`${x}: unknown item "${v}"`);
    else if (key === 'take' && !isThing(v)) out.push(`${x}: unknown thing "${v}"`);
    else if (key === 'call' && !HANDLERS.includes(v)) out.push(`${x}: unknown handler "${v}"`);
    else if (key === 'room' && v !== true) out.push(`${x}: room is written as true`);
    else if (key === 'weather' && !KINDS.includes(v)) out.push(`${x}: unknown weather "${v}"`);
    else if (key === 'washUp') {
      const items = Array.isArray(v) ? v : v?.items;
      if (!Array.isArray(items) || !items.length || items.some((it: unknown) => typeof it !== 'string' || !known.items.includes(it))) out.push(`${x}: unknown wash-up in ${JSON.stringify(items)}`);
      if (!Array.isArray(v) && !nearOk(v)) out.push(`${x}: wash-up is a list, or items and near (1–${MAX_NEAR} metres)`);
    } else if (key === 'stones') {
      const n = typeof v === 'object' && v ? v.n : v;
      if (!(Number.isInteger(n) && n >= 1 && n <= 10)) out.push(`${x}: stones must be 1–10`);
      if (typeof v === 'object' && !nearOk(v)) out.push(`${x}: stones is a number, or n and near (1–${MAX_NEAR} metres)`);
    }
    else if (key === 'strike' && v !== true) out.push(`${x}: strike is written as true`);
  });
  return out;
}
