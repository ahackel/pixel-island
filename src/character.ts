// The character editor before each new game: the survivor as they were (or the default), changed a
// row at a time under four tabs, or rolled at random. A small wardrobe: no tools, the spear is built.
import { BROWS, EYE_SHAPES, HAIR_STYLES, HEAD_SHAPES } from '@pixel/engine/character/base.ts';
import { CATALOG, CLOTH_KEYS, entryById } from '@pixel/engine/character/catalog.ts';
import { HAIR_COLORS, lookOf, type State, type WornSlot } from '@pixel/engine/character/character.ts';
import { SHADOW, SKIN_KEYS } from '@pixel/engine/core/palette.ts';
import { STAND } from '@pixel/engine/core/poses.ts';
import { BUILDS, drawCharacter, SPRITE_W, type Facing } from '@pixel/engine/core/puppet.ts';
import { textWidth, text } from '@pixel/shared/pixel-font.ts';
import { panel, pixelCanvas } from '@pixel/shared/pixel-ui.ts';
import { t } from './i18n.ts';
import { C, caps, pixelButton, S } from './ui.ts';

type Value = string | boolean | null;
/** `none`: how often a roll leaves it at its first value (none, no, own colours). `unset`: what null is called. */
interface Row { key: string; values: readonly Value[]; get(s: State): Value; set(s: State, v: Value): void; none?: number; unset?: string }

const ids = (slot: string) => CATALOG.filter((e) => e.slot === slot && !e.id.startsWith('job-')).map((e) => e.id);
/** The palette colour a piece's own main colour is swapped for, or null for its own. */
const colorRow = (slot: WornSlot): Row => ({
  key: 'char.color',
  values: [null, ...CLOTH_KEYS],
  get: (s) => s.colors[slot]?.[entryById(s.worn[slot])?.colors[0] ?? 'white'] ?? null,
  set: (s, v) => {
    const own = entryById(s.worn[slot])?.colors[0];
    if (v && own) s.colors[slot] = { [own]: v as never };
    else delete s.colors[slot];
  },
  none: 0.5,
  unset: 'char.own',
});
const wornRow = (key: string, slot: WornSlot, optional: boolean, none = 0): Row => ({
  key,
  values: [...(optional ? [null] : []), ...ids(slot)],
  get: (s) => s.worn[slot],
  // A new piece starts in its own colours.
  set: (s, v) => { s.worn[slot] = v as string | null; delete s.colors[slot]; },
  none,
});

const TABS: { key: string; rows: Row[] }[] = [
  { key: 'char.body', rows: [
    { key: 'char.skin', values: SKIN_KEYS, get: (s) => s.skin, set: (s, v) => (s.skin = v as never) },
    { key: 'char.figure', values: ['m', 'f'], get: (s) => s.frame, set: (s, v) => (s.frame = v as 'm' | 'f') },
    { key: 'char.build', values: BUILDS.map((b) => b.id), get: (s) => s.build, set: (s, v) => (s.build = v as string) },
    { key: 'char.head', values: HEAD_SHAPES, get: (s) => s.face.shape ?? 'round', set: (s, v) => (s.face.shape = v as never) },
  ] },
  { key: 'char.face', rows: [
    { key: 'char.eyes', values: EYE_SHAPES, get: (s) => s.face.eyes, set: (s, v) => (s.face.eyes = v as never) },
    { key: 'char.brows', values: BROWS, get: (s) => s.face.brows, set: (s, v) => (s.face.brows = v as never) },
    { key: 'char.freckles', values: [false, true], get: (s) => s.face.freckles, set: (s, v) => (s.face.freckles = !!v), none: 0.7 },
    { key: 'char.glasses', values: [false, true], get: (s) => s.face.glasses, set: (s, v) => (s.face.glasses = !!v), none: 0.8 },
  ] },
  { key: 'char.hair', rows: [
    { key: 'char.hairStyle', values: [null, ...HAIR_STYLES.map((h) => h.id), ...ids('hair')], get: (s) => s.hair, set: (s, v) => (s.hair = v as string | null), none: 0.1 },
    { key: 'char.color', values: HAIR_COLORS, get: (s) => s.hairColor, set: (s, v) => (s.hairColor = v as never) },
    wornRow('char.beard', 'beard', true, 0.6),
  ] },
  { key: 'char.clothes', rows: [
    wornRow('char.top', 'top', false), colorRow('top'),
    wornRow('char.bottom', 'bottom', false), colorRow('bottom'),
    wornRow('char.hat', 'hat', true, 0.3),
  ] },
];

/** A whole new survivor: each row at random, the optional ones (beard, hat, own colours) often left as they come. */
function roll(s: State): void {
  for (const { rows } of TABS) for (const row of rows) {
    const first = row.values[0];
    const pick = (first === null || first === false) && Math.random() < (row.none ?? 0) ? first : row.values[Math.floor(Math.random() * row.values.length)];
    row.set(s, pick);
  }
}

/** What a row shows: none, yes or no, or which of how many. */
function shown(row: Row, s: State): string {
  const v = row.get(s);
  if (v === null) return t(row.unset ?? 'char.none');
  if (typeof v === 'boolean') return t(v ? 'char.yes' : 'char.no');
  const some = row.values.filter((x) => x !== null);
  return `${some.indexOf(v) + 1}/${some.length}`;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => Object.assign(document.createElement(tag), { className: cls });

/** The editor, starting from `start` (copied). `done` gets the survivor chosen; `back` goes back to the menu. */
export function characterEditor(start: State, done: (s: State) => void, back: () => void): HTMLElement {
  const s: State = structuredClone(start);
  s.worn.tool = null;
  const box = el('div', 'editor');

  // The survivor, slowly turning round.
  const SIZE = 56;
  const { canvas: stage, ctx } = pixelCanvas(SIZE, SIZE, S);
  stage.className = 'stage';
  let facing = 0;
  const paint = () => {
    const sprite = drawCharacter(lookOf(s), STAND, facing as Facing);
    ctx.clearRect(0, 0, SIZE, SIZE);
    panel(ctx, 0, 0, SIZE, SIZE - 1, C.paper, C.shadow);
    const dx = (SPRITE_W - SIZE) / 2, dy = 2;
    for (let y = 0; y < SIZE - 3; y++) for (let x = 0; x < SIZE; x++) {
      const c = sprite.get(x + dx, y + dy);
      if (!c) continue;
      ctx.fillStyle = c === SHADOW ? C.shadow : c;
      ctx.fillRect(x, y, 1, 1);
    }
  };
  const turning = setInterval(() => {
    if (!box.isConnected) return clearInterval(turning);
    facing = (facing + 1) % 8;
    paint();
  }, 700);

  // One row: the name, what is chosen, and arrows either side.
  const labels = TABS.flatMap((tab) => tab.rows.map((r) => textWidth(caps(t(r.key)))));
  const values = [t('char.none'), t('char.own'), t('char.yes'), t('char.no'), '00/00'].map((v) => textWidth(caps(v)));
  const W = 4 + Math.max(...labels) + 6 + Math.max(...values) + 4;
  const rowEl = (row: Row) => {
    const face = el('span', 'value');
    const draw = () => {
      const { canvas, ctx } = pixelCanvas(W, 14, S);
      panel(ctx, 0, 0, W, 13, C.paper, C.shadow);
      text(ctx, caps(t(row.key)), 4, 4, C.ink);
      const v = caps(shown(row, s));
      text(ctx, v, W - 4 - textWidth(v), 4, C.ink);
      face.replaceChildren(canvas);
    };
    const step = (by: number) => {
      const n = row.values.length;
      row.set(s, row.values[(row.values.indexOf(row.get(s)) + by + n) % n]);
      draw();
      refresh();
    };
    draw();
    const line = el('div', 'row');
    line.append(pixelButton(t('char.prev'), { icon: 'left' }, () => step(-1)), face, pixelButton(t('char.next'), { icon: 'right' }, () => step(1)));
    return { line, draw };
  };

  const tabsBox = el('div', 'tabs');
  const rowsBox = el('div', 'rows');
  // As tall as the longest tab, so switching tabs does not move the buttons.
  rowsBox.style.minHeight = `${Math.max(...TABS.map((tb) => tb.rows.length)) * (14 * S + 6)}px`;
  let tab = 0;
  let drawn: { draw: () => void }[] = [];
  const showTab = () => {
    tabsBox.replaceChildren(...TABS.map((tb, n) => {
      const b = pixelButton(t(tb.key), { words: t(tb.key) }, () => { tab = n; showTab(); });
      if (n !== tab) b.classList.add('off');
      return b;
    }));
    const made = TABS[tab].rows.map(rowEl);
    drawn = made;
    rowsBox.replaceChildren(...made.map((m) => m.line));
  };
  // A change can change other rows (a new top drops its colour), so all of the tab are redrawn.
  const refresh = () => {
    for (const d of drawn) d.draw();
    paint();
  };

  const end = el('div', 'tabs');
  end.append(
    pixelButton(t('char.back'), { words: t('char.back') }, back),
    pixelButton(t('char.random'), { icon: 'dice' }, () => { roll(s); refresh(); }),
    pixelButton(t('char.start'), { words: t('char.start') }, () => done(structuredClone(s))),
  );
  box.append(stage, tabsBox, rowsBox, end);
  showTab();
  paint();
  return box;
}
