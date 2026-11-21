// The pixel interface's building blocks, game-agnostic: each is a small canvas shown at `S` times, so a button is only a
// place to tap. Colours come from theme.ts, pictures from icons.ts, words from the pixel font (capitals).
import { LINE_H, LINE_STEP, text, textWidth, wrap } from '../shared/pixel-font.ts';
import { drawRows, label as label_, panel, pixelCanvas, rounded } from '../shared/pixel-ui.ts';
import { iconRows } from './icons.ts';
import { C, PAINT, S } from './theme.ts';
import './ui.css';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => Object.assign(document.createElement(tag), { className: cls });

/** Everything is written in capitals, as in Lop Hop. */
export const caps = (s: string) => s.toUpperCase();

/** An icon alone, as a picture. */
export function iconPicture(name: string, scale = S): HTMLCanvasElement {
  const rows = iconRows(name);
  const { canvas, ctx } = pixelCanvas(rows[0].length, rows.length, scale);
  drawRows(ctx, rows, 0, 0, PAINT);
  return canvas;
}

export interface ButtonFace { icon?: string; words?: string; dark?: boolean; lit?: boolean; pressed?: boolean; flat?: boolean }

/** A button with an icon, words, or an icon then words. `flat`: no shadow, for a bar of the same paper. `dark`: the night's own button; `lit`: the one chosen of a row; `pressed`: an on/off button that is on (shown lit). */
export function pixelButton(label: string, face: ButtonFace, on: () => void): HTMLButtonElement {
  const icon = face.icon ? iconRows(face.icon) : null;
  const iconW = icon ? icon[0].length : 0;
  const words = face.words && caps(face.words);
  const wordsW = words ? textWidth(words) : 0;
  const w = words ? 4 + iconW + (icon ? 3 : 0) + wordsW + 4 : 13;
  const h = 13;
  const { canvas, ctx } = pixelCanvas(w, face.flat ? h : h + 1, S); // no shadow row when flat, so it centres
  panel(ctx, 0, 0, w, h, face.dark ? C.night : face.lit || face.pressed ? C.lit : C.paper, face.flat ? undefined : C.shadow);
  if (icon) drawRows(ctx, icon, words ? 4 : Math.floor((w - iconW) / 2), 2, PAINT);
  if (words) text(ctx, words, w - 4 - wordsW, 4, face.dark ? C.white : C.ink);
  const b = el('button', 'pbtn');
  b.setAttribute('aria-label', label);
  b.title = label;
  if (face.pressed !== undefined) b.setAttribute('aria-pressed', String(face.pressed));
  b.append(canvas);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    on();
  });
  return b;
}

/** A colour to pick: a flat square, outlined in ink when chosen. `color` null draws an empty one (nothing / erase). */
export function swatch(label: string, color: string | null, chosen: boolean, on: () => void): HTMLButtonElement {
  const { canvas, ctx } = pixelCanvas(9, 10, S);
  panel(ctx, 0, 0, 9, 9, chosen ? C.ink : C.paper, C.shadow);
  if (color) { ctx.fillStyle = color; ctx.fillRect(2, 2, 5, 5); } else { rounded(ctx, 2, 2, 5, 5, C.empty); }
  const b = el('button', 'pbtn');
  b.title = b.ariaLabel = label;
  b.append(canvas);
  b.addEventListener('click', on);
  return b;
}

/**
 * A slider from 0 to 1: a track, its filled part and a knob. Drag or tap anywhere on it. It redraws itself while dragged, so
 * the host need not; `format` writes the value as a number beside it.
 */
export function slider(label: string, value: number, change: (value: number) => void, width = 40, format?: (value: number) => string, done?: () => void): HTMLElement {
  const wrap = el('span', 'uslider');
  const draw = () => {
    const { canvas, ctx } = pixelCanvas(width, 9, S);
    const x = Math.round(value * (width - 5));
    rounded(ctx, 0, 3, width, 3, C.track);
    if (x > 1) rounded(ctx, 0, 3, x + 2, 3, C.lit);
    panel(ctx, x, 0, 5, 8, C.paper, C.shadow);
    canvas.className = 'uslider__track';
    wrap.replaceChildren(...(format ? [canvas, label_(caps(format(value)), C.paper, S)] : [canvas]));
  };
  const at = (e: PointerEvent) => {
    const r = wrap.querySelector('canvas')!.getBoundingClientRect();
    value = Math.min(1, Math.max(0, ((e.clientX - r.left) / r.width * width - 2.5) / (width - 5)));
    draw();
    change(value);
  };
  // The listeners sit on the wrapper, which stays while the picture inside is swapped (a swapped element would lose the capture).
  wrap.title = label;
  wrap.setAttribute('aria-label', label);
  wrap.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('.uslider__track')) { wrap.setPointerCapture(e.pointerId); at(e); } });
  wrap.addEventListener('pointermove', (e) => wrap.hasPointerCapture(e.pointerId) && at(e));
  wrap.addEventListener('pointerup', () => done?.());
  draw();
  return wrap;
}

/** A box for ordinary DOM content with the pixel look: corner pixels cut, a shadow line under. */
export function box(...children: Node[]): HTMLElement {
  const outer = el('div', 'ubox');
  const inner = el('div', 'ubox__in');
  inner.append(...children);
  outer.append(inner);
  return outer;
}

/** A flat panel alone, w by h pixels, with its shadow line: the ground other things are laid on. */
export function panelPicture(w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = pixelCanvas(w, h + 1, S);
  panel(ctx, 0, 0, w, h, C.paper, C.shadow);
  return canvas;
}

/** A bar from 0 to 1 on a track; `low` fills it in the warning colour. */
export function bar(value: number, color: string, width = 32, low = false): HTMLCanvasElement {
  const { canvas, ctx } = pixelCanvas(width, 5, S);
  rounded(ctx, 0, 0, width, 5, C.track);
  const f = Math.round(value * width);
  if (f >= 2) rounded(ctx, 0, 0, f, 5, low ? C.low : color);
  return canvas;
}

/** A tile that holds one picture (rows and their colours) or, given null, an empty one. */
export function slot(picture: { rows: readonly string[]; colors: Record<string, string> } | null): HTMLCanvasElement {
  const { canvas, ctx } = pixelCanvas(13, 14, S);
  if (picture) panel(ctx, 0, 0, 13, 13, C.paper, C.shadow);
  else rounded(ctx, 0, 0, 13, 13, C.empty);
  if (picture) drawRows(ctx, picture.rows, Math.floor((13 - picture.rows[0].length) / 2), Math.floor((13 - picture.rows.length) / 2), picture.colors);
  return canvas;
}

/** Words in a panel, a framed picture on the left (`paint` draws it at x, y, `size` square) and the words beside it. */
export function dialog(words: string, paint: (ctx: CanvasRenderingContext2D, x: number, y: number) => void, width = 200, size = 22): HTMLCanvasElement {
  const textX = 4 + size + 2 + 6;
  const lines = wrap(words, width - textX - 5);
  const h = Math.max(size + 2 + 8, (lines.length - 1) * LINE_STEP + LINE_H + 8);
  const { canvas, ctx } = pixelCanvas(width, h + 1, S);
  panel(ctx, 0, 0, width, h, C.paper, C.shadow);
  rounded(ctx, 4, 4, size + 2, size + 2, C.track);
  paint(ctx, 5, 5);
  const top = Math.floor((h - ((lines.length - 1) * LINE_STEP + 5)) / 2);
  lines.forEach((line, n) => text(ctx, line, textX, top + n * LINE_STEP, C.ink));
  return canvas;
}

/** The day and two bars, redrawn into one canvas. */
export function hud(names: { hunger: string; energy: string }): { canvas: HTMLCanvasElement; draw: (day: string, icon: string, hunger: number, energy: number, low: number) => void } {
  const labels = { hunger: caps(names.hunger), energy: caps(names.energy) };
  const lw = Math.max(textWidth(labels.hunger), textWidth(labels.energy));
  const barW = 32;
  const w = 5 + lw + 4 + barW + 5;
  const h = 31;
  const { canvas, ctx } = pixelCanvas(w, h + 1, S);
  let shown = '';
  const draw = (day: string, icon: string, hunger: number, energy: number, low: number) => {
    const fill = (n: number) => Math.round(n * barW);
    const key = `${day}|${icon}|${fill(hunger)}|${fill(energy)}|${hunger < low}|${energy < low}`;
    if (key === shown) return;
    shown = key;
    ctx.clearRect(0, 0, w, h + 1);
    panel(ctx, 0, 0, w, h, C.paper, C.shadow);
    drawRows(ctx, iconRows(icon), 4, 3, PAINT);
    text(ctx, caps(day), 16, 5, C.ink);
    const row = (y: number, name: string, n: number, color: string) => {
      text(ctx, name, 5, y, C.ink);
      const x = 5 + lw + 4;
      rounded(ctx, x, y, barW, 5, C.track);
      const f = fill(n);
      if (f >= 2) rounded(ctx, x, y, f, 5, n < low ? C.low : color);
    };
    row(15, labels.hunger, hunger, C.hunger);
    row(15 + LINE_STEP, labels.energy, energy, C.energy);
  };
  return { canvas, draw };
}

/** A component that redraws itself in place when what it shows has changed. */
export type Live = HTMLElement & { redraw: () => void };

/**
 * A colour bar: all the colours side by side in one panel, a little triangle over the chosen one; tap or slide along it.
 * `get` says which is chosen (null: none); the bar redraws itself after a pick.
 */
function colorsLook<T>(label: string, picks: { value: T; color: string }[], get: () => T | null, choose: (value: T) => void, width: number): Live {
  const TIP = 3;
  const self = Object.assign(el('span', 'ubar'), { redraw: () => {} }) as Live;
  const edge = (n: number) => 2 + Math.floor((n * (width - 4)) / picks.length);
  self.redraw = () => {
    const now = get();
    const { canvas, ctx } = pixelCanvas(width, TIP + 14, S);
    panel(ctx, 0, TIP, width, 13, C.paper, C.shadow);
    picks.forEach((p, n) => {
      const x = edge(n), w = edge(n + 1) - x;
      ctx.fillStyle = p.color;
      ctx.fillRect(x, TIP + 2, w, 9);
      if (p.value !== now) return;
      ctx.fillStyle = C.paper;
      const mid = x + Math.floor(w / 2);
      for (let y = 0; y < TIP; y++) ctx.fillRect(mid - (TIP - 1 - y), y, 2 * (TIP - 1 - y) + 1, 1);
    });
    self.replaceChildren(canvas);
  };
  const at = (e: PointerEvent) => {
    const x = (e.clientX - self.getBoundingClientRect().left) / S;
    const n = Math.max(0, Math.min(picks.length - 1, Math.floor(((x - 2) * picks.length) / (width - 4))));
    if (picks[n].value === get()) return;
    choose(picks[n].value);
    self.redraw();
  };
  self.setAttribute('aria-label', label);
  self.title = label;
  self.addEventListener('pointerdown', (e) => { self.setPointerCapture(e.pointerId); at(e); });
  self.addEventListener('pointermove', (e) => { if (self.hasPointerCapture(e.pointerId)) at(e); });
  self.redraw();
  return self;
}

/**
 * A value chooser: a panel with an arrow at each end and what is chosen between them, words or an icon; only the arrows are
 * buttons (left steps back, right forward), the middle is just the value. `show` is read at every redraw (call `redraw` after the value changed).
 */
function arrowsLook(label: string, show: () => { words?: string; icon?: string }, step: (by: -1 | 1) => void, width: number): Live {
  const self = Object.assign(el('span', 'uchooser'), { redraw: () => {} }) as Live;
  self.redraw = () => {
    const { canvas, ctx } = pixelCanvas(width, 14, S);
    panel(ctx, 0, 0, width, 13, C.paper, C.shadow);
    drawRows(ctx, iconRows('left'), 2, 2, C.ink);
    drawRows(ctx, iconRows('right'), width - 11, 2, C.ink);
    const v = show();
    if (v.icon) drawRows(ctx, iconRows(v.icon), Math.floor((width - 9) / 2), 2, C.ink);
    else if (v.words) text(ctx, caps(v.words), width / 2, 4, C.ink, 'center');
    const half = (by: -1 | 1) => {
      const b = el('button', `uchooser__half ${by < 0 ? 'uchooser__prev' : 'uchooser__next'}`);
      b.style.width = `${11 * S}px`;
      b.setAttribute('aria-label', `${label}: ${by < 0 ? '-' : '+'}`);
      b.addEventListener('click', () => { step(by); self.redraw(); });
      return b;
    };
    self.replaceChildren(canvas, half(-1), half(1));
  };
  self.title = label;
  self.redraw();
  return self;
}

// ------------------------------------------------------------------ one value of several

/** One of several values: an icon, words or a colour. */
export interface Option { id: string; icon?: string; words?: string; color?: string }
/** How the options are drawn: `arrows` one at a time between two arrows, `buttons` all in a row, `colors` a bar of colours, `list` a popup. */
export type Look = 'arrows' | 'buttons' | 'colors' | 'list';

const faceOf = (o: Option): ButtonFace => ({ icon: o.icon, words: o.icon ? undefined : o.words });

/** A button that opens a panel of `content` under it; a tap outside or inside (given `close`) shuts it. */
export function opener(label: string, face: ButtonFace, content: (close: () => void) => Node): HTMLElement {
  const wrap = el('span', 'upopwrap');
  let pop: HTMLElement | null = null;
  const away = (e: Event) => { if (pop && !wrap.contains(e.target as Node)) close(); };
  const close = () => { pop?.remove(); pop = null; removeEventListener('pointerdown', away, true); };
  wrap.append(pixelButton(label, face, () => {
    if (pop) return close();
    pop = el('div', 'upop');
    pop.append(box(content(close)));
    wrap.append(pop);
    addEventListener('pointerdown', away, true);
  }));
  return wrap;
}

/** All options side by side in one panel, the chosen one lit; each segment is a button laid over the picture. */
function groupLook(label: string, options: Option[], current: string | null, pick: (id: string) => void): HTMLElement {
  const widths = options.map((o) => (o.icon || !o.words ? 13 : 8 + textWidth(caps(o.words))));
  const total = widths.reduce((a, b) => a + b, 0);
  const { canvas, ctx } = pixelCanvas(total, 14, S);
  panel(ctx, 0, 0, total, 13, C.paper, C.shadow);
  const wrap = el('span', 'ugroup');
  wrap.title = label;
  wrap.setAttribute('role', 'group');
  let x = 0;
  options.forEach((o, n) => {
    const w = widths[n];
    if (o.id === current) rounded(ctx, x + 1, 1, w - 2, 11, C.lit);
    if (o.icon) drawRows(ctx, iconRows(o.icon), x + Math.floor((w - 9) / 2), 2, PAINT);
    else if (o.words) text(ctx, caps(o.words), x + 4, 4, C.ink);
    const b = el('button', 'ugroup__seg');
    b.style.cssText = `left:${x * S}px;width:${w * S}px`;
    b.title = b.ariaLabel = o.words ?? o.icon ?? o.id;
    b.setAttribute('aria-pressed', String(o.id === current));
    b.addEventListener('click', () => pick(o.id));
    wrap.append(b);
    x += w;
  });
  wrap.prepend(canvas);
  return wrap;
}

/**
 * The one component to choose a value of a list, however it looks (see `Look`). `get` reads the current id (null: none) and
 * is asked again at every redraw; `pick` is called with a chosen id. `width` is in pixels, for arrows, colors and list.
 */
export function choice(label: string, options: Option[], get: () => string | null, pick: (id: string) => void, look: Look = 'arrows', width = 60, flat = false): Live {
  const index = () => Math.max(0, options.findIndex((o) => o.id === get()));
  if (look === 'colors') return colorsLook(label, options.filter((o) => o.color).map((o) => ({ value: o.id, color: o.color! })), get, pick, width);
  if (look === 'arrows') {
    return arrowsLook(label, () => options[index()], (by) => pick(options[(index() + by + options.length) % options.length].id), width);
  }
  const self = Object.assign(el('span', 'urow'), { redraw: () => {} }) as Live;
  self.title = label;
  if (look === 'buttons') {
    self.redraw = () => self.replaceChildren(groupLook(label, options, get(), (id) => { pick(id); self.redraw(); }));
  } else {
    self.redraw = () => self.replaceChildren(opener(label, { ...faceOf(options[index()]), flat }, (close) => {
      const list = el('div', 'urow');
      list.append(...options.map((o) => pixelButton(o.words ?? o.icon ?? o.id, { ...faceOf(o), lit: o.id === get(), flat: true }, () => { pick(o.id); close(); self.redraw(); })));
      return list;
    }));
  }
  self.redraw();
  return self;
}

// ------------------------------------------------------------------ layout and input

/** What a row is called: an icon or a few words (a tooltip says it in full). */
export interface Name { icon?: string; words?: string; tip?: string }

const nameOf = (n: Name): HTMLElement => {
  const w = el('span', 'uname');
  w.title = n.tip ?? n.words ?? n.icon ?? '';
  w.append(n.icon ? iconPicture(n.icon, S) : label_(caps(n.words ?? ''), C.ink, S));
  return w;
};

/** A row: what it is called on the left, its control on the right. Put rows in `fields` and all names and controls line up. */
export function field(name: Name, control: Node): HTMLElement {
  const row = el('div', 'ufield');
  row.append(nameOf(name), control);
  return row;
}

/** Rows of `field` under each other, their names in one column and their controls starting on one line. */
export function fields(...rows: Node[]): HTMLElement {
  const grid = el('div', 'ufields');
  grid.append(...rows);
  return grid;
}

/** A group with a header (a button that folds it away) over its content. */
export function section(name: Name, content: Node[], open = true, onToggle?: (open: boolean) => void): HTMLElement {
  const wrap = el('div', 'usection');
  const body = el('div', 'usection__body');
  body.append(...content);
  const head = el('div', 'urow');
  const draw = () => {
    head.replaceChildren(pixelButton(name.tip ?? name.words ?? name.icon ?? '', { icon: open ? 'down' : 'right', words: undefined }, () => { open = !open; body.hidden = !open; onToggle?.(open); draw(); }), nameOf(name));
  };
  body.hidden = !open;
  draw();
  wrap.append(head, body);
  return wrap;
}

/** A line of text to type in: the same drawn well as the search field. `dice` (optional) is a button beside it that makes a new text; `done` is told when typing ends (leaving the field, Enter). `width` is in pixels of the raster. */
export function textField(label: string, value: string, change: (value: string) => void, options: { placeholder?: string; dice?: () => string; done?: (value: string) => void; width?: number } = {}): HTMLElement {
  const well = inputWell(label, { value, change, done: options.done, placeholder: options.placeholder, width: options.width ?? 60 });
  const row = el('span', 'urow');
  row.append(well);
  if (options.dice) row.append(pixelButton(label, { icon: 'dice' }, () => { well.input.value = options.dice!(); well.redraw(); change(well.input.value); options.done?.(well.input.value); }));
  return row;
}

const MAGNIFIER = ['.xxx...', 'x...x..', 'x...x..', 'x...x..', '.xxxx..', '....xx.', '.....xx'];
const CROSS = ['x...x', '.x.x.', '..x..', '.x.x.', 'x...x'];

interface WellOptions { value?: string; change: (value: string) => void; done?: (value: string) => void; placeholder?: string; icon?: readonly string[]; clearable?: boolean; width?: number }

/**
 * A line of text, all drawn on the raster: a well, an optional small icon at the left, the typed words in the pixel font and,
 * if `clearable`, a small cross at the right while there is text (tap it to clear). A transparent input over it takes the typing;
 * the caret is drawn too (a long text scrolls to keep it in view). Without `width` (raster pixels) it stretches over its parent.
 */
function inputWell(label: string, o: WellOptions): HTMLElement & { input: HTMLInputElement; redraw: () => void } {
  const H = 13;
  const wrap = el('span', 'usearch');
  if (o.width) wrap.style.width = `${o.width * S}px`;
  const input = Object.assign(el('input', 'usearch__input'), { spellcheck: false, value: o.value ?? '' });
  input.setAttribute('aria-label', label);
  input.title = label;
  const clear = el('button', 'usearch__clear');
  clear.title = clear.ariaLabel = 'Clear';
  const left = o.icon ? 2 + o.icon[0].length + 3 : 3;
  let canvas: HTMLCanvasElement | null = null;
  let blink: number | undefined;
  const draw = () => {
    const w = o.width ?? Math.max(left + 14, Math.floor(wrap.clientWidth / S));
    const made = pixelCanvas(w, H, S);
    const { ctx } = made;
    panel(ctx, 0, 0, w, H, C.track);
    if (o.icon) drawRows(ctx, o.icon, 2, Math.floor((H - o.icon.length) / 2), C.ink);
    const crossed = o.clearable && input.value;
    const room = w - left - (crossed ? 11 : 3);
    const shown = input.value.toUpperCase();
    const caretAt = textWidth(shown.slice(0, input.selectionStart ?? shown.length));
    const shift = Math.max(0, caretAt - room + 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, 0, room, H);
    ctx.clip();
    if (shown) text(ctx, shown, left - shift, 4, C.ink);
    else if (o.placeholder && document.activeElement !== input) text(ctx, o.placeholder.toUpperCase(), left, 4, C.empty);
    if (document.activeElement === input && Math.floor(Date.now() / 500) % 2 === 0) { ctx.fillStyle = C.ink; ctx.fillRect(left - shift + caretAt + (caretAt ? 1 : 0), 3, 1, 7); }
    ctx.restore();
    if (crossed) drawRows(ctx, CROSS, w - 8, 4, C.ink);
    clear.hidden = !crossed;
    canvas?.remove();
    canvas = made.canvas;
    wrap.prepend(canvas);
    input.style.left = `${left * S}px`;
    input.style.right = `${(crossed ? 11 : 2) * S}px`;
  };
  input.addEventListener('input', () => { draw(); o.change(input.value); });
  input.addEventListener('change', () => o.done?.(input.value));
  clear.addEventListener('click', () => { input.value = ''; draw(); o.change(''); o.done?.(''); input.focus(); });
  for (const type of ['keyup', 'click', 'blur'] as const) input.addEventListener(type, draw);
  input.addEventListener('focus', () => { draw(); blink = window.setInterval(draw, 500); });
  input.addEventListener('blur', () => window.clearInterval(blink));
  wrap.append(input, clear);
  new ResizeObserver(draw).observe(wrap);
  return Object.assign(wrap, { input, redraw: draw });
}

/** A search box that stretches over its parent: a small magnifier at the left, a cross to clear at the right. */
export function searchField(label: string, change: (value: string) => void, value = ''): HTMLElement {
  return inputWell(label, { change, value, icon: MAGNIFIER, clearable: true });
}

/**
 * A panel at the left or right edge of a page, top to bottom, with a grip on its inner edge to drag it wider or narrower (the
 * width is kept in the browser under `key`). Put the content in `body`.
 */
export function sidePanel(side: 'left' | 'right', key: string, width = 240): { panel: HTMLElement; body: HTMLElement } {
  const panel = el('aside', `uside uside--${side}`);
  let w = width;
  try { w = Math.max(120, Number(localStorage.getItem(key)) || width); } catch { /* the default */ }
  panel.style.width = `${w}px`;
  const body = el('div', 'uside__body');
  const grip = el('div', 'uside__grip');
  grip.title = 'Resize';
  grip.addEventListener('pointerdown', (e) => grip.setPointerCapture(e.pointerId));
  grip.addEventListener('pointermove', (e) => {
    if (!grip.hasPointerCapture(e.pointerId)) return;
    const r = panel.getBoundingClientRect();
    panel.style.width = `${Math.round(Math.max(120, Math.min(innerWidth * 0.6, side === 'left' ? e.clientX - r.left : r.right - e.clientX)))}px`;
  });
  grip.addEventListener('pointerup', () => { try { localStorage.setItem(key, String(parseInt(panel.style.width))); } catch { /* not kept */ } });
  panel.append(body, grip);
  return { panel, body };
}

/** A button that opens a panel of icon buttons, one per action. */
export function menu(label: string, items: { icon: string; label: string; on: () => void; danger?: boolean; disabled?: boolean }[], icon = 'menu', flat = false): HTMLElement {
  return opener(label, { icon, flat }, (close) => {
    const list = el('div', 'urow');
    list.append(...items.map((i) => Object.assign(pixelButton(i.label, { icon: i.icon, dark: i.danger, flat: true }, () => { close(); i.on(); }), { disabled: !!i.disabled })));
    return list;
  });
}

/**
 * A number in a pixel panel: drag the name (icon or words) on its left sideways to change the value, or tap the number
 * and type. One drag step is `PER` pixels of the picture; the value stays within `min` to `max`, in steps of `step`.
 */
export function numberField(name: Name, value: number, change: (value: number) => void, options: { min?: number; max?: number; step?: number; width?: number } = {}): HTMLElement {
  const { min = 0, max = 100, step = 1, width = 40 } = options;
  const PER = 2;
  const handleW = name.icon ? 13 : 8 + textWidth(caps(name.words ?? ''));
  const tip = name.tip ?? name.words ?? name.icon ?? '';
  const { canvas, ctx } = pixelCanvas(width, 14, S);
  const paint = () => {
    ctx.clearRect(0, 0, width, 14);
    panel(ctx, 0, 0, width, 13, C.paper, C.shadow);
    if (name.icon) drawRows(ctx, iconRows(name.icon), 2, 2, C.ink);
    else text(ctx, caps(name.words ?? ''), 4, 4, C.ink);
    const n = String(value);
    text(ctx, n, width - 4 - textWidth(n), 4, C.ink);
  };
  const fit = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const set = (v: number) => { if (v === value) return; value = v; paint(); change(v); };

  const wrap = el('span', 'unumber');
  const grab = el('span', 'unumber__grab');
  grab.style.width = `${handleW * S}px`;
  grab.title = tip;
  let from: { x: number; value: number } | null = null;
  grab.addEventListener('pointerdown', (e) => { grab.setPointerCapture(e.pointerId); from = { x: e.clientX, value }; });
  grab.addEventListener('pointermove', (e) => from && set(fit(from.value + Math.round((e.clientX - from.x) / S / PER) * step)));
  grab.addEventListener('pointerup', () => { from = null; });

  const typed = el('button', 'unumber__value');
  typed.style.left = `${handleW * S}px`;
  typed.setAttribute('aria-label', tip);
  typed.addEventListener('click', () => {
    const input = Object.assign(el('input', 'unumber__input'), { type: 'number', value: String(value) });
    input.style.left = `${handleW * S}px`;
    input.addEventListener('blur', () => { const v = Number(input.value); input.remove(); if (input.value !== '' && !Number.isNaN(v)) set(fit(v)); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = ''; input.blur(); } });
    wrap.append(input);
    input.select();
  });

  paint();
  wrap.append(canvas, grab, typed);
  return wrap;
}

// ------------------------------------------------------------------ page header

/** What the header of a tool page holds; every part but the tool switcher is optional. */
export interface HeaderOptions {
  /** The pages to switch between, the current one by `tool`; `href` is where a pick goes. */
  tools: { id: string; icon: string; name: string; href: string }[];
  tool: string;
  about?: string[];
  more?: { icon: string; label: string; on: () => void; danger?: boolean; disabled?: boolean }[];
  /** Actions on the whole file or library, as buttons in their own group (new, copy, delete). */
  actions?: { icon: string; label: string; on: () => void; disabled?: boolean }[];
  /** Short status text next to the menu (saved, an error). */
  status?: Node;
  /** Old-style controls the page still brings itself (a picker of its things). */
  things?: Node;
  undo?: () => void;
  redo?: () => void;
  /** The main action: save. */
  save?: { label: string; on: () => void; disabled?: boolean };
  shuffle?: () => void;
  extra?: Node;
  languages?: { current: string; ids: string[]; pick: (id: string) => void };
  labels?: { about: string; more: string; undo: string; redo: string; shuffle: string; language: string; tools: string };
}

/** Joins groups of controls into one row with a divider between each two non-empty groups. */
function groups(...list: (Node | null | undefined | false)[][]): HTMLElement {
  const row = el('span', 'urow');
  list.map((g) => g.filter((n): n is Node => !!n)).filter((g) => g.length).forEach((g, i) => {
    if (i) row.append(el('span', 'udivider'));
    row.append(...g);
  });
  return row;
}

/** The header of every tool page, groups divided by lines: switcher, about, menu | actions on the file | its things and status; at the right undo, redo | save | extras | language. */
export function header(o: HeaderOptions): { bar: HTMLElement; undo: HTMLButtonElement | null; redo: HTMLButtonElement | null } {
  const t = { about: 'About', more: 'More', undo: 'Undo', redo: 'Redo', shuffle: 'Shuffle', language: 'Language', tools: 'Tools', ...o.labels };
  const bar = el('header', 'uheader');
  const pages: Option[] = o.tools.map((x) => ({ id: x.id, icon: x.icon, words: x.name }));
  const paras = o.about;
  const undo = o.undo ? pixelButton(t.undo, { icon: 'undo', flat: true }, o.undo) : null;
  const redo = o.redo ? pixelButton(t.redo, { icon: 'redo', flat: true }, o.redo) : null;
  const l = o.languages;
  const left = groups(
    [
      choice(t.tools, pages, () => o.tool, (id) => { location.href = o.tools.find((x) => x.id === id)!.href; }, 'list', 60, true),
      paras && opener(t.about, { icon: 'info', flat: true }, () => {
        const text = el('div', 'uabout');
        text.append(...paras.map((p) => Object.assign(el('p', ''), { textContent: p })));
        return text;
      }),
      o.more && menu(t.more, o.more, 'more', true),
    ],
    (o.actions ?? []).map((a) => Object.assign(pixelButton(a.label, { icon: a.icon, flat: true }, a.on), { disabled: !!a.disabled })),
    [o.things, o.status],
  );
  const right = groups(
    [undo, redo],
    [o.save && Object.assign(pixelButton(o.save.label, { icon: 'save', flat: true }, o.save.on), { disabled: !!o.save.disabled })],
    [o.shuffle && pixelButton(t.shuffle, { icon: 'dice', flat: true }, o.shuffle), o.extra],
    [l && choice(t.language, l.ids.map((id) => ({ id, icon: id })), () => l.current, l.pick, 'list', 60, true)],
  );
  bar.append(left, right);
  return { bar, undo, redo };
}

// ------------------------------------------------------------------ on / off, tiles, messages

/** An on/off button: lit while on; a tap flips it and tells `change`. */
export function toggle(label: string, face: Omit<ButtonFace, 'pressed'>, on: boolean, change: (on: boolean) => void): HTMLElement {
  const wrap = el('span', 'utoggle');
  const draw = () => wrap.replaceChildren(pixelButton(label, { ...face, pressed: on }, () => { on = !on; draw(); change(on); }));
  draw();
  return wrap;
}

/** What a tile shows: a picture or an icon, and optionally a few words and a small mark (an icon) in the corner. */
export interface Tile { id: string; picture?: Node; icon?: string; words?: string; mark?: string }

/** A wrapping grid of tiles to pick one from (a library of things); the picked one is lit. Tooltips say the words in full. */
export function tileGrid(tiles: Tile[], selected: string | null, pick: (id: string) => void): HTMLElement {
  const grid = el('div', 'utiles');
  grid.append(...tiles.map((t) => {
    const b = el('button', `utile${t.id === selected ? ' utile--on' : ''}`);
    b.title = b.ariaLabel = t.words ?? t.id;
    b.setAttribute('aria-pressed', String(t.id === selected));
    const inner = el('span', 'utile__in');
    inner.append(t.picture ?? (t.icon ? iconPicture(t.icon) : document.createTextNode('')));
    if (t.words && !t.picture && !t.icon) inner.append(label_(caps(t.words), C.ink, S));
    if (t.mark) { const m = el('span', 'utile__mark'); m.append(iconPicture(t.mark, S / 2)); inner.append(m); }
    b.append(inner);
    b.addEventListener('click', () => pick(t.id));
    return b;
  }));
  return grid;
}

/** A frame round a preview: its content on the ground, a name tag at the top left and tools at the top right. */
export function previewFrame(content: Node, options: { tag?: Node; tools?: Node[] } = {}): HTMLElement {
  const frame = el('div', 'uframe');
  frame.append(content);
  if (options.tag) { const t = el('div', 'uframe__tag'); t.append(options.tag); frame.append(t); }
  if (options.tools?.length) { const t = el('div', 'uframe__tools urow'); t.append(...options.tools); frame.append(t); }
  return frame;
}

/** Asks for a yes or a no in a pixel box over the page (check or cross, Escape is no): replaces the browser's own confirm. */
export function confirmDialog(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const veil = el('div', 'umodal');
    const text = el('p', 'umodal__text');
    text.textContent = question;
    const buttons = el('div', 'urow');
    const done = (yes: boolean) => { veil.remove(); removeEventListener('keydown', key, true); resolve(yes); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') done(false); else if (e.key === 'Enter') done(true); };
    buttons.append(pixelButton('No', { icon: 'close' }, () => done(false)), pixelButton('Yes', { icon: 'check', lit: true }, () => done(true)));
    veil.append(box(text, buttons));
    veil.addEventListener('pointerdown', (e) => { if (e.target === veil) done(false); });
    addEventListener('keydown', key, true);
    document.body.append(veil);
  });
}

/** A short message in a pixel box at the bottom of the page; it goes by itself. */
export function toast(message: string, ms = 3000): void {
  const t = el('div', 'utoast');
  t.append(box(Object.assign(el('span', ''), { textContent: message })));
  t.setAttribute('role', 'status');
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
