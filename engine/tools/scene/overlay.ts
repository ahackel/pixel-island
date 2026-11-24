// Marks over the scene editor's desk at the screen's own size: a label, a button or a tab pinned to a point of the
// desk, maybe with a line out to it. They follow the desk as it pans, zooms and turns, but keep their size whatever
// the zoom, as the rest of the editor's buttons do. The scene names and the stubs of ways to scenes not open are pins.

type XY = { x: number; y: number };

export interface Pin {
  /** Names what the element shows: it is made once per key and kept while the key stays (a new look, a new key). */
  key: string;
  /** The point of the desk it belongs to, in desk pixels. */
  at: XY;
  /** How far from that point the element stands, in screen pixels. */
  out?: XY;
  /** The colour of a line from the point out to the element, if one is drawn. */
  line?: string;
  /**
   * Which point of the element sits at the end of `out`, as fractions of its size (0.5, 1 is the middle of its bottom
   * edge). By default it hangs off the end of `out`, on the side away from the point, so a line to it shows.
   */
  align?: XY;
  make: () => HTMLElement;
}

/** A line between two points of the desk (desk pixels), drawn at the screen's own thickness; dashed for a weaker tie. */
export interface Line { from: XY; to: XY; color: string; dashed?: boolean }

/** A line's pixels, in screen pixels: a little under one pixel of the editor's buttons. */
export const LINE_PIXEL = 3;

export class Overlay {
  /** Goes over the desk's canvas, as large as the view; only the pins themselves take pointer events. */
  readonly el = document.createElement('div');
  private readonly lines = document.createElement('canvas');
  private readonly box = document.createElement('div');
  private shown = new Map<string, HTMLElement>();
  private keys = '';

  constructor() {
    this.el.className = 'desk-overlay';
    this.lines.className = 'desk-overlay__lines';
    this.box.className = 'desk-overlay__pins';
    this.el.append(this.lines, this.box);
  }

  /** The element shown for a key, if it is shown. */
  element(key: string): HTMLElement | undefined {
    return this.shown.get(key);
  }

  /**
   * Shows these pins, the later ones over the earlier, and these lines under them; `screenOf` puts a point of the desk
   * on the view, in screen pixels.
   */
  show(pins: Pin[], screenOf: (p: XY) => XY, lines: Line[] = []): void {
    const keys = pins.map((p) => p.key).join('\n');
    if (keys !== this.keys) {
      this.keys = keys;
      const next = new Map<string, HTMLElement>();
      for (const pin of pins) {
        const el = this.shown.get(pin.key) ?? pin.make();
        el.classList.add('desk-pin');
        next.set(pin.key, el);
      }
      // Only what changed moves, so an element being dragged keeps its pointer.
      const want = [...next.values()];
      for (const old of this.shown.values()) if (!want.includes(old)) old.remove();
      want.forEach((el, k) => {
        if (this.box.children[k] !== el) this.box.insertBefore(el, this.box.children[k] ?? null);
      });
      this.shown = next;
    }

    const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
    if (this.lines.width !== w || this.lines.height !== h) {
      this.lines.width = w;
      this.lines.height = h;
    }
    const ctx = this.lines.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    for (const l of lines) line(ctx, screenOf(l.from), screenOf(l.to), l.color, l.dashed);
    for (const pin of pins) {
      const a = screenOf(pin.at);
      const out = pin.out ?? { x: 0, y: 0 };
      const b = { x: a.x + out.x, y: a.y + out.y };
      if (pin.line) line(ctx, a, b, pin.line);
      const el = this.shown.get(pin.key)!;
      el.style.left = `${Math.round(b.x)}px`;
      el.style.top = `${Math.round(b.y)}px`;
      const m = Math.max(Math.abs(out.x), Math.abs(out.y));
      const align = pin.align ?? (m ? { x: 0.5 - (0.5 * out.x) / m, y: 0.5 - (0.5 * out.y) / m } : { x: 0.5, y: 0.5 });
      el.style.transform = `translate(${-100 * align.x}%, ${-100 * align.y}%)`;
    }
  }
}

/** A line of square pixels, as the pixel art is drawn, the same thickness at any zoom. */
function line(ctx: CanvasRenderingContext2D, a: XY, b: XY, color: string, dashed = false): void {
  const p = LINE_PIXEL;
  ctx.fillStyle = color;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / p));
  for (let k = 0; k <= n; k++) {
    // Dashes of three pixels with three left out.
    if (dashed && k % 6 >= 3) continue;
    const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
    ctx.fillRect(Math.floor(x / p) * p, Math.floor(y / p) * p, p, p);
  }
}
