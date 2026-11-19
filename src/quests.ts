// The story as a chain of quests (content/quests.json), one at a time. Each quest counts only what happens while it
// is the current one, and brings with it what its task needs (stones, the hammer, the vine, ...), so no task can be
// done before its quest. A finished quest hands over to the next one the following morning, or at once if the next
// says `now`, or in the night before if it says `night`. Plain data and rules, no page or engine code, so the tests can use it.
import data from './content/quests.json' with { type: 'json' };

export const KINDS = ['sunny', 'cloudy', 'windy', 'fog', 'rain', 'storm'] as const;
export type Kind = (typeof KINDS)[number];

/** What a quest waits for; the game reports each as it happens. */
export const GOALS = ['eat', 'sleep', 'fish', 'crab', 'open', 'hut', 'stormSleep', 'campfire', 'log', 'sail'] as const;
export type Goal = (typeof GOALS)[number];

/** The pictures a quest can show in the corner (see main.ts). */
export const QUEST_ICONS = ['coconut', 'moon', 'fish', 'crab', 'crate', 'hammer', 'storm', 'fire', 'axe', 'raft'] as const;
export type QuestIcon = (typeof QUEST_ICONS)[number];

export interface Quest {
  id: string;
  goal: Goal;
  /** How many times the goal must happen (1 if left out). */
  count?: number;
  /** Starts as soon as the quest before is done, not the next morning. */
  now?: boolean;
  /** Starts in the night after the quest before is done: the survivor is woken by it (the storm). */
  night?: boolean;
  /** The weather on every day the quest runs (else a fair one). */
  weather?: Kind;
  /** What the sea leaves on the beach when the quest starts. */
  washUps?: string[];
  /** Stones laid on the beach when it starts; from then on there is always one to find. */
  stones?: number;
  /** Lightning strikes a palm when it starts: the first fire. */
  strike?: boolean;
  icon: QuestIcon;
  /** Said when it starts, and again at a tap on its icon: a loca id. */
  thought: string;
}

export const QUESTS = data as Quest[];

/** Where the story stands: the quest under way, how often its goal has happened, and whether it is done. */
export interface Progress { quest: number; count: number; done: boolean }

export const startProgress = (): Progress => ({ quest: 0, count: 0, done: false });

/** After `goal` happened once. Only the current quest's own goal counts; a done quest waits for its morning. */
export function advance(p: Progress, goal: Goal, quests: readonly Quest[] = QUESTS): Progress {
  const q = quests[p.quest];
  if (!q || p.done || q.goal !== goal) return p;
  const count = p.count + 1;
  return { ...p, count, done: count >= (q.count ?? 1) };
}

/**
 * The quest that should be under way now: a done quest gives way to the next at `morning`, or at once if the next one
 * says `now`. Returns the same progress if nothing starts.
 */
export function next(p: Progress, morning: boolean, quests: readonly Quest[] = QUESTS): Progress {
  const after = quests[p.quest + 1];
  if (!p.done || !after || (!morning && !after.now)) return p;
  return { quest: p.quest + 1, count: 0, done: false };
}

/** Whether a quest that brings stones has started: then a stone is always to be found. */
export const stonesOut = (quest: number, quests: readonly Quest[] = QUESTS) => quests.slice(0, quest + 1).some((q) => q.stones);

/** A text in every language, by id. A missing language falls back to English. */
export type Loca = Record<string, { en: string; de?: string }>;
export const LOCA_ID = /^[A-Za-z][\w.-]*$/;

/** What is wrong with the quests and texts, as lines; empty when they are fine. `items` are the known wash-up ids. */
export function checkContent(quests: unknown, loca: unknown, items: readonly string[]): string[] {
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
    if (!GOALS.includes(q.goal)) out.push(`${w}: unknown goal "${q.goal}"`);
    if (q.count !== undefined && !(Number.isInteger(q.count) && q.count >= 1 && q.count <= 20)) out.push(`${w}: count must be 1–20`);
    if (q.weather !== undefined && !KINDS.includes(q.weather)) out.push(`${w}: unknown weather "${q.weather}"`);
    if (q.stones !== undefined && !(Number.isInteger(q.stones) && q.stones >= 0 && q.stones <= 10)) out.push(`${w}: stones must be 0–10`);
    if (!QUEST_ICONS.includes(q.icon)) out.push(`${w}: unknown icon "${q.icon}"`);
    if (typeof q.thought !== 'string' || !(q.thought in (loca as object))) out.push(`${w}: unknown text "${q.thought}"`);
    if (q.washUps !== undefined && (!Array.isArray(q.washUps) || q.washUps.some((it: unknown) => typeof it !== 'string' || !items.includes(it)))) {
      out.push(`${w}: unknown wash-up in ${JSON.stringify(q.washUps)}`);
    }
  });
  return out;
}
