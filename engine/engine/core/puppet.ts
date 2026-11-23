import { darker, hexOf, SHADOW, type Cell, type PaletteKey } from './palette.ts';

// ------------------------------------------------------------------ geometry

export type Vec3 = [number, number, number];
/**
 * The drawing canvas. The character itself fits the 32 x 48 body window in its middle; the
 * margin around it is room for tools that swing out and for wide hats.
 */
export const SPRITE_W = 64;
export const SPRITE_H = 64;
export const BODY_WINDOW = { x: 16, y: 8, w: 32, h: 48 };
/** Size of the grid the model paints on in the whole-sprite format: the body window. */
export const PAINT_W = BODY_WINDOW.w;
export const PAINT_H = BODY_WINDOW.h;
/** The feet stand on row ORIGIN_Y, centred on the line between two pixel columns. */
const ORIGIN_X = BODY_WINDOW.x + 16.5;
const ORIGIN_Y = BODY_WINDOW.y + 44;
/** The pixel on the ground under the character, as the animals, objects and plants give theirs. */
export const CHARACTER_ORIGIN = { x: Math.floor(ORIGIN_X), y: ORIGIN_Y };

/**
 * Eight facings. The diagonals keep their old numbers: 0 front right, 1 front left, 2 back left,
 * 3 back right; then 4 front, 5 left, 6 back, 7 right. Drawn are 0, 3, 4, 6 and 7; 1, 2 and 5 are
 * mirror images of 0, 3 and 7.
 */
export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const FACING_NAMES = ['front right', 'front left', 'back left', 'back right', 'front', 'left', 'back', 'right'] as const;
/** The facings in order round the clock, from front right towards front left. */
export const FACING_RING: Facing[] = [0, 4, 1, 5, 2, 6, 3, 7];
/** The facing `steps` eighths of a turn round from `facing`. */
export const turnFacing = (facing: Facing, steps: number): Facing => FACING_RING[(((FACING_RING.indexOf(facing) + steps) % 8) + 8) % 8];
/**
 * What each facing shows: the facing it is drawn as (1, 2 and 5 are the mirror images of 0, 3 and
 * 7), whether it is seen from behind, and which view of the face it shows, if any.
 */
export const FACING_VIEWS: Record<Facing, { drawn: 0 | 3 | 4 | 6 | 7; mirror: boolean; back: boolean; face: 'diagonal' | 'front' | 'side' | null }> = {
  0: { drawn: 0, mirror: false, back: false, face: 'diagonal' },
  1: { drawn: 0, mirror: true, back: false, face: 'diagonal' },
  2: { drawn: 3, mirror: true, back: true, face: null },
  3: { drawn: 3, mirror: false, back: true, face: null },
  4: { drawn: 4, mirror: false, back: false, face: 'front' },
  5: { drawn: 7, mirror: true, back: false, face: 'side' },
  6: { drawn: 6, mirror: false, back: true, face: null },
  7: { drawn: 7, mirror: false, back: false, face: 'side' },
};
/** The views that are drawn, not mirrored: the two diagonals and front, back and right. */
export type View = 0 | 3 | 'S' | 'N' | 'E';
/** Views drawn from their own stamps where an item has them; otherwise the nearest diagonal's are used. */
export type OwnView = 'S' | 'N' | 'E';

/**
 * A pose: joint positions in the character's own space, in pixels.
 * x is the character's right, y is up, z is forward. Feet rest at y = 1.
 */
export interface Pose {
  hips: Vec3;
  chest: Vec3;
  neck: Vec3;
  shoulderL: Vec3; elbowL: Vec3; handL: Vec3;
  shoulderR: Vec3; elbowR: Vec3; handR: Vec3;
  hipL: Vec3; kneeL: Vec3; footL: Vec3;
  hipR: Vec3; kneeR: Vec3; footR: Vec3;
  /**
   * Lying on the back: the pose is drawn standing, in the three-quarter front view, then turned a
   * quarter onto the floor, its feet left or right on the screen as the character faces (see `lying`).
   */
  lie?: boolean;
  /** Lying face down (only with `lie`), unless `options.lying` says otherwise. */
  down?: boolean;
  /** The head turned this many eighths of a turn to the character's left (negative: right), at most one. */
  look?: number;
  /**
   * Follow-through: how far hair hanging below the ears lags behind the head this frame, in
   * pixels. It drops as the body rises, lifts as it drops, and trails behind at a run.
   */
  hair?: Vec3;
}

// Forward and right in ground coordinates, for each drawn view. Front, back and side views keep
// the diagonal views' sideways scale so the limbs keep their spacing.
const FORWARD: Record<View, [number, number]> = { 0: [1, 0], 3: [0, -1], S: [0.7071, 0.7071], N: [-0.7071, -0.7071], E: [0.7071, -0.7071] };
const RIGHT: Record<View, [number, number]> = { 0: [0, 1], 3: [1, 0], S: [-0.5, 0.5], N: [0.5, -0.5], E: [0.5, 0.5] };
/** How far a step forward moves a point down the screen: the 2:1 isometric ratio. */
const FORWARD_LIFT = 0.3536;
/**
 * Sideways offsets inside the body are flattened. True isometry would put one shoulder two
 * pixels above the other, which reads as a broken arm at this size; hand-drawn sprites keep the
 * body nearly level, with the nearer side one pixel lower.
 */
const SIDE_LIFT = 0.06;

interface Point {
  x: number;
  y: number;
  depth: number;
}

function project(p: Vec3, facing: View): Point {
  const f = FORWARD[facing];
  const r = RIGHT[facing];
  const forward = { x: (f[0] - f[1]) * 0.7071, down: f[0] + f[1] };
  const right = { x: (r[0] - r[1]) * 0.7071, down: r[0] + r[1] };
  return {
    x: ORIGIN_X + forward.x * p[2] + right.x * p[0],
    y: ORIGIN_Y - p[1] + forward.down * FORWARD_LIFT * p[2] + right.down * SIDE_LIFT * p[0],
    depth: forward.down * p[2] + right.down * p[0],
  };
}

/**
 * Where the two hands meet on the sprite, for something carried in them; `back` when the body hides
 * it, and `ahead` the way the character faces on screen when seen side on (1 right, -1 left), else 0.
 */
export function handsOn(pose: Pose, facing: Facing): { x: number; y: number; back: boolean; ahead: number } {
  const v = FACING_VIEWS[facing];
  const view: View = v.drawn === 4 ? 'S' : v.drawn === 6 ? 'N' : v.drawn === 7 ? 'E' : v.drawn;
  const mid = [0, 1, 2].map((n) => (pose.handL[n] + pose.handR[n]) / 2) as Vec3;
  const p = project(v.mirror ? [-mid[0], mid[1], mid[2]] : mid, view);
  // A mirrored view is flipped about the centre line, as `Sprite.mirrored` does.
  return { x: v.mirror ? SPRITE_W - p.x : p.x, y: p.y, back: v.back, ahead: v.face === 'side' ? (v.mirror ? -1 : 1) : 0 };
}

// ------------------------------------------------------------------ paint

/** A small pixel image. Rows of cells; null is transparent. */
export type Stamp = (Cell | null)[][];

/** Frames that rigid stamps are drawn in. The anchor is the pixel that sits on the joint. */
export const HEAD_FRAME = { w: 33, h: 36, ax: 16, ay: 24 };
export const TORSO_FRAME = { w: 21, h: 24, ax: 10, ay: 1 };
export const TOOL_FRAME = { w: 33, h: 54, ax: 16, ay: 38 };
/** Sizes the recipe format asks the model for. They sit inside the larger frames above. */
export const HEAD_STAMP = { w: 21, h: 30, ax: 10, ay: 21 };
export const TOOL_STAMP = { w: 15, h: 44, ax: 7, ay: 30 };
/** Limb paint is a strip of this many cells from shoulder to hand, or hip to ankle. */
export const LIMB_CELLS = 10;
export interface StampPair {
  front: Stamp;
  back: Stamp;
}

/** An item in its final form, whatever produced it. All fields are optional layers. */
export interface Item {
  name: string;
  slot: Slot;
  /** Hair, beard, hat: rigid on the head. */
  head?: StampPair;
  /** Drawn behind the body when seen from the front, for long hair. */
  headBehind?: StampPair;
  /** A beard kept short, such as stubble: wear does not let it grow. */
  short?: boolean;
  /** A head item seen from the front, back or side, and what of it hangs behind the body there. */
  views?: Partial<Record<OwnView, { head: Stamp; behind?: Stamp }>>;
  /**
   * An uneven head item (a side parting) seen in the left-hand views, which are drawn as the
   * right-hand ones and mirrored: so these stamps are what the right-hand view would show of the
   * item with its sides swapped. Without them the item is simply mirrored.
   */
  left?: Partial<Record<0 | 3 | 'E', { head: Stamp; behind?: Stamp }>>;
  /** Shirt body, waistband, skirt: rigid on the chest. */
  torso?: StampPair;
  /** The torso stamp is the whole body there: no solid block is drawn under it, so its gaps are see-through (a skeleton's ribs). */
  open?: boolean;
  /** Sleeve colours from shoulder (first) to hand (last). null leaves the arm bare. */
  arm?: (Cell | null)[];
  /** Trouser colours from hip to ankle. */
  leg?: (Cell | null)[];
  /** The upper of a shoe. A boot's shaft is paint on the lower end of `leg`. */
  foot?: Cell | null;
  /** The sole, where it differs from the upper. */
  sole?: Cell | null;
  /** 'strap' is a sandal: the foot is bare apart from one strap. 'toe' is a shoe worn through at the toes. */
  footOpen?: 'strap' | 'toe';
  /** A carried object. Its grip is pinned to the nearer hand in every frame. */
  tool?: StampPair;
  /**
   * How a tool is carried when it is not being swung. 'pole' is long: the arm is held out so the
   * shaft clears the head. 'carry' is short: the arm hangs and swings as usual.
   */
  hold?: 'pole' | 'carry';
  /** Columns from the tool stamp's anchor to its shaft, front and back, so the fist closes on the shaft itself. */
  gripDx?: { front: number; back: number };
  /**
   * A particle system attached to a tool (world/particles.ts: a torch's sparks and halo, a lantern's light): its id,
   * and the point it sits at in the stamps, front and back. The drawn sprite says where that point lands (`Sprite.fx`).
   */
  fx?: { system: string; front: { x: number; y: number }; back: { x: number; y: number } };
}

export const SLOTS = ['bottom', 'shoes', 'top', 'beard', 'hair', 'hat', 'tool'] as const;
export type Slot = (typeof SLOTS)[number];

/** Body build: how wide the torso and limbs are drawn. Clothing is fitted to it by rule. */
export interface Build {
  id: string;
  label: string;
  /** Torso width in pixels. */
  torso: 7 | 9 | 11;
  arm: number;
  leg: number;
  /** Extra pixels of width for the head and neck, with everything worn on the head. */
  head?: number;
  /** No waist: the feminine hourglass is left out, the torso stays straight. */
  straight?: boolean;
  /** One more row of jaw under the face, like a double chin. */
  chin?: boolean;
}

export const BUILDS: Build[] = [
  { id: 'thin', label: 'Very slim', torso: 7, arm: 2, leg: 3 },
  { id: 'slim', label: 'Slim', torso: 9, arm: 3, leg: 4 },
  { id: 'sturdy', label: 'Sturdy', torso: 11, arm: 4, leg: 5, head: 2, straight: true, chin: true },
];

export interface Look {
  skin: PaletteKey;
  /** Defaults to the slim build. */
  build?: Build;
  /** Body shape. 'f' narrows the waist and adds a chest shadow; clothing follows by rule. */
  frame?: 'm' | 'f';
  /** The bare head, as stamps. */
  head: StampPair;
  /** Face expressions, drawn on the front of the head. 'neutral' is the default. */
  faces: Record<string, Stamp>;
  /** The colour of the glasses' frame, if the face wears glasses: from behind only their temples show. */
  glasses?: PaletteKey;
  /** The bare head and its faces seen from the front, back and side. */
  views?: Partial<Record<OwnView, { head: Stamp; faces: Record<string, Stamp> }>>;
  items: Item[];
  /** A skeleton: thin limbs with a knob at each elbow and knee. */
  skeleton?: boolean;
}

export interface DrawOptions {
  /** Which face to show. */
  face?: string;
  /**
   * True while the tool is being swung: the holding arm follows the pose instead of the carry
   * position, and the tool turns with the forearm.
   */
  swing?: boolean;
  /** Every part in a flat colour of its own (`PART_COLORS`), for checking the drawing by script. */
  parts?: boolean;
  /** How a lying pose lies; by default on the back, in the three-quarter front view. */
  lying?: Lying;
}

/**
 * How a lying figure is drawn: from the three-quarter front view or (`back`) the three-quarter back
 * view, and face up or (`down`) face down, its front side turned to the floor.
 */
export interface Lying {
  back?: boolean;
  down?: boolean;
}

/** The colours of the parts drawing. The working arm holds the tool; the free arm is the other one. */
export const PART_COLORS = {
  legs: '#3355ff', torso: '#00aa44', clothes: '#88dd00', workArm: '#ff2222', freeArm: '#ff9900', tool: '#888888',
  head: '#ffcc99', face: '#000000', hair: '#aa00ff', hat: '#00dddd', beard: '#996600', behind: '#ff66cc', ear: '#cc6644',
} as const;
export type Part = keyof typeof PART_COLORS;

// ------------------------------------------------------------------ drawing


export class Sprite {
  readonly pixels: (string | null)[] = new Array(SPRITE_W * SPRITE_H).fill(null);
  /** While set, everything is drawn in this colour instead: the parts drawing. */
  part: string | null = null;
  /** While true, what is drawn is an arm on the camera's side of the body. */
  drawingNearArm = false;
  /** 1 where such an arm (with its hand) shows in the finished picture, for drawing it over something carried. */
  readonly nearArm = new Uint8Array(SPRITE_W * SPRITE_H);
  /** Where the held tool's particle system landed (its `fx`), if it has one. */
  fx: { x: number; y: number; system: string } | null = null;
  set(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H) return;
    this.pixels[y * SPRITE_W + x] = this.part && color !== SHADOW ? this.part : color;
    this.nearArm[y * SPRITE_W + x] = this.drawingNearArm ? 1 : 0;
  }
  get(x: number, y: number): string | null {
    return this.pixels[y * SPRITE_W + x] ?? null;
  }
  /** The same image facing the other way. */
  mirrored(): Sprite {
    const out = new Sprite();
    for (let y = 0; y < SPRITE_H; y++) {
      // Mirror about the character's centre line, which lies between two columns.
      for (let x = 1; x < SPRITE_W; x++) {
        out.pixels[y * SPRITE_W + (SPRITE_W - x)] = this.pixels[y * SPRITE_W + x];
        out.nearArm[y * SPRITE_W + (SPRITE_W - x)] = this.nearArm[y * SPRITE_W + x];
      }
    }
    if (this.fx) out.fx = { ...this.fx, x: SPRITE_W - this.fx.x };
    return out;
  }
}

/** The rows a figure's body spans, and the middle row it is laid down about (its hips, near enough). */
function bodyRows(standing: Sprite): { top: number; bottom: number; middle: number } {
  let top = SPRITE_H;
  let bottom = 0;
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const c = standing.get(x, y);
      if (c && c !== SHADOW) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return { top, bottom, middle: Math.round((top + bottom) / 2) };
}

/** Facings whose feet point left on the screen, lying; the rest point right. */
const FEET_LEFT = new Set<Facing>([1, 2, 5, 6]);
/** Facings that turn away from the camera. */
const BACK_FACINGS = new Set<Facing>([2, 3, 6]);

/**
 * A figure lying, whatever its facing: drawn in a three-quarter view (front unless `options.lying`
 * says back), which reads best lying, and turned a quarter (`laidDown`), a whole quarter turn keeping
 * every pixel, face up or face down; mirrored so its feet point left or right on the screen, the way it looked.
 */
function lying(look: Look, pose: Pose, facing: Facing, options: DrawOptions): Sprite {
  // The hat comes off: lying, its brim would stand up off the floor like a board.
  const bare = { ...look, items: look.items.filter((it) => it.slot !== 'hat') };
  // Facing away from the camera it is seen from behind, so turning a lying figure shows its back on that side.
  const back = options.lying?.back ?? BACK_FACINGS.has(facing);
  const out = laidDown(drawFigure(bare, { ...pose, lie: false }, back ? 3 : 0, options), options.lying?.down ?? !!pose.down);
  return FEET_LEFT.has(facing) ? out.mirrored() : out;
}

/**
 * A standing figure laid on the floor: turned a quarter so the head points left and the front
 * faces up (or, `down`, the other way round, the front to the floor), centred on the character's
 * spot. Its shadow is cast from the sun where it lies, as for everything else.
 */
function laidDown(standing: Sprite, down: boolean): Sprite {
  const out = new Sprite();
  const { top, bottom, middle } = bodyRows(standing);
  if (top > bottom) return out;
  const cx = SPRITE_W / 2;
  // The far side of the body (the back, seen from the front) rests on the floor.
  const placed: [number, number, string][] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const c = standing.get(x, y);
      if (c && c !== SHADOW) placed.push([cx + (y - middle), ORIGIN_Y - 3 - (down ? cx - x : x - cx), c]);
    }
  }
  for (const [x, y, c] of placed) out.set(x, y, c);
  const g = standing.fx;
  if (g) out.fx = { system: g.system, x: cx + (g.y - middle), y: ORIGIN_Y - 3 - (down ? cx - g.x : g.x - cx) };
  return out;
}

/**
 * A beard seen from behind: what of the front view stands out past this head's jaw on the side
 * the face points to (both sides straight from behind), above the shoulders, in shade. Worked out against the head actually worn,
 * so a narrow head shows the beard right up to its edge.
 */
export function beardBehind(front: Stamp, head: Stamp, both = false): Stamp {
  const shown = front.map((row, y) =>
    row.map((cell, x) => (cell && (both || x >= HEAD_FRAME.ax) && y <= HEAD_FRAME.ay && !head[y]?.[x] ? { ...cell, shade: true, light: false } : null)),
  );
  // A lone pixel past the head reads as a speck, not a beard.
  return shown.map((row, y) => row.map((cell, x) => (cell && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => shown[y + dy]?.[x + dx]) ? cell : null)));
}

interface Layer {
  depth: number;
  draw: () => void;
}

/**
 * A stamp made wider by repeating one column `times` times: the nearest one to `col` that is plain
 * on every row, inside a run of the row's main paint, so a badge or a stripe keeps its size and
 * shape; the outline widens the same either way.
 */
/** The paint most cells have. */
function mainKey(cells: (Cell | null | undefined)[]): string | undefined {
  const tally = new Map<string, number>();
  for (const cell of cells) if (cell) tally.set(cell.key, (tally.get(cell.key) ?? 0) + 1);
  return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function widened(stamp: Stamp, col: number, times: number): Stamp {
  const same = (a: Cell | null | undefined, b: Cell | null | undefined) =>
    (!a && !b) || (!!a && !!b && a.key === b.key && !!a.shade === !!b.shade && !!a.light === !!b.light && a.mix === b.mix);
  const mains = stamp.map(mainKey);
  // One column for the whole stamp, so the rows of a detail stay in line.
  const plain = (c: number) => stamp.every((row, y) => (!row[c] || row[c]!.key === mains[y]) && same(row[c - 1], row[c]) && same(row[c], row[c + 1]));
  const at = [0, -1, 1, -2, 2, -3, 3, -4, 4].map((d) => col + d).find(plain) ?? col;
  return stamp.map((row) => [...row.slice(0, at + 1), ...Array<Cell | null>(times).fill(row[at] ?? null), ...row.slice(at + 1)]);
}

function stampInto(sprite: Sprite, stamp: Stamp, frame: { ax: number; ay: number }, x: number, y: number): void {
  for (let row = 0; row < stamp.length; row++) {
    const cells = stamp[row];
    for (let col = 0; col < cells.length; col++) {
      const cell = cells[col];
      if (!cell) continue;
      const px = x + col - frame.ax;
      const py = y + row - frame.ay;
      if (!cell.mix) sprite.set(px, py, hexOf(cell));
      else {
        // See-through cells only tint what is under them, and nothing where nothing is.
        const under = sprite.get(px, py);
        if (under) sprite.set(px, py, mixed(under, hexOf(cell), cell.mix));
      }
    }
  }
}

/** `over` laid on `under` at strength `k`, as #rrggbb. */
export function mixed(under: string, over: string, k: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(channel(under, i) * (1 - k) + channel(over, i) * k).toString(16).padStart(2, '0')).join('');
}

/**
 * Draws a limb through its joints as clean pixel runs: one run per step along the longer axis,
 * never an anti-aliased or rotated shape. A slanted segment gets longer runs so the limb keeps
 * its width across, and each bend is filled with a rounded block so it does not notch. `colorAt`
 * gets the position along the limb from 0 to 1, the index across it, and whether that part runs
 * up and down (across is then left to right) or sideways (across is then top to bottom).
 */
function drawLimb(sprite: Sprite, joints: Point[], width: number, colorAt: (t: number, across: number, tall: boolean) => string, knob = false): void {
  const steps = joints.slice(1).map((b, i) => Math.max(Math.abs(Math.round(b.x) - Math.round(joints[i].x)), Math.abs(Math.round(b.y) - Math.round(joints[i].y))));
  const total = steps.reduce((a, b) => a + b, 0);
  // The bends first, so the runs drawn after keep their shading across. The first joint gets a
  // block too: a limb held out sideways starts its runs at the joint's middle, which would leave
  // a gap between a shoulder and the body.
  let done = 0;
  for (let i = 0; i < joints.length - 1; i++) {
    if (i > 0) done += steps[i - 1];
    const t = total ? done / total : 0;
    // A skeleton's elbows and knees are knobs, a pixel wider than the bone.
    const size = knob && i === 1 ? width + 1 : width;
    const x0 = Math.round(joints[i].x - size / 2);
    const y0 = Math.round(joints[i].y - size / 2);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const corner = size >= 3 && (dx === 0 || dx === size - 1) && (dy === 0 || dy === size - 1);
        if (!corner) sprite.set(x0 + dx, y0 + dy, colorAt(t, dx, true));
      }
    }
  }
  let step = 0;
  for (let i = 1; i < joints.length; i++) {
    const a = joints[i - 1];
    const b = joints[i];
    const n = steps[i - 1];
    const tall = Math.abs(b.y - a.y) >= Math.abs(b.x - a.x);
    const major = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    const run = major ? Math.round((width * Math.hypot(b.x - a.x, b.y - a.y)) / major) : width;
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const x = a.x + (n ? ((b.x - a.x) * k) / n : 0);
      const y = a.y + (n ? ((b.y - a.y) * k) / n : 0);
      const t = total ? step / total : 0;
      for (let w = 0; w < run; w++) {
        const across = Math.min(width - 1, Math.floor((w * width) / run));
        if (tall) sprite.set(Math.round(x - run / 2) + w, Math.round(y), colorAt(t, across, true));
        else sprite.set(Math.round(x), Math.round(y - run / 2) + w, colorAt(t, across, false));
      }
      step++;
    }
  }
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;

/**
 * Fits a torso stamp drawn for the 9-pixel torso to another build by repeating or dropping one
 * column on each side of the middle. Horizontal patterns are unaffected. Returns the stamp and
 * where its anchor column now is.
 */
function fitted(stamp: Stamp, width: number): { stamp: Stamp; ax: number } {
  if (width === 9) return { stamp, ax: TORSO_FRAME.ax };
  // Each side gains or loses this many columns: gained by repeating the column two from the
  // middle, lost from two and three out.
  const more = (width - 9) / 2;
  const ax = TORSO_FRAME.ax;
  const dropped = more < 0 ? Array.from({ length: -more }, (_, k) => [ax - 2 - k, ax + 2 + k]).flat() : [];
  return {
    stamp: stamp.map((row) => row.flatMap((cell, col) => {
      if (more > 0 && (col === ax - 2 || col === ax + 2)) return Array(more + 1).fill(cell);
      return dropped.includes(col) ? [] : [cell];
    })),
    ax: ax + more,
  };
}

/** A stamp turned about a pivot, as loose pixels. */
type Turned = { dx: number; dy: number; cell: Cell }[];
const turnedCache = new WeakMap<Stamp, Map<string, Turned>>();

/**
 * Turns a tool stamp about its grip in steps of 45 degrees, clockwise. Each target pixel looks
 * up its source, so shafts stay unbroken lines and nothing is blended.
 */
function turned(stamp: Stamp, pivotX: number, pivotY: number, steps: number): Turned {
  const key = `${pivotX},${pivotY},${steps}`;
  let cache = turnedCache.get(stamp);
  if (!cache) turnedCache.set(stamp, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  const angle = (steps * Math.PI) / 4;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out: Turned = [];
  const reach = Math.max(stamp.length, stamp[0]?.length ?? 0);
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const cell = stamp[Math.round(pivotY - dx * sin + dy * cos)]?.[Math.round(pivotX + dx * cos + dy * sin)];
      if (cell) out.push({ dx, dy, cell });
    }
  }
  cache.set(key, out);
  return out;
}

/**
 * True if a hat covers the top of the skull, as opposed to a band around the forehead.
 * Measured where the top of the hair sits: a headband paints nothing there, so the hair above
 * it is kept.
 */
function coversCrown(hat: Stamp): boolean {
  let painted = 0;
  let total = 0;
  for (let row = HEAD_FRAME.ay - 18; row <= HEAD_FRAME.ay - 15; row++) {
    for (let col = HEAD_FRAME.ax - 4; col <= HEAD_FRAME.ax + 4; col++) {
      total++;
      if (hat[row]?.[col]) painted++;
    }
  }
  return painted / total >= 0.4;
}

const faceOnCache = new WeakMap<Stamp, Stamp[]>();

/**
 * A head item drawn only in 3/4 seen face on (`front`) or from straight behind, worked out from
 * its 3/4 stamp. In the 3/4 stamps the face sits a column and a half to the right of the head's
 * middle, and the middle of the back of the head as far to the left. Each row's outline is the
 * half from that point outwards (the face side, or the back) stretched to half the row's width
 * and mirrored, so a fringe's opening lands over the face and a cap's peak becomes a band across
 * the brow. Inside that outline the other half takes its colours from its own side of the 3/4
 * row, so a badge, a bun or a ponytail is not doubled. Rows with nothing on the face side hang
 * behind the head or down past it; how they show face on is explained below.
 */
export function faceOn(stamp: Stamp, front: boolean, hat = false): Stamp {
  let cached = faceOnCache.get(stamp);
  if (!cached) faceOnCache.set(stamp, (cached = []));
  const slot = (front ? 1 : 0) + (hat ? 2 : 0);
  const hit = cached[slot];
  if (hit) return hit;
  // The middle of the head face on and from behind: the head is an odd number of pixels wide,
  // symmetric about column ax, so a hat or hair turned face on is mirrored about that column too.
  const middle = HEAD_FRAME.ax + 0.5;
  const turn = middle + (front ? 1.5 : -1.5);
  const own = front ? 'right' : 'left';
  const sign = own === 'right' ? 1 : -1;
  // Rows with nothing on the face side (or the back) hang behind the head or down past it. Rows
  // above the first one that reaches that side are the crown, not hanging.
  const reaches = stamp.map((row) => row.some((cell, x) => cell && sign * (x + 0.5 - turn) > 0));
  const crownEnd = reaches.indexOf(true);
  const hanging = stamp.map((row, y) => row.some(Boolean) && !reaches[y] && y > crownEnd);
  // Narrow all the way down, they are one strand, a braid or a ponytail, not a mass of hair.
  const strand = stamp.every((row, y) => !hanging[y] || row.filter(Boolean).length <= 4);
  const out = stamp.map((row, y) => {
    if (!reaches[y] && row.some(Boolean) && y < crownEnd) return row.map((cell, x) => cell ?? row[2 * middle - 1 - x] ?? null);
    if (hanging[y]) {
      // From behind a knot's tails or one strand hang down the middle of the back of the head, once;
      // a mass of long hair falls on both sides.
      if (!front && (hat || strand)) return row.map((_, x) => row[x - Math.floor(middle - turn)] ?? null);
      if (!front) return row.map((cell, x) => cell ?? row[2 * middle - 1 - x] ?? null);
      // Face on: a hat's knot hangs behind the head and does not show. A braid or a ponytail
      // stays one strand on the same side as in 3/4, where the 3/4 view and the front both show
      // the character's right on the left of the picture. A mass of long hair falls on both sides.
      if (hat) return row.map(() => null);
      if (strand) return row;
      return row.map((cell, x) => cell ?? row[2 * middle - 1 - x] ?? null);
    }
    const l = row.findIndex(Boolean);
    if (l < 0) return row.map(() => null);
    const r = row.length - 1 - [...row].reverse().findIndex(Boolean);
    const reach = { left: Math.max(0, turn - l), right: Math.max(0, r + 1 - turn) };
    const half = (reach.left + reach.right) / 2;
    return row.map((_, x) => {
      // Distance from the middle, the same for a column and its mirror image.
      const d = Math.abs(x + 0.5 - middle);
      const cell = row[Math.floor(turn + (sign * d * reach[own]) / half)] ?? null;
      if (!cell || sign * (x + 0.5 - middle) > 0) return cell;
      return row[Math.floor(turn - (sign * d * reach[own === 'right' ? 'left' : 'right']) / half)] ?? cell;
    });
  });
  // Sampling the 3/4 row about the middle can miss its one middle pixel; a gap of one between two
  // pixels of the same paint is filled.
  const closed = out.map((row) => row.map((cell, x) => cell ?? (row[x - 1] && row[x + 1] && row[x - 1]!.key === row[x + 1]!.key ? row[x - 1] : null)));
  const final = hat && front ? centredBadge(stamp, closed, HEAD_FRAME.ax) : closed;
  cached[slot] = final;
  return final;
}

/**
 * A hat's badge, the one small patch of another colour on it, sits on the middle of the hat face
 * on, at its own size, wherever the 3/4 view and the stretch to face on put it. Bands, stripes and
 * dot patterns are left as they are.
 */
function centredBadge(diagonal: Stamp, straight: Stamp, axis: number): Stamp {
  const main = mainKey(diagonal.flat());
  const seen = new Set<string>();
  const patches: [number, number][][] = [];
  diagonal.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (!cell || cell.key === main || seen.has(`${x},${y}`)) return;
      const patch: [number, number][] = [];
      const todo: [number, number][] = [[x, y]];
      seen.add(`${x},${y}`);
      while (todo.length) {
        const [px, py] = todo.pop()!;
        patch.push([px, py]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = diagonal[py + dy]?.[px + dx];
          if (n && n.key !== main && !seen.has(`${px + dx},${py + dy}`)) {
            seen.add(`${px + dx},${py + dy}`);
            todo.push([px + dx, py + dy]);
          }
        }
      }
      patches.push(patch);
    }),
  );
  const span = (p: [number, number][], i: 0 | 1) => Math.max(...p.map((c) => c[i])) - Math.min(...p.map((c) => c[i])) + 1;
  const badges = patches.filter((p) => p.length >= 3 && span(p, 0) <= 4 && span(p, 1) <= 4);
  if (badges.length !== 1) return straight;
  const badge = badges[0];
  const keys = new Set(badge.map(([x, y]) => diagonal[y][x]!.key));
  const rows = new Set(badge.map(([, y]) => y));
  // Its stretched copy goes, filled with the hat beside it.
  const out = straight.map((row, y) => {
    if (!rows.has(y)) return [...row];
    const plain = row.find((cell) => cell && !keys.has(cell.key)) ?? null;
    return row.map((cell) => (cell && keys.has(cell.key) ? plain : cell));
  });
  const xs = badge.map(([x]) => x);
  const shift = Math.round(axis - (Math.min(...xs) + Math.max(...xs)) / 2);
  for (const [x, y] of badge) if (out[y][x + shift]) out[y][x + shift] = diagonal[y][x];
  return out;
}

/**
 * Where the ears are on the bare head, per view, as column and row counted from the top of the
 * skull in the head-stamp grid: the near ear on the left edge in front 3/4 and on the right edge
 * from behind, both edges face on and from behind, and in the middle side on.
 */
const LEFT_EAR: [number, number][] = [[2, 6], [2, 7], [2, 8], [2, 9], [3, 7], [3, 8]];
const RIGHT_EAR: [number, number][] = [[18, 6], [18, 7], [18, 8], [18, 9], [17, 7], [17, 8]];
const EARS: Record<'front' | 'back' | OwnView, [number, number][]> = {
  front: LEFT_EAR,
  back: RIGHT_EAR,
  S: [...LEFT_EAR, ...RIGHT_EAR],
  N: [...LEFT_EAR, ...RIGHT_EAR],
  E: [[8, 6], [9, 6], [7, 7], [7, 8], [8, 9], [9, 9]],
};
/** The ear cells of a view in the head frame, for a head stamp whose skull starts at row `top`. */
const earCells = (view: keyof typeof EARS, top: number): [number, number][] =>
  EARS[view].map(([c, r]) => [c + HEAD_FRAME.ax - HEAD_STAMP.ax, r + top]);
/**
 * The whole ear as a round patch, not just its outline: side on the box round the ear's ring less
 * its two back corners; in the other views the column on the edge and its hollow.
 */
function earPatch(view: keyof typeof EARS, ears: [number, number][]): Set<string> {
  if (view === 'E') {
    const xs = ears.map(([x]) => x), ys = ears.map(([, y]) => y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const out = new Set<string>();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!(x === x0 && (y === y0 || y === y1))) out.add(`${x},${y}`);
    return out;
  }
  return new Set(ears.map(([x, y]) => `${x},${y}`));
}
const skullTop = (stamp: Stamp) => stamp.findIndex((row) => row.some(Boolean));

const coversCache = new WeakMap<Stamp, boolean>();
/**
 * Whether a hairstyle covers the ears: decided once, from its front 3/4 stamp, which every
 * hairstyle has, so all the views agree.
 */
function coversEars(hair: Stamp, head: Stamp): boolean {
  let hit = coversCache.get(hair);
  if (hit === undefined) coversCache.set(hair, (hit = earCells('front', skullTop(head)).filter(([x, y]) => hair[y]?.[x]).length >= 2));
  return hit;
}

const sideCache = new WeakMap<StampPair, Stamp>();
/**
 * Hair side on, for a hairstyle drawn only in 3/4: behind the ear it is the 3/4 back view, which
 * shows the back of the head; from the ear forward it is the 3/4 front view, narrowed to run from
 * the ear to the brow. The ear lies on the edge of both 3/4 views and in the middle side on.
 * Above the skull, from row `top`, it is the 3/4 front view as it is.
 */
function hairSide(pair: StampPair, top: number): Stamp {
  const hit = sideCache.get(pair);
  if (hit) return hit;
  const dx = HEAD_FRAME.ax - HEAD_STAMP.ax;
  const earFront = Math.max(...EARS.E.map(([x]) => x)) + dx;
  const earDiagonal = Math.max(...EARS.front.map(([x]) => x)) + dx;
  // The face edge: the 3/4 skull ends at stamp column 17, the side skull at 18.
  const ratio = (17 - (earDiagonal - dx)) / (18 - (earFront - dx));
  // A bun or a crest standing up from the crown is drawn once, where the 3/4 front view has it.
  const spliced = pair.front.map((row, y) =>
    y < top ? row : row.map((_, x) => (x <= earFront ? pair.back[y]?.[x] ?? null : row[earDiagonal + Math.round((x - earFront) * ratio)] ?? null)),
  );
  // Where the two halves meet they may leave a one-pixel notch: it is closed with the pixel beside it.
  const out = spliced.map((row) => row.map((cell, x) => cell ?? (row[x - 1] && row[x + 1] ? row[x - 1] : null)));
  sideCache.set(pair, out);
  return out;
}

const peakCache = new WeakMap<Stamp, Stamp>();
/**
 * A hat's 3/4 back stamp without its peak: rows that reach past the head only on the face side
 * (the right, from behind) are cut back to the head's edge. A brim all round reaches past both
 * sides and stays. Seen from straight behind, the peak points away and does not show.
 */
function withoutPeak(hat: Stamp, head: Stamp): Stamp {
  const hit = peakCache.get(hat);
  if (hit) return hit;
  const xs = head.flatMap((row) => row.flatMap((cell, x) => (cell ? [x] : [])));
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const out = hat.map((row) => {
    const l = row.findIndex(Boolean);
    const r = row.length - 1 - [...row].reverse().findIndex(Boolean);
    if (l < 0 || r <= right + 1 || l < left) return row;
    return row.map((cell, x) => (x > right ? null : cell));
  });
  peakCache.set(hat, out);
  return out;
}

const tuckedCache = new WeakMap<Stamp, WeakMap<Stamp, Stamp>>();

/**
 * Hair as worn under a hat: everything above the hat's lower edge is removed, so no tuft pokes
 * through the crown or bulges beside it. Hair below the brim stays. Worked out from the two
 * stamps, so no hairstyle needs a second drawing.
 */
function tucked(hair: Stamp, hat: Stamp): Stamp {
  let byHat = tuckedCache.get(hair);
  if (!byHat) tuckedCache.set(hair, (byHat = new WeakMap()));
  const hit = byHat.get(hat);
  if (hit) return hit;
  const width = hat[0]?.length ?? 0;
  const edge: number[] = Array(width).fill(-1);
  hat.forEach((row, y) => row.forEach((cell, x) => {
    if (cell) edge[x] = Math.max(edge[x], y);
  }));
  // Columns the hat does not reach take the edge of the nearest column it does.
  const first = edge.findIndex((v) => v >= 0);
  const last = edge.length - 1 - [...edge].reverse().findIndex((v) => v >= 0);
  const edgeAt = (x: number) => (first < 0 ? -1 : edge[Math.min(last, Math.max(first, x))]);
  const out = hair.map((row, y) => row.map((cell, x) => (cell && y <= edgeAt(x) ? null : cell)));
  byHat.set(hat, out);
  return out;
}

/** Draws one frame of a character. Every pixel is placed by a rule or comes from a stamp. */
export function drawCharacter(look: Look, pose: Pose, facing: Facing, options: DrawOptions = {}): Sprite {
  return drawFigure(look, pose, facing, options);
}

/**
 * The same pose done the other way round: left and right swapped and the head turned the other
 * way. Drawn and then mirrored, it gives back the pose itself.
 */
function mirroredPose(pose: Pose): Pose {
  const flip = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
  const out = { ...pose, hips: flip(pose.hips), chest: flip(pose.chest), neck: flip(pose.neck), look: pose.look ? -pose.look : pose.look, ...(pose.hair ? { hair: flip(pose.hair) } : {}) };
  for (const joint of ['shoulder', 'elbow', 'hand', 'hip', 'knee', 'foot'] as const) {
    out[`${joint}L`] = flip(pose[`${joint}R`]);
    out[`${joint}R`] = flip(pose[`${joint}L`]);
  }
  return out;
}

/**
 * `working` is the hand that holds the tool and does the work: the right one, or the left while
 * drawing a view that is mirrored afterwards, so a character stays right-handed all the way round.
 */
function drawFigure(look: Look, pose: Pose, facing: Facing, options: DrawOptions, working: 'L' | 'R' = 'R', mirrored = false): Sprite {
  // A mirrored view is drawn with the pose done the other way round, then flipped: the right hand
  // stays the right hand, and a head turned to the left still turns to the left.
  if (pose.lie) return lying(look, pose, facing, options);
  if (FACING_VIEWS[facing].mirror) return drawFigure(look, mirroredPose(pose), FACING_VIEWS[facing].drawn, options, 'L', true).mirrored();
  const view: View = facing === 4 ? 'S' : facing === 6 ? 'N' : facing === 7 ? 'E' : (facing as 0 | 3);
  const own: OwnView | null = typeof view === 'string' ? view : null;
  // Side on, the far arm is behind the body and the head. Raised, as in a wave, it would not
  // show at all; the near arm does it instead, and the far hand takes over the tool.
  if (own === 'E' && pose.handL[1] > pose.shoulderL[1] + 2 && pose.handR[1] <= pose.shoulderR[1] + 2) {
    const flip = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
    const arms = { shoulderL: flip(pose.shoulderR), elbowL: flip(pose.elbowR), handL: flip(pose.handR), shoulderR: flip(pose.shoulderL), elbowR: flip(pose.elbowL), handR: flip(pose.handL) };
    return drawFigure(look, { ...pose, ...arms }, facing, options, working === 'R' ? 'L' : 'R', mirrored);
  }
  // Side on, depth is the character's own x, so the lower shoulder is the far one. A tool swung in
  // that hand is hidden behind the body and the near arm, and the hand left over reads as a loose
  // piece. The near hand swings instead, as it does for a wave above.
  if (own === 'E' && options.swing && pose[working === 'R' ? 'shoulderR' : 'shoulderL'][0] < pose[working === 'R' ? 'shoulderL' : 'shoulderR'][0]) {
    const flip = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
    const arms = { shoulderL: flip(pose.shoulderR), elbowL: flip(pose.elbowR), handL: flip(pose.handR), shoulderR: flip(pose.shoulderL), elbowR: flip(pose.elbowL), handR: flip(pose.handL) };
    return drawFigure(look, { ...pose, ...arms }, facing, options, working === 'R' ? 'L' : 'R', mirrored);
  }
  // Side on, an arm raised out to the side would stand straight up through the head; it is raised
  // forward instead, in front of the face, where it shows.
  if (own === 'E' && !options.swing && pose.handR[1] > pose.shoulderR[1] + 2) {
    const s = pose.shoulderR;
    const forward = (v: Vec3): Vec3 => [s[0], v[1], v[2] + Math.abs(v[0] - s[0]) * 2.2];
    pose = { ...pose, elbowR: forward(pose.elbowR), handR: forward(pose.handR) };
  }
  // Side on, both arms of the use clip reach forward together. The far one has the body in front of
  // it, so all that clears the near arm is a stray piece of hand. It is tucked down at the side,
  // keeping a little of the reach, where the body covers it for the whole swing.
  if (own === 'E' && options.swing) {
    const far: 'L' | 'R' = pose.shoulderL[0] < pose.shoulderR[0] ? 'L' : 'R';
    const at = far === 'L' ? pose.shoulderL : pose.shoulderR;
    const tuck = (v: Vec3, drop: number): Vec3 => [at[0], at[1] - drop, at[2] + (v[2] - at[2]) * 0.35];
    pose = far === 'L'
      ? { ...pose, elbowL: tuck(pose.elbowL, 4.5), handL: tuck(pose.handL, 9) }
      : { ...pose, elbowR: tuck(pose.elbowR, 4.5), handR: tuck(pose.handR, 9) };
  }

  const sprite = new Sprite();
  const as = (part: Part) => {
    if (options.parts) sprite.part = PART_COLORS[part];
  };
  const back = view === 3 || view === 'N';
  const side = (pair: StampPair) => (back ? pair.back : pair.front);
  const P = (v: Vec3) => project(v, view);
  const skin: Cell = { key: look.skin, shade: false };
  const tone = (cell: Cell, shade: boolean) => hexOf({ ...cell, shade: cell.shade || shade, light: shade ? false : cell.light });
  const layers: Layer[] = [];
  // Later slots cover earlier ones.
  const ordered = SLOTS.flatMap((slot) => look.items.filter((i) => i.slot === slot));
  const tool = ordered.find((i) => i.tool);
  // A short tool held up in one hand (a torch, a stick) would hide behind the arm, so it is drawn
  // in front of the arm with the hand over it; a long one shows past the head anyway.
  const toolRows = tool?.tool?.front.map((row) => row.some(Boolean)) ?? [];
  const shortTool = tool?.hold === 'pole' && toolRows.lastIndexOf(true) - toolRows.indexOf(true) < 26;
  const body = look.build ?? BUILDS.find((b) => b.id === 'slim')!;
  // A skeleton's limbs are thin lines, but hang where a body's would.
  const build = look.skeleton ? { ...body, arm: 1, leg: 2 } : body;
  // Poses are authored for the slim build. Wider builds move the limbs outwards so that arms
  // still sit just outside the torso and legs keep a one-pixel gap.
  // Face on and from behind the torso is two pixels wider and the arms move out with it; side on
  // it is two narrower, its depth.
  const torsoWidth = build.torso + (own === 'S' || own === 'N' ? 2 : own === 'E' ? -2 : 0);
  // A thin arm keeps the outer edge a full one would have.
  const armShift = ((torsoWidth - 9) / 2 + (body.arm - 3) / 2 + (body.arm - build.arm) / 2) / 0.7071;
  const hat = ordered.find((i) => i.slot === 'hat' && i.head);
  // Under a hat that covers the crown, hair is drawn in its tucked form.
  const hairStamp = (item: Item, stamp: Stamp): Stamp =>
    item.slot === 'hair' && hat && coversCrown(rawHead(hat)) ? tucked(stamp, rawHead(hat)) : stamp;
  const legShift = ((body.leg - 4) / 2) / 0.7071;
  const moved = (v: Vec3, s: 'L' | 'R', shift: number): Vec3 => [v[0] + (s === 'R' ? shift : -shift), v[1], v[2]];

  const limbPaint = (kind: 'arm' | 'leg', t: number): Cell => {
    let cell: Cell = skin;
    const index = Math.min(LIMB_CELLS - 1, Math.floor(t * LIMB_CELLS));
    for (const item of ordered) {
      const strip = item[kind];
      if (strip?.[index]) cell = strip[index]!;
    }
    return cell;
  };

  const chest = P(pose.chest);
  const hips = P(pose.hips);

  // No ground shadow in the picture: it is cast from the sun where the character stands.

  // How far the knees have swung out to either side of where the legs hang, for skirts.
  const legPoints = (['L', 'R'] as const).map((s) => ({
    hip: P(moved(pose[`hip${s}`], s, legShift)).x,
    knee: P(moved(pose[`knee${s}`], s, legShift)).x,
  }));
  const stride = {
    left: Math.min(0, Math.min(...legPoints.map((l) => l.knee)) - Math.min(...legPoints.map((l) => l.hip))),
    right: Math.max(0, Math.max(...legPoints.map((l) => l.knee)) - Math.max(...legPoints.map((l) => l.hip))),
  };

  // ---- legs and feet. The farther leg is drawn in the shade tone, with a gap between the two.
  for (const s of ['L', 'R'] as const) {
    const hip = P(moved(pose[`hip${s}`], s, legShift));
    const knee = P(moved(pose[`knee${s}`], s, legShift));
    const foot = P(moved(pose[`foot${s}`], s, legShift));
    const far = hip.depth < hips.depth;
    layers.push({
      depth: knee.depth - 20,
      draw: () => {
        as('legs');
        // One edge stays in shade along the whole leg, the far side or the underside, so it reads as round.
        drawLimb(sprite, [hip, knee, foot], build.leg, (t, across, tall) =>
          tone(limbPaint('leg', t), far || (build.leg >= 3 && across === (tall && farSide < 0 ? 0 : build.leg - 1))), look.skeleton);
        const shoes = [...ordered].reverse().find((item) => item.foot);
        const upper = shoes?.foot ?? skin;
        const sole = shoes?.sole ?? upper;
        // Feet are wider than the legs and point the way the character faces.
        // Seen from the front or back they point at or away from the viewer, so they stay as wide
        // as the leg; side on they reach a pixel further forward.
        const left = Math.round(foot.x - build.leg / 2);
        const top = Math.round(foot.y);
        const toe = own === 'S' || own === 'N' ? build.leg - 1 : own === 'E' ? build.leg + 1 : build.leg;
        // A foot lifted behind the body, pushing off, tips toe down: seen from the side it is no
        // longer a flat block but narrows to the toes under the front of the shin.
        const foot3 = pose[`foot${s}`];
        if (own !== 'S' && own !== 'N' && foot3[1] > 1.5 && foot3[2] < pose[`hip${s}`][2] - 1) {
          for (let dx = 0; dx < build.leg; dx++) {
            sprite.set(left + dx, top, tone(shoes?.footOpen ? skin : upper, far || dx === 0));
            if (dx >= build.leg - 2) sprite.set(left + dx + 1, top + 1, tone(sole, far));
          }
          return;
        }
        for (let dx = 0; dx <= toe; dx++) {
          // A sandal leaves the foot bare apart from one strap; a worn-out shoe shows the toes.
          const bare = shoes?.footOpen === 'strap' ? dx !== Math.floor(build.leg / 2) : shoes?.footOpen === 'toe' && dx === toe;
          sprite.set(left + dx, top, tone(bare ? skin : upper, far));
          sprite.set(left + dx, top + 1, tone(sole, far || dx === 0));
        }
      },
    });
  }

  // ---- torso: a block from shoulders to hips with a shaded far side, then rigid clothing stamps
  const farSide = Math.sign(P(pose.shoulderL).x - chest.x) || 1;
  // Which way on screen the character faces.
  const ahead = Math.sign(P([0, 0, 1]).x - P([0, 0, 0]).x) || 1;
  layers.push({
    depth: chest.depth,
    draw: () => {
      as('torso');
      const top = Math.round(chest.y);
      const bottom = Math.round(hips.y) + 1;
      const width = torsoWidth;
      const feminine = look.frame === 'f';
      // The feminine shape is an hourglass. The waist is drawn in on both sides, far enough
      // that a gap shows between it and the hanging arm. A sturdy build stays straight.
      const inset = (row: number): number => {
        // Side on the waist is the body's depth, not its width: there is no hourglass to see.
        if (!feminine || build.straight || own === 'E') return 0;
        // One pixel in, over three rows (one on the slimmest build): a deeper or longer waist
        // reads as a wasp waist at this size.
        return width >= 9 ? (row >= 5 && row <= 7 ? 1 : 0) : row === 6 ? 1 : 0;
      };
      /** First and last body column drawn in a torso row. Column 0 is the left edge of the block. */
      const span = (row: number): [number, number] => [inset(row), width - 1 - inset(row)];
      const open = ordered.some((item) => item.open);
      for (let y = top; y <= bottom && !open; y++) {
        const k = bottom === top ? 0 : (y - top) / (bottom - top);
        const left = Math.round(chest.x + (hips.x - chest.x) * k - width / 2);
        const [lo, hi] = span(y - top);
        for (let i = lo; i <= hi; i++) {
          // The far side is in shade, and there is a shadow under the chin.
          const edge = farSide > 0 ? i === hi : i === lo;
          const under = y === top && i >= 2 && i <= width - 3;
          sprite.set(left + i, y, tone(skin, edge || under));
        }
      }
      const mid = Math.floor(chest.x);
      if (open) {
        // The stamps below are all there is of the body.
      } else if (back) {
        // A hint of the spine, so the back is not an empty block.
        for (let dy = 2; dy <= 5; dy++) sprite.set(mid, top + dy, tone(skin, true));
      } else {
        if (own !== 'E') sprite.set(own === 'S' ? mid : mid + 1, top + 8, tone(skin, true));
      }
      const half = (width - 1) / 2;
      const hipRow = TORSO_FRAME.ay + 11;
      as('clothes');
      for (const item of ordered) {
        if (!item.torso) continue;
        // Side on the body shows its side: the near half of the 3/4 stamp is mirrored over its
        // front half, so a placket, buttons or a tie on the chest do not face the viewer.
        const profile = (stamp: Stamp): Stamp => stamp.map((row) => row.map((cell, c) => (c > TORSO_FRAME.ax ? row[2 * TORSO_FRAME.ax - c] ?? null : cell)));
        const fit = fitted(own === 'E' ? profile(side(item.torso)) : side(item.torso), width);
        let stamp = fit.stamp;
        if (feminine) {
          // Clothing follows the waist, and gets a soft shadow under the chest.
          const first = fit.ax - half;
          stamp = stamp.map((row, r) => {
            const bodyRow = r - TORSO_FRAME.ay;
            if (bodyRow < 0 || bodyRow > 11) return row;
            const [lo, hi] = span(bodyRow);
            const out = row.map((cell, c) => {
              const i = c - first;
              if (!cell) return cell;
              if (inset(bodyRow) && (i < lo || i > hi)) return null;
              if (!back && feminine && bodyRow === 3 && Math.abs(c - fit.ax - farSide) <= 2) return { ...cell, shade: true, light: false };
              return cell;
            });
            if (inset(bodyRow)) {
              const c = first + (farSide > 0 ? hi : lo);
              if (out[c]) out[c] = { ...out[c]!, shade: true, light: false };
            }
            return out;
          });
        }
        // Above the hips a top may reach past the body's edges only where it carries on from
        // them without a break: a pixel left on its own beside the body (a puffed sleeve fitted
        // to a narrower build) would float in the air. Side on the arms hang over the middle of
        // the body, so nothing past its edges stays.
        const upper = stamp.slice(0, hipRow + 1).map((row) => {
          const first = fit.ax - half;
          const out = [...row];
          for (const dir of [-1, 1]) {
            let joined = own !== 'E';
            for (let c = dir < 0 ? first - 1 : first + width; c >= 0 && c < row.length; c += dir) {
              joined = joined && !!row[c];
              if (!joined) out[c] = null;
            }
          }
          return out;
        });
        // The body above is a block sheared and squashed from chest to hips when it leans: each row of
        // the top goes where its body row went, so clothes bend with the body. Standing it is one to one.
        const rows = bottom - top;
        // Squashed, two rows can land on one line. On a see-through stamp (ribs) only the first is
        // drawn there, or a bar would fill the gap under it and the cage turn solid.
        const taken = new Set<number>();
        upper.forEach((row, r) => {
          const b = r - TORSO_FRAME.ay;
          const y = top + (b <= 0 ? b : b >= 11 ? rows + b - 11 : Math.round((b * rows) / 11));
          if (item.open && row.some(Boolean)) {
            if (taken.has(y)) return;
            taken.add(y);
          }
          stampInto(sprite, [row], { ax: fit.ax, ay: 0 }, Math.floor(chest.x + (hips.x - chest.x) * Math.max(0, Math.min(1, b / 11))), y);
        });
        // Anything below the hips is a skirt. Each of its rows is stretched towards whichever
        // knee has swung out, more so further down, so the hem follows the stride.
        for (let r = hipRow + 1; r < stamp.length; r++) {
          const cells = stamp[r];
          const first = cells.findIndex(Boolean);
          if (first < 0) continue;
          const last = cells.length - 1 - [...cells].reverse().findIndex(Boolean);
          const t = Math.min(1, (r - hipRow) / 5);
          const from = first + Math.round(stride.left * t);
          const to = last + Math.round(stride.right * t);
          for (let x = from; x <= to; x++) {
            const cell = cells[first + Math.round(((x - from) * (last - first)) / Math.max(1, to - from))];
            if (cell) sprite.set(Math.floor(hips.x) + x - fit.ax, bottom + r - hipRow, hexOf(cell));
          }
        }
      }
      // The front of the body side on and in front 3/4: the bust, and a sturdy build's belly,
      // stand out at the front in whatever is worn there. Each is given as how far it stands out
      // row by row, side on and in 3/4, where the front is half turned away. The belly starts
      // under the chest and swells to two pixels over most of the stomach before it rounds back
      // in at the hips; on a woman it starts under the bust, a row in at the waist between them.
      // A pixel that overhangs the row below is the underside, in shade. Face on and from behind
      // the outline does not change; the shadow under the chest on clothing shows the bust face on.
      const sturdy = !!build.straight;
      const profile = new Map<number, number>();
      const shape = (side: Record<number, number>, threeQuarter: Record<number, number>) => {
        for (const [row, out] of Object.entries(own === 'E' ? side : threeQuarter)) profile.set(Number(row), out);
      };
      if (feminine) shape(sturdy ? { 2: 1, 3: 2, 4: 2, 5: 1 } : { 2: 1, 3: 1, 4: 1 }, { 3: 1, 4: 1 });
      if (sturdy && feminine) shape({ 6: 1, 7: 2, 8: 2, 9: 2, 10: 1 }, { 7: 1, 8: 1, 9: 1 });
      if (sturdy && !feminine) shape({ 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 2, 10: 1 }, { 6: 1, 7: 1, 8: 1, 9: 1 });
      // A slimmer build is still rounded side on: chest and stomach a pixel out in one curve,
      // from under the bust on a woman, so no waist shows in profile.
      if (!sturdy) shape(feminine ? { 5: 1, 6: 1, 7: 1, 8: 1 } : { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 }, {});
      if (!back && (own === 'E' || own === null)) {
        for (const [row, depth] of profile) {
          const y = top + row;
          // The front edge of the torso in this row, as the block above drew it.
          const k = bottom === top ? 0 : row / (bottom - top);
          const edge = Math.round(chest.x + (hips.x - chest.x) * k - width / 2) + span(row)[1];
          const color = sprite.get(edge, y);
          if (!color) continue;
          const below = profile.get(row + 1) ?? 0;
          for (let d = 1; d <= depth; d++) sprite.set(edge + d, y, d > below ? darker(color) : color);
        }
      }
    },
  });

  // ---- arms and hands. The working hand holds the tool; a short tool, which the body would hide
  // in the far hand, goes to the hand nearer the viewer.
  const depthOf = (s: 'L' | 'R') => P(moved(pose[`shoulder${s}`], s, armShift)).depth;
  const nearer = depthOf('L') > depthOf('R') + 0.5 ? 'L' : depthOf('R') > depthOf('L') + 0.5 ? 'R' : working;
  const holder = shortTool ? nearer : working;
  for (const s of ['L', 'R'] as const) {
    const shoulder3 = moved(pose[`shoulder${s}`], s, armShift);
    const shoulder = P(shoulder3);
    const far = shoulder.depth < chest.depth;
    let elbow = P(moved(pose[`elbow${s}`], s, armShift));
    let hand = P(moved(pose[`hand${s}`], s, armShift));
    // The working hand holds the tool even on the far side, where the body hides part of it.
    const holding = tool && s === holder;
    // Side on, a long tool is carried upright at the side, just behind the head: leaned forward it
    // ran across the face, and in front of the head it hid it.
    const upright = holding && tool.hold === 'pole' && !options.swing && own === 'E';
    if (holding && tool.hold === 'pole' && !options.swing) {
      const side3 = s === 'R' ? 1 : -1;
      if (shortTool) {
        // A short one (a torch) is held up before the body, the forearm raised forward and out to
        // shoulder height, so its top shows past the head from every side.
        const elbow3 = add(shoulder3, [side3 * 1.6, -3.3, 1.2]);
        elbow = P(elbow3);
        hand = P(add(elbow3, [side3 * 3, 2.8, 3.6]));
      } else {
        // A long tool is carried with the arm held out to the side, so the shaft clears the head.
        const elbow3 = add(shoulder3, [side3 * 3.4, -2.9, upright ? 0 : 0.4]);
        elbow = P(elbow3);
        hand = P(add(elbow3, [side3 * 3.6, -0.6, upright ? 0.6 : 2.6]));
      }
    }
    const inner = Math.sign(chest.x - shoulder.x);
    // A near arm raised past the shoulder, waving or swinging, is in front of the head.
    const armDepth = !far && hand.y < shoulder.y - 2 ? chest.depth + 4 : elbow.depth + (far ? -1 : 1);
    layers.push({
      depth: holding && shortTool ? armDepth + 0.001 : upright ? chest.depth + 2.5 : armDepth - 0.001,
      draw: () => {
        as('tool');
        if (holding) {
          // The grip is pinned to the hand in every frame. While swinging, the tool turns with
          // the forearm as if held like a hammer: upright when the forearm points forward.
          let steps = 0;
          if (options.swing) {
            const fromDown = (Math.atan2(hand.x - elbow.x, hand.y - elbow.y) * 180) / Math.PI;
            steps = Math.round((90 - fromDown) / 45);
            // A long tool does not turn with the arm: it stays tilted the way the character
            // faces and is thrust with the hand, which also keeps it on the canvas.
            steps = tool.hold === 'pole' ? ahead : Math.max(-3, Math.min(3, steps));
          }
          const pivotX = TOOL_FRAME.ax + (tool.gripDx?.[back ? 'back' : 'front'] ?? 0);
          for (const { dx, dy, cell } of turned(side(tool.tool!), pivotX, TOOL_FRAME.ay, steps)) {
            sprite.set(Math.round(hand.x) + dx, Math.round(hand.y) + dy, hexOf(cell));
          }
          if (tool.fx) {
            // The particle system's point, turned about the grip the same way as the stamp (see `turned`).
            const g = back ? tool.fx.back : tool.fx.front;
            const u = g.x - pivotX, v = g.y - TOOL_FRAME.ay;
            const cos = Math.cos((steps * Math.PI) / 4), sin = Math.sin((steps * Math.PI) / 4);
            sprite.fx = { system: tool.fx.system, x: Math.round(hand.x) + u * cos - v * sin, y: Math.round(hand.y) + u * sin + v * cos };
          }
        }
      },
    });
    layers.push({
      depth: armDepth,
      draw: () => {
        as(s === working ? 'workArm' : 'freeArm');
        sprite.drawingNearArm = !far;
        drawLimb(sprite, [shoulder, elbow, hand], build.arm, (t, across, tall) => {
          // The nearer arm's inner edge is shaded all along, or its underside where it is held out,
          // so it separates from the body and reads as round.
          const contact = !far && (tall ? (inner > 0 ? across === build.arm - 1 : across === 0) : across === build.arm - 1);
          // The outer corner of the shoulder is lit, which rounds it.
          const cap = !far && t === 0 && (inner > 0 ? across === 0 : across === build.arm - 1);
          const cell = limbPaint('arm', t);
          return cap ? hexOf({ ...cell, shade: false, light: true }) : tone(cell, far || contact);
        }, look.skeleton);
        sprite.drawingNearArm = false;
      },
    });
    layers.push({
      depth: armDepth + 0.002,
      draw: () => {
        as(s === working ? 'workArm' : 'freeArm');
        sprite.drawingNearArm = !far;
        // Hands are a visible block of skin, drawn over whatever they hold.
        // As wide as the arm, at least three pixels; the knuckle row is shaded apart from its middle.
        // A skeleton's hand is a small knob of bone, two by two.
        const handW = look.skeleton ? 2 : Math.max(3, build.arm);
        const left = Math.round(hand.x - handW / 2);
        const top = Math.round(hand.y) - 1;
        for (let dy = 0; dy < (look.skeleton ? 2 : 3); dy++) {
          for (let dx = 0; dx < handW; dx++) sprite.set(left + dx, top + dy, tone(skin, far || (dy === 2 && dx !== 1 && dx !== handW - 2)));
        }
        sprite.drawingNearArm = false;
      },
    });
  }

  // ---- head: rigid stamps. A wider build repeats the middle column of the head, hair and hat
  // stamps so they widen together and stay centred; the face keeps its size in the middle.
  const neck = P(pose.neck);
  // Hair below the ears lags behind the head by whole pixels; the scalp stays put, so short hair never moves.
  const lag = pose.hair ? { x: Math.round(P(add(pose.neck, pose.hair)).x - neck.x), y: Math.round(-pose.hair[1]) } : { x: 0, y: 0 };
  const lagged = (stamp: Stamp): Stamp => {
    if (!lag.x && !lag.y) return stamp;
    const cut = skullTop(bareHead()) + 9;
    // Rows just under the ears move less, so the hair bends instead of breaking off.
    return stamp.map((row, y) => {
      if (y <= cut) return row;
      const from = stamp[Math.max(cut, y - lag.y)] ?? [];
      const dx = y > cut + 2 ? lag.x : 0;
      return row.map((_, x) => from[x - dx] ?? null);
    });
  };
  // The head turns up to an eighth either way of the body and is drawn in the view it then
  // faces: that view's own stamps, mirrored for the left-hand views.
  const headFacing = turnFacing(facing, -Math.max(-1, Math.min(1, pose.look ?? 0)));
  const { mirror: flip, drawn: headView, back: headBack } = FACING_VIEWS[headFacing];
  const hv: OwnView | null = headView === 4 ? 'S' : headView === 6 ? 'N' : headView === 7 ? 'E' : null;
  const hside = (pair: StampPair) => (headBack ? pair.back : pair.front);
  const extra = build.head ?? 0;
  // Mirroring the head moves it two pixels towards the body's front; a turned head is moved back
  // one less, so it leans a pixel the way it now looks instead of seeming to pull back.
  const nudge = flip ? -1 : 0;
  const hx = Math.floor(neck.x) - Math.floor(extra / 2) + nudge;
  // The neck is one row shorter than the head stamps draw it: the head sits a row lower and the
  // neck's lowest row is left out, so it still ends on the shoulders. A double chin already
  // takes up that row.
  const lift = build.chin ? 0 : 1;
  const hy = Math.round(neck.y) + lift;
  // The jaw row, in the head frame; a double chin repeats it, which moves the chin and neck down.
  const JAW = 21;
  const headStamp = (stamp: Stamp): Stamp => {
    const wide = across(extra ? widened(stamp, HEAD_FRAME.ax, extra) : stamp, extra);
    return build.chin ? [...wide.slice(0, JAW + 1), wide[JAW], ...wide.slice(JAW + 1)] : wide;
  };
  // A head facing a left-hand view: the same stamps mirrored about the head's middle, between two columns.
  const across = (stamp: Stamp, wider: number): Stamp =>
    flip ? stamp.map((row) => row.map((_, x) => row[2 * HEAD_FRAME.ax + wider + 1 - x] ?? null)) : stamp;
  // Front, back and side views use the head's and the items' hv stamps for that view; an item
  // without them falls back to its diagonal stamp on the same side.
  const ownHead = hv ? look.views?.[hv] : undefined;
  const faces = ownHead?.faces ?? look.faces;
  const face = headBack ? [] : across(faces[options.face ?? 'neutral'] ?? faces.neutral, 0);
  const bareHead = () => ownHead?.head ?? hside(look.head);
  // Ears follow the hairstyle: hair that covers them in 3/4 covers them in every view it reaches
  // them, filling the ear with the hair beside it; hair that leaves them free is never drawn over them.
  const hairItem = ordered.find((item) => item.slot === 'hair' && item.head);
  const ears = earCells(hv ?? (headBack ? 'back' : 'front'), skullTop(bareHead()));
  // Only where this view's hair reaches the ear: a style that stops short of it side on shows the
  // ear there as on a bare head, not a patch of hair on the skin. Asked while drawing, once itemHead exists.
  let hidden: boolean | undefined;
  const earsHidden = () =>
    (hidden ??= !!hairItem && coversEars(hairItem.head!.front, look.head.front) && ears.filter(([x, y]) => itemHead(hairItem)[y]?.[x]).length >= 2);
  const earSet = new Set(ears.map(([x, y]) => `${x},${y}`));
  const onEar = (x: number, y: number) => earSet.has(`${x},${y}`);
  const withEars = (hair: Stamp): Stamp => {
    const out = hair.map((row) => [...row]);
    if (!earsHidden()) {
      for (const [x, y] of ears) out[y][x] = null;
      return out;
    }
    // Hidden, the whole ear is filled, its hollow too, spreading from the hair beside it: filling only
    // the ring left a hair-coloured ear outline on the skin side on, where the hair stops short of it.
    const patch = [...earPatch(hv ?? (headBack ? 'back' : 'front'), ears)].map((k) => k.split(',').map(Number));
    for (let grew = true; grew; ) {
      grew = false;
      for (const [x, y] of patch) {
        if (out[y][x]) continue;
        out[y][x] = N8.map(([dx, dy]) => out[y + dy]?.[x + dx]).find(Boolean) ?? null;
        grew ||= !!out[y][x];
      }
    }
    return out;
  };
  const headOf = (): Stamp => {
    const head = bareHead();
    if (!earsHidden()) return head;
    const hair = withEars(itemHead(hairItem!));
    // An ear the hair does not reach loses its bump on the outline, or side on its shape.
    return head.map((row, y) => row.map((cell, x) => (cell && onEar(x, y) && !hair[y][x] ? (hv === 'E' ? { ...cell, shade: false, light: false } : null) : cell)));
  };
  // An item without its own stamp for the view falls back to its 3/4 stamp on the same side.
  const fallback = (item: Item): Stamp => {
    const stamp = hside(item.head!);
    if ((item.slot === 'hat' || item.slot === 'hair') && (hv === 'S' || hv === 'N')) {
      return faceOn(hv === 'N' && item.slot === 'hat' ? withoutPeak(stamp, look.head.back) : stamp, hv === 'S', item.slot === 'hat');
    }
    if (item.slot === 'hair' && hv === 'E') return hairSide(item.head!, skullTop(look.head.front));
    // A hat side on is put together like hair: the back of it behind the ear, the front of it
    // narrowed in front, crown included, so a badge on the front does not face the viewer.
    if (item.slot === 'hat' && hv === 'E') return hairSide(item.head!, 0);
    if (item.slot !== 'beard' || !hv) return stamp;
    // Side on the beard moves forward with the face. Face on it is the half of the 3/4 beard
    // towards the face, mirrored about the middle of the face; from behind only what stands out
    // past the head shows, in shade.
    // Row by row, the edge of the face in 3/4, where a sideburn runs, goes right in front of the ear:
    // each row is narrowed to run from there to a pixel past where the beard ends in 3/4. A row
    // reaching past the edge of the face, as a full beard does below the jaw, starts there instead.
    if (hv === 'E') {
      const xs = stamp.flatMap((row) => row.flatMap((cell, x) => (cell ? [x] : [])));
      if (!xs.length) return stamp;
      const x1 = Math.max(...xs) + 1;
      const start = Math.max(...earCells('E', 0).map(([x]) => x)) + 1;
      const near = look.head.front;
      const nearEar = earCells('front', skullTop(near));
      let edge = Math.min(...xs);
      const narrowed = stamp.map((row, y) => {
        const face = near[y]?.findIndex((cell, x) => cell && !nearEar.some(([ex, ey]) => ex === x && ey === y)) ?? -1;
        if (face >= 0) edge = face;
        const first = row.findIndex(Boolean);
        const from = first >= 0 ? Math.min(edge, first) : edge;
        return row.map((_, x) => (x < start || x > x1 ? null : row[Math.round(from + ((x - start) * (x1 - 1 - from)) / Math.max(1, x1 - start))] ?? null));
      });
      // Below the ear it covers the jaw back to under the ear.
      const ear = earCells('E', skullTop(bareHead()));
      const below = Math.max(...ear.map(([, y]) => y));
      const back = Math.min(...ear.map(([x]) => x));
      const head = bareHead();
      return narrowed.map((row, y) => {
        const first = row.findIndex(Boolean);
        if (y <= below || first < 0) return row;
        return row.map((cell, x) => cell ?? (x >= back && x < first && head[y]?.[x] ? row[first] : null));
      });
    }
    const front = item.head!.front;
    // Face on, each half of the beard is the near half of the 3/4 beard, the half that faces the
    // viewer there: from the edge of the face to the nose, eased onto the edge of the face-on head
    // and its middle, and mirrored. Outside the head it keeps its distance from the edge.
    const near = look.head.front;
    const straightHead = look.views?.S?.head ?? near;
    const nose = 13 + HEAD_FRAME.ax - HEAD_STAMP.ax;
    const mid = HEAD_FRAME.ax;
    // The edge of the face, not of the ear standing out past it.
    const outer = (view: 'front' | 'S', stamp: Stamp) => {
      const cells = earCells(view, skullTop(stamp));
      const x0 = Math.min(...cells.map(([x]) => x));
      return new Set(cells.filter(([x]) => x === x0).map(([x, y]) => `${x},${y}`));
    };
    const earAt = new Map<Stamp, Set<string>>([[near, outer('front', near)], [straightHead, outer('S', straightHead)]]);
    const edgeOf = (stamp: Stamp, y: number) => stamp[y]?.findIndex((cell, x) => cell && !earAt.get(stamp)!.has(`${x},${y}`)) ?? -1;
    let last = [edgeOf(near, 0), edgeOf(straightHead, 0)];
    const straight = front.map((row, y) => {
      const edges = [edgeOf(near, y), edgeOf(straightHead, y)];
      if (edges.every((e) => e >= 0)) last = edges;
      const [e34, eS] = last;
      const half = row.map((_, x) => {
        if (x > mid) return null;
        const src = x < eS ? e34 - (eS - x) : e34 + ((x - eS) * (nose - e34)) / Math.max(1, mid - eS);
        return row[Math.round(src)] ?? null;
      });
      const out = half.map((cell, x) => cell ?? half[2 * mid - x] ?? null);
      // Below the jaw a row the near half misses, such as the tip of a long beard on the far half,
      // keeps its 3/4 width, centred, so the beard reaches as low in every view.
      const xs = row.flatMap((cell, x) => (cell ? [x] : []));
      if (y <= JAW || !xs.length || out.some(Boolean)) return out;
      const shift = Math.round(mid - (xs[0] + xs[xs.length - 1]) / 2);
      return row.map((_, x) => row[x - shift] ?? null);
    });
    if (hv === 'S') return straight;
    // From straight behind the beard shows past the jaw on both sides, by the same rule as in 3/4 from behind.
    return beardBehind(straight, headOf(), true);
  };
  // The head ends up seen from the left when exactly one of the body's and the head's mirroring applies.
  const leftKey = mirrored !== flip ? (hv === 'E' ? 'E' : headView === 0 || headView === 3 ? headView : null) : null;
  function rawHead(item: Item): Stamp {
    if (leftKey !== null && item.left?.[leftKey]) return item.left[leftKey]!.head;
    return hv && item.views?.[hv] ? item.views[hv]!.head : fallback(item);
  }
  const itemHead = (item: Item) => hairStamp(item, rawHead(item));
  const itemBehind = (item: Item): Stamp | undefined => {
    if (leftKey !== null && item.left?.[leftKey]) return item.left[leftKey]!.behind && hairStamp(item, item.left[leftKey]!.behind!);
    if (hv && item.views?.[hv]) return item.views[hv]!.behind && hairStamp(item, item.views[hv]!.behind!);
    if (!item.headBehind || hv === 'N') return undefined;
    return hairStamp(item, hv === 'S' ? faceOn(hside(item.headBehind), true) : hside(item.headBehind));
  };
  // The face keeps its size on a wider head; side on it stays at the front of the head.
  const fx = Math.floor(neck.x) + nudge + (hv === 'E' ? (flip ? -1 : 1) * (extra - Math.floor(extra / 2)) : 0);
  const bearded = ordered.some((item) => item.slot === 'beard' && item.head);
  // Hair never covers the face, in any view: whatever a stamp drawn for another view would put
  // over the eyes, brows or mouth, or between them, is left out. So a fringe framing the face in
  // 3/4 does not slide over it side on or face on.
  const features = face.flatMap((row, y) => row.flatMap((cell, x) => (cell && cell.key !== look.skin && cell.key !== 'blush' ? [[x, y]] : [])));
  const area = features.length
    ? {
        x0: Math.min(...features.map((f) => f[0])) + fx - hx,
        x1: Math.max(...features.map((f) => f[0])) + fx - hx,
        y0: Math.min(...features.map((f) => f[1])),
        y1: Math.max(...features.map((f) => f[1])),
      }
    : null;
  const offFace = (stamp: Stamp): Stamp =>
    area ? stamp.map((row, y) => (y < area.y0 || y > area.y1 ? row : row.map((cell, x) => (x >= area.x0 && x <= area.x1 ? null : cell)))) : stamp;
  layers.push({
    depth: back ? chest.depth + 0.5 : chest.depth - 0.5,
    draw: () => {
      for (const item of ordered) {
        const behind = itemBehind(item);
        as('behind');
        if (behind) stampInto(sprite, item.slot === 'hair' ? lagged(headStamp(behind)) : headStamp(behind), HEAD_FRAME, hx, hy);
      }
    },
  });
  layers.push({
    depth: chest.depth + 3,
    draw: () => {
      as('head');
      // Ears the hair leaves free are warmed a little, like the nose.
      const patch = earPatch(hv ?? (headBack ? 'back' : 'front'), ears);
      // A skull has no ears: side on the ear's place is plain bone, in the other views the ear is left off.
      const bare = look.skeleton ? headOf().map((row, y) => row.map((cell, x) => (onEar(x, y) ? (hv === 'E' ? { key: look.skin, shade: false } : null) : cell))) : headOf();
      // Bone does not blush.
      const head = earsHidden() || look.skeleton ? bare : bare.map((row, y) => row.map((cell, x) => (cell && patch.has(`${x},${y}`) ? { ...cell, flush: true } : cell)));
      stampInto(sprite, headStamp(head).map((row, y) => (y > HEAD_FRAME.ay - lift ? row.map(() => null) : row)), HEAD_FRAME, hx, hy);
      if (options.parts && !earsHidden()) {
        // The ears in a colour of their own, so a script can tell whether they show.
        as('ear');
        stampInto(sprite, headStamp(bare.map((row, y) => row.map((cell, x) => (cell && onEar(x, y) ? cell : null)))), HEAD_FRAME, hx, hy);
      }
      as('face');
      // In the parts drawing blush is skin: hair may lie over a cheek, not over the features.
      if (!headBack) stampInto(sprite, options.parts ? face.map((row) => row.map((c) => (c?.key === 'blush' ? null : c))) : face, HEAD_FRAME, fx, hy);
      // From behind the glasses' temples show where they run over the top of each ear the hair leaves
      // free: the ear's top pixel and the one inside it.
      if (headBack && look.glasses && !earsHidden()) {
        const top = Math.min(...ears.map(([, y]) => y));
        const temples = ears.filter(([, y]) => y === top).flatMap(([x, y]) => [[x, y], [x < HEAD_FRAME.ax ? x + 1 : x - 1, y]]);
        const key = look.glasses;
        stampInto(sprite, headStamp(bare.map((row, y) => row.map((_, x) => (temples.some(([tx, ty]) => tx === x && ty === y) ? { key, shade: false } : null)))), HEAD_FRAME, hx, hy);
      }
      // A beard's sideburn runs in front of the ear, so an ear the hair leaves free shows past it in
      // every view: a beard pixel on the ear moves onto the face beside it, if that is free.
      const clear = (beard: Stamp): Stamp => {
        const out = beard.map((row, y) => row.map((cell, x) => (onEar(x, y) ? null : cell)));
        for (const [x, y] of ears) {
          if (!beard[y]?.[x] || hv === 'E') continue;
          let to = x;
          do to += x < HEAD_FRAME.ax ? 1 : -1;
          while (onEar(to, y));
          if (!beard[y][to]) out[y][to] = beard[y][x];
        }
        return out;
      };
      for (const item of ordered) {
        // From straight behind a beard does not show.
        if (!item.head) continue;
        const raw = headView === 3 && item.slot === 'beard' ? beardBehind(item.head.front, look.head.back) : item === hairItem ? withEars(itemHead(item)) : itemHead(item);
        const stamp = headStamp(item.slot === 'beard' && !earsHidden() ? clear(raw) : raw);
        as(item.slot === 'hair' ? 'hair' : item.slot === 'beard' ? 'beard' : 'hat');
        stampInto(sprite, item.slot === 'hair' ? offFace(lagged(stamp)) : stamp, HEAD_FRAME, hx, hy);
      }
      // The features show through any beard: eyes, brows, glasses, the mouth in whatever shape the
      // mood gives it, and the nose, side on the tip on the head's outline. Freckles and blush are
      // skin and lie under it.
      if (bearded && !headBack) {
        as('face');
        const features = face.map((row) => row.map((cell) => (cell && ((cell.key !== look.skin && cell.key !== 'blush') || cell.flush) ? cell : null)));
        stampInto(sprite, features, HEAD_FRAME, fx, hy);
        as('head');
        stampInto(sprite, headStamp(bare.map((row) => row.map((cell) => (cell?.flush ? cell : null)))), HEAD_FRAME, hx, hy);
      }
    },
  });

  layers.sort((a, b) => a.depth - b.depth);
  for (const layer of layers) layer.draw();
  return sprite;
}

// ------------------------------------------------------------------ text form of stamps

/**
 * Stamps are written as rows of characters. '.' is transparent. Any other character is looked
 * up in the legend; an upper-case letter is the base colour and its lower-case form the shade.
 * A legend value ending in '+' selects the highlight tone. '#', '%' and '+' are the skin in its
 * base, shade and highlight tones.
 */
export function parseStamp(rows: string[], legend: Record<string, PaletteKey | `${PaletteKey}+`>, skin?: PaletteKey): Stamp {
  return rows.map((row) =>
    [...row].map((ch): Cell | null => {
      if (ch === '.' || ch === ' ') return null;
      if (skin && (ch === '#' || ch === '%' || ch === '+')) return { key: skin, shade: ch === '%', light: ch === '+' };
      const entry = legend[ch.toUpperCase()];
      if (!entry) throw new Error(`Unknown character "${ch}" in stamp`);
      const light = entry.endsWith('+');
      const key = (light ? entry.slice(0, -1) : entry) as PaletteKey;
      return { key, shade: ch !== ch.toUpperCase(), light: light && ch === ch.toUpperCase() };
    }),
  );
}

// ------------------------------------------------------------------ standing layout

/** Where the body parts sit in the standing pose, for one drawn facing. Used to read paint off a whole sprite. */
export interface Layout {
  neck: { x: number; y: number };
  torso: { x: number; top: number; bottom: number };
  /** Column and row range of each limb, nearer one first. */
  arms: { x: number; y0: number; y1: number }[];
  legs: { x: number; y0: number; y1: number }[];
  handR: { x: number; y: number };
}

export function layoutOf(pose: Pose, facing: 0 | 3): Layout {
  const P = (v: Vec3) => {
    // Reported in body-window coordinates, the space the whole-sprite format is painted in.
    const p = project(v, facing);
    return { x: Math.floor(p.x) - BODY_WINDOW.x, y: Math.round(p.y) - BODY_WINDOW.y, depth: p.depth };
  };
  const limb = (a: Vec3, b: Vec3) => ({ x: P(a).x, y0: P(a).y, y1: P(b).y, depth: P(a).depth });
  const nearFirst = <T extends { depth: number }>(list: T[]) => list.sort((p, q) => q.depth - p.depth);
  return {
    neck: P(pose.neck),
    torso: { x: P(pose.chest).x, top: P(pose.chest).y, bottom: P(pose.hips).y + 1 },
    arms: nearFirst([limb(pose.shoulderL, pose.handL), limb(pose.shoulderR, pose.handR)]),
    legs: nearFirst([limb(pose.hipL, pose.footL), limb(pose.hipR, pose.footR)]),
    handR: P(pose.handR),
  };
}
