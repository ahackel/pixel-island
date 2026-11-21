// The skeleton: a character like any other (the same rig, clips and wardrobe) drawn in bone, with
// a skull for a head, ribs and a pelvis for a body, and gaps at the joints (`Look.skeleton`).
import type { Cell, PaletteKey } from '../core/palette.ts';
import { parseStamp, TORSO_FRAME, type Item, type Stamp } from '../core/puppet.ts';

export const BONE: PaletteKey = 'bone';

const INK: Cell = { key: 'ink', shade: false };
const SHADE: Cell = { key: BONE, shade: true };

/**
 * The skull's one face, whatever the mood: big hollow eyes, a nose hole, and a grin, in black pixels only.
 * Placed by where the neutral face has its eyes, nose and mouth, so it fits each view; side on it faces right. Every name gets the same face; the view from behind has none.
 */
export function skullFaces(faces: Record<string, Stamp>, head: Stamp): Record<string, Stamp> {
  const from = faces.neutral;
  if (!from) return {};
  const cells = (match: (c: Cell) => boolean) => from.flatMap((row, y) => row.flatMap((c, x) => (c && match(c) ? [[x, y] as const] : [])));
  const face: Stamp = from.map((row) => row.map(() => null));
  const put = (x: number, y: number, cell: Cell) => { (face[y] ??= [])[x] = cell; };
  // Eyes: the ink of the top rows, two face on, one side on. They are a pixel wider: outwards face on,
  // towards the back of the skull side on.
  const ink = cells((c) => c.key === 'ink' || c.key === 'tooth');
  const top = Math.min(...ink.map(([, y]) => y));
  const sockets = ink.filter(([, y]) => y <= top + 2);
  const xs = sockets.map(([x]) => x);
  const two = Math.max(...xs) - Math.min(...xs) > 4;
  const mid = (Math.max(...xs) + Math.min(...xs)) / 2;
  for (const [x, y] of sockets) {
    put(x, y, INK);
    put(two && x > mid ? x + 1 : x - 1, y, INK);
  }
  // A little shade under the outer end of each socket, for the cheekbones.
  const bottom = top + 3;
  for (const x of two ? [Math.min(...xs) - 1, Math.max(...xs) + 1] : [Math.min(...xs) - 1]) put(x, bottom, SHADE);
  // Side on the nose is a hole just in front of the socket, where the face dips in.
  if (!two) put(Math.max(...xs) + 1, bottom, INK);
  // The nose hole: the lowest row of the nose, between the eyes face on.
  const nose = cells((c) => !!c.flush).filter(([x]) => !two || (x >= Math.min(...xs) && x <= Math.max(...xs)));
  if (nose.length) {
    const row = Math.max(...nose.map(([, y]) => y));
    for (const [x, y] of nose) if (y === row) put(x, y, INK);
  }
  // The grin: black only, the teeth are the skull's own colour between the ticks. The ends turn up and
  // the jaw is a little open under the teeth. An odd width keeps a tick in the middle.
  const mouth = cells((c) => c.key === 'mouth');
  if (mouth.length) {
    const mx = mouth.map(([x]) => x);
    // A row lower than a face puts it, so the nose hole has skin between it and the teeth.
    const y = mouth[0][1] + 1;
    const w = Math.max(...mx) - Math.min(...mx) + 1;
    const x0 = Math.max(...mx) - (w % 2 ? w : w + 1) + 1 - 1;
    // Two pixels wider than the face's own mouth, one on each side.
    const n = (w % 2 ? w : w + 1) + 2;
    // Side on the teeth run further back along the jaw, to a shadow where the jaw hinges.
    const back = two ? 0 : 2;
    for (let p = -back; p < n; p++) {
      if (p === -back || p === n - 1 || (p - -back) % 2 === 0) put(x0 + p, y, INK);
      if (p > -back && p < n - 1) put(x0 + p, y + 1, INK);
    }
    if (!two) for (const dy of [-1, 0, 1]) put(x0 - back - 1, y + dy, SHADE);
  }
  // Nothing outside the skull.
  const clipped = face.map((row, y) => row.map((c, x) => (head[y]?.[x] ? c : null)));
  return Object.fromEntries(Object.keys(faces).map((name) => [name, clipped]));
}

/**
 * A head stamp as a skull: no blush on the ears and nose, no nose standing out past the face, and a
 * subtle crack down from the crown. The crack is on the skull, not the face, so it shows from every
 * side, behind too; near the middle of the crown it stays put when a view is mirrored.
 */
export const boneHead = (stamp: Stamp): Stamp => {
  const reach = stamp.map((row) => row.reduce((last, c, x) => (c && !c.flush ? x : last), -1));
  const out = stamp.map((row, y) => row.map((c, x) => (c?.flush ? (x > reach[y] ? null : { ...c, flush: false }) : c)));
  const top = out.findIndex((row) => row.some(Boolean));
  const xs = out[top].flatMap((c, x) => (c ? [x] : []));
  const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
  for (const [dx, dy] of [[1, 0], [1, 1], [0, 2], [0, 3], [1, 4]] as const) if (out[top + dy]?.[cx + dx]) out[top + dy][cx + dx] = SHADE;
  return out;
};

// Body rows are written 9 wide and placed in the torso frame as underwear is: chest from row 2, pelvis from row 10.
const body = (above: number, rows: string[]) =>
  parseStamp([...Array(above).fill('.'.repeat(TORSO_FRAME.w)), ...rows.map((row) => '......' + row + '......')], { W: BONE });

/** Ribs: bars with nothing between them, round a spine. `open` leaves the body block out, so the gaps are see-through. */
export const RIBS: Item = {
  name: 'Ribs',
  slot: 'top',
  open: true,
  torso: {
    front: body(2, ['WWWWWWWWw', '.W..W..w.', '.WWWWWWw.', '.W..w..w.', '.WWWwwWw.', '..w.w.w..', '...www...', '....w....']),
    back: body(2, ['wWWWWWWWw', '.W..W..W.', '.WWWWWWW.', '.W..W..W.', '.WWWWWWW.', '..W.W.W..', '...WWW...', '....W....']),
  },
};

export const PELVIS: Item = {
  name: 'Pelvis',
  slot: 'bottom',
  open: true,
  torso: {
    front: body(10, ['.WWWWWWw.', 'WWW.W.WWw', '.WW...ww.']),
    back: body(10, ['.wWWWWWw.', 'WWWWWWWWW', '.WW...WW.']),
  },
};
