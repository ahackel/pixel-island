// Cheats for any game while developing (the game shows them for ?cheats): one orange button with a
// lightning bolt in the lower left, which slides a drawer of orange cheat buttons in from the left.
// Tapping a cheat keeps the drawer open; tapping beside it closes it. A cheat can hold a list of
// more, which takes the list's place when tapped until one of them is picked. Brings its own styles.
import { ABOVE, LINE_H, text, textWidth } from './pixel-font.ts';
import { drawRows, label, panel, pixelCanvas } from './pixel-ui.ts';
import { cachesNow, totals } from './stats.ts';

export interface Cheat {
  words: string;
  on?: () => void;
  /** Cheats that take the drawer's place when this one is tapped, such as a choice of weathers. */
  more?: Cheat[];
}

const ORANGE = '#e07a1f';
const WHITE = '#ffffff';
const SHADOW = '#00000040';
const BOLT = ['.....xx..', '....xx...', '...xx....', '..xxxxxx.', '.....xx..', '....xx...', '...xx....', '..x......', '.........'];

const CSS = `
.cheat-open, .cheat-btn { display: block; padding: 0; border: 0; background: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.cheat-open:active canvas, .cheat-btn:active canvas { filter: invert(1) hue-rotate(180deg); }
.cheat-open { position: absolute; left: max(12px, env(safe-area-inset-left)); bottom: max(12px, env(safe-area-inset-bottom)); }
.cheat-drawer { position: absolute; inset: 0; visibility: hidden; transition: visibility 0.25s; }
.cheat-drawer.open { visibility: visible; }
.cheat-drawer .cheat-panel { position: absolute; top: 0; bottom: 0; left: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; overflow-y: auto;
  padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  background: #000a; transform: translateX(-100%); transition: transform 0.25s ease-out; }
.cheat-drawer.open .cheat-panel { transform: none; }
.cheat-stats { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 3px;
  padding: 6px; background: #000a; pointer-events: none; }
`;
function addStyles(): void {
  if (document.getElementById('cheat-styles')) return;
  const style = document.createElement('style');
  style.id = 'cheat-styles';
  style.textContent = CSS;
  document.head.append(style);
}

/** An orange pixel button with white words or the bolt, `scale` times larger. */
function button(className: string, label: string, words: string | null, scale: number, on: () => void): HTMLButtonElement {
  const w = words ? textWidth(words) + 8 : 13;
  const h = 13;
  const { canvas, ctx } = pixelCanvas(w, h + 1, scale);
  panel(ctx, 0, 0, w, h, ORANGE, SHADOW);
  if (words) text(ctx, words, 4, Math.floor((h - LINE_H) / 2) + ABOVE, WHITE);
  else drawRows(ctx, BOLT, 2, 2, WHITE);
  const b = document.createElement('button');
  b.className = className;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.append(canvas);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    on();
  });
  return b;
}

/**
 * Adds the cheat button and its drawer to `parent` (a positioned element over the game), before
 * `before` if given, so an overlay such as a menu can stay on top.
 */
export function cheatDrawer(parent: HTMLElement, cheats: Cheat[], scale: number, before?: Element | null): void {
  addStyles();
  const drawer = document.createElement('div');
  drawer.className = 'cheat-drawer';
  const list = document.createElement('div');
  list.className = 'cheat-panel';
  // A cheat with more puts them in place of the list; picking one brings the list back.
  const show = (shown: Cheat[]) => {
    list.replaceChildren(...shown.map((c) => button('cheat-btn', c.words, c.words, scale, () => {
      c.on?.();
      if (c.more) show(c.more);
      else if (shown !== cheats) show(cheats);
    })));
  };
  show(cheats);
  drawer.append(list);
  const open = (on: boolean) => {
    // Opening always starts at the top list.
    if (on) show(cheats);
    drawer.classList.toggle('open', on);
  };
  // Tapping beside the panel closes it; taps on the panel stay there.
  drawer.addEventListener('click', () => open(false));
  list.addEventListener('click', (e) => e.stopPropagation());
  const opener = button('cheat-open', 'Cheats', null, scale, () => open(true));
  if (before) before.before(opener, drawer);
  else parent.append(opener, drawer);
}

const size = (b: number) => (b >= 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

/**
 * A stats overlay at the top middle, for a cheat to switch on and off: frames per second, milliseconds a frame takes
 * to draw, what the drawing caches hold (`shared/stats.ts`) and the JS heap where the browser tells it, twice a second.
 */
export function statsOverlay(parent: HTMLElement, scale: number): () => void {
  addStyles();
  const box = document.createElement('div');
  box.className = 'cheat-stats';
  box.hidden = true;
  parent.append(box);
  let last = totals();
  let lastAt = performance.now();
  let timer = 0;
  const draw = () => {
    const now = totals();
    const at = performance.now();
    const n = now.frames - last.frames;
    const fps = (n * 1000) / Math.max(1, at - lastAt);
    const ms = n ? (now.frameMs - last.frameMs) / n : 0;
    [last, lastAt] = [now, at];
    const held = cachesNow().filter((c) => c.entries);
    const lines = [
      `FPS ${Math.round(fps)}  FRAME ${ms.toFixed(1)} MS`,
      `CACHES ${size(held.reduce((b, c) => b + c.bytes, 0))}`,
      ...held.map((c) => `  ${c.name.toUpperCase()} ${c.entries}: ${size(c.bytes)}`),
      ...(now.heapMB ? [`HEAP ${now.heapMB} MB`] : []),
    ];
    box.replaceChildren(...lines.map((l) => label(l, WHITE, scale)));
  };
  return () => {
    box.hidden = !box.hidden;
    clearInterval(timer);
    if (box.hidden) return;
    [last, lastAt] = [totals(), performance.now()];
    timer = window.setInterval(draw, 500);
    draw();
  };
}
