import { headFor, viewsFor } from './base.ts';
import { PALETTE, type Cell, type PaletteKey } from '../core/palette.ts';
import { HEAD_FRAME, type Item, type OwnView, type Stamp } from '../core/puppet.ts';

// Hair as one shape around the skull instead of a drawing per view. The model describes a
// hairstyle by a few numbers: how far down it reaches at eight angles round the head, how much it
// stands off the skull, buns and tails. Every view is worked out from that one shape, so a hairline,
// a fringe or a ponytail cannot disagree between views, and an uneven style (a side parting) keeps
// its side when the character turns. The shape is placed over the hand-drawn head of each view row
// by row, so the hair hugs the skull that is actually drawn; light and shade are placed by rule.

/** Angles round the head, in degrees: 0 the face, 90 the character's right, 180 the back, 270 the left. */
export interface ShellPart {
  kind: 'bun' | 'tail';
  /** Angle round the head where it sits. */
  at: number;
  /** Height, in rows below the top of the skull (negative is above it). */
  row: number;
  /** Bun: radius. Tail: width. In pixels. */
  size: number;
  /** Tail: how many rows it hangs down. */
  length?: number;
  /** How far from the head's middle axis; defaults to the skull's surface plus half the size. */
  out?: number;
}

export interface Shell {
  name: string;
  slot: 'hair';
  color: PaletteKey;
  /**
   * Where the hair ends, in rows below the top of the skull, at 0, 45, 90 ... 315 degrees (eight
   * values). The skull is 14 rows: brows at 4, eyes 5 to 8, ears 6 and 7, chin 13, shoulders
   * about 18. A fringe is 2 to 4 at 0; hair to the shoulders is about 18 at 180.
   */
  hem: number[];
  /** Pixels the hair stands off the skull, 0 to 3. */
  volume?: number;
  /** Extra rows of height on top of the head, 0 to 4. */
  crown?: number;
  /** Only a crest this many pixels either side of the middle line (a mohawk). */
  strip?: number;
  /** Angle of a parting line on the crown. */
  parting?: number;
  /** Curly: the outline is broken into curls. */
  curl?: boolean;
  parts?: ShellPart[];
}

/** Checks a shell written by the model. Throws with a message the model can act on. */
export function checkShell(input: any): Shell {
  const fail = (msg: string): never => {
    throw new Error(msg);
  };
  if (!input || typeof input !== 'object') fail('a shell must be an object');
  if (typeof input.name !== 'string' || !input.name) fail('"name" is missing');
  if (input.slot !== 'hair') fail('"slot" must be "hair"');
  if (!(input.color in PALETTE)) fail(`"color" ${input.color} is not a palette key`);
  const num = (v: unknown, lo: number, hi: number, what: string) =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fail(`${what} must be a number from ${lo} to ${hi}`);
  if (!Array.isArray(input.hem) || input.hem.length !== 8) fail('"hem" needs eight numbers, at 0, 45 ... 315 degrees');
  input.hem.forEach((v: unknown, i: number) => num(v, -2, 34, `hem[${i}]`));
  for (const [key, lo, hi] of [['volume', 0, 3], ['crown', 0, 4], ['strip', 0.5, 6], ['parting', 0, 360]] as const) {
    if (input[key] !== undefined && input[key] !== null) num(input[key], lo, hi, `"${key}"`);
  }
  for (const [i, p] of (input.parts ?? []).entries()) {
    if (p.kind !== 'bun' && p.kind !== 'tail') fail(`parts[${i}].kind must be "bun" or "tail"`);
    num(p.at, 0, 360, `parts[${i}].at`);
    num(p.row, -6, 24, `parts[${i}].row`);
    num(p.size, 1, 6, `parts[${i}].size`);
    if (p.kind === 'tail') num(p.length, 1, 24, `parts[${i}].length`);
    if (p.out !== undefined) num(p.out, 0, 14, `parts[${i}].out`);
  }
  return input as Shell;
}

// ------------------------------------------------------------------ the skull, measured

type Key = 0 | 3 | OwnView;
/** Which way each drawn view looks at the head: the angle that faces the viewer. */
const YAW: Record<Key, number> = { S: 0, 0: 45, E: 90, 3: 135, N: 180 };
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Rows of skull, chin and neck in the head stamps, from the top of the skull. */
const HEAD_ROWS = 16;
const JAW = 12;
const EAR_ROWS = [6, 7];

interface Section {
  a: number;
  front: number;
  back: number;
}

const span = (row: (Cell | null)[] | undefined): [number, number] | null => {
  if (!row) return null;
  const l = row.findIndex(Boolean);
  if (l < 0) return null;
  return [l, row.length - 1 - [...row].reverse().findIndex(Boolean)];
};

let measured: { sections: Section[]; heads: Record<Key, Stamp>; widest: number; below: Section; reachX: number; reachZ: number } | null = null;
/**
 * The skull as a stack of horizontal ellipses, one per row: its half width from the face-on head,
 * its depth in front of and behind the ear from the side head. Measured once, on the plain head.
 */
function skull() {
  if (measured) return measured;
  const pair = headFor('skinB');
  const views = viewsFor('skinB');
  const heads: Record<Key, Stamp> = { 0: pair.front, 3: pair.back, S: views.S!.head, N: views.N!.head, E: views.E!.head };
  const top = (s: Stamp) => s.findIndex((r) => r.some(Boolean));
  const south = heads.S;
  const east = heads.E;
  const ts = top(south);
  const te = top(east);
  // The ear sits on the turning axis side on: stamp column 8, in the head frame.
  const axis = 8.5 + HEAD_FRAME.ax - 10;
  const sections: Section[] = [];
  for (let h = 0; h < HEAD_ROWS; h++) {
    const s = span(south[ts + h]);
    const e = span(east[te + h]);
    sections.push(s && e ? { a: (s[1] - s[0] + 1) / 2, front: e[1] + 1 - axis, back: axis - e[0] } : { a: 0, front: 0, back: 0 });
  }
  // The ears stick out face on; the skull there is as wide as the rows around it.
  for (const h of EAR_ROWS) sections[h] = { ...sections[h], a: Math.max(sections[EAR_ROWS[0] - 1].a, sections[EAR_ROWS.at(-1)! + 1].a) };
  // The widest skull row, and the section the hair falls straight down from below it.
  const widest = sections.reduce((best, s, i) => (i <= JAW && s.a >= sections[best].a ? i : best), 0);
  const head = sections.slice(0, JAW + 1);
  const below = { a: sections[widest].a, front: Math.max(...head.map((q) => q.front)), back: Math.max(...head.map((q) => q.back)) };
  // No skull section reaches further than this from the axis, sideways or front to back.
  const reachX = Math.max(...sections.map((q) => q.a));
  const reachZ = Math.max(...sections.map((q) => Math.max(q.front, q.back)));
  measured = { sections, heads, widest, below, reachX, reachZ };
  return measured;
}

const inEllipse = (x: number, z: number, s: Section, grow = 0) =>
  s.a + grow > 0 && (x / (s.a + grow)) ** 2 + (z / ((z > 0 ? s.front : s.back) + grow)) ** 2 <= 1;

/** How far the skull's surface is from the axis at row `h` towards angle `deg`. */
function surface(h: number, deg: number): number {
  const s = skull().sections[Math.max(0, Math.min(JAW, Math.round(h)))];
  const t = rad(deg);
  const b = Math.cos(t) > 0 ? s.front : s.back;
  return 1 / Math.sqrt((Math.sin(t) / s.a) ** 2 + (Math.cos(t) / b) ** 2);
}

/** The hem at an angle, between the eight given ones. */
function hemAt(hem: number[], deg: number): number {
  const f = ((((deg % 360) + 360) % 360) / 45);
  const i = Math.floor(f);
  const t = f - i;
  return hem[i % 8] * (1 - t) + hem[(i + 1) % 8] * t;
}

const angleOf = (x: number, z: number) => ((Math.atan2(x, z) * 180) / Math.PI + 360) % 360;
const angleGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

interface Hit {
  deg: number;
  /** Towards the viewer from the head's axis. */
  near: boolean;
  part: boolean;
}

/** What a ray at row `h` and sideways offset `u` meets first: skull, hair or nothing. */
function cast(shell: Shell, h: number, u: number, yaw: number): 'skull' | Hit | null {
  const { sections, widest, below, reachX, reachZ } = skull();
  const volume = shell.volume ?? 1;
  const crown = shell.crown ?? 0;
  // The outer shape the hair fills: the skull grown by the volume, stretched up by the crown,
  // and below its widest row falling straight down.
  const section = (row: number): Section | null => {
    if (row < -crown) return null;
    if (row < 0) return sections[0];
    return row <= widest ? sections[row] : below;
  };
  const outer = (x: number, z: number) => {
    for (let dh = -volume; dh <= volume; dh++) {
      const s = section(h + dh);
      if (s && inEllipse(x, z, s, Math.sqrt(volume * volume - dh * dh))) return true;
    }
    return false;
  };
  const head = h >= 0 && h < HEAD_ROWS ? sections[h] : null;
  const t = rad(yaw);
  const right = [-Math.cos(t), Math.sin(t)];
  const toward = [Math.sin(t), Math.cos(t)];
  const parts = (shell.parts ?? []).map((p) => {
    const out = p.out ?? surface(p.row, p.at) + p.size / 2;
    return { p, px: out * Math.sin(rad(p.at)), pz: out * Math.cos(rad(p.at)) };
  });
  const inPart = (x: number, z: number) => parts.some(({ p, px, pz }) => {
    const r2 = (x - px) ** 2 + (z - pz) ** 2;
    return p.kind === 'bun'
      ? r2 + (h - p.row) ** 2 <= p.size * p.size + 0.3
      : h >= p.row && h <= p.row + p.length! && r2 <= (p.size / 2 - (h > p.row + p.length! - 2 ? 0.5 : 0)) ** 2 + 0.3;
  });
  for (let d = 14; d >= -14; d -= 0.25) {
    const x = u * right[0] + d * toward[0];
    const z = u * right[1] + d * toward[1];
    // Outside every skull section grown by the volume neither the skull nor the hair can be met, only a bun or tail.
    if (Math.abs(x) > reachX + volume || Math.abs(z) > reachZ + volume) {
      if (inPart(x, z)) return { deg: angleOf(x, z), near: d > 0, part: true };
      continue;
    }
    const deg = angleOf(x, z);
    // Clumps: every other strand ends a row higher.
    const hem = hemAt(shell.hem, deg) - (Math.floor(deg / 22.5) % 2 ? 1 : 0);
    const inStrip = shell.strip === undefined || shell.strip === null || Math.abs(x) <= shell.strip;
    // Where the skull is covered, the hair lies on it even with no volume (a buzz cut).
    if (head && inEllipse(x, z, head)) return h <= hem && inStrip ? { deg, near: d > 0, part: false } : 'skull';
    if (inPart(x, z)) return { deg, near: d > 0, part: true };
    if (!inStrip || !outer(x, z) || h > hem) continue;
    return { deg, near: d > 0, part: false };
  }
  return null;
}

/** Where the skull is in row `h` of the model, seen from `yaw`: the first and last offset that meet it. */
const spans = new Map<string, [number, number] | null>();
function modelSpan(h: number, yaw: number): [number, number] | null {
  // The same for every shell: worked out once per row and view.
  const id = `${h}|${yaw}`;
  if (!spans.has(id)) spans.set(id, measureSpan(h, yaw));
  return spans.get(id)!;
}
function measureSpan(h: number, yaw: number): [number, number] | null {
  const s = skull().sections[h];
  if (!s?.a) return null;
  const t = rad(yaw);
  let lo = Infinity;
  let hi = -Infinity;
  for (let u = -12; u <= 12; u += 0.05) {
    // Widest extent of the ellipse along the screen direction, found by casting.
    for (let d = -12; d <= 12; d += 0.25) {
      const x = u * -Math.cos(t) + d * Math.sin(t);
      const z = u * Math.sin(t) + d * Math.cos(t);
      if (inEllipse(x, z, s)) {
        lo = Math.min(lo, u);
        hi = Math.max(hi, u);
        break;
      }
    }
  }
  return lo <= hi ? [lo, hi + 0.05] : null;
}

/** The shell with left and right swapped: what the left-hand views show, drawn as right-hand ones. */
export function mirroredShell(shell: Shell): Shell {
  const flip = (deg: number) => (360 - deg) % 360;
  return {
    ...shell,
    hem: shell.hem.map((_, i) => shell.hem[(8 - i) % 8]),
    ...(shell.parting !== undefined ? { parting: flip(shell.parting) } : {}),
    parts: shell.parts?.map((p) => ({ ...p, at: flip(p.at) })),
  };
}

const symmetric = (shell: Shell) =>
  shell.hem.every((v, i) => v === shell.hem[(8 - i) % 8]) && (shell.parting === undefined || shell.parting % 180 === 0) &&
  (shell.parts ?? []).every((p) => p.at % 180 === 0 || (shell.parts ?? []).some((q) => q.kind === p.kind && q.row === p.row && angleGap(q.at, 360 - p.at) < 1));

/** The hash used for curls: the same angle and row give the same answer in every view. */
const curlCut = (deg: number, h: number) => ((Math.floor(deg / 25) * 7 + h * 3) % 5) === 0;

/** One view of a shell, as a head stamp and what of it hangs behind the body. */
export function renderShell(shell: Shell, key: Key): { head: Stamp; behind: Stamp } {
  const { heads } = skull();
  const stamp = heads[key];
  const yaw = YAW[key];
  const W = HEAD_FRAME.w;
  const H = HEAD_FRAME.h;
  const top = stamp.findIndex((r) => r.some(Boolean));
  const hits: (Hit | null)[][] = Array.from({ length: H }, () => Array(W).fill(null));
  // Each model row is laid over the drawn skull row: where the model's skull begins and ends is
  // put where the drawn one does. Rows without skull use the nearest row that has one.
  const fits: ({ from: number; scale: number; at: number } | null)[] = [];
  for (let h = 0; h < HEAD_ROWS; h++) {
    const m = modelSpan(h, yaw);
    const s = span(stamp[top + h]);
    fits.push(m && s ? { from: m[0], scale: (m[1] - m[0]) / (s[1] + 1 - s[0]), at: s[0] } : null);
  }
  const fitAt = (h: number) => {
    for (let d = 0; d < HEAD_ROWS; d++) {
      const f = fits[Math.max(0, Math.min(HEAD_ROWS - 1, h - d))] ?? fits[Math.max(0, Math.min(HEAD_ROWS - 1, h + d))];
      if (f) return f;
    }
    return { from: 0, scale: 1, at: HEAD_FRAME.ax };
  };
  for (let y = 0; y < H; y++) {
    const h = y - top;
    // Above the skull the top row's fit, below the chin the jaw's: the hair keeps the head's scale.
    const fit = fitAt(Math.min(h, JAW));
    for (let x = 0; x < W; x++) {
      const u = fit.from + (x + 0.5 - fit.at) * fit.scale;
      const hit = cast(shell, h, u, yaw);
      if (hit && hit !== 'skull') hits[y][x] = hit;
    }
  }
  const head: Stamp = hits.map((row) => row.map(() => null));
  const behind: Stamp = hits.map((row) => row.map(() => null));
  const has = (x: number, y: number) => !!hits[y]?.[x];
  const skin = (x: number, y: number) => !!stamp[y]?.[x];
  // The middle of the skull on screen, for the lit band.
  const crownRow = span(stamp[top + 2]) ?? [HEAD_FRAME.ax - 7, HEAD_FRAME.ax + 7];
  const cx = (crownRow[0] + crownRow[1] + 1) / 2;
  const half = (crownRow[1] + 1 - crownRow[0]) / 2;
  const columnTop = Array.from({ length: W }, (_, x) => hits.findIndex((row) => row[x] && !row[x]!.part));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const hit = hits[y][x];
      if (!hit) continue;
      const h = y - top;
      const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => has(x + dx, y + dy)).length;
      // A lone pixel is noise at this size.
      if (n4 === 0) continue;
      const edge = [[1, 0], [-1, 0], [0, -1]].some(([dx, dy]) => !has(x + dx, y + dy) && !skin(x + dx, y + dy));
      if (shell.curl && edge && h > 1 && curlCut(hit.deg, h)) continue;
      // Hanging below the chin and on the far side of the head, it is behind the body.
      if (h > JAW && !hit.near && key !== 'N' && !(key === 'E' && hit.deg > 90 && hit.deg < 270) && key !== 3) {
        behind[y][x] = { key: shell.color, shade: true };
        continue;
      }
      const lowest = !has(x, y + 1);
      const awayFromLight = !has(x + 1, y) && !skin(x + 1, y);
      // Clumps part near their ends, at the same angles in every view.
      const groove = !hit.part && !lowest && !has(x, y + 3) && h >= 4 && angleGap(hit.deg, Math.round(hit.deg / 45) * 45 + 22.5) < 5;
      const parting = shell.parting !== undefined && h <= 2 && angleGap(hit.deg, shell.parting) < 14 && y > columnTop[x];
      const shade = (lowest && h > 5) || (awayFromLight && h > 3) || groove || parting || (hit.part && x >= cx + 1 && h > 0);
      const band = columnTop[x] >= 0 && !hit.part && ((y === columnTop[x] + 1 && x >= cx - half * 0.7 && x <= cx + 1) || (y === columnTop[x] + 2 && x >= cx - half * 0.8 && x < cx - 1));
      head[y][x] = { key: shell.color, shade, light: !shade && band };
    }
  }
  return { head, behind };
}

const KEYS: Key[] = [0, 3, 'S', 'N', 'E'];
const empty = (s: Stamp) => !s.some((r) => r.some(Boolean));

/** A shell turned into an ordinary hair item: its 3/4 stamps, its own front, back and side views, and its left-hand views where it is uneven. */
export function compileShell(shell: Shell): Item {
  const views = (s: Shell) => Object.fromEntries(KEYS.map((k) => [k, renderShell(s, k)])) as Record<Key, { head: Stamp; behind: Stamp }>;
  const right = views(shell);
  const own = (v: { head: Stamp; behind: Stamp }) => ({ head: v.head, ...(empty(v.behind) ? {} : { behind: v.behind }) });
  const item: Item = {
    name: shell.name,
    slot: 'hair',
    head: { front: right[0].head, back: right[3].head },
    headBehind: { front: right[0].behind, back: right[3].behind },
    views: { S: own(right.S), N: own(right.N), E: own(right.E) },
  };
  if (!symmetric(shell)) {
    // A left-hand view is a right-hand one drawn and mirrored: drawn from the mirrored shell, it
    // comes out as the shell itself seen from the left.
    const left = views(mirroredShell(shell));
    item.left = { 0: own(left[0]), 3: own(left[3]), E: own(left.E) };
  }
  return item;
}
