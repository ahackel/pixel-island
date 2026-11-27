/**
 * Pictures as caches keep them: cut to the box round what they paint, each pixel a 2-byte index into one
 * shared colour table instead of a string slot. A picture holds no ground shadow: shadows are cast from the sun.
 */

/** Every colour any cropped picture uses, once; index 0 is empty. */
const colors: (string | null)[] = [null];
const indices = new Map<string, number>();
function indexOf(hex: string): number {
  let k = indices.get(hex);
  if (k === undefined) {
    if (colors.length > 0xffff) throw new Error('more than 65535 colours in cropped pictures');
    indices.set(hex, (k = colors.length));
    colors.push(hex);
  }
  return k;
}

export class Cropped {
  constructor(
    readonly w: number,
    readonly h: number,
    /** Where the thing stands, in the cropped box. */
    readonly foot: { x: number; y: number },
    private readonly px: Uint16Array,
  ) {}
  get(x: number, y: number): string | null {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : colors[this.px[y * this.w + x]];
  }
  /**
   * The picture mirrored left to right on its full `fullW`-wide canvas, where it stands at column `footX`: the same as
   * cropping the mirrored canvas.
   */
  mirrored(fullW: number, footX: number): Cropped {
    const { w, h } = this;
    const x0 = footX - this.foot.x;
    const px = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + w - 1 - x] = this.px[y * w + x];
    return new Cropped(w, h, { x: footX - (fullW - x0 - w), y: this.foot.y }, px);
  }
  get bytes(): number {
    return this.px.byteLength;
  }
}

/** A `w`×`h` picture standing on `foot`, cut to what it paints. Read once, so the source may be reused after. */
export function crop(p: { get(x: number, y: number): string | null }, w: number, h: number, foot: { x: number; y: number }): Cropped {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!p.get(x, y)) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return new Cropped(1, 1, { x: 0, y: 0 }, new Uint16Array(1));
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const px = new Uint16Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const hex = p.get(x + x0, y + y0);
    if (hex) px[y * cw + x] = indexOf(hex);
  }
  return new Cropped(cw, ch, { x: foot.x - x0, y: foot.y - y0 }, px);
}
