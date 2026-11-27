import type { Pose, Vec3 } from './puppet.ts';

/** Bone lengths of the puppet, in pixels. */
// Shoulder and hip offsets are chosen so the limbs land on whole pixel columns: arms just outside
// the nine-pixel torso, legs four wide with a one-pixel gap between them.
export const BONES = { thigh: 5, shin: 5, upperArm: 4.5, forearm: 4.5, spine: 10, shoulder: 7.07, hip: 3.54 };

/** Joint angles in degrees. swing: forward is positive. bend: elbow or knee flex. out: away from the body. */
export interface LimbAngles {
  swing: number;
  bend?: number;
  out?: number;
}

export interface PoseSpec {
  /** Whole body up or down, in pixels. */
  bob?: number;
  /** Chest lowered towards the hips, for breathing and crouching. */
  sink?: number;
  /** Torso tilted forward, in degrees. */
  lean?: number;
  armL?: LimbAngles;
  armR?: LimbAngles;
  legL?: LimbAngles;
  legR?: LimbAngles;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** Direction of a hanging limb segment after swinging forward and out. */
function direction(swing: number, out: number, side: number): Vec3 {
  const s = rad(swing);
  const o = rad(out);
  return [Math.sin(o) * side, -Math.cos(s) * Math.cos(o), Math.sin(s) * Math.cos(o)];
}

/** Builds joint positions from joint angles, the way an animator would pose a puppet. */
export function buildPose(spec: PoseSpec = {}): Pose {
  const bob = spec.bob ?? 0;
  const lean = rad(spec.lean ?? 0);
  const hips: Vec3 = [0, 1 + BONES.thigh + BONES.shin + bob, 0];
  const spine = BONES.spine - (spec.sink ?? 0);
  const chest: Vec3 = [0, hips[1] + Math.cos(lean) * spine, Math.sin(lean) * spine];
  const pose = { hips, chest, neck: add(chest, [0, 1, 0]) } as Pose;
  for (const [s, side] of [['L', -1], ['R', 1]] as const) {
    const arm = spec[`arm${s}`] ?? { swing: 0 };
    const shoulder = add(chest, [side * BONES.shoulder, -0.5, 0]);
    const elbow = add(shoulder, direction(arm.swing, arm.out ?? 0, side), BONES.upperArm);
    const hand = add(elbow, direction(arm.swing + (arm.bend ?? 0), arm.out ?? 0, side), BONES.forearm);
    pose[`shoulder${s}`] = shoulder;
    pose[`elbow${s}`] = elbow;
    pose[`hand${s}`] = hand;

    const leg = spec[`leg${s}`] ?? { swing: 0 };
    const hip = add(hips, [side * BONES.hip, -0.5, 0]);
    const knee = add(hip, direction(leg.swing, leg.out ?? 0, side), BONES.thigh);
    const foot = add(knee, direction(leg.swing - (leg.bend ?? 0), leg.out ?? 0, side), BONES.shin);
    pose[`hip${s}`] = hip;
    pose[`knee${s}`] = knee;
    pose[`foot${s}`] = foot;
  }
  return pose;
}

const mirrored = (spec: PoseSpec): PoseSpec => ({
  ...spec, armL: spec.armR, armR: spec.armL, legL: spec.legR, legR: spec.legL,
});

// Walk: contact, down, passing, then the same on the other foot. Authored as key poses.
// The body drops on the step and rises as the legs pass; arms swing against the legs. Strides are
// kept short and knees only a little bent, as in hand-drawn walks this size: wider swings turn
// the shins into long slanted runs, and a foot kicked up behind reads as a broken leg.
const walkHalf: PoseSpec[] = [
  { legR: { swing: 24, bend: 4 }, legL: { swing: -20, bend: 8 }, armL: { swing: 26, bend: 18 }, armR: { swing: -22, bend: 8 }, lean: 2 },
  { bob: -1, legR: { swing: 12, bend: 12 }, legL: { swing: -20, bend: 14 }, armL: { swing: 16, bend: 14 }, armR: { swing: -14, bend: 8 }, lean: 3 },
  { legR: { swing: -4 }, legL: { swing: 16, bend: 38 }, armL: { swing: -4, bend: 10 }, armR: { swing: 6, bend: 12 }, lean: 2 },
];

// Carry: both forearms held out in front, hands together at the waist, as under a box. The legs
// walk as in the walk; the arms stay put and only bob with the body.
const carryArms = { armL: { swing: 30, bend: 60, out: -14 }, armR: { swing: 30, bend: 60, out: -14 } };
const carryHalf: PoseSpec[] = walkHalf.map((spec) => ({ ...spec, ...carryArms, lean: -1 }));
export const HOLD = buildPose(carryArms);

export interface Clip {
  name: string;
  /** Frames shown per second. */
  rate: number;
  frames: Pose[];
  /** Face to show on each frame. Missing entries mean the neutral face. */
  faces?: (string | undefined)[];
  /** True for actions that swing the held tool, such as a chop. */
  swing?: boolean;
}

export const STAND = buildPose();

/**
 * Follow-through for a looping clip: hanging hair lags a frame behind the body's rise and fall,
 * a pixel down as the body comes up and up as it drops, and `trail` pixels behind it.
 */
function withHair(specs: PoseSpec[], trail = 0): Pose[] {
  return specs.map((spec, i) => {
    const before = specs[(i + specs.length - 1) % specs.length].bob ?? 0;
    const rise = Math.sign((spec.bob ?? 0) - before);
    return { ...buildPose(spec), hair: [0, -rise, -trail] as Vec3 };
  });
}

// Run: contact, passing, flight, then the same on the other foot. A small forward lean, elbows
// held at a right angle and swinging against the legs, the knee of the free leg carried high.
const runHalf: PoseSpec[] = [
  { bob: -1, lean: 7, legR: { swing: 34, bend: 12 }, legL: { swing: -30, bend: 40 }, armL: { swing: 36, bend: 80 }, armR: { swing: -42, bend: 75 } },
  { bob: 0, lean: 8, legR: { swing: 4, bend: 14 }, legL: { swing: 18, bend: 95 }, armL: { swing: 8, bend: 80 }, armR: { swing: -8, bend: 80 } },
  { bob: 1, lean: 7, legR: { swing: -38, bend: 18 }, legL: { swing: 52, bend: 72 }, armL: { swing: -36, bend: 75 }, armR: { swing: 34, bend: 80 } },
];

// Use: one generic action for whatever is in the hand, or for bare hands. One bow forward from the
// hips, both arms reaching down to 45 degrees in front (swing is from hanging, so in the world, not
// along the leaning back) and a little out so they read from the front; held a beat, then back up.
const useArms = (swing: number, bend = 6) => ({ armL: { swing, bend, out: 8 }, armR: { swing, bend, out: 8 } });
const useFrames: PoseSpec[] = [
  { lean: 14, ...useArms(18) },
  { lean: 30, bob: -1, ...useArms(36) },
  { lean: 40, bob: -1, ...useArms(45) },
  { lean: 40, bob: -1, ...useArms(45, 10) },
  { lean: 22, ...useArms(26) },
  { lean: 8, ...useArms(8, 8) },
];

// Wave: the elbow is lifted out to the side at shoulder height and the forearm stands up from
// it, the hand swinging from side to side. Elbow and hand stay outside the head in every view, so
// the arm reads as one piece joined at the shoulder, from the front, the back and in 3/4. Built
// from joint positions, since the elbow and the hand go out by different amounts.
const waveFrames: Pose[] = [-0.6, 0.6, 1.8, 0.6].map((sway) => {
  const pose = buildPose();
  const elbow = add(pose.shoulderL, [-4.6, 2, 0.6]);
  return { ...pose, elbowL: elbow, handL: add(elbow, [-sway, 4.4, 0.6]) };
});

// Sit: on the floor, legs straight out in front, hands resting on the thighs. Lie: on the back,
// arms at the sides; the renderer lays the figure down. Both only blink.
const SIT = buildPose({ bob: -9, legL: { swing: 90, out: 4 }, legR: { swing: 90, out: 4 }, armL: { swing: 35, bend: 25 }, armR: { swing: 35, bend: 25 } });
const LIE: Pose = { ...buildPose({ armL: { swing: 0, out: 8 }, armR: { swing: 0, out: 8 }, legL: { swing: 0, out: 3 }, legR: { swing: 0, out: 3 } }), lie: true };
const LIE_DOWN: Pose = { ...LIE, down: true };
// Sitting down: bend the knees into a crouch leaning forward, drop onto the seat with the knees
// up, then stretch the legs out. Each bob keeps the feet near the ground. Standing up is the same
// played backwards.
const SIT_DOWN = [
  { bob: -1, lean: 10, legL: { swing: 25, bend: 45 }, legR: { swing: 25, bend: 45 }, armL: { swing: 20, bend: 10 }, armR: { swing: 20, bend: 10 } },
  { bob: -2.5, lean: 20, legL: { swing: 50, bend: 90 }, legR: { swing: 50, bend: 90 }, armL: { swing: 40, bend: 20 }, armR: { swing: 40, bend: 20 } },
  { bob: -6, lean: 12, legL: { swing: 95, bend: 120 }, legR: { swing: 95, bend: 120 }, armL: { swing: 30, bend: 20 }, armR: { swing: 30, bend: 20 } },
  { bob: -9, lean: 4, legL: { swing: 100, bend: 70, out: 4 }, legR: { swing: 100, bend: 70, out: 4 }, armL: { swing: 35, bend: 25 }, armR: { swing: 35, bend: 25 } },
].map(buildPose);
const resting = (pose: Pose): Pick<Clip, 'rate' | 'frames' | 'faces'> => ({
  rate: 5,
  frames: Array<Pose>(15).fill(pose),
  faces: Array.from({ length: 15 }, (_, i) => (i === 13 ? 'blink' : undefined)),
});

// Look around: the eyes glance aside, then the head turns an eighth to the right, back and an
// eighth to the left. A game can turn the head on any pose with `look` and move the eyes with
// the 'aside' face.
const toward = (look: number): Pose => ({ ...STAND, look });
const LOOK_STEPS: [Pose, string | undefined][] = [
  [STAND, undefined], [STAND, undefined], [STAND, 'aside'], [toward(-1), undefined],
  [toward(-1), 'blink'], [toward(-1), 'aside'], [STAND, undefined], [toward(1), undefined],
  [toward(1), 'smile'], [toward(1), undefined], [STAND, undefined], [STAND, 'smile'], [STAND, undefined],
];

// Climb: up a ladder, seen mostly from behind. One hand reaches high while the other holds at the shoulders, the knee
// on the same side lifted to the next rung, then the other side; the body hangs a pixel lower between the reaches.
const climbHalf: PoseSpec[] = [
  { lean: 4, armL: { swing: 168, bend: 12, out: 6 }, armR: { swing: 115, bend: 45, out: 6 }, legL: { swing: 48, bend: 85 }, legR: { swing: 4, bend: 6 } },
  { bob: -1, lean: 4, armL: { swing: 145, bend: 30, out: 6 }, armR: { swing: 135, bend: 30, out: 6 }, legL: { swing: 28, bend: 50 }, legR: { swing: 22, bend: 45 } },
];

export const AUTHORED: Record<string, Clip> = {
  // Standing still. The only movement is a blink every three seconds.
  idle: { name: 'Idle', ...resting(STAND) },
  walk: { name: 'Walk', rate: 8, frames: withHair([...walkHalf, ...walkHalf.map(mirrored)]) },
  run: { name: 'Run', rate: 11, frames: withHair([...runHalf, ...runHalf.map(mirrored)], 1) },
  // Only the arm moves; the body stays where it is.
  wave: { name: 'Wave', rate: 7, frames: waveFrames, faces: waveFrames.map(() => 'happy') },
  use: { name: 'Use', rate: 8, frames: useFrames.map(buildPose), swing: true },
  carry: { name: 'Carry', rate: 7, frames: withHair([...carryHalf, ...carryHalf.map(mirrored)]) },
  hold: { name: 'Hold', ...resting(HOLD) },
  sitDown: { name: 'Sit down', rate: 8, frames: SIT_DOWN },
  sit: { name: 'Sit', ...resting(SIT) },
  standUp: { name: 'Stand up', rate: 8, frames: [...SIT_DOWN].reverse() },
  lie: { name: 'Lie', ...resting(LIE) },
  lieFace: { name: 'Lie face-down', ...resting(LIE_DOWN) },
  // Lying down from sitting and sitting up again: straight from one to the other, held a moment.
  lieDown: { name: 'Lie down', rate: 6, frames: [LIE] },
  sitUp: { name: 'Sit up', rate: 6, frames: [LIE] },
  climb: { name: 'Climb', rate: 6, frames: withHair([...climbHalf, ...climbHalf.map(mirrored)]) },
  look: { name: 'Look around', rate: 3, frames: LOOK_STEPS.map(([pose]) => pose), faces: LOOK_STEPS.map(([, face]) => face) },
};
