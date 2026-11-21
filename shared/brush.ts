// The scene editor's round brush. No DOM, so `node scripts/brush-check.mjs` can test it.

/** The tiles a round brush of `size` tiles across covers around a centre tile, as offsets. */
export function roundBrush(size: number): [number, number][] {
  const r = Math.ceil(size / 2);
  const limit = (size / 2) ** 2 + 0.35;
  const out: [number, number][] = [];
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (di * di + dj * dj <= limit) out.push([di, dj]);
  return out;
}
