// What the survivor says. A passing thought ("Got one!") is a bubble over their head that goes when read or at a tap.
// A story thought (the morning's, the day plan's, waking to thunder) is a box at the bottom with their face: the island
// dims and stands still until a tap, and thoughts that come meanwhile wait their turn.
import type { Actor } from '@pixel/engine/world/actor.ts';
import { SHADOW } from '@pixel/engine/core/palette.ts';
import { C, caps, dialog as storyDialog, S } from '@pixel/shared/game-ui.ts';
import { speechBubble } from '@pixel/shared/pixel-ui.ts';
import { t } from './i18n.ts';

/** How long a thought takes to read: a moment, and more for each letter. */
const readMs = (words: string) => Math.min(12_000, Math.max(3000, 1500 + 70 * words.length));
/** A tap only puts a thought away once it has shown this long, so the tap that caused it does not. */
const TAP_AFTER = 700;
/** The face in the box: the survivor's head in the same three-quarter view always, cut from their picture. */
const FACE = 22;

export interface Talk {
  /** The bubble and the box, for the page. */
  bubble: HTMLElement;
  dialog: HTMLElement;
  /** A passing thought, by its text id. */
  think(key: string): void;
  unthink(): void;
  /** Whether a passing thought shows. */
  thinking(): boolean;
  /** A story thought, by its text id, after any still waiting. */
  tell(key: string): void;
  /** Whether a story thought is up, which holds the game still. */
  telling(): boolean;
  /** Puts away the story thought shown and those waiting, and the passing one: the night (or the end) begins. */
  forget(): void;
  /** Each frame: the bubble goes once read, else follows the survivor's head at screen point `x`, `y`. */
  follow(ms: number, x: number, y: number): void;
}

/** The survivor's talk, on `app`, with `who`'s face; a tap while `paused` leaves a thought up. */
export function talkView(app: HTMLElement, who: Actor, paused: () => boolean): Talk {
  const bubble = Object.assign(document.createElement('div'), { className: 'bubble', hidden: true });
  /** When the passing thought goes away by itself, and when it came. */
  let bubbleUntil = 0;
  let bubbleShown = 0;
  /** Half the bubble's width, and the page's, in screen pixels: read when they change, not every frame. */
  let bubbleHalf = 0;
  let appWidth = app.clientWidth;
  addEventListener('resize', () => (appWidth = app.clientWidth));
  /** The bubble's transform, set only when it changes. */
  let placed = '';

  function think(key: string): void {
    const words = t(key);
    bubble.replaceChildren(speechBubble(caps(words), C, S));
    bubble.setAttribute('aria-label', words);
    bubble.hidden = false;
    // Measured once, as it is shown: it only changes with the words.
    bubbleHalf = bubble.offsetWidth / 2;
    bubbleShown = performance.now();
    bubbleUntil = bubbleShown + readMs(words);
    who.talkUntil = bubbleShown + Math.min(readMs(words), 4000);
  }
  function unthink(): void {
    bubble.hidden = true;
    bubbleUntil = 0;
  }
  // Any tap puts a passing thought away (and still walks, picks up, ...), once it has been there a moment.
  app.addEventListener('pointerdown', () => {
    if (!bubble.hidden && performance.now() - bubbleShown > TAP_AFTER && !paused()) unthink();
  }, { capture: true });

  const dialog = Object.assign(document.createElement('div'), { className: 'dialog', hidden: true });
  const told: string[] = [];
  let toldShown = 0;
  const telling = () => !dialog.hidden;
  function tell(key: string): void {
    told.push(key);
    if (!telling()) showTold();
  }
  function showTold(): void {
    const key = told.shift();
    if (!key) return void (dialog.hidden = true);
    unthink();
    dialog.replaceChildren(storyBox(caps(t(key))));
    dialog.setAttribute('aria-label', t(key));
    dialog.hidden = false;
    toldShown = performance.now();
  }
  dialog.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (performance.now() - toldShown > TAP_AFTER) showTold();
  });
  function forget(): void {
    told.length = 0;
    dialog.hidden = true;
    unthink();
  }

  function drawFace(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const me = who.portrait();
    const ink = (px: number, py: number) => { const c = me.picture.get(px, py); return c && c !== SHADOW ? c : null; };
    // From the top of the hat or hair down, centred on what is drawn in those rows.
    let top = 0;
    while (top < me.h && ![...Array(me.w).keys()].some((px) => ink(px, top))) top++;
    const xs = [...Array(me.w).keys()].filter((px) => [...Array(FACE).keys()].some((fy) => ink(px, top + fy)));
    const x0 = Math.round((xs[0] + xs[xs.length - 1] + 1) / 2 - FACE / 2);
    for (let fy = 0; fy < FACE; fy++) for (let fx = 0; fx < FACE; fx++) {
      const c = ink(x0 + fx, top + fy - 1);
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + fx, y + fy, 1, 1);
    }
  }
  /** The box: the face in a frame on the left, the words beside it; as wide as the screen allows. */
  const storyBox = (words: string) => storyDialog(words, drawFace, Math.min(200, Math.floor((window.innerWidth - 24) / S)), FACE);

  function follow(ms: number, x: number, y: number): void {
    if (!bubble.hidden && ms > bubbleUntil) unthink();
    if (bubble.hidden) return;
    // Centred over the survivor, but kept on the screen when they stand near its edge.
    const transform = `translate(${Math.min(appWidth - 8 - bubbleHalf, Math.max(8 + bubbleHalf, x))}px, ${y}px) translate(-50%, -100%)`;
    if (transform !== placed) bubble.style.transform = placed = transform;
  }

  return { bubble, dialog, think, unthink, thinking: () => !bubble.hidden, tell, telling, forget, follow };
}
