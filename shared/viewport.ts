// A pixel canvas with a camera, for any game or tool: whole-pixel zoom that eases, two-finger pinch
// and pan, trackpad scroll and pinch, mouse wheel. One-finger or mouse presses are handed to the
// page as `press` (the down and each move while held), in ground-image pixels.
// shortcut: tools/scene/main.ts still has its own copy of this logic; move it onto Viewport when that page is next reworked.

export interface ViewportOptions {
  zoom?: number;
  min?: number;
  max?: number;
  /** A one-pointer press at a ground-image pixel; `start` on the down, false while it moves held. */
  press?: (p: { x: number; y: number }, start: boolean) => void;
}

export class Viewport {
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** The ground-image pixel in the middle of the view. */
  cam = { x: 0, y: 0 };
  zoom: number;
  /** The view's size in ground-image pixels. */
  w = 1;
  h = 1;
  private min: number;
  private max: number;
  private target: number;
  private anchor: { x: number; y: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; zoom: number; mid: { x: number; y: number }; cam: { x: number; y: number } } | null = null;
  private pressing = false;

  constructor(o: ViewportOptions = {}) {
    this.min = o.min ?? 1;
    this.max = o.max ?? 8;
    this.zoom = this.target = this.clamp(o.zoom ?? 3);
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;inset:0;overflow:hidden;touch-action:none';
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'image-rendering:pixelated;display:block';
    this.el.append(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    new ResizeObserver(() => this.fit()).observe(this.el);
    this.listen(o.press);
  }

  private clamp(z: number): number {
    return Math.max(this.min, Math.min(this.max, z));
  }

  private fit(): void {
    const box = this.el.getBoundingClientRect();
    this.w = Math.max(1, Math.ceil(box.width / this.zoom));
    this.h = Math.max(1, Math.ceil(box.height / this.zoom));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.canvas.style.width = `${this.w * this.zoom}px`;
    this.canvas.style.height = `${this.h * this.zoom}px`;
  }

  /** The part of the ground image on screen. */
  rect(): { x: number; y: number; w: number; h: number } {
    return { x: Math.round(this.cam.x - this.w / 2), y: Math.round(this.cam.y - this.h / 2), w: this.w, h: this.h };
  }

  /** The ground-image pixel under a screen point. */
  toGround(clientX: number, clientY: number): { x: number; y: number } {
    const box = this.canvas.getBoundingClientRect();
    const r = this.rect();
    return { x: (clientX - box.left) / this.zoom + r.x, y: (clientY - box.top) / this.zoom + r.y };
  }

  /** The screen point of a ground-image pixel, relative to the viewport element. */
  toScreen(x: number, y: number): { x: number; y: number } {
    const r = this.rect();
    return { x: (x - r.x) * this.zoom, y: (y - r.y) * this.zoom };
  }

  /** Sets the zoom, keeping the ground under a screen point (default: the middle) in place. */
  private zoomAt(next: number, at: { x: number; y: number } | null): void {
    next = this.clamp(next);
    if (next === this.zoom) return;
    if (at) {
      const box = this.el.getBoundingClientRect();
      const dx = at.x - (box.left + box.width / 2);
      const dy = at.y - (box.top + box.height / 2);
      this.cam.x += dx / this.zoom - dx / next;
      this.cam.y += dy / this.zoom - dy / next;
    }
    this.zoom = next;
    this.fit();
  }

  step(by: number): void {
    this.target = this.clamp(Math.round(this.target) + by);
    this.anchor = null;
  }

  /** Eases the zoom toward its target; call once a frame. */
  update(dt: number): void {
    if (this.zoom === this.target) return;
    const next = this.zoom + (this.target - this.zoom) * (1 - Math.exp(-14 * dt));
    this.zoomAt(Math.abs(this.target - next) < 0.005 ? this.target : next, this.anchor);
  }

  /** Shows a picture the size of the view. */
  show(image: { data: Uint8ClampedArray; width: number; height: number }): void {
    this.ctx.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  }

  private pair() {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  private listen(press: ViewportOptions['press']): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const { dist, mid } = this.pair();
        this.pinch = { dist, zoom: this.zoom, mid, cam: { ...this.cam } };
        this.pressing = false;
      } else if (this.pointers.size === 1 && e.button === 0) {
        this.pressing = true;
        press?.(this.toGround(e.clientX, e.clientY), true);
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size === 2) {
        const { dist, mid } = this.pair();
        this.zoom = this.target = this.clamp(this.pinch.zoom * (dist / this.pinch.dist));
        this.fit();
        this.cam.x = this.pinch.cam.x - (mid.x - this.pinch.mid.x) / this.zoom;
        this.cam.y = this.pinch.cam.y - (mid.y - this.pinch.mid.y) / this.zoom;
      } else if (this.pressing) press?.(this.toGround(e.clientX, e.clientY), false);
    });
    const release = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      // Lifting one finger of a pinch does not start a press with the other.
      if (this.pointers.size < 2) this.pinch = null;
      if (!this.pointers.size) this.pressing = false;
    };
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', release);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // A trackpad sends a two-finger move as scrolling, which pans, and a pinch as scrolling with Ctrl held, which zooms.
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (e.ctrlKey) {
        this.target = this.clamp(this.target * Math.exp(-e.deltaY * scale * 0.01));
        this.anchor = { x: e.clientX, y: e.clientY };
        return;
      }
      this.cam.x += (e.deltaX * scale) / this.zoom;
      this.cam.y += (e.deltaY * scale) / this.zoom;
    }, { passive: false });
  }
}
