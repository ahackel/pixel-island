// The game's interface pieces, drawn as flat pixel art with the engine's pixel font and panels.
import { LINE_H, text, textWidth } from '@pixel/shared/pixel-font.ts';
import { drawRows, panel, pixelCanvas, rounded } from '@pixel/shared/pixel-ui.ts';

/** How many screen pixels one interface pixel takes: big enough to tap on an iPad. */
export const S = window.innerWidth < 600 ? 3 : 4;

export const C = {
  ink: '#2b1d12', paper: '#f6ecd2', empty: '#f6ecd28c', shadow: '#00000040', track: '#e2d3ae', hunger: '#e0862e', energy: '#4f9ad6', low: '#d9412b',
  night: '#2f3b6e', moon: '#f3eccf', white: '#ffffff',
};

/** Icons, 9 by 9: each character a colour of `PAINT`, '.' nothing. */
const PAINT: Record<string, string> = {
  x: C.ink, k: '#1f1f1f', r: '#d9412b', b: '#2f3b6e', g: '#cfe6f2', h: '#8a5a2b', y: '#f6c94a', o: '#e8862a', w: '#4f9ad6', m: '#f6e6a6', s: '#d8c27a', t: '#ffffff',
};
export const ICONS = {
  zoomIn: ['..xxx....', '.xgggx...', 'xggxggx..', 'xgxxxgx..', 'xggxggx..', '.xgggx...', '..xxx.h..', '......hh.', '.......hh'],
  zoomOut: ['..xxx....', '.xgggx...', 'xgggggx..', 'xgxxxgx..', 'xgggggx..', '.xgggx...', '..xxx.h..', '......hh.', '.......hh'],
  menu: ['.........', '.........', '.xxxxxxx.', '.........', '.xxxxxxx.', '.........', '.xxxxxxx.', '.........', '.........'],
  sun: ['....y....', '.y.....y.', '...ooo...', '..oyyyo..', 'y.oyyyo.y', '..oyyyo..', '...ooo...', '.y.....y.', '....y....'],
  dusk: ['.........', '.y..y..y.', '.........', '...ooo...', '..oyyyo..', '.oyyyyyo.', 'wwwwwwwww', '.........', '..ww.ww..'],
  moon: ['..mmmm...', '.mmms..t.', 'mmms.....', 'mmms.....', 'mmms..t..', 'mmms.....', '.mmms....', '..mmmm...', '.........'],
  // Flags for the language, a flag's shape inside the square.
  en: ['.........', 'btbtrrrrr', 'bbbbttttt', 'btbtrrrrr', 'bbbbttttt', 'ttttttttt', 'rrrrrrrrr', '.........', '.........'],
  de: ['.........', 'kkkkkkkkk', 'kkkkkkkkk', 'rrrrrrrrr', 'rrrrrrrrr', 'yyyyyyyyy', 'yyyyyyyyy', '.........', '.........'],
} as const;
export type Icon = keyof typeof ICONS;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => Object.assign(document.createElement(tag), { className: cls });

/**
 * A flat button with an icon, words, or an icon then words. `dark` for the night's own button.
 */
export function pixelButton(label: string, face: { icon?: Icon; words?: string; dark?: boolean }, on: () => void): HTMLButtonElement {
  const iconW = face.icon ? 9 : 0;
  const wordsW = face.words ? textWidth(face.words) : 0;
  const w = face.words ? 4 + iconW + (face.icon ? 3 : 0) + wordsW + 4 : 13;
  const h = 13;
  const { canvas, ctx } = pixelCanvas(w, h + 1, S);
  panel(ctx, 0, 0, w, h, face.dark ? C.night : C.paper, C.shadow);
  if (face.icon) drawRows(ctx, ICONS[face.icon], face.words ? 4 : 2, 2, PAINT);
  if (face.words) text(ctx, face.words, w - 4 - wordsW, 4, face.dark ? C.white : C.ink);
  const b = el('button', 'pbtn');
  b.setAttribute('aria-label', label);
  b.title = label;
  b.append(canvas);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    on();
  });
  return b;
}

/** The day and the two bars, redrawn into one canvas. */
export function hud(labels: { hunger: string; energy: string }): { canvas: HTMLCanvasElement; draw: (day: string, icon: Icon, hunger: number, energy: number, low: number) => void } {
  const lw = Math.max(textWidth(labels.hunger), textWidth(labels.energy));
  const barW = 32;
  const w = 5 + lw + 4 + barW + 5;
  const h = 31;
  const { canvas, ctx } = pixelCanvas(w, h + 1, S);
  let shown = '';
  const draw = (day: string, icon: Icon, hunger: number, energy: number, low: number) => {
    const fill = (n: number) => Math.round(n * barW);
    const key = `${day}|${icon}|${fill(hunger)}|${fill(energy)}|${hunger < low}|${energy < low}`;
    if (key === shown) return;
    shown = key;
    ctx.clearRect(0, 0, w, h + 1);
    panel(ctx, 0, 0, w, h, C.paper, C.shadow);
    drawRows(ctx, ICONS[icon], 4, 3, PAINT);
    text(ctx, day, 16, 5, C.ink);
    const bar = (y: number, name: string, n: number, color: string) => {
      text(ctx, name, 5, y, C.ink);
      const x = 5 + lw + 4;
      rounded(ctx, x, y, barW, 5, C.track);
      const f = fill(n);
      if (f >= 2) rounded(ctx, x, y, f, 5, n < low ? C.low : color);
    };
    bar(15, labels.hunger, hunger, C.hunger);
    bar(15 + LINE_H, labels.energy, energy, C.energy);
  };
  return { canvas, draw };
}

/** A bag slot: a flat tile, with a picture in it or empty. */
export function slot(picture: { rows: readonly string[]; colors: Record<string, string> } | null): HTMLCanvasElement {
  const { canvas, ctx } = pixelCanvas(13, 14, S);
  if (picture) panel(ctx, 0, 0, 13, 13, C.paper, C.shadow);
  else rounded(ctx, 0, 0, 13, 13, C.empty);
  if (picture) drawRows(ctx, picture.rows, Math.floor((13 - picture.rows[0].length) / 2), Math.floor((13 - picture.rows.length) / 2), picture.colors);
  return canvas;
}
