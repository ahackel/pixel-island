// Every text of the game, by id, from content/loca.json.
import { currentLang, fill } from '@pixel/shared/lang.ts';
import loca from './content/loca.json' with { type: 'json' };
import type { Loca } from './quests.ts';

/** The ids the code itself names; data (quests.json) may name any id in the table. */
export type Key = keyof typeof loca;
const LOCA: Loca = loca;
/** A text in the current language, else in English, else its id (so a missing one shows). */
export function t(id: string, values?: Record<string, string | number>): string {
  const e = LOCA[id];
  return fill((e?.[currentLang()] || e?.en) ?? id, values);
}
