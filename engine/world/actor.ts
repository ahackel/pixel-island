// A character walking around a world: position in metres, facing, which clip plays, and the
// sprite for the current frame. Movement slides along whatever blocks it.
import { AUTHORED, STAND, type Clip } from '../core/poses.ts';
import { CHARACTER_ORIGIN as FEET, drawCharacter, FACING_RING, handsOn, SPRITE_H, SPRITE_W, turnFacing, type Facing, type Look, type Lying, type Sprite } from '../core/puppet.ts';
import { SHADOW } from '../core/palette.ts';
import type { Picture } from './island.ts';
import { heightAt, LEVEL_PX, SEA_LEVEL, standingHeight, underwater, waterAt, waterOf } from './terrain.ts';
import { ocean, rgb } from './ocean.ts';
import type { Thing, World } from './world.ts';
import type { Climb } from './ways.ts';
import { drew, slots } from '../../shared/stats.ts';
import { cached, idOf } from '../core/cache.ts';

export const EMOTES = ['wave', 'use'] as const;
export type Emote = (typeof EMOTES)[number];
type ClipId = 'idle' | 'walk' | 'run' | 'carry' | 'hold' | 'sitDown' | 'sit' | 'lieDown' | 'lie' | 'sitUp' | 'standUp' | 'climb' | Emote;

/** Metres per second. */
const SPEED = { walk: 1.7, run: 3.6 };
/** Levels per second up or down a ladder. */
const CLIMB_SPEED = 2.6;
/** How many times an emote plays before the character goes back to standing: a wave goes on a little, a use is one go. */
const EMOTE_LOOPS: Record<Emote, number> = { wave: 2, use: 1 };
/** Wading is slower than walking on land. */
const WADING = 0.6;
/**
 * Splashes while wading: drops thrown up from the feet every `every` seconds of walking (half that
 * running), `per` at a time, falling back under `gravity`, in levels and tiles per second.
 */
const SPLASH = { every: 0.08, per: 2, up: [4, 8], out: 0.7, gravity: 40 };

/**
 * What a standing character does now and then so it does not look frozen: glance aside, turn its
 * head, smile, laugh or look surprised, for a moment, then rest again. Weights add up to 1.
 */
// A glance turns the whole body an eighth of a turn, into a straight view, for a moment.
// `look` turns the head an eighth, left or right at random.
const FIDGETS: { weight: number; look?: 1; glance?: boolean; face?: string; seconds: [number, number] }[] = [
  { weight: 0.18, face: 'aside', seconds: [0.8, 1.8] },
  { weight: 0.28, look: 1, seconds: [0.8, 2.4] },
  { weight: 0.06, look: 1, face: 'smile', seconds: [1, 2] },
  { weight: 0.08, glance: true, seconds: [0.8, 1.8] },
  { weight: 0.07, look: 1, face: 'aside', seconds: [0.8, 1.6] },
  { weight: 0.07, look: 1, face: 'smile', seconds: [1.2, 2.4] },
  { weight: 0.15, face: 'smile', seconds: [1.5, 3.5] },
  { weight: 0.06, face: 'happy', seconds: [0.8, 1.4] },
  { weight: 0.05, face: 'surprised', seconds: [0.5, 1] },
];
/**
 * The mouth while talking: a new shape every `TALK_MS`, picked at random but never the same twice
 * running, so it chatters unevenly like the old adventure games rather than ticking.
 */
const TALK_MS = 90;
const TALK_FACES = ['neutral', 'talkHalf', 'talkOpen'] as const;
function talkFace(ms: number): string {
  const slot = Math.floor(ms / TALK_MS);
  const pick = (k: number) => (Math.imul(k, 2654435761) >>> 0) % TALK_FACES.length;
  const was = pick(slot - 1);
  const now = pick(slot);
  return TALK_FACES[now === was ? (now + 1) % TALK_FACES.length : now];
}

/** Seconds of plain standing between two fidgets. */
const REST: [number, number] = [1.5, 4.5];
const between = ([a, b]: [number, number]) => (a + Math.random() * (b - a)) * 1000;

interface Fidget { look?: number; glance?: 1 | -1; face?: string; until: number }

/**
 * Something in the character's arms: its picture for the facing and time (kept pictures, so the
 * drawing can be cached), and how many pixels its ground point sits below the hands.
 */
export type Carried = (facing: Facing, ms: number) => { picture: Picture; w: number; h: number; foot: { x: number; y: number }; below: number };

interface Drop { i: number; j: number; z: number; vi: number; vj: number; vz: number; pale: boolean }

/** A colour moved part of the way to another; a sprite colour keeps its alpha. */
export function tint(hex: string, to: number[], k: number): string {
  const from = rgb(hex);
  return '#' + from.map((v, n) => Math.round(v + (to[n] - v) * k).toString(16).padStart(2, '0')).join('') + hex.slice(7);
}

/**
 * A picture standing `rows` pixels deep in water, its ground point at row `feet` (a character's by
 * default): the rows under the surface are tinted, the waterline lighter, the ground shadow gone.
 */
export function wading(sprite: Picture, rows: number, feet = FEET.y): Picture {
  const foam = rgb(ocean.wave);
  const line = feet - rows;
  // Under the surface, the deeper a row the more the water covers it, as with fish.
  const under = Array.from({ length: rows + 1 }, (_, n) => ({ water: rgb(waterAt(n / LEVEL_PX)), cover: 1 - underwater(n / LEVEL_PX) }));
  return {
    get(x, y) {
      const c = sprite.get(x, y);
      if (!c || c === SHADOW) return null;
      if (y === line) return tint(c, foam, 0.55);
      if (y < line) return c;
      const u = under[Math.min(rows, y - line)];
      return tint(c, u.water, u.cover);
    },
  };
}

/**
 * The facing for a direction on the map, in eighths of a turn. +i is front right on screen, +j
 * front left, -i back left, -j back right, and the facings between them lie between.
 */
export function facingOf(di: number, dj: number, current: Facing): Facing {
  if (Math.abs(di) < 1e-6 && Math.abs(dj) < 1e-6) return current;
  return turnFacing(0, Math.round(Math.atan2(dj, di) / (Math.PI / 4)));
}

/** Milliseconds per eighth of a turn when a character or animal changes direction. */
export const TURN_MS = 55;

/** One eighth of a turn from `from` towards `to`, the short way round. */
export function turnToward(from: Facing, to: Facing): Facing {
  const d = (((FACING_RING.indexOf(to) - FACING_RING.indexOf(from)) % 8) + 8) % 8;
  return d === 0 ? from : turnFacing(from, d <= 4 ? 1 : -1);
}

export class Actor {
  i: number;
  j: number;
  facing: Facing = 0;
  /** The last direction walked, as an angle on the map. */
  heading = 0;
  /** Where the character is turning to, a step at a time, and when it last stepped. */
  private aim: Facing = 0;
  private turned = 0;
  private clip: ClipId = 'idle';
  private started = 0;
  /** Held in one frame of a clip, as a prop: no fidgets, no blinks, no moving on. */
  frozen: { clip: string; frame: number } | null = null;
  private look: Look;
  /** Wading pictures of each drawn picture, by rows under water. */
  private wet = new WeakMap<Picture, Map<number, Picture>>();
  private drops: Drop[] = [];
  /** The water line where the character last stood, which the splash drops fall back to. */
  private waterLine = SEA_LEVEL;
  private splashClock = 0;
  /** Distance walked since the last footprint, and which foot is next. */
  private stride = 0;
  private foot = 1;
  /** The fidget playing while standing, and when the next one starts. */
  private fidget: Fidget | null = null;
  /** Until when (page time, ms) the character is talking: its mouth moves. */
  talkUntil = 0;
  /** Milliseconds of standing still, hands empty and on dry ground, before the character sits down; the game sets it. */
  sitAfter = Infinity;
  /** Lying down (or going to): sitting down ends on the back instead of sitting. */
  private lying = false;
  /** Asleep: the eyes stay shut, and nothing gets the character up until the game wakes it. */
  asleep = false;
  /** How the character lies once down: the view and face up or down. */
  private lies: Lying = {};
  private nextFidget = 0;
  /** A ladder being climbed: the way (ways.ts `Climb`), the point of it gone for next, and the level the character is at. */
  private climbing: { way: Climb; k: number; level: number } | null = null;
  /** What is held, if anything; the character walks (never runs) while carrying. */
  carrying: Carried | null = null;
  private held = new WeakMap<Picture, Map<string, Picture>>();

  constructor(look: Look, at: { i: number; j: number }) {
    this.look = look;
    this.i = at.i;
    this.j = at.j;
  }

  setLook(look: Look): void {
    // Frames are kept per look, so going back to a look (a flickering torch) draws nothing again.
    this.look = look;
  }

  emote(emote: Emote, ms: number): void {
    // Hands full: no waving.
    if (!this.carrying) this.play(emote, ms);
  }

  /** Turns, standing, toward a direction on the map, as toward something looked at. */
  lookAt(di: number, dj: number): void {
    this.heading = Math.atan2(dj, di);
  }

  /** Gets a sitting or lying character up (not one asleep), and starts the wait before sitting again over. */
  rouse(ms: number): void {
    if (this.asleep) return;
    this.lying = false;
    if (this.clip === 'lie' || this.clip === 'lieDown') this.play('sitUp', ms);
    else if (this.clip === 'sit' || this.clip === 'sitDown') this.play('standUp', ms);
    else if (this.clip === 'idle') this.started = ms;
  }

  /** Sits down where it stands, if standing with empty hands. */
  sit(ms: number): void {
    if (!this.carrying && (this.clip === 'idle' || (EMOTES as readonly string[]).includes(this.clip))) this.play('sitDown', ms);
  }

  /** Sits down and lies back (or as `how` says); `asleep` shuts the eyes until `asleep` is cleared and it is roused. */
  lieDown(ms: number, asleep: boolean, how: Lying = {}): void {
    this.lying = true;
    this.asleep = asleep;
    this.lies = how;
    this.play(this.clip === 'sit' ? 'lieDown' : 'sitDown', ms);
  }

  /**
   * Climbs a ladder along a way of points (ways.ts `climbOf`), facing the ladder, from the first point to the last; it
   * does nothing else until it is there. A carried thing is held on.
   */
  climb(way: Climb, ms: number): void {
    if (way.length < 2) return;
    const first = way[0], last = way[way.length - 1];
    const up = last.level > first.level;
    // Toward the ladder: from its foot toward its top, whichever way the climb goes.
    const di = up ? last.i - first.i : first.i - last.i, dj = up ? last.j - first.j : first.j - last.j;
    if (Math.hypot(di, dj) > 1e-6) {
      this.facing = this.aim = facingOf(di, dj, this.facing);
      this.heading = Math.atan2(dj, di);
    }
    this.i = first.i;
    this.j = first.j;
    this.climbing = { way, k: 1, level: first.level };
    this.play('climb', ms);
  }
  /** Whether the character is on a ladder. */
  get onLadder(): boolean {
    return !!this.climbing;
  }

  /** Whether the character is getting up and will not walk until it stands. */
  get rising(): boolean {
    return this.clip === 'standUp' || this.clip === 'sitUp';
  }

  /** Whether the clip playing has played through once. */
  private played(ms: number): boolean {
    const clip = AUTHORED[this.clip];
    return ms - this.started >= (clip.frames.length / clip.rate) * 1000;
  }

  carry(what: Carried | null): void {
    this.carrying = what;
    this.held = new WeakMap();
    if (this.clip === 'sit' || this.clip === 'sitDown' || this.clip === 'lieDown' || this.clip === 'lie' || this.clip === 'sitUp' || this.clip === 'standUp' || (EMOTES as readonly string[]).includes(this.clip)) this.clip = 'idle';
  }

  /** A spot on the map about `far` metres in front of the character. */
  ahead(far: number): { i: number; j: number } {
    return { i: this.i + Math.cos(this.heading) * far, j: this.j + Math.sin(this.heading) * far };
  }

  private play(clip: ClipId, ms: number): void {
    if (clip === this.clip) return;
    this.clip = clip;
    this.started = ms;
    this.fidget = null;
    this.nextFidget = ms + between(REST);
  }

  /** Starts, ends or keeps the standing fidget. */
  private fidgetAt(ms: number): Fidget | null {
    if (this.clip !== 'idle') return null;
    if (!this.nextFidget) this.nextFidget = ms + between(REST);
    if (this.fidget && ms > this.fidget.until) {
      this.fidget = null;
      this.nextFidget = ms + between(REST);
    }
    if (!this.fidget && ms >= this.nextFidget) {
      let roll = Math.random();
      const pick = FIDGETS.find((f) => (roll -= f.weight) < 0) ?? FIDGETS[0];
      const side = Math.random() < 0.5 ? 1 : -1;
      this.fidget = { look: pick.look && pick.look * side, glance: pick.glance ? side : undefined, face: pick.face, until: ms + between(pick.seconds) };
    }
    return this.fidget;
  }

  /**
   * Moves toward the point `di`, `dj` away on the map for `dt` seconds, at walking or running speed but no further than
   * that point (a direction of length 1 or more, as the keys give, just goes that way). A zero direction stands still,
   * letting an emote finish.
   */
  update(world: World, dt: number, di: number, dj: number, run: boolean, ms: number): void {
    this.fly(Math.min(dt, 0.1));
    if (this.climbing) return this.climbOn(Math.min(dt, 0.1), ms);
    const length = Math.hypot(di, dj);
    if (length > 1e-6) {
      this.aim = facingOf(di, dj, this.aim);
      this.heading = Math.atan2(dj, di);
    } else {
      // Standing, a character settles into the nearest of the four diagonal views, which read
      // best; the straight views are for walking and glancing.
      this.aim = turnFacing(0, 2 * Math.round(this.heading / (Math.PI / 2)));
    }
    if (this.facing !== this.aim && ms - this.turned >= TURN_MS) {
      this.facing = turnToward(this.facing, this.aim);
      this.turned = ms;
    }
    // Getting up finishes before anything else; asked to move while sitting, the character gets up first.
    if (this.clip === 'sitUp') {
      if (!this.played(ms)) return;
      this.play('standUp', ms);
    }
    if (this.clip === 'standUp') {
      if (!this.played(ms)) return;
      this.play('idle', ms);
    }
    const down = this.clip === 'sit' || this.clip === 'sitDown' || this.clip === 'lieDown' || this.clip === 'lie';
    // Asleep, nothing moves it; awake, asked to move, it gets up first.
    if (length >= 1e-6 && down) return this.asleep ? undefined : this.rouse(ms);
    if (length < 1e-6) {
      const clip = AUTHORED[this.clip];
      const emoting = (EMOTES as readonly string[]).includes(this.clip);
      // Lying down is two steps: sit, then lower the upper body.
      if (this.clip === 'sitDown' && this.played(ms)) this.play(this.lying ? 'lieDown' : 'sit', ms);
      if (this.clip === 'lieDown' && this.played(ms)) this.play('lie', ms);
      if (down) return;
      if (this.clip === 'idle' && !this.carrying && ms - this.started >= this.sitAfter && this.depth(world) <= 0) return this.play('sitDown', ms);
      if (!emoting || ms - this.started > (clip.frames.length / clip.rate) * 1000 * EMOTE_LOOPS[this.clip as Emote]) this.play(this.carrying ? 'hold' : 'idle', ms);
      return;
    }
    if (this.carrying) run = false;
    this.play(this.carrying ? 'carry' : run ? 'run' : 'walk', ms);
    const depth = this.depth(world);
    // No further than asked: a walker sent to a point stops on it rather than past it, on the way it was planned along.
    const step = Math.min(length, (run ? SPEED.run : SPEED.walk) * (depth > 0 ? WADING : 1) * Math.min(dt, 0.1));
    if (depth > 0) this.splash(Math.min(dt, 0.1), run);
    const mi = (di / length) * step;
    const mj = (dj / length) * step;
    const from = { i: this.i, j: this.j };
    // Try the whole move, then each axis alone, so a wall or a plant is slid along, not stuck on.
    for (const [ti, tj] of [[mi, mj], [mi, 0], [0, mj]]) {
      if (!ti && !tj) continue;
      const to = { i: this.i + ti, j: this.j + tj };
      if (world.canWalk(from, to)) {
        this.i = to.i;
        this.j = to.j;
        this.stride += Math.hypot(ti, tj);
        if (this.stride >= (run ? 0.45 : 0.3)) {
          this.stride = 0;
          this.foot = -this.foot;
          // Feet a hand apart, either side of the way walked.
          world.footstep(this.i - Math.sin(this.heading) * 0.06 * this.foot, this.j + Math.cos(this.heading) * 0.06 * this.foot, ms);
        }
        return;
      }
    }
  }

  /** Goes on up or down the ladder for `dt` seconds; at the end of the way, stands again. */
  private climbOn(dt: number, ms: number): void {
    const c = this.climbing!;
    while (dt > 0 && c.k < c.way.length) {
      const to = c.way[c.k];
      const up = Math.abs(to.level - c.level) / CLIMB_SPEED, along = Math.hypot(to.i - this.i, to.j - this.j) / SPEED.walk;
      const need = Math.max(up, along);
      if (need <= dt) {
        this.i = to.i; this.j = to.j; c.level = to.level;
        c.k++;
        dt -= need;
        continue;
      }
      const f = dt / need;
      this.i += (to.i - this.i) * f;
      this.j += (to.j - this.j) * f;
      c.level += (to.level - c.level) * f;
      dt = 0;
    }
    if (c.k >= c.way.length) {
      this.climbing = null;
      this.play(this.carrying ? 'hold' : 'idle', ms);
    }
  }

  /** How deep the character stands in water, in levels; 0 on land. */
  private depth(world: World): number {
    this.waterLine = waterOf(world.floor);
    return Math.max(0, this.waterLine - heightAt(world.floor, this.i, this.j));
  }

  private splash(dt: number, run: boolean): void {
    this.splashClock += dt;
    const every = run ? SPLASH.every / 2 : SPLASH.every;
    for (; this.splashClock > every; this.splashClock -= every) {
      for (let n = 0; n < SPLASH.per; n++) {
        const a = Math.random() * Math.PI * 2;
        const out = SPLASH.out * (0.3 + Math.random() * 0.7);
        this.drops.push({
          i: this.i + Math.cos(a) * 0.12, j: this.j + Math.sin(a) * 0.12, z: 0,
          vi: Math.cos(a) * out, vj: Math.sin(a) * out,
          vz: SPLASH.up[0] + Math.random() * (SPLASH.up[1] - SPLASH.up[0]), pale: Math.random() < 0.4,
        });
      }
    }
  }

  /** Moves the drops on; a drop is gone when it falls back into the water. */
  private fly(dt: number): void {
    for (const d of this.drops) {
      d.i += d.vi * dt;
      d.j += d.vj * dt;
      d.vz -= SPLASH.gravity * dt;
      d.z += d.vz * dt;
    }
    this.drops = this.drops.filter((d) => d.z > 0);
  }

  /** The splash drops in the air, each one pixel, standing on the water surface below it. */
  dropThings(): Thing[] {
    const white = ocean.wave;
    const pale = ocean.shore;
    return this.drops.map((d) => ({
      spot: { i: d.i, j: d.j, level: this.waterLine + d.z },
      picture: d.pale ? dot(pale) : dot(white),
      w: 1, h: 1, foot: { x: 0, y: 0 },
    }));
  }

  /** The character standing in a three-quarter front view, whatever it is doing: for a portrait. */
  portrait(): { picture: Picture; w: number; h: number } {
    const body = cached('character', `${idOf(this.look)}|portrait`, () => drawCharacter(this.look, STAND, 0), () => slots(SPRITE_W, SPRITE_H, 1));
    return { picture: body, w: SPRITE_W, h: SPRITE_H };
  }

  thing(world: World, ms: number): Thing {
    const clip: Clip = AUTHORED[this.frozen?.clip ?? this.clip];
    // A clip started from an event's time can begin a moment after this frame's time; never count back.
    const n = this.frozen ? this.frozen.frame : Math.floor((Math.max(0, ms - this.started) / 1000) * clip.rate) % clip.frames.length;
    const fidget = this.frozen ? null : this.fidgetAt(ms);
    // Blinking goes on through a fidget.
    const face = this.frozen ? clip.faces?.[n] === 'blink' ? undefined : clip.faces?.[n] : this.asleep ? 'blink' : ms < this.talkUntil ? talkFace(ms) : clip.faces?.[n] === 'blink' ? 'blink' : (fidget?.face ?? clip.faces?.[n]);
    const look = fidget?.look ?? 0;
    const facing = fidget?.glance ? turnFacing(this.facing, fidget.glance) : this.facing;
    const key = `${this.frozen?.clip ?? this.clip}|${n}|${facing}|${face}|${look}|${!!this.carrying}|${!!this.lies.back}|${!!this.lies.down}`;
    const pose = look ? { ...STAND, look } : clip.frames[n];
    const body = cached('character', `${idOf(this.look)}|${key}`, () => {
      // Hands full, the tool is put away.
      const worn = this.carrying ? { ...this.look, items: this.look.items.filter((it) => it.slot !== 'tool') } : this.look;
      return drawCharacter(worn, pose, facing, { face, swing: clip.swing, lying: this.lies });
    }, () => slots(SPRITE_W, SPRITE_H, 1));
    let sprite: Picture = body;
    if (this.carrying) {
      const held = this.carrying(facing, ms);
      let kept = this.held.get(held.picture);
      if (!kept) this.held.set(held.picture, (kept = new Map()));
      let both = kept.get(key);
      if (!both) kept.set(key, (both = drew('holding', () => holding(body, held, handsOn(pose, facing)), () => slots(SPRITE_W, SPRITE_H))));
      sprite = both;
    }
    // A carried thing puts the tool away, so only the body's own tool brings its particle system.
    const fx = this.carrying ? undefined : body.fx ?? undefined;
    if (this.climbing) return { spot: { i: this.i, j: this.j, level: this.climbing.level }, picture: sprite, w: SPRITE_W, h: SPRITE_H, foot: FEET, fx };
    const depth = this.depth(world);
    if (depth <= 0) return { spot: { i: this.i, j: this.j, level: standingHeight(world.map, this.i, this.j) }, picture: sprite, w: SPRITE_W, h: SPRITE_H, foot: FEET, flat: pose.lie, fx };
    // In the shallows the feet stand on the sea floor, under the surface.
    const rows = Math.round(depth * LEVEL_PX);
    let wet = this.wet.get(sprite);
    if (!wet) this.wet.set(sprite, (wet = new Map()));
    let picture = wet.get(rows);
    if (!picture) wet.set(rows, (picture = drew('wading', () => wading(sprite, rows), () => slots(SPRITE_W, SPRITE_H))));
    return { spot: { i: this.i, j: this.j, level: waterOf(world.floor) - depth }, picture, w: SPRITE_W, h: SPRITE_H, foot: FEET, flat: pose.lie, fx };
  }
}

/** Pixels a carried thing is held further out in front when the character is seen side on. */
const SIDE_REACH = 4;

/**
 * A character sprite with a carried picture laid at its hands, in front of the body or, seen from
 * behind, behind it. In front, the arms and hands on the camera's side of the body are drawn over it.
 */
function holding(body: Sprite, held: ReturnType<Carried>, hands: { x: number; y: number; back: boolean; ahead: number }): Picture {
  // Side on, the thing is held out in front, clear of the chest, rather than centred on the hands.
  const dx = Math.round(hands.x) + hands.ahead * SIDE_REACH - held.foot.x;
  const dy = Math.round(hands.y) + held.below - held.foot.y;
  const out: (string | null)[] = new Array(SPRITE_W * SPRITE_H);
  for (let y = 0; y < SPRITE_H; y++) for (let x = 0; x < SPRITE_W; x++) {
    const own = body.get(x, y);
    const hx = x - dx;
    const hy = y - dy;
    let c = hx >= 0 && hy >= 0 && hx < held.w && hy < held.h ? held.picture.get(hx, hy) : null;
    // The held thing's own ground shadow stays on the ground, under the character's.
    if (c === SHADOW) c = null;
    out[y * SPRITE_W + x] = hands.back ? (own && own !== SHADOW ? own : c ?? own) : (c ?? own);
  }
  if (!hands.back) body.nearArm.forEach((on, k) => {
    if (on && body.pixels[k] && body.pixels[k] !== SHADOW) out[k] = body.pixels[k];
  });
  return { get: (x, y) => out[y * SPRITE_W + x] ?? null };
}

const dots = new Map<string, Picture>();
/** A one-pixel picture of a colour, kept so its shadow and drawing caches hold. */
function dot(color: string): Picture {
  let picture = dots.get(color);
  if (!picture) dots.set(color, (picture = { get: () => color }));
  return picture;
}
