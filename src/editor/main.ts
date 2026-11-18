// The day editor: what happens on each day (weather, what washes up, coconuts and driftwood,
// the morning thought, timed events) and the texts those name by loca id. Edits a copy of
// content/days.json and loca.json and saves both through the dev server (vite.config.ts).
// Its own interface is English only: it is a developer's tool, not part of the game.
import './style.css';
import { button, h } from '@pixel/shared/shell.ts';
import { ITEMS } from '@pixel/engine/world/props.ts';
import days from '../content/days.json' with { type: 'json' };
import loca from '../content/loca.json' with { type: 'json' };
import { LOOSE } from '../crafts.ts';
import { checkContent, EVENT_KINDS, KINDS, LOCA_ID, MAX_AT, type DayEvent, type DayPlan, type Days, type Loca } from '../days.ts';

/** What the sea can bring: a crate to stand on the beach, or small things to pick up. */
const ITEM_IDS = [...ITEMS.map((it) => it.id as string), ...LOOSE];
/** The arc in DESIGN.md is about 15 days; the list always shows that many and one past the last planned. */
const MIN_DAYS = 15;

let state: { days: Days; loca: Loca } = structuredClone({ days: days as Days, loca: loca as Loca });
let savedJson = JSON.stringify(state);
let tab: 'days' | 'texts' = location.hash === '#texts' ? 'texts' : 'days';
let day = Math.max(1, Number(location.hash.match(/^#day(\d+)$/)?.[1]) || 1);
let filter = '';

const root = document.getElementById('editor')!;
const dirty = () => JSON.stringify(state) !== savedJson;
addEventListener('beforeunload', (e) => { if (dirty()) e.preventDefault(); });

/** The day's plan, created when first edited; an empty plan is dropped so the file stays short. */
const plan = (n: number): DayPlan => (state.days[n] ??= {});
function tidy(): void {
  for (const [n, p] of Object.entries(state.days)) {
    for (const k of Object.keys(p) as (keyof DayPlan)[]) if (p[k] === undefined || (Array.isArray(p[k]) && !(p[k] as unknown[]).length)) delete p[k];
    if (!Object.keys(p).length) delete state.days[n];
  }
}
function change(fn: () => void): void {
  fn();
  tidy();
  render();
}

/** Where texts are used, by id, so a used one is not deleted. */
function uses(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (id: string, where: string) => out.set(id, [...(out.get(id) ?? []), where]);
  for (const [n, p] of Object.entries(state.days)) {
    if (p.thought) add(p.thought, `day ${n}`);
    p.events?.forEach((e) => e.do === 'thought' && add(e.text, `day ${n}`));
  }
  return out;
}

async function save(): Promise<boolean> {
  const problems = checkContent(state.days, state.loca, ITEM_IDS);
  if (problems.length) return alert(problems.join('\n')), false;
  const res = await fetch('/__content', { method: 'POST', body: JSON.stringify(state) }).catch(() => null);
  if (!res?.ok) return alert(`Not saved: ${res ? await res.text() : 'no dev server'}`), false;
  savedJson = JSON.stringify(state);
  render();
  return true;
}

// ------------------------------------------------------------------ parts

function select(value: string, options: [string, string][], on: (v: string) => void, label: string): HTMLSelectElement {
  const s = h('select', { 'aria-label': label });
  s.append(...options.map(([v, words]) => Object.assign(h('option', { value: v }, words), { selected: v === value })));
  s.addEventListener('change', () => on(s.value));
  return s;
}

function numberInput(value: number | undefined, placeholder: string, lo: number, hi: number, step: number, on: (v: number | undefined) => void, label: string): HTMLInputElement {
  const i = h('input', { type: 'number', min: String(lo), max: String(hi), step: String(step), placeholder, 'aria-label': label });
  i.value = value === undefined ? '' : String(value);
  i.addEventListener('change', () => {
    const v = i.value === '' ? undefined : Math.min(hi, Math.max(lo, Number(i.value)));
    change(() => on(v));
  });
  return i;
}

/** A text box that writes as it is typed, without redrawing (so it keeps focus). */
function textInput(value: string, on: (v: string) => void, attrs: Record<string, string>): HTMLInputElement {
  const i = h('input', { type: 'text', ...attrs });
  i.value = value;
  i.addEventListener('input', () => {
    on(i.value);
    status();
  });
  return i;
}

/** Asks for a new text id, suggesting one; null if cancelled or taken. */
function newText(suggest: string): string | null {
  let id = suggest;
  for (let n = 2; id in state.loca; n++) id = `${suggest}${n}`;
  const got = prompt('Id of the new text (letters, digits, . _ -):', id)?.trim();
  if (!got) return null;
  if (!LOCA_ID.test(got)) return alert(`"${got}" is not a usable id.`), null;
  if (got in state.loca) return alert(`"${got}" exists already; pick it from the list.`), null;
  state.loca[got] = { en: '', de: '' };
  return got;
}

/** Thoughts are the texts whose id starts so; the rest is the game's interface. */
const THOUGHT = 'think.';
const thoughts = () => Object.keys(state.loca).filter((id) => id.startsWith(THOUGHT)).sort();

/** Picks a thought by id, or makes a new one, and edits its English and German right there. */
function textPicker(id: string | undefined, none: string | null, suggest: string, on: (id: string | undefined) => void): HTMLElement {
  const ids = thoughts();
  if (id && !ids.includes(id)) ids.unshift(id);
  const options: [string, string][] = [...(none === null ? [] : [['', none] as [string, string]]), ...ids.map((k) => [k, k] as [string, string]), ['+new', '+ new text…']];
  const box = h('div', { class: 'text-pick' }, select(id ?? '', options, (v) => {
    if (v !== '+new') return change(() => on(v || undefined));
    const made = newText(suggest);
    change(() => made && on(made));
  }, 'Text'));
  const e = id ? state.loca[id] : undefined;
  if (id && e) {
    box.append(
      h('label', {}, h('span', {}, 'EN'), textInput(e.en, (v) => (e.en = v), { 'aria-label': 'English' })),
      h('label', {}, h('span', {}, 'DE'), textInput(e.de ?? '', (v) => (e.de = v), { 'aria-label': 'German', placeholder: e.en })),
    );
  } else if (id) box.append(h('p', { class: 'warn' }, `Unknown text "${id}".`));
  return box;
}

const row = (name: string, ...children: (Node | string)[]) => h('div', { class: 'field' }, h('div', { class: 'field__name' }, name), h('div', { class: 'field__value' }, ...children));
const remove = (label: string, on: () => void) => button({ class: 'small', 'aria-label': label, title: label }, () => change(on), '✕');

// ------------------------------------------------------------------ the day

function summary(p: DayPlan | undefined): string {
  if (!p) return '';
  return [p.weather, ...(p.washUps ?? []), p.events?.length ? `${p.events.length} event${p.events.length > 1 ? 's' : ''}` : '', p.thought ? '💬' : '']
    .filter(Boolean).join(' · ');
}

function eventRow(n: number, e: DayEvent, k: number): HTMLElement {
  const events = plan(n).events!;
  const set = (next: DayEvent) => change(() => (events[k] = next));
  const kind = select(e.do, EVENT_KINDS.map((d) => [d, { thought: 'Thought', washUp: 'Wash-up', strike: 'Lightning strike' }[d]]), (d) => {
    if (d === 'thought') set({ at: e.at, do: 'thought', text: thoughts()[0] });
    else if (d === 'washUp') set({ at: e.at, do: 'washUp', item: ITEM_IDS[0] });
    else set({ at: e.at, do: 'strike' });
  }, 'Kind');
  const at = numberInput(e.at, '0', 0, MAX_AT, 0.5, (v) => (events[k] = { ...e, at: v ?? 0 }), 'Minute');
  const what = e.do === 'thought' ? textPicker(e.text, null, `${THOUGHT}day${n}.event${k + 1}`, (id) => id && set({ ...e, text: id }))
    : e.do === 'washUp' ? select(e.item, ITEM_IDS.map((i) => [i, i]), (item) => set({ ...e, item }), 'Item')
    : h('span', { class: 'muted' }, 'the tallest palm nearest the survivor burns (only once a game)');
  return h('div', { class: 'event' }, h('label', { class: 'at' }, at, h('span', {}, 'min')), kind, what, remove('Remove event', () => events.splice(k, 1)));
}

function dayForm(n: number): HTMLElement {
  const p = state.days[n] ?? {};
  const washUps = p.washUps ?? [];
  const events = p.events ?? [];
  return h('section', { class: 'form' },
    h('header', { class: 'form__head' },
      h('h2', {}, `Day ${n}`),
      button({ class: 'primary' }, async () => { if (!dirty() || (await save())) open(`../?day=${n}&cheats`, 'pixel-island'); }, '▶ Play this day'),
    ),
    h('p', { class: 'muted' }, 'Anything left empty keeps the game’s own rule.'),
    row('Weather', select(p.weather ?? '', [['', 'auto (random, a step from yesterday)'], ...KINDS.map((k) => [k, k] as [string, string])], (v) => change(() => (plan(n).weather = (v || undefined) as DayPlan['weather'])), 'Weather')),
    row('Coconuts', numberInput(p.coconuts, n === 1 ? '2' : '1', 0, 10, 1, (v) => (plan(n).coconuts = v), 'Coconuts'), h('span', { class: 'muted' }, 'fall from the palms this morning (at most 3 under one)')),
    row('Driftwood', numberInput(p.wood, '2', 0, 10, 1, (v) => (plan(n).wood = v), 'Driftwood'), h('span', { class: 'muted' }, 'washes up this morning (at most 4 lying)')),
    row('Washes up',
      ...washUps.map((item, k) => h('div', { class: 'line' }, select(item, ITEM_IDS.map((i) => [i, i]), (v) => change(() => (plan(n).washUps![k] = v)), 'Item'), remove('Remove', () => plan(n).washUps!.splice(k, 1)))),
      button({ class: 'small' }, () => change(() => (plan(n).washUps ??= []).push(ITEM_IDS[0])), '+ item'),
    ),
    row('Morning thought', textPicker(p.thought, 'auto (what washed up, or the weather)', `${THOUGHT}day${n}.morning`, (id) => (plan(n).thought = id))),
    row('Events',
      h('p', { class: 'muted' }, `Game minutes after the morning: the day lasts 10, sunset at 9, night from 10:30 on.`),
      ...events.map((e, k) => eventRow(n, e, k)),
      button({ class: 'small' }, () => change(() => (plan(n).events ??= []).push({ at: 1, do: 'thought', text: thoughts()[0] })), '+ event'),
    ),
  );
}

function daysTab(): HTMLElement {
  const last = Math.max(MIN_DAYS, ...Object.keys(state.days).map(Number), day) + 1;
  const list = h('nav', { class: 'days' }, ...Array.from({ length: last }, (_, k) => {
    const n = k + 1;
    const b = button({ class: n === day ? 'day on' : 'day' }, () => { day = n; history.replaceState(null, '', `#day${n}`); render(); },
      h('b', {}, `Day ${n}`), h('span', {}, summary(state.days[n])));
    return b;
  }));
  return h('div', { class: 'split' }, list, dayForm(day));
}

// ------------------------------------------------------------------ the texts

function textsTab(): HTMLElement {
  const used = uses();
  const q = filter.toLowerCase();
  const ids = Object.keys(state.loca).sort().filter((id) => !q || [id, state.loca[id].en, state.loca[id].de ?? ''].some((s) => s.toLowerCase().includes(q)));
  const search = textInput(filter, (v) => { filter = v; }, { placeholder: 'Search ids and texts', 'aria-label': 'Search', class: 'search' });
  search.addEventListener('change', render);
  return h('section', { class: 'form texts' },
    h('header', { class: 'form__head' }, h('h2', {}, 'Texts'), search, button({ class: 'small' }, () => { const id = newText('think.new'); if (id) { filter = id; render(); } }, '+ new text')),
    h('p', { class: 'muted' }, 'Every text of the game, by id. The code names some ids; days name any. German left empty falls back to English.'),
    h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Id'), h('th', {}, 'English'), h('th', {}, 'German'), h('th', {}, 'Used by days'), h('th', {}))),
      h('tbody', {}, ...ids.map((id) => {
        const e = state.loca[id];
        const where = used.get(id);
        return h('tr', {},
          h('td', {}, h('code', {}, id)),
          h('td', {}, textInput(e.en, (v) => (e.en = v), { 'aria-label': `${id} English` })),
          h('td', { class: e.de ? '' : 'missing' }, textInput(e.de ?? '', (v) => (e.de = v), { 'aria-label': `${id} German`, placeholder: 'missing' })),
          h('td', { class: 'muted' }, where?.join(', ') ?? ''),
          // shortcut: ids the code names are not known here, so deleting one shows the id in the game; check src before deleting non-day texts.
          h('td', {}, where ? '' : remove(`Delete ${id}`, () => { if (confirm(`Delete text "${id}"? Code that names it will show the id instead.`)) delete state.loca[id]; })),
        );
      })),
    ),
  );
}

// ------------------------------------------------------------------ the page

const saveButton = button({ class: 'primary' }, () => void save(), 'Save');
const state_ = h('span', { class: 'status' });
function status(): void {
  const d = dirty();
  saveButton.disabled = !d;
  state_.textContent = d ? 'Unsaved changes' : 'Saved';
  state_.classList.toggle('dirty', d);
}

function render(): void {
  const tabs = h('div', { class: 'modes' },
    button({ class: tab === 'days' ? 'on' : '' }, () => { tab = 'days'; history.replaceState(null, '', `#day${day}`); render(); }, 'Days'),
    button({ class: tab === 'texts' ? 'on' : '' }, () => { tab = 'texts'; history.replaceState(null, '', '#texts'); render(); }, 'Texts'),
  );
  const scroll = root.querySelector('.form')?.scrollTop ?? 0;
  root.replaceChildren(
    h('header', { class: 'top' }, h('h1', {}, 'Pixel Island · Days'), tabs, h('span', { class: 'spacer' }), state_,
      button({}, () => { if (!dirty() || confirm('Throw away unsaved changes?')) { savedJson = JSON.stringify(state); location.reload(); } }, 'Revert'), saveButton),
    tab === 'days' ? daysTab() : textsTab(),
  );
  const form = root.querySelector('.form');
  if (form) form.scrollTop = scroll;
  status();
}
render();
