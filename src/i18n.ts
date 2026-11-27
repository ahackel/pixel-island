// Every text of the game, by id, from content/loca.json.
import { currentLang, fill } from '@pixel/shared/lang.ts';
import loca from './content/loca.json' with { type: 'json' };
import { BUNDLES } from './islands.ts';
import type { Loca } from './quests.ts';

/** The ids the code itself names; data (the quests and rules) may name any id in the table. */
export type Key = keyof typeof loca;
/** The game's texts and those each island's content brings (their ids do not overlap: islands.test.ts). */
const LOCA: Loca = Object.assign({}, loca, ...BUNDLES.map((b) => b.loca));
/** A text in the current language, else in English, else its id (so a missing one shows). */
export function t(id: string, values?: Record<string, string | number>): string {
  const e = LOCA[id];
  return fill((e?.[currentLang()] || e?.en) ?? id, values);
}
