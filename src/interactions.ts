// What the survivor does with what is in hand on a thing in the world: a stone on the crate, the axe on a palm, a stick
// on the burning stump. The rules are data (content/interactions.json), tried in order, the first that fits wins, and
// each is a list of effects (effects.ts): a thought, a goal reached, a thing into the bag, or a named handler for what only
// the game can do (a crate falling apart, a palm cut down). Plain rules, no page or engine code, so the tests can use them.
import data from './content/interactions.json' with { type: 'json' };
import { BAG_ITEMS, type BagItem } from './crafts.ts';
import { checkEffects, type Effect } from './effects.ts';

/** The things in the world a hand can act on. */
export const TARGETS = ['crate', 'palm', 'stump', 'drift'] as const;
export type Target = (typeof TARGETS)[number];

/** What a rule may ask about the thing acted on or the game (answered by main.ts). */
export const CONDITIONS = ['tall', 'byHut', 'wantsFire'] as const;
export type Condition = (typeof CONDITIONS)[number];

/** What a hand holds: an item, or 'empty'. */
export type Held = BagItem | 'empty';
export const HELD: readonly string[] = [...BAG_ITEMS, 'empty'];

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

/** What is wrong with the rules, as lines; empty when they are fine. `loca` is the table of texts, `goals` every goal that exists (see quests.ts). */
export function checkRules(rules: unknown, loca: object, goals: readonly string[]): string[] {
  const out: string[] = [];
  if (!Array.isArray(rules)) return ['interactions: not a list'];
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
    out.push(...checkEffects(r.do, 'rule', w, { loca, goals, items: [] }));
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
