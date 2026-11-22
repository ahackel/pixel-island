// The pixel editor shared by the props tool, the wall editor and the parts editor: pencil, eraser,
// fill, picker, line and rectangle over a grid of palette cells, with the rule-drawn version as an
// onion skin underneath. Swatches are palette entries in their three tones, never a free colour, so
// whatever is painted can still be recoloured and lit. It edits the grids it is given in place and
// says when a stroke ended, so the host keeps undo (shared/history.ts) and saving.
import './pixel-editor.css';
import { hexOf, PAINT_KEYS, PALETTE, type Cell, type PaletteKey } from '../../engine/core/palette.ts';
import { blankGrid, type Grid } from '../../engine/core/stamp.ts';
import { h } from '../../shared/shell.ts';
import { box, choice, pixelButton, section, toggle } from '../../ui/components.ts';
import { label } from '../../shared/pixel-ui.ts';
import { C } from '../../ui/theme.ts';
import { currentLang } from '../../shared/lang.ts';

const L = (en: string, de: string) => (currentLang() === 'de' ? de : en);

export type PaintTool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'line' | 'rect';
const TOOLS: [PaintTool, string, string, string, string][] = [
  ['pencil', 'pencil', 'Pencil', 'Stift', 'B'],
  ['eraser', 'eraser', 'Eraser', 'Radierer', 'E'],
  ['fill', 'bucket', 'Fill', 'Füllen', 'G'],
  ['picker', 'pipette', 'Pick a colour', 'Farbe aufnehmen', 'I'],
  ['line', 'line', 'Line', 'Linie', 'L'],
  ['rect', 'rect', 'Rectangle', 'Rechteck', 'R'],
];

export interface PixelEditorOptions {
  /** The views being painted; edited in place. All of one size. */
  grids: Grid[];
  /** Which of them is on the canvas. */
  view: number;
  /** The pivot, drawn as a small cross: where the thing stands on the ground. */
  pivot?: { x: number; y: number };
  /** The rule-drawn picture of a view, shown faintly underneath while painting. */
  onion?: (view: number) => Grid | null;
  /** Lines to help, in grid pixels: a wall's foot, a body's outline. */
  guides?: (view: number) => { x0: number; y0: number; x1: number; y1: number; color: string }[];
  /** A pixel changed during a stroke. */
  live: () => void;
  /** A stroke ended, or the canvas was changed as a whole: commit and save. */
  done: () => void;
  /** Whether the canvas may be grown and trimmed; the host is told the new pivot. */
  resize?: (grids: Grid[], pivot: { x: number; y: number }) => void;
  /** Colours offered first, such as the ones the rule used. */
  keys?: PaletteKey[];
  /** The view names, for the view picker; none hides it. */
  viewNames?: string[];
  pickView?: (view: number) => void;
}

// What the painter last chose stays chosen while panels are rebuilt.
let tool: PaintTool = 'pencil';
let ink: Cell = { key: 'wood', shade: false };
let zoom = 0;
let showGrid = true;
let showOnion = true;
let mirrorX = false;

const sameCell = (a: Cell | null, b: Cell | null) => (!a && !b) || (!!a && !!b && a.key === b.key && !!a.shade === !!b.shade && !!a.light === !!b.light);

/** Every pixel of a straight line, both ends included. */
function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function pixelEditor(o: PixelEditorOptions): { el: HTMLElement; redraw(): void } {
  const grid = () => o.grids[o.view] ?? o.grids[0];
  const W = () => grid()[0]?.length ?? 1;
  const H = () => grid().length;
  const canvas = h('canvas', { class: 'px__canvas', tabindex: '0', 'aria-label': L('Pixels', 'Pixel') });
  const wrap = h('div', { class: 'px__wrap' }, canvas);
  const info = h('span', { class: 'px__info' });
  let preview: [number, number][] = [];

  // Fits the panel on opening: about 380 pixels across and 520 down.
  const fit = () => Math.max(2, Math.min(24, Math.floor(Math.min(380 / W(), 520 / H()))));
  const scale = () => (zoom > 0 ? zoom : fit());

  function redraw(): void {
    const s = scale();
    const w = W(), hh = H();
    canvas.width = w * s;
    canvas.height = hh * s;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    // A checkerboard shows what is empty.
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#c4cad3' : '#d6dbe2';
      ctx.fillRect(x * s, y * s, s, s);
    }
    const under = showOnion ? o.onion?.(o.view) : null;
    if (under) {
      ctx.globalAlpha = 0.3;
      under.forEach((row, y) => row.forEach((c, x) => {
        if (!c) return;
        ctx.fillStyle = hexOf(c);
        ctx.fillRect(x * s, y * s, s, s);
      }));
      ctx.globalAlpha = 1;
    }
    grid().forEach((row, y) => row.forEach((c, x) => {
      if (!c) return;
      ctx.fillStyle = hexOf(c);
      ctx.fillRect(x * s, y * s, s, s);
    }));
    for (const [x, y] of preview) {
      ctx.fillStyle = tool === 'eraser' ? '#ffffffaa' : hexOf(ink);
      ctx.fillRect(x * s, y * s, s, s);
    }
    if (showGrid && s >= 6) {
      ctx.strokeStyle = '#00000018';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < w; x++) { ctx.moveTo(x * s + 0.5, 0); ctx.lineTo(x * s + 0.5, hh * s); }
      for (let y = 1; y < hh; y++) { ctx.moveTo(0, y * s + 0.5); ctx.lineTo(w * s, y * s + 0.5); }
      ctx.stroke();
    }
    for (const g of o.guides?.(o.view) ?? []) {
      ctx.strokeStyle = g.color;
      ctx.lineWidth = Math.max(1, s / 6);
      ctx.beginPath();
      ctx.moveTo((g.x0 + 0.5) * s, (g.y0 + 0.5) * s);
      ctx.lineTo((g.x1 + 0.5) * s, (g.y1 + 0.5) * s);
      ctx.stroke();
    }
    if (o.pivot) {
      const { x, y } = o.pivot;
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = Math.max(1, s / 5);
      ctx.strokeRect(x * s + 1, y * s + 1, s - 2, s - 2);
    }
    if (mirrorX) {
      ctx.strokeStyle = '#3a7bd588';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo((w * s) / 2, 0);
      ctx.lineTo((w * s) / 2, hh * s);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const at = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * W()), Math.floor(((e.clientY - r.top) / r.height) * H())];
  };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W() && y < H();
  const put = (x: number, y: number, c: Cell | null) => {
    const spots: [number, number][] = [[x, y]];
    if (mirrorX) spots.push([W() - 1 - x, y]);
    for (const [px, py] of spots) if (inside(px, py)) grid()[py][px] = c ? { ...c } : null;
  };
  const paint = (): Cell | null => (tool === 'eraser' ? null : ink);

  function fillFrom(x: number, y: number): void {
    const g = grid();
    const target = g[y][x];
    const c = paint();
    if (sameCell(target, c)) return;
    const todo: [number, number][] = [[x, y]];
    const seen = new Set<number>();
    while (todo.length) {
      const [px, py] = todo.pop()!;
      const k = py * W() + px;
      if (!inside(px, py) || seen.has(k) || !sameCell(g[py][px], target)) continue;
      seen.add(k);
      put(px, py, c);
      todo.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
  }

  let start: [number, number] | null = null;
  let last: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = at(e);
    if (!inside(x, y)) return;
    start = last = [x, y];
    if (tool === 'picker' || e.altKey) {
      const c = grid()[y][x];
      if (c) { ink = { key: c.key, shade: !!c.shade, ...(c.light ? { light: true } : {}) }; tool = tool === 'picker' ? 'pencil' : tool; }
      start = null;
      return rebuild();
    }
    if (tool === 'fill') {
      fillFrom(x, y);
      start = null;
      o.live();
      redraw();
      return o.done();
    }
    if (tool === 'pencil' || tool === 'eraser') {
      put(x, y, paint());
      o.live();
    }
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = at(e);
    info.textContent = inside(x, y) ? `${x}, ${y}${o.pivot ? `  (${x - o.pivot.x}, ${y - o.pivot.y})` : ''}` : '';
    if (!start || !last) return;
    if (tool === 'pencil' || tool === 'eraser') {
      for (const [px, py] of lineCells(last[0], last[1], x, y)) put(px, py, paint());
      last = [x, y];
      o.live();
    } else if (tool === 'line') {
      preview = lineCells(start[0], start[1], x, y);
    } else if (tool === 'rect') {
      const [x0, x1] = [Math.min(start[0], x), Math.max(start[0], x)];
      const [y0, y1] = [Math.min(start[1], y), Math.max(start[1], y)];
      preview = [];
      for (let px = x0; px <= x1; px++) preview.push([px, y0], [px, y1]);
      for (let py = y0 + 1; py < y1; py++) preview.push([x0, py], [x1, py]);
    }
    redraw();
  });
  const end = () => {
    if (!start) return;
    for (const [x, y] of preview) put(x, y, paint());
    preview = [];
    start = last = null;
    redraw();
    o.live();
    o.done();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoom = Math.max(2, Math.min(32, scale() + (e.deltaY < 0 ? 1 : -1)));
    redraw();
  }, { passive: false });

  /** Moves every pixel of the view on the canvas by one. */
  function nudge(dx: number, dy: number): void {
    const g = grid();
    const next = blankGrid(W(), H());
    g.forEach((row, y) => row.forEach((c, x) => {
      if (c && inside(x + dx, y + dy)) next[y + dy][x + dx] = c;
    }));
    g.splice(0, g.length, ...next);
    o.live();
    o.done();
    redraw();
  }
  function flip(): void {
    for (const row of grid()) row.reverse();
    o.live();
    o.done();
    redraw();
  }
  /** Grows every view by `n` pixels on each side, or trims them to what is painted (n = 0). */
  function resize(n: number): void {
    if (!o.resize || !o.pivot) return;
    const w = W(), hh = H();
    let x0 = 0, y0 = 0, x1 = w - 1, y1 = hh - 1;
    if (n === 0) {
      x0 = w; y0 = hh; x1 = -1; y1 = -1;
      for (const g of o.grids) g.forEach((row, y) => row.forEach((c, x) => {
        if (c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }));
      if (x1 < 0) return;
      // Keep the pivot inside, and a pixel round what is painted.
      x0 = Math.max(0, Math.min(x0, o.pivot.x) - 1); y0 = Math.max(0, Math.min(y0, o.pivot.y) - 1);
      x1 = Math.min(w - 1, Math.max(x1, o.pivot.x) + 1); y1 = Math.min(hh - 1, Math.max(y1, o.pivot.y) + 1);
    } else {
      x0 -= n; y0 -= n; x1 += n; y1 += n;
    }
    const nw = Math.min(160, x1 - x0 + 1), nh = Math.min(160, y1 - y0 + 1);
    const grids = o.grids.map((g) => {
      const next = blankGrid(nw, nh);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) next[y][x] = g[y + y0]?.[x + x0] ?? null;
      return next;
    });
    o.resize(grids, { x: o.pivot.x - x0, y: o.pivot.y - y0 });
  }

  canvas.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey) return;
    const t = TOOLS.find(([, , , , key]) => key.toLowerCase() === e.key.toLowerCase());
    if (t) { tool = t[0]; e.preventDefault(); return rebuild(); }
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (step[e.key]) { e.preventDefault(); nudge(...step[e.key]); }
    if (e.key === 'm') { mirrorX = !mirrorX; rebuild(); }
  });

  const el = h('div', { class: 'px' });
  // The ink is a palette colour in one of its three tones: a colour bar picks the colour, a second bar of its tones the tone.
  const TONES = ['light', 'base', 'shade'] as const;
  const toneOf = (c: Cell) => (c.light ? 'light' : c.shade ? 'shade' : 'base');
  const cellOf = (key: PaletteKey, tone: string): Cell => ({ key, shade: tone === 'shade', ...(tone === 'light' ? { light: true } : {}) });
  const toneSlot = h('span');
  const toneBar = () => choice(L('Tone', 'Ton'), TONES.map((tone) => ({ id: tone, color: PALETTE[ink.key][tone] })), () => toneOf(ink), (tone) => pickInk(cellOf(ink.key, tone)), 'colors', 40);
  /** Takes an ink; the bars redraw themselves, so only a change of tool rebuilds the editor (it would end a drag along a bar). */
  function pickInk(c: Cell): void {
    ink = c;
    if (tool === 'eraser' || tool === 'picker') { tool = 'pencil'; return rebuild(); }
    toneSlot.replaceChildren(toneBar());
  }
  const colorBar = (keys: PaletteKey[]) => choice(L('Colour', 'Farbe'), keys.map((key) => ({ id: key, color: PALETTE[key].base })), () => ink.key, (key) => pickInk(cellOf(key as PaletteKey, toneOf(ink))), 'colors', Math.max(40, keys.length * 8 + 4));
  const bar = (...items: Node[]) => { const row = h('div', { class: 'urow' }); row.append(...items); return row; };
  const act = (icon: string, tip: string, on: () => void) => pixelButton(tip, { icon, flat: true }, on);
  function rebuild(): void {
    const used = new Set<PaletteKey>();
    for (const g of o.grids) for (const row of g) for (const c of row) if (c) used.add(c.key);
    const first = [...new Set([...(o.keys ?? []), ...used])];
    const rest = PAINT_KEYS.filter((k) => !first.includes(k));
    const tools = box(bar(
      ...TOOLS.map(([id, ic, en, de, key]) => pixelButton(`${L(en, de)} (${key})`, { icon: ic, flat: true, pressed: tool === id }, () => { tool = id; rebuild(); })),
      h('span', { class: 'udivider' }),
      toggle(L('Paint both halves (M)', 'Beide Hälften malen (M)'), { icon: 'mirror', flat: true }, mirrorX, (on) => { mirrorX = on; }),
      act('flip', L('Flip this view', 'Diese Ansicht spiegeln'), flip),
      toggle(L('Grid', 'Raster'), { icon: 'grid', flat: true }, showGrid, (on) => { showGrid = on; rebuild(); }),
      ...(o.onion ? [toggle(L('Show the generated version underneath', 'Die erzeugte Fassung darunter zeigen'), { icon: 'layers', flat: true }, showOnion, (on) => { showOnion = on; rebuild(); })] : []),
      act('zoomout', L('Zoom out', 'Verkleinern'), () => { zoom = Math.max(2, scale() - 2); redraw(); }),
      act('zoomin', L('Zoom in', 'Vergrößern'), () => { zoom = Math.min(32, scale() + 2); redraw(); }),
    ));
    const views = o.viewNames && o.viewNames.length > 1
      ? choice(L('View', 'Ansicht'), o.viewNames.map((name, k) => ({ id: String(k), words: name })), () => String(o.view), (id) => o.pickView?.(Number(id)), 'buttons')
      : null;
    const sizeRow = o.resize ? bar(
      label(`${W()}X${H()}`, C.ink, 4),
      pixelButton(L('Grow canvas', 'Fläche vergrößern'), { icon: 'plus' }, () => resize(4)),
      pixelButton(L('Trim canvas', 'Fläche zuschneiden'), { icon: 'trim' }, () => resize(0)),
    ) : null;
    const nudges = bar(...([['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]] as const).map(([ic, dx, dy]) => pixelButton(L('Move the view', 'Ansicht verschieben'), { icon: ic }, () => nudge(dx, dy))));
    el.replaceChildren(
      views ?? '', tools, wrap, info,
      h('div', { class: 'px__inks' },
        colorBar(first),
        toneSlot,
        rest.length ? section({ icon: 'palette', tip: L('All colours', 'Alle Farben') }, [colorBar(rest)], false) : '',
      ),
      nudges, sizeRow ?? '',
    );
    toneSlot.replaceChildren(toneBar());
    redraw();
  }
  rebuild();
  return { el, redraw };
}
