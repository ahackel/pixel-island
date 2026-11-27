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

/** A colour as a button's picture: a square with an ink edge. */
const COLOR_ROWS = ['.#######.', '#ooooooo#', '#ooooooo#', '#ooooooo#', '#ooooooo#', '#ooooooo#', '#ooooooo#', '#ooooooo#', '.#######.'];

export interface ButtonFace { icon?: string; color?: string; words?: string; dark?: boolean; lit?: boolean; pressed?: boolean; flat?: boolean }

/** A button with an icon, words, or an icon then words. `flat`: no shadow, for a bar of the same paper. `dark`: the night's own button; `lit`: the one chosen of a row; `pressed`: an on/off button that is on (shown lit). */
export function pixelButton(label: string, face: ButtonFace, on: (e: MouseEvent) => void): HTMLButtonElement {
  const icon = face.icon ? iconRows(face.icon) : face.color ? COLOR_ROWS : null;
  const iconW = icon ? icon[0].length : 0;
  const words = face.words && caps(face.words);
  const wordsW = words ? textWidth(words) : 0;
  const w = words ? 4 + iconW + (icon ? 3 : 0) + wordsW + 4 : 13;
  const h = 13;
  const { canvas, ctx } = pixelCanvas(w, face.flat ? h : h + 1, S); // no shadow row when flat, so it centres
  // A toggled-on button is orange and sits down (CSS moves it a pixel) with no shadow; a flat one has no ground until lit or on.
  const fill = face.dark ? C.night : face.lit || face.pressed ? C.lit : face.flat ? null : C.paper;
  if (fill) panel(ctx, 0, 0, w, h, fill, face.flat || face.pressed ? undefined : C.shadow);
  if (icon) drawRows(ctx, icon, words ? 4 : Math.floor((w - iconW) / 2), 2, face.color ? { '#': C.ink, o: face.color } : PAINT);
  if (words) text(ctx, words, w - 4 - wordsW, 4, face.dark ? C.white : C.ink);
  const b = el('button', `pbtn${face.flat ? ' pbtn--flat' : ''}${face.pressed ? ' pbtn--on' : ''}`);
  b.setAttribute('aria-label', label);
  b.title = label;
  if (face.pressed !== undefined) b.setAttribute('aria-pressed', String(face.pressed));
  b.append(canvas);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    on(e);
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

/**
 * A standing slider over whole steps, `min` at the bottom to `max` at the top, with two knobs on one track, a low one
 * and a high one that never pass each other; only the track and the knobs, so it floats over a picture. Drag a knob,
 * or press the track to bring the nearer knob there. `get` says where the knobs are, `change` hears each move; it
 * redraws itself while dragged. `length` is the most pixels the track takes; `format` writes a value for its tip.
 */
export function rangeSlider(label: string, o: { min: number; max: number; get: () => [number, number]; change: (lo: number, hi: number) => void; format?: (value: number) => string; length?: number; done?: () => void }): Live {
  const self = Object.assign(el('span', 'urange'), { redraw: () => {} }) as Live;
  const span = Math.max(1, o.max - o.min);
  const step = Math.max(3, Math.min(8, Math.floor((o.length ?? 60) / span)));
  const words = (v: number) => o.format?.(v) ?? String(v);
  const KNOB_W = 7, KNOB_H = 5, w = KNOB_W, h = span * step + KNOB_H;
  /** The middle row of a value's knob. */
  const yOf = (v: number) => 2 + (o.max - v) * step;
  self.redraw = () => {
    const [lo, hi] = o.get();
    const { canvas, ctx } = pixelCanvas(w, h + 1, S);
    rounded(ctx, 2, yOf(o.max) - 1, 3, span * step + 3, C.track);
    rounded(ctx, 2, yOf(hi) - 1, 3, (hi - lo) * step + 3, C.lit);
    for (const v of lo === hi ? [hi] : [lo, hi]) panel(ctx, 0, yOf(v) - 2, KNOB_W, KNOB_H - 1, C.paper, C.shadow);
    canvas.className = 'urange__track';
    self.replaceChildren(canvas);
    self.title = `${label}: ${words(lo)} – ${words(hi)}`;
    self.setAttribute('aria-valuetext', `${words(lo)} – ${words(hi)}`);
  };
  const valueAt = (e: PointerEvent) => {
    const r = self.querySelector('canvas')!.getBoundingClientRect();
    const y = ((e.clientY - r.top) / r.height) * (h + 1);
    return Math.max(o.min, Math.min(o.max, o.max - Math.round((y - 2) / step)));
  };
  // Which knob the press holds; with both on one step, the one the pointer then moves toward.
  let held: 'lo' | 'hi' | 'either' | null = null;
  const move = (v: number) => {
    let [lo, hi] = o.get();
    if (held === 'either') {
      if (v === lo) return;
      held = v > hi ? 'hi' : 'lo';
    }
    if (held === 'hi') hi = Math.max(lo, v);
    else lo = Math.min(hi, v);
    if (`${[lo, hi]}` === `${o.get()}`) return;
    o.change(lo, hi);
    self.redraw();
  };
  self.setAttribute('role', 'group');
  self.setAttribute('aria-label', label);
  self.addEventListener('pointerdown', (e) => {
    const v = valueAt(e), [lo, hi] = o.get();
    self.setPointerCapture(e.pointerId);
    held = lo === hi ? (v > hi ? 'hi' : v < lo ? 'lo' : 'either') : Math.abs(v - hi) < Math.abs(v - lo) || (v - hi === lo - v && v > hi) ? 'hi' : 'lo';
    move(v);
  });
  self.addEventListener('pointermove', (e) => self.hasPointerCapture(e.pointerId) && held && move(valueAt(e)));
  self.addEventListener('pointerup', () => { held = null; o.done?.(); });
  self.redraw();
  return self;
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
 * A pick with an icon instead of a colour (an eraser, "as it was") gets a cell of its own, wider than a colour's.
 * `get` says which is chosen (null: none); the bar redraws itself after a pick.
 */
function colorsLook<T>(label: string, picks: { value: T; color?: string; icon?: string }[], get: () => T | null, choose: (value: T) => void, width: number): Live {
  const TIP = 3, ICON_W = 11;
  const self = Object.assign(el('span', 'ubar'), { redraw: () => {} }) as Live;
  const icons = picks.filter((p) => p.icon).length;
  const colorW = (width - 4 - icons * ICON_W) / Math.max(1, picks.length - icons);
  const edges = [2];
  picks.forEach((p) => edges.push(edges[edges.length - 1] + (p.icon ? ICON_W : colorW)));
  const edge = (n: number) => Math.round(edges[n]);
  self.redraw = () => {
    const now = get();
    const { canvas, ctx } = pixelCanvas(width, TIP + 14, S);
    panel(ctx, 0, TIP, width, 13, C.paper, C.shadow);
    picks.forEach((p, n) => {
      const x = edge(n), w = edge(n + 1) - x;
      if (p.icon) drawRows(ctx, iconRows(p.icon), x + Math.floor((w - 9) / 2), TIP + 2, PAINT);
      else { ctx.fillStyle = p.color!; ctx.fillRect(x, TIP + 2, w, 9); }
      if (p.value !== now) return;
      ctx.fillStyle = C.ink;
      const mid = x + Math.floor(w / 2);
      for (let y = 0; y < TIP; y++) ctx.fillRect(mid - (TIP - 1 - y), y, 2 * (TIP - 1 - y) + 1, 1);
    });
    self.replaceChildren(canvas);
  };
  const at = (e: PointerEvent) => {
    const x = (e.clientX - self.getBoundingClientRect().left) / S;
    const found = picks.findIndex((_, i) => x < edge(i + 1));
    const n = found < 0 ? picks.length - 1 : found;
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

/** One of several values: an icon, words or a colour. In the `colors` look an option with an icon and no colour is a cell showing that icon. */
export interface Option { id: string; icon?: string; words?: string; color?: string }
/** How the options are drawn: `arrows` one at a time between two arrows, `buttons` all in a row, `colors` a bar of colours, `list` a popup. */
export type Look = 'arrows' | 'buttons' | 'colors' | 'list';

const faceOf = (o: Option): ButtonFace => ({ icon: o.icon, color: o.icon ? undefined : o.color, words: o.icon || o.color ? undefined : o.words });

/**
 * Opens a panel of `content` under `anchor`, kept on the page: it floats over everything (a side panel's scrolling does not
 * clip it) and shifts left or above when there is no room. A tap outside `anchor` and the panel, Escape, or `close` shuts it;
 * `closed` is told. Returns `close`.
 */
export function popover(anchor: HTMLElement, content: (close: () => void) => Node, closed?: () => void): () => void {
  const pop = el('div', 'upop');
  pop.append(box(content(() => close())));
  const place = () => {
    if (!anchor.isConnected) return close();
    const a = anchor.getBoundingClientRect(), p = pop.getBoundingClientRect();
    const below = a.bottom + 8 + p.height <= innerHeight - 8 || a.top - 8 - p.height < 8;
    pop.style.left = `${Math.max(8, Math.min(a.left, innerWidth - 8 - p.width))}px`;
    pop.style.top = `${below ? Math.min(a.bottom + 8, Math.max(8, innerHeight - 8 - p.height)) : a.top - 8 - p.height}px`;
  };
  const away = (e: Event) => { if (!anchor.contains(e.target as Node) && !pop.contains(e.target as Node)) close(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const scrolled = (e: Event) => { if (!pop.contains(e.target as Node)) place(); };
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    pop.remove();
    removeEventListener('pointerdown', away, true);
    removeEventListener('keydown', key, true);
    removeEventListener('scroll', scrolled, true);
    removeEventListener('resize', place);
    closed?.();
  };
  document.body.append(pop);
  place();
  addEventListener('pointerdown', away, true);
  addEventListener('keydown', key, true);
  addEventListener('scroll', scrolled, true);
  addEventListener('resize', place);
  return close;
}

/** A button that opens a panel of `content` under it (see `popover`); a second tap on it, or a tap outside, shuts it. */
export function opener(label: string, face: ButtonFace, content: (close: () => void) => Node): HTMLElement {
  const wrap = el('span', 'upopwrap');
  let close: (() => void) | null = null;
  wrap.append(pixelButton(label, face, () => {
    if (close) return close();
    close = popover(wrap, content, () => { close = null; });
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
  if (look === 'colors') {
    return options.length > BAR_COLORS ? colorField(label, options, get, pick)
      : colorsLook(label, options.filter((o) => o.color || o.icon).map((o) => ({ value: o.id, color: o.color, icon: o.color ? undefined : o.icon })), get, pick, width);
  }
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

// ------------------------------------------------------------------ colours

/**
 * How colours are chosen, everywhere: up to this many side by side in a colour bar (`choice(..., 'colors')`); more in a colour
 * field (`colorField`) that shows the chosen one and opens a popup of swatches; any colour at all in a colour field that opens
 * an HSV picker (`colorPicker`). `choice` with the `colors` look turns into a colour field by itself past this count.
 */
export const BAR_COLORS = 16;
const FIELD_W = 27;

/** A colour field's face: a panel, the colour (or an icon, or an empty well for none) and a small arrow. */
function colorFace(face: { color?: string; icon?: string } | null): HTMLCanvasElement {
  const { canvas, ctx } = pixelCanvas(FIELD_W, 14, S);
  panel(ctx, 0, 0, FIELD_W, 13, C.paper, C.shadow);
  if (face?.color) { ctx.fillStyle = face.color; ctx.fillRect(2, 2, FIELD_W - 13, 9); }
  else if (face?.icon) drawRows(ctx, iconRows(face.icon), Math.floor((FIELD_W - 11 - 9) / 2) + 1, 2, PAINT);
  else rounded(ctx, 2, 2, FIELD_W - 13, 9, C.empty);
  drawRows(ctx, iconRows('down'), FIELD_W - 10, 2, C.ink);
  return canvas;
}

/** The button of a colour field: its face, and a popup of `content` on a tap (a second tap shuts it). */
function colorButton(label: string, face: () => { color?: string; icon?: string } | null, content: (close: () => void) => Node): Live {
  const self = Object.assign(el('span', 'ucolor'), { redraw: () => {} }) as Live;
  let close: (() => void) | null = null;
  const b = el('button', 'pbtn');
  b.title = b.ariaLabel = label;
  b.addEventListener('click', () => { close ? close() : (close = popover(self, content, () => { close = null; })); });
  self.redraw = () => b.replaceChildren(colorFace(face()));
  self.append(b);
  self.redraw();
  return self;
}

/**
 * Swatches to pick one from, in rows of `columns`: one picture, the chosen one framed in ink. An option with an icon and no
 * colour (reset, eraser) is a cell showing that icon. The pointer's option is named in the tooltip.
 */
export function swatchGrid(label: string, options: Option[], get: () => string | null, pick: (id: string) => void, columns = Math.min(12, Math.ceil(Math.sqrt(options.length * 2)))): HTMLElement {
  const CELL = 11;
  const rows = Math.ceil(options.length / columns);
  const { canvas, ctx } = pixelCanvas(columns * CELL, rows * CELL, S);
  const now = get();
  options.forEach((o, n) => {
    const x = (n % columns) * CELL, y = Math.floor(n / columns) * CELL;
    if (o.color) { ctx.fillStyle = o.color; ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2); }
    else if (o.icon) drawRows(ctx, iconRows(o.icon), x + 1, y + 1, PAINT);
    if (o.id !== now) return;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x, y, CELL, 1); ctx.fillRect(x, y + CELL - 1, CELL, 1); ctx.fillRect(x, y, 1, CELL); ctx.fillRect(x + CELL - 1, y, 1, CELL);
    if (o.color) { ctx.fillStyle = C.paper; ctx.fillRect(x + 1, y + 1, CELL - 2, 1); ctx.fillRect(x + 1, y + CELL - 2, CELL - 2, 1); ctx.fillRect(x + 1, y + 1, 1, CELL - 2); ctx.fillRect(x + CELL - 2, y + 1, 1, CELL - 2); }
  });
  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left) / (CELL * S)), row = Math.floor((e.clientY - r.top) / (CELL * S));
    return col >= 0 && col < columns && row >= 0 ? options[row * columns + col] : undefined;
  };
  const wrap = el('span', 'uswatches');
  wrap.title = label;
  wrap.setAttribute('role', 'listbox');
  wrap.setAttribute('aria-label', label);
  canvas.addEventListener('pointermove', (e) => { const o = at(e); wrap.title = o ? o.words ?? o.id : label; });
  canvas.addEventListener('click', (e) => { const o = at(e); if (o) pick(o.id); });
  wrap.append(canvas);
  return wrap;
}

/** One colour of many: a field showing the chosen one, a popup of swatches to change it (see `swatchGrid` for `columns`). */
export function colorField(label: string, options: Option[], get: () => string | null, pick: (id: string) => void, columns?: number): Live {
  const self: Live = colorButton(label, () => options.find((o) => o.id === get()) ?? null,
    (close) => swatchGrid(label, options, get, (id) => { close(); if (id !== get()) pick(id); self.redraw(); }, columns));
  return self;
}

const hexByte = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
/** A colour from hue (0 to 360), saturation and value (0 to 1) as `#rrggbb`. */
export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return `#${hexByte(f(5) * 255)}${hexByte(f(3) * 255)}${hexByte(f(1) * 255)}`;
}
/** `#rgb` or `#rrggbb` (any alpha dropped) as hue, saturation and value; null if it is not a colour. */
export function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  let m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim())?.[1];
  if (!m) return null;
  if (m.length === 3) m = [...m].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m!.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max ? d / max : 0, v: max };
}

/**
 * Any colour: a field showing it, and a popup with an HSV picker: a square of saturation (across) and value (up) in the
 * chosen hue, a hue bar, the three as numbers and the colour as hex to type, and optionally a row of `presets`. `change` is
 * told every step of a drag; `done` once it ends (or a number or hex is typed), for undo.
 */
export function colorPicker(label: string, get: () => string, change: (hex: string) => void, o: { presets?: string[]; done?: (hex: string) => void } = {}): Live {
  const self: Live = colorButton(label, () => ({ color: get() }), () => hsvPanel(label, get, (hex, end) => { change(hex); self.redraw(); if (end) o.done?.(hex); }, o.presets ?? []));
  return self;
}

function hsvPanel(label: string, get: () => string, set: (hex: string, end: boolean) => void, presets: string[]): HTMLElement {
  const SW = 64, SH = 40, HH = 7;
  let { h, s, v } = hexToHsv(get()) ?? { h: 0, s: 0, v: 0 };
  const square = pixelCanvas(SW, SH, S), hue = pixelCanvas(SW, HH, S);
  const numbers = el('div', 'urow'), hexRow = el('div', 'urow');
  const draw = () => {
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { square.ctx.fillStyle = hsvToHex(h, x / (SW - 1), 1 - y / (SH - 1)); square.ctx.fillRect(x, y, 1, 1); }
    const mx = Math.round(s * (SW - 1)), my = Math.round((1 - v) * (SH - 1));
    square.ctx.fillStyle = v > 0.6 && s < 0.5 ? C.ink : C.white;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) square.ctx.fillRect(mx + dx, my + dy, 1, 1);
    hue.ctx.clearRect(0, 0, SW, HH);
    for (let x = 0; x < SW; x++) { hue.ctx.fillStyle = hsvToHex((x / (SW - 1)) * 360, 1, 1); hue.ctx.fillRect(x, 1, 1, HH - 2); }
    const hx = Math.round((h / 360) * (SW - 1));
    hue.ctx.fillStyle = C.ink;
    hue.ctx.fillRect(hx - 1, 0, 3, 1); hue.ctx.fillRect(hx - 1, HH - 1, 3, 1); hue.ctx.fillRect(hx, 0, 1, HH);
  };
  // The typed parts are rebuilt after a change made elsewhere, never while one of them is in use.
  const fill = () => {
    const num = (words: string, tip: string, value: number, max: number, to: (n: number) => void) =>
      numberField({ words, tip }, Math.round(value), (n) => { to(n); draw(); set(hsvToHex(h, s, v), false); fillHex(); }, { min: 0, max, width: 30 });
    numbers.replaceChildren(
      num('H', 'Hue', h, 360, (n) => (h = n)), num('S', 'Saturation', s * 100, 100, (n) => (s = n / 100)), num('V', 'Value', v * 100, 100, (n) => (v = n / 100)));
    fillHex();
  };
  const fillHex = () => hexRow.replaceChildren(
    textField(label, hsvToHex(h, s, v), () => {}, { width: 44, done: (typed) => { const c = hexToHsv(typed); if (!c) return fillHex(); ({ h, s, v } = c); draw(); set(hsvToHex(h, s, v), true); fill(); } }),
    ...presets.map((p) => swatch(p, p, p.toLowerCase() === hsvToHex(h, s, v), () => { ({ h, s, v } = hexToHsv(p)!); draw(); set(hsvToHex(h, s, v), true); fill(); })));
  const drag = (canvas: HTMLCanvasElement, to: (fx: number, fy: number) => void) => {
    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      to(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
      draw();
      set(hsvToHex(h, s, v), false);
    };
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); at(e); });
    canvas.addEventListener('pointermove', (e) => canvas.hasPointerCapture(e.pointerId) && at(e));
    canvas.addEventListener('pointerup', () => { set(hsvToHex(h, s, v), true); fill(); });
  };
  drag(square.canvas, (fx, fy) => { s = fx; v = 1 - fy; });
  drag(hue.canvas, (fx) => { h = fx * 360; });
  square.canvas.title = 'Saturation, value';
  hue.canvas.title = 'Hue';
  draw();
  fill();
  const wrap = el('div', 'uhsv');
  wrap.append(square.canvas, hue.canvas, numbers, hexRow);
  return wrap;
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

/** A line of text to type in: the same drawn well as the search field. `dice` (optional) is a button beside it that makes a new text; `done` is told when typing ends (leaving the field, Enter). `width` is in pixels of the raster; `flat`: the die has no shadow. */
export function textField(label: string, value: string, change: (value: string) => void, options: { placeholder?: string; dice?: () => string; done?: (value: string) => void; width?: number; flat?: boolean } = {}): HTMLElement {
  const well = inputWell(label, { value, change, done: options.done, placeholder: options.placeholder, width: options.width ?? 60 });
  const row = el('span', 'urow');
  row.append(well);
  if (options.dice) row.append(pixelButton(label, { icon: 'dice', flat: options.flat }, () => { well.input.value = options.dice!(); well.redraw(); change(well.input.value); options.done?.(well.input.value); }));
  return row;
}

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
  let left = 3;
  let canvas: HTMLCanvasElement | null = null;
  let blink: number | undefined;
  const draw = () => {
    const icon = input.value || document.activeElement === input ? undefined : o.icon;
    left = icon ? 2 + icon[0].length + 3 : 3; // the icon goes once the field has the focus or text
    const w = o.width ?? Math.max(left + 14, Math.floor(wrap.clientWidth / S));
    const made = pixelCanvas(w, H, S);
    const { ctx } = made;
    panel(ctx, 0, 0, w, H, C.track);
    if (icon) drawRows(ctx, icon, 2, Math.floor((H - icon.length) / 2), PAINT);
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
  return inputWell(label, { change, value, icon: iconRows('search'), clearable: true });
}

/**
 * A panel at the left or right edge of a page, top to bottom, with a grip on its inner edge to drag it wider or narrower (the
 * width is kept in the browser under `key`). Put the content in `body`.
 */
export function sidePanel(side: 'left' | 'right', key: string, width = 240): { panel: HTMLElement; body: HTMLElement } {
  const panel = el('aside', `uside uside--${side}`);
  showSide(side, sideShown(side));
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

const SIDE_KEY = { left: 'pixel-sidebar', right: 'pixel-inspector' };
const sideShown = (side: 'left' | 'right'): boolean => { try { return localStorage.getItem(SIDE_KEY[side]) !== '0'; } catch { return true; } };
const showSide = (side: 'left' | 'right', on: boolean): void => { document.body.classList.toggle(`uside-off-${side}`, !on); };

/** The header toggle of a side panel (the library or scene list at the left, the inspector at the right): lit while it is shown; the choice is kept in the browser for every editor. */
export function sidebarButton(label: string, side: 'left' | 'right' = 'left'): HTMLElement {
  return toggle(label, { icon: side === 'left' ? 'sidebar' : 'inspector', flat: true }, sideShown(side), (on) => {
    showSide(side, on);
    try { localStorage.setItem(SIDE_KEY[side], on ? '1' : '0'); } catch { /* not kept */ }
  });
}

/** The panels of a `workspace`, and its middle. */
export type Workspace = HTMLElement & { centre: HTMLElement; left: HTMLElement | null; right: HTMLElement | null };

/**
 * The frame of a tool page under its header: an optional panel at the left and one at the right, each with a grip to drag it
 * wider or narrower (the widths are kept in the browser under `key`), and the middle on the page's ground between them. Below
 * 700 pixels everything stacks, the middle first. Give `into` to fill an existing `main` instead of making one.
 */
export function workspace(o: { key: string; left?: Node[]; right?: Node[]; centre: Node[]; leftWidth?: number; rightWidth?: number }, into?: HTMLElement): Workspace {
  const main = into ?? el('main', 'uworkspace');
  const side = (which: 'left' | 'right', nodes: Node[] | undefined, width?: number) => {
    if (!nodes) return null;
    const { panel, body } = sidePanel(which, `${o.key}-${which}`, width);
    body.append(...nodes);
    main.append(panel);
    return body;
  };
  const left = side('left', o.left, o.leftWidth);
  const centre = el('div', 'uwork');
  centre.append(...o.centre);
  main.append(centre);
  const right = side('right', o.right, o.rightWidth);
  main.classList.add('uworkspace');
  return Object.assign(main, { centre, left, right });
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
  /** The name of the thing being edited (a text field), right after the page's icon. */
  name?: Node;
  /** The button that shows or hides the left panel (`sidebarButton`), after the tool switcher. */
  sidebar?: Node;
  /** The button that shows or hides the right panel (`sidebarButton(label, 'right')`), after the About button. */
  inspector?: Node;
  /** Short status text next to the menu (saved, an error). */
  status?: Node;
  /** Old-style controls the page still brings itself (a picker of its things). */
  things?: Node;
  undo?: () => void;
  redo?: () => void;
  /** The main action: save. */
  /** `unsaved` greys the button out while nothing changed and, with `saveNow`, asks to save before leaving for another tool. */
  save?: { label: string; on: () => void; disabled?: boolean; unsaved?: () => boolean; saveNow?: () => Promise<boolean> };
  shuffle?: () => void;
  extra?: Node;
  languages?: { current: string; ids: string[]; pick: (id: string) => void };
  labels?: { about: string; more: string; undo: string; redo: string; shuffle: string; language: string; tools: string; saveAsk: string; save: string; dontSave: string; cancel: string };
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

/** The header of every tool page, groups divided by lines: page icon | name, save, actions, menu, status | undo, redo | extras, about; a space; language. */
export function header(o: HeaderOptions): { bar: HTMLElement; undo: HTMLButtonElement | null; redo: HTMLButtonElement | null } {
  const t = { about: 'About', more: 'More', undo: 'Undo', redo: 'Redo', shuffle: 'Shuffle', language: 'Language', tools: 'Tools', saveAsk: 'Save your changes to the project before leaving?', save: 'Save', dontSave: "Don't save", cancel: 'Cancel', ...o.labels };
  const bar = el('header', 'uheader');
  const pages: Option[] = o.tools.map((x) => ({ id: x.id, icon: x.icon, words: x.name }));
  const paras = o.about;
  const undo = o.undo ? pixelButton(t.undo, { icon: 'undo', flat: true }, o.undo) : null;
  const redo = o.redo ? pixelButton(t.redo, { icon: 'redo', flat: true }, o.redo) : null;
  const l = o.languages;
  const saveButton = o.save && Object.assign(pixelButton(o.save.label, { icon: 'save', flat: true }, o.save.on), { disabled: !!o.save.disabled });
  const tracked = o.save?.unsaved && !o.save.disabled ? o.save.unsaved : null;
  // The save button is grey while there is nothing to save; a page that changes things in many places is polled rather than wired.
  if (saveButton && tracked) {
    saveButton.disabled = !tracked();
    let seen = false;
    const timer = window.setInterval(() => {
      if (bar.isConnected) seen = true;
      else if (seen) return window.clearInterval(timer);
      saveButton.disabled = !tracked();
    }, 400);
  }
  /** Goes to another page; with unsaved changes it first asks whether to save them. */
  const leave = (href: string) => {
    const go = () => { location.href = href; };
    if (!tracked || !tracked()) return go();
    void leaveDialog(t.saveAsk, { save: t.save, dont: t.dontSave, cancel: t.cancel }).then(async (answer) => {
      if (answer === 'leave' || (answer === 'save' && (await o.save!.saveNow?.()))) go();
    });
  };
  const left = groups(
    [choice(t.tools, pages, () => o.tool, (id) => leave(o.tools.find((x) => x.id === id)!.href), 'list', 60, true), o.sidebar],
    [
      o.name,
      saveButton,
      ...(o.actions ?? []).map((a) => Object.assign(pixelButton(a.label, { icon: a.icon, flat: true }, a.on), { disabled: !!a.disabled })),
      o.more && menu(t.more, o.more, 'more', true),
      o.things,
      o.status,
    ],
  );
  const right = groups(
    [undo, redo],
    [
      o.shuffle && pixelButton(t.shuffle, { icon: 'dice', flat: true }, o.shuffle),
      o.extra,
      paras && opener(t.about, { icon: 'info', flat: true }, () => {
        const text = el('div', 'uabout');
        text.append(...paras.map((p) => Object.assign(el('p', ''), { textContent: p })));
        return text;
      }),
      o.inspector,
    ],
  );
  if (l) {
    const lang = choice(t.language, l.ids.map((id) => ({ id, icon: id })), () => l.current, l.pick, 'list', 60, true);
    lang.classList.add('uheader__lang');
    right.append(lang);
  }
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

/** Filters as a row of toggle buttons, at most one on: a tap turns one on, a tap on the one that is on turns it off again (`none`, everything shown). */
export function filterToggles(options: Option[], get: () => string, pick: (id: string) => void, none = 'all'): HTMLElement {
  const row = el('span', 'urow');
  row.append(...options.map((o) => toggle(o.words ?? o.icon ?? o.id, faceOf(o), get() === o.id, () => pick(get() === o.id ? none : o.id))));
  return row;
}

/** What a tile shows: a picture or an icon, and optionally a few words and a small mark (an icon) in the corner. */
export interface Tile { id: string; picture?: Node; icon?: string; words?: string; mark?: string }

/** A wrapping grid of tiles to pick one from (a library of things); the picked one is lit. Tooltips say the words in full. */
export function tileGrid(tiles: Tile[], selected: string | null, pick: (id: string) => void): HTMLElement {
  const grid = el('div', 'utiles');
  grid.append(...tiles.map((t) => {
    const b = el('button', `utile${t.id === selected ? ' utile--on' : ''}`);
    b.title = b.ariaLabel = t.words ?? t.id;
    b.dataset.id = t.id;
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

/** A thing in a `library`: its tile, and more words the search finds it by (its kind, tags, "edited"). */
export interface LibraryItem extends Tile { find?: string }
export type Library = HTMLElement & { redraw: () => void };

/**
 * The left panel of every editor: a search field over the tiles of everything the editor can edit, the one being edited lit.
 * The search matches each typed word against a tile's words, id and `find`, and is kept in the browser under `key`.
 * `filters` (optional) are controls between the search and the tiles, asked again at every redraw; call `redraw` after
 * the things, the one picked or a filter changed. `empty` is said when nothing matches.
 */
export function library(o: { key: string; label?: string; items: () => LibraryItem[]; selected: () => string | null; pick: (id: string) => void; filters?: () => Node[]; empty?: string }): Library {
  const KEY = `${o.key}-search`;
  let query = '';
  try { query = localStorage.getItem(KEY) ?? ''; } catch { /* none */ }
  const self = Object.assign(el('div', 'ulibrary'), { redraw: () => {} }) as Library;
  const filters = el('div', 'ulibrary__filters');
  const list = el('div', 'uside__list');
  self.redraw = () => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const shown = o.items().filter((t) => { const hay = `${t.words ?? ''} ${t.id} ${t.find ?? ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
    const scroll = list.scrollTop;
    list.replaceChildren(shown.length ? tileGrid(shown, o.selected(), o.pick) : label_(caps(o.empty ?? 'Nothing matches'), C.ink, S));
    list.scrollTop = scroll;
    const f = o.filters?.() ?? [];
    filters.replaceChildren(...f);
    filters.hidden = !f.length;
  };
  const search = searchField(o.label ?? 'Search', (v) => { query = v; try { localStorage.setItem(KEY, v); } catch { /* not kept */ } self.redraw(); }, query);
  self.append(search, filters, list);
  self.redraw();
  return self;
}

/** A frame round a preview: its content on the ground, a name tag at the top left and tools at the top right. */
export function previewFrame(content: Node, options: { tag?: Node; tools?: Node[] } = {}): HTMLElement {
  const frame = el('div', 'uframe');
  frame.append(content);
  if (options.tag) { const t = el('div', 'uframe__tag'); t.append(options.tag); frame.append(t); }
  if (options.tools?.length) { const t = el('div', 'uframe__tools urow'); t.append(...options.tools); frame.append(t); }
  return frame;
}

/**
 * Turning a preview: a left and a right arrow at its sides, and a sideways drag on it, each `turn(1)` or `turn(-1)` (the right
 * arrow is +1; a drag to the right turns the other way, as the wardrobe's does), and the arrow keys outside text fields. Call
 * it once for the preview's own element and put the two arrows it returns into that element, which must be positioned.
 */
export function turnView(view: HTMLElement, turn: (step: 1 | -1) => void, words: { left: string; right: string } = { left: 'Turn left', right: 'Turn right' }): HTMLElement[] {
  const STEP = 40; // pixels dragged for one step
  let x0: number | null = null;
  view.style.touchAction = 'pan-y';
  view.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button, input, [contenteditable]')) return;
    x0 = e.clientX;
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    while (Math.abs(e.clientX - x0) >= STEP) {
      const to = e.clientX > x0 ? 1 : -1;
      turn(-to as 1 | -1);
      x0 += to * STEP;
    }
  });
  const end = () => (x0 = null);
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || !view.isConnected) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') turn(e.key === 'ArrowRight' ? 1 : -1);
  });
  const arrow = (side: 'left' | 'right', step: 1 | -1) => Object.assign(pixelButton(words[side], { icon: side }, () => turn(step)), { className: `pbtn uturn uturn--${side}` });
  return [arrow('left', -1), arrow('right', 1)];
}

/** The options of a preview as a column of buttons floating at its top right, as in the scene editor (toggles, a choice as `list`). */
export function viewTools(...tools: (Node | null | false)[]): HTMLElement {
  const column = el('div', 'uview');
  column.append(...tools.filter((t): t is Node => !!t));
  return column;
}

/** Asks for a yes or a no in a pixel box over the page (check or cross, Escape is no): replaces the browser's own confirm. */
export function confirmDialog(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const veil = el('div', 'umodal');
    const text = el('p', 'umodal__text');
    text.textContent = question;
    const buttons = el('div', 'urow');
    const done = (yes: boolean) => { veil.remove(); removeEventListener('keydown', key, true); resolve(yes); };
    // A popup open over the box (a colour picker) takes Escape and Enter itself.
    const key = (e: KeyboardEvent) => { if (document.querySelector('.upop')) return; if (e.key === 'Escape') done(false); else if (e.key === 'Enter') done(true); };
    buttons.append(pixelButton('No', { icon: 'close' }, () => done(false)), pixelButton('Yes', { icon: 'check', lit: true }, () => done(true)));
    veil.append(box(text, buttons));
    veil.addEventListener('pointerdown', (e) => { if (e.target === veil) done(false); });
    addEventListener('keydown', key, true);
    document.body.append(veil);
  });
}

/** Asks what to do with unsaved changes on leaving: save them, leave without, or stay (Escape, a tap outside). */
export function leaveDialog(question: string, words: { save: string; dont: string; cancel: string }): Promise<'save' | 'leave' | 'stay'> {
  return new Promise((resolve) => {
    const veil = el('div', 'umodal');
    const text = el('p', 'umodal__text');
    text.textContent = question;
    const buttons = el('div', 'urow');
    const done = (answer: 'save' | 'leave' | 'stay') => { veil.remove(); removeEventListener('keydown', key, true); resolve(answer); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') done('stay'); else if (e.key === 'Enter') done('save'); };
    buttons.append(
      pixelButton(words.cancel, { words: words.cancel }, () => done('stay')),
      pixelButton(words.dont, { words: words.dont }, () => done('leave')),
      pixelButton(words.save, { icon: 'check', words: words.save, lit: true }, () => done('save')),
    );
    veil.append(box(text, buttons));
    veil.addEventListener('pointerdown', (e) => { if (e.target === veil) done('stay'); });
    addEventListener('keydown', key, true);
    document.body.append(veil);
  });
}

/** A form in a pixel box over the page: a title, the rows, then a cross (no) and a check (yes). `submit` runs on yes; Escape is no, Enter yes (not while typing a number). */
export function formDialog(title: string, rows: Node[], submit: () => void): void {
  const veil = el('div', 'umodal');
  const head = el('div', 'uform__title');
  head.append(label_(caps(title), C.ink, S));
  const buttons = el('div', 'urow');
  const done = (yes: boolean) => { veil.remove(); removeEventListener('keydown', key, true); if (yes) submit(); };
  const key = (e: KeyboardEvent) => { if (document.querySelector('.upop')) return; if (e.key === 'Escape') done(false); else if (e.key === 'Enter' && !(e.target instanceof HTMLInputElement)) done(true); };
  buttons.append(pixelButton('No', { icon: 'close' }, () => done(false)), pixelButton('Yes', { icon: 'check', lit: true }, () => done(true)));
  veil.append(box(head, ...rows, buttons));
  veil.addEventListener('pointerdown', (e) => { if (e.target === veil) done(false); });
  addEventListener('keydown', key, true);
  document.body.append(veil);
}

/** A short message in a pixel box at the bottom of the page; it goes by itself. */
export function toast(message: string, ms = 3000): void {
  const t = el('div', 'utoast');
  t.append(box(Object.assign(el('span', ''), { textContent: message })));
  t.setAttribute('role', 'status');
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
