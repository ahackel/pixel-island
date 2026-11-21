// The icon editor: the shared library of 9 by 9 icons (ui/icons.json) drawn pixel by pixel. Pick an icon on the left, paint
// it big in the middle with the colours on the right. "Save" writes the whole library to the project's icons.json, which
// the game then lays over the engine's; promote it to the engine to share it.
import { saveToProject, canSaveToProject } from '../../shared/project.ts';
import { history } from '../../shared/history.ts';
import { drawRows, pixelCanvas } from '../../shared/pixel-ui.ts';
import { box, pixelButton, swatch } from '../../ui/components.ts';
import { ICONS } from '../../ui/icons.ts';
import { uiPage } from '../../ui/page.ts';
import { C, PAINT, S } from '../../ui/theme.ts';

const N = 9;
const CELL = 28;
let lib: Record<string, string[]> = Object.fromEntries(Object.entries(ICONS).map(([k, v]) => [k, [...v]]));
let name = Object.keys(lib)[0];
let ink = 'x';
let saved: boolean | null = null;

const undo = history(() => ({ lib, name }), (v) => { lib = v.lib; name = v.name; render(); });
const main = uiPage('icons');
const area = document.createElement('div');
area.className = 'urow';
area.style.alignItems = 'flex-start';
main.append(area);

const pic = (rows: readonly string[], scale: number) => {
  const { canvas, ctx } = pixelCanvas(N, N, scale);
  drawRows(ctx, rows, 0, 0, PAINT);
  return canvas;
};
/** A library tile: the working copy of an icon on a button's paper, lit when open. */
const tile = (rows: readonly string[], lit: boolean) => {
  const { canvas, ctx } = pixelCanvas(N + 4, N + 4, S);
  ctx.fillStyle = lit ? C.lit : C.paper;
  ctx.fillRect(0, 0, N + 4, N + 4);
  drawRows(ctx, rows, 2, 2, PAINT);
  return canvas;
};

const paint = (x: number, y: number, ch: string) => {
  const rows = lib[name];
  if (x < 0 || y < 0 || x >= N || y >= N || rows[y][x] === ch) return false;
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
  return true;
};

function editor(): HTMLElement {
  const { canvas, ctx } = pixelCanvas(N, N, CELL);
  // Grid lines over the picture: a CSS gradient, so the pixels stay crisp.
  canvas.style.background = `repeating-conic-gradient(${C.track} 0 25%, ${C.paper} 0 50%) 0 0 / ${CELL * 2}px ${CELL * 2}px`;
  const redraw = () => { ctx.clearRect(0, 0, N, N); drawRows(ctx, lib[name], 0, 0, PAINT); };
  redraw();
  const at = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return paint(Math.floor((e.clientX - r.left) / r.width * N), Math.floor((e.clientY - r.top) / r.height * N), ink); };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); if (at(e)) redraw(); });
  canvas.addEventListener('pointermove', (e) => canvas.hasPointerCapture(e.pointerId) && at(e) && redraw());
  canvas.addEventListener('pointerup', () => { undo.commit(); saved = null; render(); });
  canvas.style.touchAction = 'none';
  return canvas;
}

function render(): void {
  area.replaceChildren();
  // The library: every icon, the open one lit.
  const list = document.createElement('div');
  list.className = 'urow';
  list.style.maxWidth = '330px';
  list.append(...Object.keys(lib).map((k) => {
    const b = document.createElement('button');
    b.className = 'pbtn';
    b.title = k;
    b.append(tile(lib[k], k === name));
    b.addEventListener('click', () => { name = k; undo.reset(); render(); });
    return b;
  }));

  const rename = Object.assign(document.createElement('input'), { value: name, spellcheck: false, title: 'Name' });
  rename.addEventListener('change', () => {
    const to = rename.value.trim();
    if (!to || to === name || lib[to]) return void (rename.value = name);
    lib = Object.fromEntries(Object.entries(lib).map(([k, v]) => [k === name ? to : k, v]));
    name = to;
    undo.commit();
    saved = null;
    render();
  });

  const tools = document.createElement('div');
  tools.className = 'urow';
  tools.append(
    pixelButton('Undo', { icon: 'undo' }, () => { undo.undo(); saved = null; }),
    pixelButton('Redo', { icon: 'redo' }, () => { undo.redo(); saved = null; }),
    pixelButton('New', { icon: 'plus' }, () => {
      let i = 1;
      while (lib[`new-${i}`]) i++;
      lib[`new-${i}`] = Array(N).fill('.'.repeat(N));
      name = `new-${i}`;
      undo.commit();
      render();
    }),
    pixelButton('Copy', { icon: 'copy' }, () => {
      let i = 2;
      while (lib[`${name}-${i}`]) i++;
      lib[`${name}-${i}`] = [...lib[name]];
      name = `${name}-${i}`;
      undo.commit();
      render();
    }),
    pixelButton('Delete', { icon: 'trash' }, () => {
      if (Object.keys(lib).length < 2) return;
      delete lib[name];
      name = Object.keys(lib)[0];
      undo.commit();
      saved = null;
      render();
    }),
    pixelButton(canSaveToProject() ? 'Save to project' : 'Saving needs the dev server', { icon: saved ? 'check' : 'download' }, async () => {
      if (!canSaveToProject()) return;
      saved = await saveToProject('icons.json', lib);
      render();
    }),
  );
  const colors = document.createElement('div');
  colors.className = 'urow';
  colors.style.cssText = 'max-width: 200px';
  colors.append(swatch('Erase', null, ink === '.', () => { ink = '.'; render(); }),
    ...Object.entries(PAINT).map(([ch, color]) => swatch(ch, color, ink === ch, () => { ink = ch; render(); })));

  const preview = document.createElement('div');
  preview.className = 'urow';
  preview.append(...[1, 2, S].map((scale) => pic(lib[name], scale)));

  area.append(box(list), box(editor(), document.createElement('br'), tools), box(rename, colors, preview));
}
render();
