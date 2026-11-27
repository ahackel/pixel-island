// The islands' stories, one bundle each: its chain of quests, the interaction rules it adds to the shared ones
// (content/interactions.json), and the texts it brings. A game says which island's story it is on (`Game.story`), and
// everything that reads the quests asks the bundle. Plain data, so the tests can use it.
import firstQuests from './content/islands/first/quests.json' with { type: 'json' };
import rockyQuests from './content/islands/rocky/quests.json' with { type: 'json' };
import rockyLoca from './content/islands/rocky/loca.json' with { type: 'json' };
import { RULES, type Rule } from './interactions.ts';
import type { Loca, Quest } from './quests.ts';

export interface Bundle {
  id: string;
  quests: readonly Quest[];
  /** The island's own rules first, then the shared ones: the first rule that fits wins, so an island can override. */
  rules: readonly Rule[];
  /** Texts only this island's content names. */
  loca: Loca;
}

/** A bundle of `id` with its own `quests`, `rules` and `loca`; the shared rules follow its own. */
export const bundle = (id: string, quests: readonly Quest[], own: readonly Rule[] = [], loca: Loca = {}): Bundle => ({ id, quests, rules: [...own, ...RULES], loca });

/** The first island: the demo's week. */
export const FIRST = bundle('first', firstQuests as Quest[]);
/** The rocky island, so far as it is written (the rest is in content/drafts/island2). */
export const ROCKY = bundle('rocky', rockyQuests as Quest[], [], rockyLoca);

export const BUNDLES: readonly Bundle[] = [FIRST, ROCKY];
export const isStory = (id: unknown): id is string => BUNDLES.some((b) => b.id === id);
/** The bundle for a story id; the first island's for one nobody knows (a save from before there were bundles). */
export const bundleOf = (id: unknown): Bundle => BUNDLES.find((b) => b.id === id) ?? FIRST;
/** The quests of the story a game is on. */
export const questsOf = (g: { story: string }): readonly Quest[] => bundleOf(g.story).quests;
