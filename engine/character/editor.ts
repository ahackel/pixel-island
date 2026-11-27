// The character editor: the character large on the left, turning; on the right a row of tabs and under them a row per
// choice, each a box with arrows either side of what is chosen, or a bar of colours; random (and done) in the corner.
// The island game's editor before each new game, and the wardrobe tool's page, which asks for every row (`full`), a
// tab of its own for the preview, and keeps the character itself (`state`). Laid out for an iPad on its side.
import { BROWS, EYE_COLORS, EYE_SHAPES, GLASSES_COLORS, HAIR_STYLES, HEAD_SHAPES, NOSES } from './base.ts';
import { CATALOG, CLOTH_KEYS, entryById } from './catalog.ts';
import { HAIR_COLORS, lookOf, type State, type WornSlot } from './character.ts';
import TEXT from './editor-text.json' with { type: 'json' };
import { PALETTE, SHADOW, SKIN_KEYS, type PaletteKey } from '../core/palette.ts';
import { AUTHORED, STAND } from '../core/poses.ts';
import { BUILDS, CHARACTER_ORIGIN, drawCharacter, SPRITE_H, SPRITE_W, turnFacing, type Facing, type Sprite } from '../core/puppet.ts';
import { withSunShadow } from '../world/island.ts';
import { C, caps, pixelButton, S, turnView, type Icon } from '../../shared/game-ui.ts';
import { choice } from '../../ui/components.ts';
import { currentLang } from '../../shared/lang.ts';
import { textWidth } from '../../shared/pixel-font.ts';
import { label, panel, pixelCanvas } from '../../shared/pixel-ui.ts';
import './editor.css';

export type Value = string | number | boolean | null;
/**
 * A choice. `key` names it and its values (`<key>.<value>`) in editor-text.json, unless `title` and `nameOf` do.
 * `none`: how often a roll leaves it at its first value (none, no, own colours). `unset`: what null is called.
 * `swatches`: picked from colour squares, not stepped through; `own` is the colour null stands for.
 * `full`: only in the wardrobe. `shown`: only while it means something (a second colour, the glasses' frame).
 */
export interface Row {
  key: string; values: readonly Value[]; get(s: State): Value; set(s: State, v: Value): void;
  none?: number; unset?: string; swatches?: true; own?(s: State): Value; icon?(v: Value): Icon;
  full?: true; shown?(s: State): boolean; title?: string; nameOf?(v: Value): string;
}
export interface Tab { key: string; icon: Icon; rows: Row[]; full?: true; title?: string }

const TEXTS: Record<string, { en: string; de?: string }> = TEXT;
/** An editor text in the current language, else in English, else its id. */
const say = (id: string) => (TEXTS[id]?.[currentLang()] || TEXTS[id]?.en) ?? id;

const ids = (slot: string, all = false) => CATALOG.filter((e) => e.slot === slot && (all || !e.id.startsWith('job-'))).map((e) => e.id);
/** The palette colour a piece's `n`th own colour is swapped for, or null for its own. */
const colorRow = (slot: WornSlot, n = 0): Row => {
  const own = (s: State) => entryById(s.worn[slot])?.colors[n];
  return {
    key: n ? 'char.color2' : 'char.color',
    values: [null, ...CLOTH_KEYS],
    get: (s) => s.colors[slot]?.[own(s) ?? 'white'] ?? null,
    set: (s, v) => {
      const mine = own(s);
      const next = { ...s.colors[slot] };
      if (!mine) return;
      // Picking the piece's own colour is the same as no swap.
      if (v && v !== mine) next[mine] = v as PaletteKey;
      else delete next[mine];
      if (Object.keys(next).length) s.colors[slot] = next;
      else delete s.colors[slot];
    },
    none: 0.5,
    unset: 'char.own',
    swatches: true,
    own: (s) => own(s) ?? null,
    ...(n ? { full: true as const, shown: (s: State) => !!own(s) } : { shown: (s: State) => !!own(s) }),
  };
};
const wornRow = (key: string, slot: WornSlot, optional: boolean, none = 0, all = false): Row => ({
  key,
  values: [...(optional ? [null] : []), ...ids(slot, all)],
  get: (s) => s.worn[slot],
  // A new piece starts in its own colours.
  set: (s, v) => { s.worn[slot] = v as string | null; delete s.colors[slot]; },
  none,
});
const flag = (key: string, get: (s: State) => boolean, set: (s: State, on: boolean) => void, none: number, full?: true): Row =>
  ({ key, values: [false, true], get, set: (s, v) => set(s, !!v), none, ...(full ? { full } : {}) });

const TABS: Tab[] = [
  { key: 'char.body', icon: 'body', rows: [
    flag('char.skeleton', (s) => !!s.skeleton, (s, on) => (s.skeleton = on || undefined), 0),
    { key: 'char.skin', values: SKIN_KEYS, get: (s) => s.skin, set: (s, v) => (s.skin = v as never), swatches: true, shown: (s) => !s.skeleton },
    { key: 'char.figure', values: ['m', 'f'], get: (s) => s.frame, set: (s, v) => (s.frame = v as 'm' | 'f'), icon: (v) => (v === 'f' ? 'female' : 'male') },
    { key: 'char.build', values: BUILDS.map((b) => b.id), get: (s) => s.build, set: (s, v) => (s.build = v as string) },
    { key: 'char.head', values: HEAD_SHAPES, get: (s) => s.face.shape ?? 'round', set: (s, v) => (s.face.shape = v as never) },
  ] },
  { key: 'char.face', icon: 'face', rows: [
    { key: 'char.eyes', values: EYE_SHAPES, get: (s) => s.face.eyes, set: (s, v) => (s.face.eyes = v as never) },
    // The dark eyes are no colour of their own (null); here they are ink, so they have a square too.
    { key: 'char.eyeColor', values: ['ink', ...EYE_COLORS.filter((c) => c)], get: (s) => s.face.eyeColor ?? 'ink', set: (s, v) => (s.face.eyeColor = v === 'ink' ? null : (v as PaletteKey)), swatches: true, full: true },
    { key: 'char.brows', values: BROWS, get: (s) => s.face.brows, set: (s, v) => (s.face.brows = v as never) },
    { key: 'char.nose', values: NOSES, get: (s) => s.face.nose ?? 'small', set: (s, v) => (s.face.nose = v as never) },
    flag('char.blush', (s) => s.face.blush, (s, on) => (s.face.blush = on), 0.4, true),
    flag('char.freckles', (s) => s.face.freckles, (s, on) => (s.face.freckles = on), 0.7),
    flag('char.lashes', (s) => s.face.lashes, (s, on) => (s.face.lashes = on), 0.5, true),
    flag('char.glasses', (s) => s.face.glasses, (s, on) => (s.face.glasses = on), 0.8),
    { key: 'char.glassesColor', values: GLASSES_COLORS, get: (s) => s.face.glassesColor ?? 'black', set: (s, v) => (s.face.glassesColor = v as PaletteKey), swatches: true, full: true, shown: (s) => s.face.glasses },
  ] },
  { key: 'char.hair', icon: 'hair', rows: [
    { key: 'char.hairStyle', values: [null, ...HAIR_STYLES.map((h) => h.id), ...ids('hair')], get: (s) => s.hair, set: (s, v) => (s.hair = v as string | null), none: 0.1 },
    { key: 'char.color', values: HAIR_COLORS, get: (s) => s.hairColor, set: (s, v) => (s.hairColor = v as never), swatches: true },
    wornRow('char.beard', 'beard', true, 0.6),
    // The beard's own colour, else the hair's: picking the hair's is the same as none.
    { key: 'char.beardColor', values: HAIR_COLORS, get: (s) => s.beardColor ?? s.hairColor, set: (s, v) => (s.beardColor = v === s.hairColor ? null : (v as PaletteKey)), swatches: true, full: true, shown: (s) => !!s.worn.beard },
  ] },
  { key: 'char.clothes', icon: 'clothes', rows: [
    wornRow('char.top', 'top', true), colorRow('top'), colorRow('top', 1),
    wornRow('char.bottom', 'bottom', true), colorRow('bottom'), colorRow('bottom', 1),
    { ...wornRow('char.shoes', 'shoes', true, 0.3), full: true }, { ...colorRow('shoes'), full: true },
    wornRow('char.hat', 'hat', true, 0.3), { ...colorRow('hat'), full: true },
  ] },
  { key: 'char.tool', icon: 'tool', full: true, rows: [wornRow('char.tool', 'tool', true, 0.5, true), colorRow('tool')] },
];

/** The dresses and skirts, by name: what reaches below the hips is no guide, as long shirts and jeans do too. */
// shortcut: a list by hand; give catalog entries a flag when there are more of them.
const SKIRTED = /^(sprite-dresses-|sprite-leafskirt-|recipe-bottoms-3$|recipe-everyday-5$|sprite-everyday-bottoms-2$)/;
const skirted = (id: string | null) => !!id && SKIRTED.test(id);

/**
 * A whole new character: each row at random, the optional ones (beard, hat, own colours) often left as they come. Rolled,
 * a woman has no beard and a man wears no dress or skirt; chosen by hand, anyone may have either.
 */
export function roll(s: State, tabs: Tab[] = TABS): void {
  for (const { rows } of tabs) for (const row of rows) {
    const first = row.values[0];
    const pick = (first === null || first === false) && Math.random() < (row.none ?? 0) ? first : row.values[Math.floor(Math.random() * row.values.length)];
    row.set(s, pick);
  }
  if (s.frame === 'f') s.worn.beard = null;
  else for (const slot of ['top', 'bottom'] as const) {
    if (!skirted(s.worn[slot])) continue;
    const plain = ids(slot).filter((id) => !skirted(id));
    s.worn[slot] = plain[Math.floor(Math.random() * plain.length)] ?? null;
    delete s.colors[slot];
  }
}

export interface EditorOptions {
  /** The wardrobe: every row, and its own tabs after the shared ones. */
  full?: boolean;
  tabs?: Tab[];
  /** The character to edit in place, kept by the caller (else a copy of `start`, handed to `done`). */
  state?: () => State;
  /** After every change made here. */
  changed?: () => void;
  /** Done: the button that ends editing. Left out, there is none. */
  done?: (s: State) => void;
  /** Instead of rolling every row: the caller's own random character. */
  random?: () => void;
  /** What the preview plays, else the idle with a glance or a smile now and then, neat. */
  preview?: () => { clip: string; look: number; aside: boolean; worn: boolean };
  /** A value's name where the texts have none, such as any catalog piece's. */
  nameOf?: (row: Row, v: Value) => string | undefined;
  /** When the preview turns. */
  turned?: (facing: Facing) => void;
}
export type Editor = HTMLElement & { refresh(): void; facing(): Facing };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => Object.assign(document.createElement(tag), { className: cls });
/** A palette colour's own shade, for a swatch. */
const hex = (k: Value) => PALETTE[k as PaletteKey]?.base ?? C.paper;

/** The editor, starting from `start` (copied, unless `options.state` gives the character to edit in place). */
export function characterEditor(start: State, options: EditorOptions = {}): Editor {
  const copy: State = structuredClone(start);
  if (!options.full) copy.worn.tool = null;
  const cur = options.state ?? (() => copy);
  const tabs = [...TABS.filter((tb) => options.full || !tb.full), ...(options.tabs ?? [])]
    .map((tb) => ({ ...tb, rows: tb.rows.filter((r) => options.full || !r.full) }));
  const named = (row: Row, v: Value): string => {
    if (row.nameOf) return row.nameOf(v);
    if (v === null) return say(row.unset ?? 'char.none');
    if (typeof v === 'boolean') return say(v ? 'char.yes' : 'char.no');
    const id = `${row.key}.${v}`;
    const name = say(id);
    if (name !== id) return name;
    const own = options.nameOf?.(row, v);
    if (own) return own;
    const some = row.values.filter((x) => x !== null);
    return `${some.indexOf(v) + 1}/${some.length}`;
  };
  const titled = (row: Row) => row.title ?? say(row.key);
  const box = el('div', 'editor');

  // The character large and neat (not yet worn by the island), idling as on the island: blinking, now and then a glance or a smile.
  // Dragged sideways (or the arrows below), they turn round.
  const SIZE = 56;
  // shortcut: fixed so the longest German names still fit beside it on a 1024-wide iPad; size it from the window if wider screens should get more.
  const BIG = 6;
  const { canvas, ctx } = pixelCanvas(SIZE, SIZE, BIG);
  canvas.className = 'editor__preview';
  // Three-quarters from the front, looking right.
  let facing: Facing = 0;
  let fidget: { look: number; face?: string; until: number } | null = null;
  let nextFidget = performance.now() + 2500;
  let shown = '';
  /** Drawn sprites by what they show; emptied when the character changes. */
  const sprites = new Map<string, Sprite>();
  const paint = () => {
    const now = performance.now();
    const p = options.preview?.();
    const clip = AUTHORED[p?.clip ?? 'idle'] ?? AUTHORED.idle;
    const frame = Math.floor((now / 1000) * clip.rate) % clip.frames.length;
    if (!p) {
      if (fidget && now > fidget.until) {
        fidget = null;
        nextFidget = now + 2500 + Math.random() * 3000;
      }
      if (!fidget && now >= nextFidget) fidget = Math.random() < 0.6 ? { look: Math.random() < 0.5 ? 1 : -1, until: now + 1500 } : { look: 0, face: 'smile', until: now + 1500 };
    }
    const blink = clip.faces?.[frame] === 'blink';
    const face = blink ? 'blink' : p ? (p.aside ? 'aside' : clip.faces?.[frame]) : fidget?.face;
    const look = p ? p.look : fidget?.look ?? 0;
    const key = `${p?.clip}|${frame}|${facing}|${face}|${look}|${p?.worn}`;
    if (key === shown) return;
    shown = key;
    let sprite = sprites.get(key);
    if (!sprite) {
      const s = cur();
      const pose = look ? { ...(p ? clip.frames[frame] : STAND), look } : clip.frames[frame];
      sprites.set(key, (sprite = drawCharacter(lookOf(p?.worn ? s : { ...s, wear: 0 }), pose, facing, { face, swing: clip.swing })));
    }
    ctx.clearRect(0, 0, SIZE, SIZE);
    panel(ctx, 0, 0, SIZE, SIZE - 1, C.paper, C.shadow);
    const dx = (SPRITE_W - SIZE) / 2, dy = 2;
    // Its shadow cast from the sun on flat ground, as far as the frame reaches.
    const cast = withSunShadow(sprite, SPRITE_W, SPRITE_H, CHARACTER_ORIGIN);
    for (let y = 0; y < SIZE - 3; y++) for (let x = 0; x < SIZE; x++) {
      const c = cast.get(x + dx, y + dy);
      if (!c) continue;
      ctx.fillStyle = c === SHADOW ? C.shadow : c;
      ctx.fillRect(x, y, 1, 1);
    }
  };
  // Started once on the page; stops when the editor is taken off it.
  let placed = false;
  const idling = setInterval(() => {
    if (placed && !box.isConnected) return clearInterval(idling);
    placed ||= box.isConnected;
    paint();
  }, 1000 / 24);
  const turn = (by: number) => {
    facing = turnFacing(facing, by);
    options.turned?.(facing);
    paint();
  };
  // The arrows at its sides and a drag on it turn the character round.
  const arrows = turnView(canvas, turn, { left: say('char.turnLeft'), right: say('char.turnRight') });
  const stage = el('div', 'editor__stage');
  stage.append(canvas, ...arrows);

  // One row: its name on the left; then arrows either side of what is chosen, or a bar of colours.
  const all = tabs.flatMap((tab) => tab.rows);
  const NAME_W = Math.max(...all.map((r) => textWidth(caps(titled(r)))));
  const VALUE_W = 8 + Math.max(...all.filter((r) => !r.swatches).flatMap((r) => r.values.map((v) => textWidth(caps(named(r, v))))));
  /** A choice's box and a colour bar: room for an arrow at each end and the longest name between. */
  const BAR_W = 11 + VALUE_W + 11;
  const rowEl = (row: Row) => {
    const line = el('div', 'editor__row');
    line.append(label(caps(titled(row)), C.paper, S));
    const options = row.values.filter((v) => !row.swatches || v !== null).map((v) => ({
      id: String(v),
      ...(row.swatches ? { color: hex(v) } : row.icon ? { icon: row.icon(v) } : { words: named(row, v) }),
    }));
    const at = (id: string) => row.values.find((v) => String(v) === id) as Value;
    const pick = choice(titled(row), options, () => {
      const v = row.get(cur()) ?? (row.swatches ? row.own?.(cur()) ?? null : null);
      return v === null || v === undefined ? null : String(v);
    }, (id) => { row.set(cur(), at(id)); changed(); }, row.swatches ? 'colors' : 'arrows', BAR_W);
    const draw = pick.redraw;
    line.append(pick);
    draw();
    return line;
  };

  const tabsBox = el('div', 'editor__tabs');
  const rowsBox = el('div', 'editor__rows');
  rowsBox.style.setProperty('--name-w', `${NAME_W * S}px`);
  let tab = 0;
  const showTab = () => {
    tabsBox.replaceChildren(...tabs.map((tb, n) => {
      const b = pixelButton(tb.title ?? say(tb.key), { icon: tb.icon, lit: n === tab }, () => { tab = n; showTab(); });
      b.setAttribute('aria-pressed', String(n === tab));
      return b;
    }));
    // A row that means nothing now (a second colour the piece has not got) is left out.
    rowsBox.replaceChildren(...tabs[tab].rows.filter((r) => r.shown?.(cur()) ?? true).map(rowEl));
  };
  // A change can change other rows (a new top drops its colour), so the whole tab is drawn again, and the character.
  const refresh = () => {
    showTab();
    sprites.clear();
    shown = '';
    paint();
  };
  const changed = () => {
    refresh();
    options.changed?.();
  };

  const end = el('div', 'editor__end');
  end.append(pixelButton(say('char.random'), { icon: 'dice' }, () => {
    if (options.random) options.random();
    else roll(cur(), tabs);
    changed();
    // A little hop, so a new roll shows even where little changed.
    canvas.classList.remove('editor__hop');
    void canvas.offsetWidth;
    canvas.classList.add('editor__hop');
  }));
  if (options.done) end.append(pixelButton(say('char.start'), { words: say('char.start') }, () => options.done!(structuredClone(cur()))));
  const side = el('div', 'editor__side');
  side.append(tabsBox, rowsBox);
  box.append(stage, side, end);
  showTab();
  paint();
  return Object.assign(box, { refresh, facing: () => facing });
}
