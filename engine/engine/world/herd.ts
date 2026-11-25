// The scene's animals come alive in Play: each rests a while (standing or grazing), then ambles or,
// now and then, runs to a spot near where it was placed, and rests again. They keep to dry land and to slopes a walker
// can take. Positions are in scene (data) coordinates, so turning the view does not move them.
import type { ClipId } from '../animals/animal.ts';
import { heightAt, waterOf } from './terrain.ts';
import { facingOf, TURN_MS, turnToward } from './actor.ts';
import type { Facing } from '../core/puppet.ts';
import type { World } from './world.ts';

/**
 * Metres per second walking, running and hopping; share of trips run, or hopped by animals that hop
 * (their run is a hop); how far from home it roams; seconds of rest.
 */
const WANDER = { walk: 0.6, run: 2, hop: 1.1, runs: 0.25, hops: 0.8, roam: 2.5, rest: [2, 7], graze: 0.3 };

/**
 * Shyness: when a character comes within `near` metres, most animals (`share` of the times) run
 * `far` metres away from it and settle there; they are calm again once it is `near * 1.5` away.
 */
const SHY = { near: 1.6, share: 0.8, far: 3 };

export interface AnimalPose { i: number; j: number; facing: Facing; clip: ClipId; started: number; /** In a character's arms. */ carried?: boolean }

interface State extends AnimalPose { aim: Facing; turned: number; hops: boolean; home: { i: number; j: number }; until: number; target: { i: number; j: number } | null; /** The character is close, and whether to flee has been decided. */ near: boolean; /** Metres since the last paw print. */ stride?: number }

export class Herd {
  poses: State[];

  constructor(world: World, ms: number) {
    this.poses = world.scene.animals.map((a) => ({
      i: a.i, j: a.j, hops: a.animal.hops, facing: a.facing, aim: a.facing, turned: 0, clip: 'idle', started: ms,
      home: { i: a.i, j: a.j }, until: ms + rest(), target: null, near: false,
    }));
  }

  /**
   * `human` is where the character is (scene coordinates), for the animals to shy away from;
   * `calm` the animal it is coming to pick up, which waits for it.
   */
  update(world: World, dt: number, ms: number, human?: { i: number; j: number }, calm?: number): void {
    this.poses.forEach((a, k) => {
      if (a.carried) return;
      // A change of direction is turned through, an eighth of a turn at a time.
      if (a.facing !== a.aim && ms - a.turned >= TURN_MS) {
        a.facing = turnToward(a.facing, a.aim);
        a.turned = ms;
      }
      if (k === calm) {
        a.target = null;
        a.until = ms + rest();
        if (a.clip !== 'eat') play(a, 'idle', ms);
        return;
      }
      if (human) {
        const d = Math.hypot(a.i - human.i, a.j - human.j);
        if (d > SHY.near * 1.5) a.near = false;
        else if (d < SHY.near && !a.near) {
          a.near = true;
          if (Math.random() < SHY.share) flee(world, a, human, ms);
        }
      }
      this.move(world, a, dt, ms);
    });
  }

  private move(world: World, a: State, dt: number, ms: number): void {
    if (!a.target) {
      if (ms < a.until) return;
      const angle = Math.random() * Math.PI * 2;
      const far = WANDER.roam * Math.sqrt(Math.random());
      a.target = { i: a.home.i + Math.cos(angle) * far, j: a.home.j + Math.sin(angle) * far };
      play(a, Math.random() < (a.hops ? WANDER.hops : WANDER.runs) ? 'run' : 'walk', ms);
    }
    const di = a.target.i - a.i;
    const dj = a.target.j - a.j;
    const length = Math.hypot(di, dj);
    const step = Math.min(length, (a.clip !== 'run' ? WANDER.walk : a.hops ? WANDER.hop : WANDER.run) * dt);
    const to = { i: a.i + (di / length) * step, j: a.j + (dj / length) * step };
    if (length < 0.05 || !dry(world, a, to)) {
      // Arrived, or the way is blocked: rest, standing or grazing.
      a.target = null;
      a.until = ms + rest();
      play(a, Math.random() < WANDER.graze ? 'eat' : 'idle', ms);
      return;
    }
    a.aim = facingOf(di, dj, a.aim);
    a.i = to.i;
    a.j = to.j;
    a.stride = (a.stride ?? 0) + step;
    if (a.stride >= 0.25) {
      a.stride = 0;
      const v = world.toView(a);
      world.footstep(v.i, v.j, ms, true);
    }
  }

  /** Taken up in a character's arms: it stops where it is and idles. */
  pickUp(k: number, ms: number): void {
    const a = this.poses[k];
    a.carried = true;
    a.target = null;
    play(a, 'idle', ms);
  }

  /** Set down at a point (scene coordinates): it rests, then roams around there, and does not bolt until the character has gone and come back. */
  setDown(k: number, at: { i: number; j: number }, facing: Facing, ms: number): void {
    const a = this.poses[k];
    Object.assign(a, { ...at, home: { ...at }, facing, aim: facing, carried: false, near: true, until: ms + rest() });
  }
}

/** Runs off away from the character, swerving if straight away is blocked, and makes the new spot home. */
function flee(world: World, a: State, from: { i: number; j: number }, ms: number): void {
  const away = Math.atan2(a.j - from.j, a.i - from.i);
  for (const swerve of [0, 0.7, -0.7, 1.4, -1.4]) {
    const angle = away + swerve + (Math.random() - 0.5) * 0.4;
    const step = { i: a.i + Math.cos(angle) * 0.3, j: a.j + Math.sin(angle) * 0.3 };
    if (!dry(world, a, step)) continue;
    a.target = { i: a.i + Math.cos(angle) * SHY.far, j: a.j + Math.sin(angle) * SHY.far };
    a.home = { ...a.target };
    play(a, 'run', ms);
    return;
  }
}

const rest = () => (WANDER.rest[0] + Math.random() * (WANDER.rest[1] - WANDER.rest[0])) * 1000;

function play(a: State, clip: ClipId, ms: number): void {
  if (a.clip === clip) return;
  a.clip = clip;
  a.started = ms;
}

/** Whether a step stays on land a walker could take. */
function dry(world: World, from: { i: number; j: number }, to: { i: number; j: number }): boolean {
  const a = world.toView(from);
  const b = world.toView(to);
  return world.canWalk(a, b) && heightAt(world.floor, b.i, b.j) >= waterOf(world.floor);
}
