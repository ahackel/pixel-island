// The pixel editor shared by the props tool, the wall editor and the parts editor: pencil, eraser,
// fill, picker, line and rectangle over a grid of palette cells, with the rule-drawn version as an
// onion skin underneath. Swatches are palette entries in their three tones, never a free colour, so
// whatever is painted can still be recoloured and lit. It edits the grids it is given in place and
// says when a stroke ended, so the host keeps undo (shared/history.ts) and saving.
import './pixel-editor.css';
import { hexOf, PAINT_KEYS, PALETTE, type Cell, type PaletteKey } from '../../engine/core/palette.ts';
import { blankGrid, type Grid } from '../../engine/core/stamp.ts';
import { button, h, icon, type IconName } from '../../shared/shell.ts';
import { currentLang } from '../../shared/lang.ts';

const L = (en: string, de: string) => (currentLang() === 'de' ? de : en);

export type PaintTool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'line' | 'rect';
const TOOLS: [PaintTool, IconName, string, string, string][] = [
  ['pencil', 'pencil', 'Pencil', 'Stift', 'B'],
  ['eraser', 'eraser', 'Eraser', 'Radierer', 'E'],
  ['fill', 'bucket', 'Fill', 'Füllen', 'G'],
  ['picker', 'pipette', 'Pick a colour', 'Farbe aufnehmen', 'I'],
  ['line', 'line', 'Line', 'Linie', 'L'],
  ['rect', 'box', 'Rectangle', 'Rechteck', 'R'],
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
  function swatchFor(key: PaletteKey): HTMLElement {
    return h('span', { class: 'px__ramp', title: key },
      ...(['light', 'base', 'shade'] as const).map((tone) => {
        const c: Cell = { key, shade: tone === 'shade', ...(tone === 'light' ? { light: true } : {}) };
        const b = button({
          class: 'px__swatch', 'aria-label': `${key} ${tone}`, 'aria-pressed': String(sameCell(c, ink)),
          style: `background: ${PALETTE[key][tone]}`,
        }, () => {
          ink = c;
          if (tool === 'eraser' || tool === 'picker') tool = 'pencil';
          rebuild();
        });
        return b;
      }));
  }
  function rebuild(): void {
    const used = new Set<PaletteKey>();
    for (const g of o.grids) for (const row of g) for (const c of row) if (c) used.add(c.key);
    const first = [...new Set([...(o.keys ?? []), ...used])];
    const rest = PAINT_KEYS.filter((k) => !first.includes(k));
    const tools = h('div', { class: 'px__tools', role: 'toolbar', 'aria-label': L('Paint tools', 'Malwerkzeuge') },
      ...TOOLS.map(([id, ic, en, de, key]) => button({ class: 'ib', 'aria-pressed': String(tool === id), 'aria-label': `${L(en, de)} (${key})`, title: `${L(en, de)} (${key})` }, () => { tool = id; rebuild(); }, icon(ic))),
      h('span', { class: 'px__sep' }),
      button({ class: 'ib', 'aria-pressed': String(mirrorX), title: L('Paint both halves (M)', 'Beide Hälften malen (M)'), 'aria-label': L('Mirror painting', 'Gespiegelt malen') }, () => { mirrorX = !mirrorX; rebuild(); }, icon('mirror')),
      button({ class: 'ib', title: L('Flip this view', 'Diese Ansicht spiegeln'), 'aria-label': L('Flip', 'Spiegeln') }, flip, icon('flip')),
      button({ class: 'ib', 'aria-pressed': String(showGrid), title: L('Grid', 'Raster'), 'aria-label': L('Grid', 'Raster') }, () => { showGrid = !showGrid; rebuild(); }, icon('grid')),
      o.onion ? button({ class: 'ib', 'aria-pressed': String(showOnion), title: L('Show the generated version underneath', 'Die erzeugte Fassung darunter zeigen'), 'aria-label': L('Onion skin', 'Zwiebelhaut') }, () => { showOnion = !showOnion; rebuild(); }, icon('layers')) : null,
      button({ class: 'ib', title: L('Zoom out', 'Verkleinern'), 'aria-label': L('Zoom out', 'Verkleinern') }, () => { zoom = Math.max(2, scale() - 2); redraw(); }, icon('zoomOut')),
      button({ class: 'ib', title: L('Zoom in', 'Vergrößern'), 'aria-label': L('Zoom in', 'Vergrößern') }, () => { zoom = Math.min(32, scale() + 2); redraw(); }, icon('zoomIn')),
    );
    const views = o.viewNames && o.viewNames.length > 1
      ? h('div', { class: 'seg seg--wrap', role: 'radiogroup', 'aria-label': L('View', 'Ansicht') },
        ...o.viewNames.map((name, k) => button({ role: 'radio', 'aria-checked': String(k === o.view) }, () => o.pickView?.(k), name)))
      : null;
    const sizeRow = o.resize ? h('div', { class: 'toggles' },
      h('span', { class: 'note', style: 'margin: 0' }, `${W()} × ${H()} px`),
      button({ class: 'toggle' }, () => resize(4), L('Grow canvas', 'Fläche vergrößern')),
      button({ class: 'toggle' }, () => resize(0), L('Trim canvas', 'Fläche zuschneiden')),
    ) : null;
    const nudges = h('div', { class: 'toggles' },
      h('span', { class: 'note', style: 'margin: 0' }, L('Move the view', 'Ansicht verschieben')),
      ...([['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]] as const).map(([t, dx, dy]) => button({ class: 'toggle', 'aria-label': t }, () => nudge(dx, dy), t)));
    el.replaceChildren(
      views ?? '', tools, wrap, info,
      h('div', { class: 'px__inks' },
        h('div', { class: 'px__ink' }, h('span', { class: 'px__now', style: `background: ${hexOf(ink)}` }), h('b', {}, `${ink.key} · ${ink.shade ? L('shade', 'Schatten') : ink.light ? L('light', 'Licht') : L('base', 'Grund')}`)),
        h('div', { class: 'px__ramps' }, ...first.map(swatchFor)),
        h('details', { class: 'px__more' }, h('summary', {}, L('All colours', 'Alle Farben')), h('div', { class: 'px__ramps' }, ...rest.map(swatchFor))),
      ),
      nudges, sizeRow ?? '',
      h('p', { class: 'note' }, L(
        'B pencil, E eraser, G fill, I pick, L line, R rectangle, M mirror; Alt-click picks a colour; arrow keys move the view; Ctrl+scroll zooms.',
        'B Stift, E Radierer, G Füllen, I Aufnehmen, L Linie, R Rechteck, M Spiegeln; Alt-Klick nimmt eine Farbe auf; Pfeiltasten verschieben; Strg+Scrollen zoomt.')),
    );
    redraw();
  }
  rebuild();
  return { el, redraw };
}
