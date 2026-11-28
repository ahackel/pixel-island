// Pixel-art pieces for a game's interface: flat panels with rounded corners and a soft shadow line under them, words
// in the pixel font, speech bubbles with a tip, little pictures written as rows. Each piece is a small canvas shown
// `scale` times larger, so it stays sharp over the game whatever the game's own zoom.
import { ABOVE, LINE_H, LINE_STEP, text, textWidth, wrap } from './pixel-font.ts';

/** `shadow`: the line under a panel; best a dark colour with some alpha, so it works on any ground. */
export interface Colors { ink: string; paper: string; shadow?: string }

/** A canvas of w by h pixels shown at `scale`. */
export function pixelCanvas(w: number, h: number, scale: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.style.cssText = `width:${w * scale}px;height:${h * scale}px;image-rendering:pixelated;display:block`;
  return { canvas, ctx: canvas.getContext('2d')! };
}

/** A filled rectangle with its corner pixels left out. */
export function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
}

/** A flat panel, w by h, and, given a shadow colour, a shadow line one pixel under it (so it takes h + 1 rows). */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, shadow?: string): void {
  if (shadow) rounded(ctx, x, y + 1, w, h, shadow);
  ctx.clearRect(x + 1, y, w - 2, h);
  ctx.clearRect(x, y + 1, w, h - 2);
  rounded(ctx, x, y, w, h, fill);
}

/** A frame: a line round with the corner pixels left out, filled (the Lop Hop look). */
export function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, edge: string, fill: string): void {
  rounded(ctx, x, y, w, h, edge);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
}

/**
 * Draws a little picture written as rows. One colour: every non-'.' character is a pixel in it. Several: each
 * character its colour from the map, characters not in it left out.
 */
export function drawRows(ctx: CanvasRenderingContext2D, rows: readonly string[], x: number, y: number, colors: string | Record<string, string>): void {
  rows.forEach((r, dy) => [...r].forEach((c, dx) => {
    const color = typeof colors === 'string' ? (c === '.' ? null : colors) : colors[c];
    if (!color) return;
    ctx.fillStyle = color;
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }));
}

/** Words alone, on nothing: the whole text cell, so umlaut dots and tails fit. `cased`: small letters stay small (a name as typed). */
export function label(s: string, color: string, scale: number, cased = false): HTMLCanvasElement {
  const { canvas, ctx } = pixelCanvas(textWidth(s, cased), LINE_H, scale);
  text(ctx, s, 0, ABOVE, color, 'left', cased);
  return canvas;
}

/**
 * A speech bubble: words on a flat panel with a tip at the bottom middle pointing down. The tip's point is the canvas's
 * bottom middle. `room`: pixels kept free right of the words, for a sign the game lays over the bubble.
 */
export function speechBubble(s: string, c: Colors, scale: number, maxW = 90, room = 0): HTMLCanvasElement {
  const lines = wrap(s, maxW);
  const tw = Math.max(...lines.map((l) => textWidth(l)));
  const w = tw + 8 + room;
  // Letters 4 rows down (dots in the 2 rows over them), 3 rows under the last line's foot.
  const boxH = (lines.length - 1) * LINE_STEP + 4 + 5 + 3;
  const tip = 3;
  const shade = c.shadow ? 1 : 0;
  const { canvas, ctx } = pixelCanvas(w, boxH + tip + shade, scale);
  const mid = Math.floor(w / 2);
  // The tip: rows narrowing to a point, under the panel, its shadow a pixel lower.
  const drawTip = (dy: number, color: string) => {
    ctx.fillStyle = color;
    for (let r = 0; r < tip; r++) ctx.fillRect(mid - (tip - 1 - r), boxH + r + dy, (tip - 1 - r) * 2 + 1, 1);
  };
  if (c.shadow) drawTip(1, c.shadow);
  panel(ctx, 0, 0, w, boxH, c.paper, c.shadow);
  drawTip(0, c.paper);
  lines.forEach((line, n) => text(ctx, line, 4 + (tw - textWidth(line)) / 2, 4 + n * LINE_STEP, c.ink));
  return canvas;
}
