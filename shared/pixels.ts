// Putting rule-drawn sprites on canvases: painting a crop of one, enlarging by whole numbers, and
// small pictures trimmed to what is painted. Shared by the editors and the start page.

export interface Rect { x: number; y: number; w: number; h: number }
/** Anything drawn by rule: a colour per pixel as `#rrggbb` or `#rrggbbaa`, or null where nothing is painted. */
type Picture = { get(x: number, y: number): string | null };

/** Writes one colour into an image, replacing what was there. */
export function setPixel(image: ImageData, x: number, y: number, hex: string): void {
  const o = (y * image.width + x) * 4;
  for (let k = 0; k < 3; k++) image.data[o + k] = parseInt(hex.slice(1 + k * 2, 3 + k * 2), 16);
  image.data[o + 3] = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255;
}

/** Paints a crop of a sprite onto a canvas, which takes the crop's size. */
export function paintSprite(canvas: HTMLCanvasElement, sprite: Picture, crop: Rect): void {
  if (canvas.width !== crop.w || canvas.height !== crop.h) Object.assign(canvas, { width: crop.w, height: crop.h });
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(crop.w, crop.h);
  for (let y = 0; y < crop.h; y++) for (let x = 0; x < crop.w; x++) {
    const hex = sprite.get(x + crop.x, y + crop.y);
    if (hex) setPixel(image, x, y, hex);
  }
  ctx.putImageData(image, 0, 0);
}

/** Whole-number enlargement that fits a box, so pixels stay square. `cap` is the most it is enlarged. */
export function fitWhole(canvas: HTMLCanvasElement, box: number, cap = Infinity): HTMLCanvasElement {
  const scale = Math.max(1, Math.min(cap, Math.floor(box / Math.max(canvas.width, canvas.height))));
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
  return canvas;
}

/**
 * A small picture of a sprite, trimmed to what it paints and enlarged to fit the box. Colours that
 * `skip` names (the ground shadow) do not count towards the trim; `drop` leaves them out of the picture too.
 */
export function trimmed(sprite: Picture, w: number, h: number, box: number, skip: (hex: string) => boolean = () => false, drop = false): HTMLCanvasElement {
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const hex = sprite.get(x, y);
    if (!hex || skip(hex)) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const canvas = document.createElement('canvas');
  const shown = drop ? { get: (x: number, y: number) => { const hex = sprite.get(x, y); return hex && !skip(hex) ? hex : null; } } : sprite;
  paintSprite(canvas, shown, { x: x0, y: y0, w: Math.max(1, x1 - x0 + 1), h: Math.max(1, y1 - y0 + 1) });
  return fitWhole(canvas, box);
}

/**
 * Keeps small pictures that take long to draw, by a key that says what they show. Each call gives
 * a new canvas with the kept picture on it, so a picture can be on the page more than once.
 */
export function pictureCache(className: string, limit = 200): { of(key: string, draw: () => HTMLCanvasElement): HTMLCanvasElement } {
  const kept = new Map<string, HTMLCanvasElement>();
  return {
    of(key, draw) {
      let made = kept.get(key);
      if (!made) {
        if (kept.size >= limit) kept.clear();
        kept.set(key, (made = draw()));
      }
      const copy = document.createElement('canvas');
      Object.assign(copy, { width: made.width, height: made.height, className });
      copy.style.cssText = made.style.cssText;
      copy.getContext('2d')!.drawImage(made, 0, 0);
      return copy;
    },
  };
}
