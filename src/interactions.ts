// What the survivor does with what is in hand on a thing in the world: a stone on the crate, the axe on a palm, a stick
// on the burning stump. The rules are data (content/interactions.json), tried in order, the first that fits wins, and
// each is a short list of effects: a thought, a goal reached, a thing into the bag, or a named handler for what only the
// game can do (a crate falling apart, a palm cut down). Plain rules, no page or engine code, so the tests can use them.
import data from './content/interactions.json' with { type: 'json' };
import { BAG_ITEMS, type BagItem } from './crafts.ts';
import { GOALS, LOCA_ID, type Goal } from './quests.ts';

/** The things in the world a hand can act on. */
export const TARGETS = ['crate', 'palm', 'stump', 'drift'] as const;
export type Target = (typeof TARGETS)[number];

/** What a rule may ask about the thing acted on or the game (answered by main.ts). */
export const CONDITIONS = ['tall', 'byHut', 'wantsFire'] as const;
export type Condition = (typeof CONDITIONS)[number];

/** What only the game can do, by name (main.ts has one function for each). Everything else is an effect in the data. */
export const HANDLERS = ['smashCrate', 'priseCrate', 'removeItem', 'fell', 'lightTorch', 'lightFire'] as const;
export type Handler = (typeof HANDLERS)[number];

/** What a hand holds: an item, or 'empty'. */
export type Held = BagItem | 'empty';
export const HELD: readonly string[] = [...BAG_ITEMS, 'empty'];

/** One step of a rule, in the order written: say a thought (a text id), reach a quest goal, put a thing in the bag, run a handler, or stop with "the bag is full" if it has no room. */
export type Effect = { think: string } | { reach: Goal } | { give: BagItem } | { call: Handler } | { room: true };

export interface Rule {
  on: Target;
  /** One item, a list of them, or 'empty'; left out, any hand (and an empty one). */
  hand?: Held | Held[];
  /** Conditions that must hold / must not hold. */
  when?: Condition | Condition[];
  unless?: Condition | Condition[];
  do: Effect[];
}

export const RULES = data as Rule[];

const list = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/** The first rule for `on` that fits what is in `hand` (null: empty) and the conditions `is` answers; none if no rule fits. */
export function ruleFor(on: Target, hand: BagItem | null, is: (c: Condition) => boolean, rules: readonly Rule[] = RULES): Rule | null {
  const held: Held = hand ?? 'empty';
  return rules.find((r) => r.on === on && (r.hand === undefined || list(r.hand).includes(held)) && list(r.when).every(is) && !list(r.unless).some(is)) ?? null;
}

/** What a rule's effects work on: the game, as far as they need it. */
export interface Doer {
  think(id: string): void;
  reach(goal: Goal): void;
  give(item: BagItem): void;
  /** Whether the bag is full. */
  full(): boolean;
  call(handler: Handler): void;
}

/** Does a rule's effects in order. A `room` effect with a full bag says so and stops there. */
export function run(rule: Rule, d: Doer): void {
  for (const e of rule.do) {
    if ('think' in e) d.think(e.think);
    else if ('reach' in e) d.reach(e.reach);
    else if ('give' in e) d.give(e.give);
    else if ('call' in e) d.call(e.call);
    else if (d.full()) return d.think('think.full');
  }
}

/** What is wrong with the rules, as lines; empty when they are fine. `loca` is the table of texts. */
export function checkRules(rules: unknown, loca: object): string[] {
  const out: string[] = [];
  if (!Array.isArray(rules)) return ['interactions: not a list'];
  const known = (id: unknown) => typeof id === 'string' && LOCA_ID.test(id) && id in loca;
  const ok: Rule[] = [];
  rules.forEach((r: any, n: number) => {
    const w = `interaction ${n + 1}`;
    if (!r || typeof r !== 'object') return void out.push(`${w}: not an object`);
    const before = out.length;
    if (!TARGETS.includes(r.on)) out.push(`${w}: unknown target "${r.on}"`);
    for (const h of list<unknown>(r.hand)) if (!HELD.includes(h as string)) out.push(`${w}: unknown hand "${h}"`);
    for (const key of ['when', 'unless'] as const) {
      for (const c of list<unknown>(r[key])) if (!CONDITIONS.includes(c as Condition)) out.push(`${w}: unknown condition "${c}" in ${key}`);
    }
    if (!Array.isArray(r.do) || !r.do.length) out.push(`${w}: needs a list of effects in "do"`);
    else {
      r.do.forEach((e: any, k: number) => {
        const x = `${w}, effect ${k + 1}`;
        const keys = e && typeof e === 'object' ? Object.keys(e) : [];
        if (keys.length !== 1) return void out.push(`${x}: needs exactly one of think, reach, give, call, room`);
        const [key] = keys;
        const v = e[key];
        if (key === 'think' && !known(v)) out.push(`${x}: unknown text "${v}"`);
        else if (key === 'reach' && !GOALS.includes(v)) out.push(`${x}: unknown goal "${v}"`);
        else if (key === 'give' && !BAG_ITEMS.includes(v)) out.push(`${x}: unknown item "${v}"`);
        else if (key === 'call' && !HANDLERS.includes(v)) out.push(`${x}: unknown handler "${v}"`);
        else if (key === 'room' && v !== true) out.push(`${x}: room is written as true`);
        else if (!['think', 'reach', 'give', 'call', 'room'].includes(key)) out.push(`${x}: unknown effect "${key}"`);
      });
    }
    if (out.length === before) {
      // A rule that an earlier one for the same target always wins over can never run.
      const hands = list(r.hand);
      const shadow = ok.find((q) => q.on === r.on && !list(q.when).length && !list(q.unless).length && (q.hand === undefined || (hands.length > 0 && hands.every((h) => list(q.hand).includes(h)))));
      if (shadow) out.push(`${w}: never reached, an earlier rule for "${r.on}" always fits first`);
      ok.push(r);
    }
  });
  return out;
}
