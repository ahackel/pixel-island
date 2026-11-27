// The one vocabulary of what happens in the game's content. An interaction (a hand on a thing, interactions.ts) and a
// quest as it starts (quests.ts) are both short lists of these effects, done in the order written. What an effect does
// to the game is main.ts's (the `Doer`); what a list may say, and its checks, are here. Plain rules, no page or engine
// code, so the tests can use them.
import { BAG_ITEMS, type BagItem } from './crafts.ts';

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
 * - `call`: a named handler (`HANDLERS`).
 * - `room`: stop here, saying so, if the bag is full.
 * - `weather`: the weather that lasts from now.
 * - `washUp`: things the sea leaves on the beach.
 * - `stones`: stones laid on the beach; from then on there is always one to find.
 * - `strike`: lightning waits to strike a palm.
 */
export type Effect =
  | { think: string }
  | { reach: string }
  | { give: BagItem }
  | { call: Handler }
  | { room: true }
  | { weather: Kind }
  | { washUp: string[] }
  | { stones: number }
  | { strike: true };

/** What an effect does to the game. */
export interface Doer {
  think(id: string): void;
  reach(goal: string): void;
  give(item: BagItem): void;
  /** Whether the bag is full. */
  full(): boolean;
  call(handler: Handler): void;
  weather(kind: Kind): void;
  washUp(items: readonly string[]): void;
  stones(n: number): void;
  strike(): void;
}

/** A doer that does nothing: spread it and fill in what matters (`{ ...idle, stones }`). */
export const idle: Doer = {
  think() {}, reach() {}, give() {}, full: () => false, call() {}, weather() {}, washUp() {}, stones() {}, strike() {},
};

/** Does effects in order. A `room` effect with a full bag says so and stops there. */
export function run(effects: readonly Effect[], d: Doer): void {
  for (const e of effects) {
    if ('think' in e) d.think(e.think);
    else if ('reach' in e) d.reach(e.reach);
    else if ('give' in e) d.give(e.give);
    else if ('call' in e) d.call(e.call);
    else if ('weather' in e) d.weather(e.weather);
    else if ('washUp' in e) d.washUp(e.washUp);
    else if ('stones' in e) d.stones(e.stones);
    else if ('strike' in e) d.strike();
    else if (d.full()) return d.think('think.full');
  }
}

/** The goals a list of effects reaches. */
export const goalsOf = (effects: readonly Effect[]): string[] => effects.flatMap((e) => ('reach' in e ? [e.reach] : []));

/** Where a list stands, which says what it may use: a hand on a thing (`rule`), or a quest as it starts (`start`). */
export type Where = 'rule' | 'start';
const ALLOWED: Record<Where, readonly string[]> = {
  rule: ['think', 'reach', 'give', 'call', 'room'],
  start: ['think', 'give', 'call', 'weather', 'washUp', 'stones', 'strike'],
};
const ALL = ['think', 'reach', 'give', 'call', 'room', 'weather', 'washUp', 'stones', 'strike'];
const NAMES: Record<Where, string> = { rule: 'an interaction', start: "a quest's start" };

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
    else if (key === 'call' && !HANDLERS.includes(v)) out.push(`${x}: unknown handler "${v}"`);
    else if (key === 'room' && v !== true) out.push(`${x}: room is written as true`);
    else if (key === 'weather' && !KINDS.includes(v)) out.push(`${x}: unknown weather "${v}"`);
    else if (key === 'washUp' && (!Array.isArray(v) || !v.length || v.some((it: unknown) => typeof it !== 'string' || !known.items.includes(it)))) out.push(`${x}: unknown wash-up in ${JSON.stringify(v)}`);
    else if (key === 'stones' && !(Number.isInteger(v) && v >= 1 && v <= 10)) out.push(`${x}: stones must be 1–10`);
    else if (key === 'strike' && v !== true) out.push(`${x}: strike is written as true`);
  });
  return out;
}
