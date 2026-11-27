// The story as a chain of quests (content/islands/<island>/quests.json, see islands.ts), one at a time. Each quest counts only what happens while it
// is the current one, and brings with it what its task needs (stones, the hammer, the vine, ...), so no task can be
// done before its quest. A finished quest hands over to the next one the following morning, or at once if the next
// says `now`, or in the night before if it says `night`. Plain data and rules, no page or engine code, so the tests can use it.
import { BAG_ITEMS, FOOD, isBagItem, RECIPES, type BagItem } from './crafts.ts';
import { checkEffects, goalsOf, KINDS, LOCA_ID, type Effect, type Kind } from './effects.ts';

export { KINDS, type Kind };

/** What a quest waits for: any name that something reports as it happens (see `CODE_GOALS`, and `reach` in interactions.json). */
export type Goal = string;
/** The goals the game's own code reports (main.ts); the others are reached by interaction rules. */
export const CODE_GOALS = ['eat', 'sleep', 'fish', 'crab', 'hut', 'stormSleep', 'log', 'sail'] as const;

/** The pictures a quest can show in the corner (see pictures.ts): any bag item's, and these. */
export const EXTRA_ICONS = ['moon', 'storm', 'raft'] as const;
export type QuestIcon = BagItem | (typeof EXTRA_ICONS)[number];
export const isQuestIcon = (x: unknown): x is QuestIcon => isBagItem(x) || EXTRA_ICONS.includes(x as (typeof EXTRA_ICONS)[number]);

export interface Quest {
  id: string;
  goal: Goal;
  /** How many times the goal must happen (1 if left out). */
  count?: number;
  /** Starts as soon as the quest before is done, not the next morning. */
  now?: boolean;
  /** Starts in the night after the quest before is done: the survivor is woken by it (the storm). */
  night?: boolean;
  /**
   * What happens as it starts, as effects (effects.ts): its weather (on every day it runs; else a fair one), what the sea
   * leaves on the beach, stones laid (from then on there is always one to find), lightning for a palm (the first fire).
   */
  start?: Effect[];
  icon: QuestIcon;
  /** Said when it starts, and again at a tap on its icon: a loca id. */
  thought: string;
}

/** Where the story stands: the quest under way, how often its goal has happened, and whether it is done. */
export interface Progress { quest: number; count: number; done: boolean }

export const startProgress = (): Progress => ({ quest: 0, count: 0, done: false });

/** After `goal` happened once. Only the current quest's own goal counts; a done quest waits for its morning. */
export function advance(p: Progress, goal: Goal, quests: readonly Quest[]): Progress {
  const q = quests[p.quest];
  if (!q || p.done || q.goal !== goal) return p;
  const count = p.count + 1;
  return { ...p, count, done: count >= (q.count ?? 1) };
}

/**
 * The quest that should be under way now: a done quest gives way to the next at `morning`, or at once if the next one
 * says `now`. Returns the same progress if nothing starts.
 */
export function next(p: Progress, morning: boolean, quests: readonly Quest[]): Progress {
  const after = quests[p.quest + 1];
  if (!p.done || !after || (!morning && !after.now)) return p;
  return { quest: p.quest + 1, count: 0, done: false };
}

/** The next quest while this one is done and that one waits for the morning (or the night): then the survivor should rest. */
export function waiting(p: Progress, quests: readonly Quest[]): Quest | null {
  const after = quests[p.quest + 1];
  return p.done && after && !after.now ? after : null;
}

/** The weather a quest brings when it starts, if it brings its own. */
export const weatherOf = (q: Quest | undefined): Kind | undefined => q?.start?.flatMap((e) => ('weather' in e ? [e.weather] : []))[0];

/** Whether a quest that brings stones has started: then a stone is always to be found. */
export const stonesOut = (quest: number, quests: readonly Quest[]) => quests.slice(0, quest + 1).some((q) => q.start?.some((e) => 'stones' in e));

/**
 * The goals the game reports of items by itself: `got:<item>` when a thing goes into the bag, `ate:<item>` when food is
 * eaten, and `made:<item>` when a recipe makes one (a rule may reach `made:` of its own, as cooking does).
 */
export const ITEM_GOALS = [...BAG_ITEMS.map((i) => `got:${i}`), ...BAG_ITEMS.filter((i) => FOOD[i]).map((i) => `ate:${i}`), ...RECIPES.map((r) => `made:${r.makes}`)];

/** Every goal something reports: the game's own, those about items, and those interaction rules reach. */
export const reportedGoals = (rules: readonly { do: readonly Effect[] }[]): string[] => [...CODE_GOALS, ...ITEM_GOALS, ...rules.flatMap((r) => goalsOf(r.do))];
/** Every goal a quest waits for. */
export const wantedGoals = (quests: readonly Quest[]): string[] => quests.map((q) => q.goal);
/** Every goal a rule may reach: all those the game reports, `made:` of any item (cooking), and those quests wait for. */
export const knownGoals = (quests: readonly Quest[]): string[] => [...CODE_GOALS, ...ITEM_GOALS, ...BAG_ITEMS.map((i) => `made:${i}`), ...wantedGoals(quests)];

/** A text in every language, by id. A missing language falls back to English. */
export type Loca = Record<string, { en: string; de?: string }>;

/** What is wrong with the quests and texts, as lines; empty when they are fine. `items` are the known wash-up ids, `reported` the goals something reports (`reportedGoals`). */
export function checkContent(quests: unknown, loca: unknown, items: readonly string[], reported: readonly string[]): string[] {
  const out: string[] = [];
  if (!loca || typeof loca !== 'object' || Array.isArray(loca)) return ['texts: not an object'];
  for (const [id, e] of Object.entries(loca as Record<string, any>)) {
    if (!LOCA_ID.test(id)) out.push(`text "${id}": bad id`);
    if (!e || typeof e.en !== 'string' || (e.de !== undefined && typeof e.de !== 'string')) out.push(`text "${id}": needs en (and de) strings`);
  }
  if (!Array.isArray(quests) || !quests.length) return [...out, 'quests: not a list'];
  const ids = new Set<string>();
  quests.forEach((q: any, n: number) => {
    const w = `quest ${n + 1}`;
    if (!q || typeof q !== 'object') return void out.push(`${w}: not an object`);
    if (typeof q.id !== 'string' || ids.has(q.id)) out.push(`${w}: missing or repeated id`);
    ids.add(q.id);
    if (!reported.includes(q.goal)) out.push(`${w}: nothing reports the goal "${q.goal}"`);
    if (q.count !== undefined && !(Number.isInteger(q.count) && q.count >= 1 && q.count <= 20)) out.push(`${w}: count must be 1–20`);
    if (q.start !== undefined) out.push(...checkEffects(q.start, 'start', w, { loca: loca as object, goals: reported, items }));
    if (!isQuestIcon(q.icon)) out.push(`${w}: unknown icon "${q.icon}"`);
    if (typeof q.thought !== 'string' || !(q.thought in (loca as object))) out.push(`${w}: unknown text "${q.thought}"`);
  });
  return out;
}
