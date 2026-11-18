// What happens on each day, written by the day editor (editor/) into content/days.json, and the texts
// in content/loca.json that its thoughts name by id. Plain data and checks, no page or engine code,
// so the dev server's save endpoint and the tests can use it too.
import data from './content/days.json' with { type: 'json' };

export const KINDS = ['sunny', 'cloudy', 'windy', 'fog', 'rain', 'storm'] as const;
export type Kind = (typeof KINDS)[number];

/** Something that happens `at` game minutes after the morning, once that day. */
export type DayEvent =
  | { at: number; do: 'thought'; text: string }
  | { at: number; do: 'washUp'; item: string }
  | { at: number; do: 'strike' };
export const EVENT_KINDS = ['thought', 'washUp', 'strike'] as const;

/** One day's script. Everything left out keeps the game's own rule. */
export interface DayPlan {
  /** The day's weather instead of the random pick. */
  weather?: Kind;
  /** Items (props ITEMS ids) the sea leaves on the beach this morning. */
  washUps?: string[];
  /** How many coconuts fall this morning (else 1; 2 on the first). */
  coconuts?: number;
  /** How many pieces of driftwood wash up this morning (else 2). */
  wood?: number;
  /** The morning's thought, a loca id (else one from what washed up and the weather). */
  thought?: string;
  events?: DayEvent[];
}
/** Day plans by day number. */
export type Days = Record<string, DayPlan>;

/** A text in every language, by id. A missing language falls back to English. */
export type Loca = Record<string, { en: string; de?: string }>;

export const DAYS = data as Days;
export const dayPlan = (day: number): DayPlan => DAYS[day] ?? {};

/** Game minutes an event may be set at: the day is 10, the night has no end. */
export const MAX_AT = 30;
export const LOCA_ID = /^[A-Za-z][\w.-]*$/;

const count = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10;

/** What is wrong with days and texts, as lines; empty when they are fine. `items` are the known wash-up ids (unchecked if left out). */
export function checkContent(days: unknown, loca: unknown, items?: readonly string[]): string[] {
  const out: string[] = [];
  if (!loca || typeof loca !== 'object' || Array.isArray(loca)) return ['texts: not an object'];
  for (const [id, e] of Object.entries(loca as Record<string, any>)) {
    if (!LOCA_ID.test(id)) out.push(`text "${id}": bad id`);
    if (!e || typeof e.en !== 'string' || (e.de !== undefined && typeof e.de !== 'string')) out.push(`text "${id}": needs en (and de) strings`);
  }
  const text = (where: string, id: unknown) => {
    if (typeof id !== 'string' || !(id in (loca as object))) out.push(`${where}: unknown text "${id}"`);
  };
  const item = (where: string, id: unknown) => {
    if (typeof id !== 'string' || (items && !items.includes(id))) out.push(`${where}: unknown item "${id}"`);
  };
  if (!days || typeof days !== 'object' || Array.isArray(days)) return [...out, 'days: not an object'];
  for (const [n, p] of Object.entries(days as Record<string, any>)) {
    const d = `day ${n}`;
    if (!/^[1-9]\d{0,2}$/.test(n)) out.push(`${d}: bad day number`);
    if (!p || typeof p !== 'object') { out.push(`${d}: not an object`); continue; }
    if (p.weather !== undefined && !KINDS.includes(p.weather)) out.push(`${d}: unknown weather "${p.weather}"`);
    if (p.coconuts !== undefined && !count(p.coconuts)) out.push(`${d}: coconuts must be 0–10`);
    if (p.wood !== undefined && !count(p.wood)) out.push(`${d}: wood must be 0–10`);
    if (p.thought !== undefined) text(`${d} thought`, p.thought);
    if (p.washUps !== undefined) {
      if (!Array.isArray(p.washUps)) out.push(`${d}: washUps must be a list`);
      else p.washUps.forEach((it: unknown) => item(`${d} wash-up`, it));
    }
    if (p.events !== undefined && !Array.isArray(p.events)) out.push(`${d}: events must be a list`);
    else (p.events ?? []).forEach((e: any, k: number) => {
      const w = `${d} event ${k + 1}`;
      if (!e || typeof e.at !== 'number' || !(e.at >= 0 && e.at <= MAX_AT)) out.push(`${w}: time must be 0–${MAX_AT} min`);
      if (!EVENT_KINDS.includes(e?.do)) out.push(`${w}: unknown kind "${e?.do}"`);
      if (e?.do === 'thought') text(w, e.text);
      if (e?.do === 'washUp') item(w, e.item);
    });
  }
  return out;
}
