// The icon editor: the shared library of 9 by 9 icons (ui/icons.json) drawn pixel by pixel. Pick an icon in the panel on the
// left, paint it big in the middle (the tools float under it), name it and choose colours in the inspector on the right.
// "Save" writes the whole library to the project's icons.json, which the game then lays over the engine's; promote it to
// the engine to share it.
import { saveToProject, canSaveToProject } from '../../shared/project.ts';
import { history } from '../../shared/history.ts';
import { drawRows, pixelCanvas } from '../../shared/pixel-ui.ts';
import { box, choice, sidebarButton, iconPicture, library, pixelButton, sidePanel, textField, type Option } from '../../ui/components.ts';
import { ICONS } from '../../ui/icons.ts';
import { uiPage } from '../../ui/page.ts';
import { C, PAINT, S } from '../../ui/theme.ts';

const N = 9;
const CELL = 28;
let lib: Record<string, string[]> = Object.fromEntries(Object.entries(ICONS).map(([k, v]) => [k, [...v]]));
let name = Object.keys(lib)[0];
let ink = 'x';
type Tool = 'draw' | 'erase' | 'line' | 'rect' | 'fill';
let tool: Tool = 'draw';

const undo = history(() => ({ lib, name }), (v) => { lib = v.lib; name = v.name; render(); });
const mark = document.createElement('span');
mark.className = 'urow';
/** The saved state next to the bar's save button: a check while what is shown is what is in the project. */
const setSaved = (v: boolean | null) => { mark.replaceChildren(...(v ? [iconPicture('check')] : [])); };
/** The library as last saved to the project (or as loaded): the save button is grey while the library is still this. */
let savedText = JSON.stringify(lib);
const saveNow = async () => {
  const text = JSON.stringify(lib);
  const ok = await saveToProject('icons.json', lib);
  if (ok) savedText = text;
  return ok;
};
const main = uiPage('icons', {
  sidebar: sidebarButton('Side panel'),
  undo: () => { undo.undo(); setSaved(null); },
  redo: () => { undo.redo(); setSaved(null); },
  save: { label: canSaveToProject() ? 'Save to project' : 'Saving needs the dev server', disabled: !canSaveToProject(), on: async () => setSaved(await saveNow()), unsaved: () => JSON.stringify(lib) !== savedText, saveNow },
  status: mark,
  actions: [
    { icon: 'plus', label: 'New', on: () => {
      let i = 1;
      while (lib[`new-${i}`]) i++;
      lib[`new-${i}`] = Array(N).fill('.'.repeat(N));
      name = `new-${i}`;
      undo.commit();
      render();
    } },
    { icon: 'copy', label: 'Copy', on: () => {
      let i = 2;
      while (lib[`${name}-${i}`]) i++;
      lib[`${name}-${i}`] = [...lib[name]];
      name = `${name}-${i}`;
      undo.commit();
      render();
    } },
    { icon: 'trash', label: 'Delete', on: () => {
      if (Object.keys(lib).length < 2) return;
      delete lib[name];
      name = Object.keys(lib)[0];
      undo.commit();
      setSaved(null);
      render();
    } },
  ],
});
main.className = 'uworkspace';
document.body.classList.add('upage--fill');

// Left: the library, search on top. Middle: the paint area and its tools. Right: the inspector.
const shelf = sidePanel('left', 'pixel-icons-library');
const area = document.createElement('div');
area.className = 'uwork';
const inspector = sidePanel('right', 'pixel-icons-inspector', 200);
main.append(shelf.panel, area, inspector.panel);

/** A library tile's picture: the working copy of an icon. */
const picture = (rows: readonly string[]) => {
  const { canvas, ctx } = pixelCanvas(N, N, S);
  drawRows(ctx, rows, 0, 0, PAINT);
  return canvas;
};

const paint = (x: number, y: number, ch: string) => {
  const rows = lib[name];
  if (x < 0 || y < 0 || x >= N || y >= N || rows[y][x] === ch) return false;
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
  return true;
};

type Cell = [number, number];
/** Paints the pixels joined to (x, y) that have its colour (up or down, left or right) with the chosen colour. */
function flood(x: number, y: number) {
  const rows = lib[name];
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const was = rows[y][x];
  const todo: Cell[] = [[x, y]];
  while (todo.length) {
    const [cx, cy] = todo.pop()!;
    if (cx < 0 || cy < 0 || cx >= N || cy >= N || rows[cy][cx] !== was || !paint(cx, cy, ink)) continue;
    todo.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}
/** The cells on the straight line between two cells. */
function lineCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let [x, y] = a;
  const dx = Math.abs(b[0] - x), dy = -Math.abs(b[1] - y), sx = x < b[0] ? 1 : -1, sy = y < b[1] ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x, y]);
    if (x === b[0] && y === b[1]) return out;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
/** The cells on the outline of the rectangle with corners a and b. */
const rectCells = (a: Cell, b: Cell): Cell[] => [lineCells(a, [b[0], a[1]]), lineCells([b[0], a[1]], b), lineCells(b, [a[0], b[1]]), lineCells([a[0], b[1]], a)].flat();

function editor(): HTMLElement {
  const { canvas, ctx } = pixelCanvas(N, N, CELL);
  // The transparent checker, one raster pixel per square, as a CSS gradient so the pixels stay crisp.
  canvas.style.background = `repeating-conic-gradient(${C.track} 0 25%, ${C.paper} 0 50%) 0 0 / ${S * 2}px ${S * 2}px`;
  const redraw = () => { ctx.clearRect(0, 0, N, N); drawRows(ctx, lib[name], 0, 0, PAINT); };
  redraw();
  const cell = (e: PointerEvent): Cell => { const r = canvas.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * N), Math.floor((e.clientY - r.top) / r.height * N)]; };
  let from: Cell | null = null;
  let last: Cell = [0, 0];
  let base: string[] = [];
  const apply = (a: Cell, b: Cell) => {
    const ch = tool === 'erase' ? '.' : ink;
    for (const [x, y] of tool === 'rect' ? rectCells(a, b) : lineCells(a, b)) paint(x, y, ch);
    redraw();
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (tool === 'fill') { flood(...cell(e)); redraw(); undo.commit(); setSaved(null); render(); return; }
    canvas.setPointerCapture(e.pointerId); from = last = cell(e); base = lib[name].slice(); apply(from, from); });
  canvas.addEventListener('pointermove', (e) => {
    if (!from) return;
    const to = cell(e);
    if (tool === 'draw' || tool === 'erase') { apply(last, to); last = to; return; }
    lib[name] = base.slice(); // a line or rectangle is drawn afresh from where it began
    apply(from, to);
  });
  canvas.addEventListener('pointerup', () => { from = null; undo.commit(); setSaved(null); render(); });
  canvas.style.touchAction = 'none';
  return canvas;
}

const list = library({ key: 'pixel-icons', items: () => Object.keys(lib).map((k) => ({ id: k, picture: picture(lib[k]), words: k })), selected: () => name, pick: (k) => { name = k; undo.reset(); render(); } });
shelf.body.append(list);

function render(): void {
  list.redraw();

  const rename = (to: string) => {
    to = to.trim();
    if (!to || to === name || lib[to]) return render();
    lib = Object.fromEntries(Object.entries(lib).map(([k, v]) => [k === name ? to : k, v]));
    name = to;
    undo.commit();
    setSaved(null);
    render();
  };

  // The tools float under the paint area.
  const tools = document.createElement('div');
  tools.className = 'urow';
  tools.append(...([['draw', 'pencil'], ['erase', 'eraser'], ['line', 'line'], ['rect', 'rect'], ['fill', 'bucket']] as const).map(([id, icon]) =>
    pixelButton(id[0].toUpperCase() + id.slice(1), { icon, flat: true, pressed: tool === id }, () => { tool = id; render(); })));

  // The inspector: the name and the colours.
  const colors: Option[] = Object.entries(PAINT).map(([id, color]) => ({ id, color }));
  inspector.body.replaceChildren(textField('Name', name, () => {}, { done: rename, width: 43 }), choice('Colors', colors, () => ink, (id) => { ink = id; }, 'colors', 43));

  area.replaceChildren(box(editor()), box(tools));
}
render();
