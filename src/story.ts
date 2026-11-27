// Whether a story can be finished, from its data alone: walks the quests in order and, at each, works out what can be had
// by then (what earlier quests washed up or gave, what is always to be had, what recipes and rules make) and asks whether
// the quest's goal can be reached with that. It says what a goal lacks, so a quest that waits for something nothing
// brings, or brings too late, shows up in `npm test` and not in the middle of a game.
//
// It is a model of what main.ts does, small on purpose, and it can only be as true as that: it knows what is always to
// be had (NATURAL), what the game's own handlers yield (HANDLER_YIELDS) and what each goal the game's code reports takes
// (`codeGoal`). It does not count (four logs, four leaves) and does not use things up: what an earlier quest brought is
// taken to be still there. Plain data and rules, no page or engine code, so the tests can use it.
import { BUILDS, FISH_ITEMS, FOOD, holds, RECIPES, type BagItem, type BuildKind } from './crafts.ts';
import type { Handler } from './effects.ts';
import type { Rule } from './interactions.ts';
import { weatherOf, type Quest } from './quests.ts';

/** What every island always has: coconuts fall from the palms, the sea leaves sticks and driftwood each morning. */
export const NATURAL: readonly BagItem[] = ['coconut', 'wood', 'drift'];

/** What the game's handlers put on the ground or in the bag (main.ts): one entry for each, so a new handler must say. */
export const HANDLER_YIELDS: Record<Handler, readonly BagItem[]> = {
  smashCrate: ['rope', 'drift'],
  priseCrate: ['rope'],
  removeItem: [],
  fell: ['log'],
  lightTorch: ['fire'],
  lightFire: [],
};

/** What is to be had, and what stands in the world, at some point of the story. */
interface World {
  items: Set<BagItem>;
  /** A campfire can burn (a torch can be lit on driftwood). */
  lit: boolean;
  /** A crate has washed up. */
  crate: boolean;
  /** Lightning has struck a palm, which burns as a stump. */
  stump: boolean;
  /** Crabs have come out on a windy day. */
  windy: boolean;
  /** Goals that some rule that can be done reaches. */
  reached: Set<string>;
}

const list = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const have = (w: World, name: string) => holds([...w.items], name);

/** Why a rule cannot be done with what is to be had, or null if it can. */
function blocked(r: Rule, w: World): string | null {
  const target = { crate: w.crate, palm: true, stump: w.stump, drift: w.items.has('drift'), campfire: w.lit }[r.on];
  if (!target) return `no ${r.on === 'campfire' ? 'lit campfire' : r.on === 'stump' ? 'burning stump (no lightning)' : r.on === 'crate' ? 'crate' : r.on}`;
  const hands = list(r.hand).filter((h) => h !== 'empty');
  if (r.hand !== undefined && !list(r.hand).includes('empty') && !hands.some((h) => w.items.has(h as BagItem))) return `nothing to hold of ${hands.join(', ')}`;
  for (const c of list(r.when)) if (c.startsWith('has:') && !have(w, c.slice(4))) return `no ${c.slice(4)} in the bag`;
  for (const e of r.do) if ('take' in e && !have(w, e.take)) return `no ${e.take} to take`;
  return null;
}

/** Lets everything that follows from what is to be had happen, until nothing new does. */
function settle(w: World, rules: readonly Rule[]): void {
  for (let changed = true; changed;) {
    changed = false;
    const add = (item: BagItem) => {
      if (!w.items.has(item)) { w.items.add(item); changed = true; }
    };
    NATURAL.forEach(add);
    for (const r of RECIPES) if (r.needs.every((n) => w.items.has(n))) add(r.makes);
    if (w.items.has('spear')) FISH_ITEMS.forEach(add);
    if (w.windy) add('crab');
    for (const r of rules) {
      if (blocked(r, w)) continue;
      for (const e of r.do) {
        if ('give' in e) add(e.give);
        else if ('call' in e) {
          HANDLER_YIELDS[e.call].forEach(add);
          if (e.call === 'lightFire' && !w.lit) { w.lit = true; changed = true; }
        } else if ('reach' in e && !w.reached.has(e.reach)) { w.reached.add(e.reach); changed = true; }
      }
    }
  }
}

/** What a build takes: every item of its stages, and its tools. */
const buildItems = (kind: BuildKind): BagItem[] => [...new Set([...BUILDS[kind].stages.flat(), ...(('tools' in BUILDS[kind] ? BUILDS[kind].tools : []) as readonly BagItem[])])];
const lacks = (w: World, items: readonly BagItem[]) => items.filter((i) => !w.items.has(i));

/** What a goal the game's own code reports takes, as what is missing; null if it can be reached; undefined if it is not such a goal. */
function codeGoal(q: Quest, w: World, earlier: ReadonlySet<string>): string | null | undefined {
  const lacking = (items: readonly BagItem[]) => {
    const missing = lacks(w, items);
    return missing.length ? `nothing gives ${missing.join(', ')}` : null;
  };
  switch (q.goal) {
    case 'eat': return (Object.keys(FOOD) as BagItem[]).some((f) => w.items.has(f)) ? null : 'no food';
    case 'sleep': return null;
    case 'fish': return lacking(['spear']);
    case 'crab': return weatherOf(q) === 'windy' ? null : 'crabs come out only on a windy day, and this quest brings none';
    case 'log': return lacking(['axe']);
    case 'hut': return lacking(buildItems('hut'));
    case 'stormSleep': return !earlier.has('hut') ? 'no hut built before it' : weatherOf(q) === 'storm' ? null : 'there is no storm: the quest brings none';
    case 'sail': return lacking(buildItems('raft'));
    default: return undefined;
  }
}

/** What a goal waits for, as what is missing; null if it can be reached with what is to be had. */
function unreachable(q: Quest, rules: readonly Rule[], w: World, earlier: ReadonlySet<string>): string | null {
  if (w.reached.has(q.goal)) return null;
  const code = codeGoal(q, w, earlier);
  if (code !== undefined) return code;
  const [kind, item] = q.goal.split(':');
  if (kind === 'got' && item) return w.items.has(item as BagItem) ? null : `nothing gives ${item}`;
  if (kind === 'ate' && item) return w.items.has(item as BagItem) && FOOD[item as BagItem] ? null : `no ${item} to eat`;
  if (kind === 'made' && item) {
    const recipes = RECIPES.filter((r) => r.makes === item);
    if (recipes.some((r) => !lacks(w, r.needs).length)) return null;
    const missing = recipes.map((r) => `${r.needs.join(' + ')}: ${lacks(w, r.needs).join(', ')} missing`);
    const why = rules.filter((r) => r.do.some((e) => 'reach' in e && e.reach === q.goal)).map((r) => blocked(r, w)).filter(Boolean);
    return [...missing, ...why].join('; ') || `no recipe or rule makes ${item}`;
  }
  const why = rules.filter((r) => r.do.some((e) => 'reach' in e && e.reach === q.goal)).map((r) => blocked(r, w));
  return why.length ? `no rule that reaches it can be done: ${why.join('; ')}` : 'nothing reports it';
}

/**
 * What stops a story being finished, as lines; empty when every quest's goal can be reached, in order, with what the
 * quests before it and its own start bring.
 */
export function checkStory(quests: readonly Quest[], rules: readonly Rule[]): string[] {
  const out: string[] = [];
  const w: World = { items: new Set(), lit: false, crate: false, stump: false, windy: false, reached: new Set() };
  const earlier = new Set<string>();
  quests.forEach((q, k) => {
    for (const e of q.start ?? []) {
      if ('washUp' in e) {
        for (const item of Array.isArray(e.washUp) ? e.washUp : e.washUp.items) w.items.add(item as BagItem);
        if ((Array.isArray(e.washUp) ? e.washUp : e.washUp.items).includes('crate')) w.crate = true;
      } else if ('stones' in e) w.items.add('stone');
      else if ('give' in e) w.items.add(e.give);
      else if ('strike' in e) w.stump = true;
    }
    if (weatherOf(q) === 'windy') w.windy = true;
    settle(w, rules);
    const why = unreachable(q, rules, w, earlier);
    if (why) out.push(`quest ${k + 1} "${q.id}": the goal "${q.goal}" cannot be reached: ${why}`);
    earlier.add(q.goal);
  });
  return out;
}
