// The objects of Animal Hospital (animal-hospital/src/data.js, but the flora plants) and its four cars,
// built from parts. Units: across the floor 1/16 of a tile edge, up in pixels; people are 48 px tall.
// At turn 0 the width (x) runs to the lower right and the depth (z) to the lower left: the long lit
// front of a 2×1 object faces the lower left.
import { cleanBuild, type Axis, type Kind, type Loop, type Paint, type Part, type Point, type Build, type Shape } from './object.ts';
import type { PaletteKey } from '../core/palette.ts';

type Opt = { axis?: Axis; paint?: Paint; loop?: Loop };
const part = (shape: Shape) => (x: number, y: number, z: number, w: number, h: number, d: number, color: PaletteKey, opt: Opt = {}): Part =>
  ({ shape, axis: opt.axis ?? 'y', x, y, z, w, h, d, color, paint: opt.paint ?? 'solid', loop: opt.loop ?? 'none' });
const box = part('box');
const cyl = part('cylinder');
const ball = part('ball');
const pt = (name: string, x: number, y: number, z: number): Point => ({ name, x, y, z });

/** Four wheels of a 2×1 car, lying across it, with a hub on the near ones. */
const wheels = (r = 8) => [0, 21].flatMap((x) => [
  cyl(x + 3, 0, 1, Math.round(r * 0.75), r, 3, 'black', { axis: 'z' }),
  cyl(x + 3, 0, 12, Math.round(r * 0.75), r, 3, 'black', { axis: 'z' }),
  box(x + 5, Math.round(r / 2) - 1, 15, 2, 2, 1, 'grey'),
  box(x + 5, Math.round(r / 2) - 1, 0, 2, 2, 1, 'grey'),
]);

const make = (kind: Kind, w: number, d: number, parts: Part[], points: Point[] = []): Build => cleanBuild({ kind, w, d, parts, points });

// The treasure chest: a box of planks framed in thin dark iron along every edge (each corner, and round the top and
// the foot), a domed lid with an iron band near each end, and an iron hasp at the front (+z, the lower left at turn
// 0). The iron stands one unit outside the box, so it reads as the box's edges from every side. The box is hollow
// and dark inside, and the open lid hollow under its dome (OPENING).
const IRON = 'black';
const chestBox = [
  box(3, 0, 5, 10, 5, 6, 'brown'),
  // Its walls round a dark inside, a little lower.
  box(3, 5, 5, 10, 2, 1, 'brown'), box(3, 5, 10, 10, 2, 1, 'brown'), box(3, 5, 6, 1, 2, 4, 'brown'), box(12, 5, 6, 1, 2, 4, 'brown'),
  box(4, 5, 6, 8, 1, 4, 'black', { paint: 'dark' }),
  // Iron down the four corners, and round the top and the foot.
  ...[[2, 4], [13, 4], [2, 11], [13, 11]].map(([x, z]) => box(x, 0, z, 1, 7, 1, IRON)),
  ...[0, 6].flatMap((y) => [box(3, y, 4, 10, 1, 1, IRON), box(3, y, 11, 10, 1, 1, IRON), box(2, y, 5, 1, 1, 6, IRON), box(13, y, 5, 1, 1, 6, IRON)]),
];
/**
 * A lid at (y, z), `h` high and `d` deep: a dome of planks as wide as the iron on the box, and at each end an iron
 * ring a unit bigger all round. The planks come first, so on the end faces, where both lie flush, they win and the
 * iron shows only as a rim round the edge, as on the box.
 */
const lid = (y: number, z: number, h: number, d: number) => [
  cyl(2, y, z, 12, h, d, 'brown', { axis: 'x' }),
  cyl(2, y - 1, z - 1, 1, h + 2, d + 2, IRON, { axis: 'x' }), cyl(13, y - 1, z - 1, 1, h + 2, d + 2, IRON, { axis: 'x' }),
];
/** The lid shut, over the box, the hasp hanging down the front. */
const chestLid = [...lid(4, 5, 7, 6), box(7, 4, 11, 2, 4, 1, IRON)];
const chest = (parts: Part[]) => make('furniture', 1, 1, [...chestBox, ...parts]);
/**
 * Frames of an object opening, after its shut picture. The chest's lid lifts, then stands up behind the box, its
 * dome to the back and its hollow underside to the front: dark, in a frame of its planks, the hasp at its top.
 */
export const OPENING: Record<string, Build[]> = {
  chest: [
    chest([...lid(6, 4, 7, 6), box(4, 6, 6, 8, 1, 3, 'black', { paint: 'dark' })]),
    chest([
      // The hollow a unit in front of the dome, so the dome does not show through it; its frame of planks in front again.
      box(3, 7, 4, 10, 8, 4, 'black', { paint: 'dark' }),
      ...lid(7, 1, 8, 6),
      box(2, 7, 8, 1, 8, 1, 'brown'), box(13, 7, 8, 1, 8, 1, 'brown'), box(3, 14, 8, 10, 1, 1, 'brown'), box(3, 7, 8, 10, 1, 1, 'brown'),
      box(7, 12, 9, 2, 3, 1, IRON),
    ]),
  ],
};

export const OBJECT_PRESETS: { id: string; name: string; prop: Build }[] = [
  { id: 'reception', name: 'Reception', prop: make('furniture', 2, 1, [
    box(1, 0, 4, 30, 17, 9, 'wood'),
    box(0, 17, 3, 32, 2, 11, 'tan'),
    box(4, 4, 13, 24, 10, 1, 'tan'),
    box(14, 6, 14, 4, 3, 1, 'cream'), box(13, 10, 14, 1, 1, 1, 'cream'), box(15, 11, 14, 2, 1, 1, 'cream'), box(18, 10, 14, 1, 1, 1, 'cream'),
    box(25, 19, 5, 2, 2, 2, 'grey'),
    box(21, 21, 4, 10, 9, 2, 'grey'),
    box(22, 22, 6, 8, 7, 1, 'teal', { paint: 'glow' }),
    box(9, 19, 7, 7, 1, 5, 'white'),
    ball(3, 19, 7, 4, 4, 4, 'yellow'),
  ]) },
  { id: 'outdesk', name: 'Outdoor desk', prop: make('furniture', 2, 1, [
    box(1, 0, 5, 30, 15, 8, 'green'),
    box(0, 15, 4, 32, 2, 10, 'white'),
    box(1, 0, 2, 2, 34, 2, 'grey'), box(29, 0, 2, 2, 34, 2, 'grey'),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => box(i * 4, 32, 0, 4, 3, 13, i % 2 ? 'white' : 'red')),
    box(5, 17, 7, 6, 1, 4, 'straw'),
    ball(22, 17, 7, 4, 4, 4, 'leaf'),
  ]) },
  { id: 'bench', name: 'Bench', prop: make('furniture', 2, 1, [
    box(2, 0, 5, 2, 7, 2, 'brown'), box(28, 0, 5, 2, 7, 2, 'brown'), box(2, 0, 10, 2, 7, 2, 'brown'), box(28, 0, 10, 2, 7, 2, 'brown'),
    box(1, 7, 4, 30, 2, 9, 'wood'),
    box(1, 9, 3, 30, 3, 2, 'wood'), box(1, 13, 3, 30, 3, 2, 'wood'),
    box(3, 9, 3, 2, 7, 1, 'brown'), box(27, 9, 3, 2, 7, 1, 'brown'),
  ], [pt('seat1', 9, 9, 8), pt('seat2', 23, 9, 8)]) },
  { id: 'plant', name: 'Potted plant', prop: make('furniture', 1, 1, [
    cyl(4, 0, 4, 8, 8, 8, 'orange'),
    cyl(3, 7, 3, 10, 2, 10, 'orange'),
    ball(2, 9, 2, 12, 14, 12, 'leaf'),
    ball(6, 17, 3, 8, 10, 8, 'green'),
    ball(8, 12, 8, 6, 7, 6, 'lime'),
  ]) },
  { id: 'examTable', name: 'Exam table', prop: make('device', 2, 1, [
    box(8, 0, 4, 16, 2, 8, 'grey'),
    box(13, 2, 6, 6, 10, 4, 'steel'),
    box(1, 12, 3, 30, 3, 10, 'white'),
    box(2, 15, 4, 28, 2, 8, 'blue'),
    box(3, 17, 5, 6, 2, 6, 'white'),
  ], [pt('bed', 16, 17, 8)]) },
  { id: 'bandageTable', name: 'Bandage table', prop: make('device', 2, 1, [
    box(8, 0, 4, 16, 2, 8, 'grey'),
    box(13, 2, 6, 6, 10, 4, 'steel'),
    box(1, 12, 3, 30, 3, 10, 'white'),
    box(2, 15, 4, 28, 2, 8, 'leaf'),
    box(14, 9, 13, 4, 1, 1, 'red'), box(15, 8, 13, 2, 3, 1, 'red'),
    cyl(25, 17, 5, 5, 4, 3, 'cream', { axis: 'z' }),
  ], [pt('bed', 15, 17, 8)]) },
  { id: 'desk', name: 'Desk', prop: make('furniture', 2, 1, [
    box(1, 0, 3, 2, 13, 2, 'brown'), box(1, 0, 11, 2, 13, 2, 'brown'),
    box(21, 0, 3, 10, 13, 10, 'wood'),
    box(22, 3, 13, 8, 1, 1, 'brown'), box(22, 8, 13, 8, 1, 1, 'brown'),
    box(0, 13, 2, 32, 2, 12, 'wood'),
    box(10, 15, 4, 2, 2, 2, 'black'),
    box(6, 17, 3, 10, 9, 2, 'black'),
    box(7, 18, 5, 8, 7, 1, 'blue', { paint: 'glow' }),
    box(8, 20, 5, 2, 1, 2, 'white', { paint: 'glow', loop: 'blink' }),
    box(7, 15, 8, 8, 1, 3, 'grey'),
    cyl(21, 15, 7, 3, 4, 3, 'red'),
  ], [pt('screen', 11, 21, 6)]) },
  { id: 'cabinet', name: 'Cabinet', prop: make('device', 1, 1, [
    box(2, 0, 2, 12, 30, 11, 'white'),
    box(3, 14, 13, 10, 14, 1, 'steel'),
    box(3, 2, 13, 10, 10, 1, 'white'),
    box(7, 4, 14, 2, 6, 1, 'red'), box(5, 6, 14, 6, 2, 1, 'red'),
    box(4, 16, 12, 3, 5, 1, 'teal'), box(8, 16, 12, 3, 4, 1, 'orange'),
  ]) },
  { id: 'nest', name: 'Nest', prop: make('device', 2, 1, [
    cyl(1, 0, 1, 30, 7, 14, 'straw'),
    cyl(5, 6, 3, 22, 2, 10, 'tan'),
    box(0, 3, 4, 3, 1, 1, 'bark'), box(28, 5, 12, 4, 1, 1, 'bark'), box(14, 6, 13, 1, 1, 3, 'bark'),
  ], [pt('bed', 16, 8, 8)]) },
  { id: 'stand', name: 'Stand', prop: make('device', 2, 1, [
    box(0, 0, 1, 32, 5, 14, 'wood'),
    box(1, 5, 2, 30, 1, 12, 'leaf'),
    box(0, 0, 0, 2, 26, 2, 'brown'), box(30, 0, 0, 2, 26, 2, 'brown'), box(0, 0, 14, 2, 26, 2, 'brown'), box(30, 0, 14, 2, 26, 2, 'brown'),
    box(2, 22, 0, 28, 2, 1, 'wood'), box(2, 22, 15, 28, 2, 1, 'wood'),
    box(2, 14, 0, 28, 2, 1, 'wood'),
  ], [pt('bed', 16, 6, 8)]) },
  { id: 'log', name: 'Log', prop: make('furniture', 2, 1, [
    cyl(1, 0, 3, 29, 13, 10, 'bark', { axis: 'x' }),
    cyl(29, 2, 4, 2, 9, 8, 'tan', { axis: 'x' }),
    ball(8, 10, 5, 8, 5, 6, 'moss'),
    ball(20, 9, 11, 3, 3, 3, 'red'),
    box(4, 0, 12, 2, 2, 3, 'leaf'),
  ]) },
  { id: 'trough', name: 'Trough', prop: make('device', 2, 1, [
    box(2, 0, 4, 28, 3, 8, 'wood'),
    box(3, 3, 5, 26, 5, 6, 'blue', { paint: 'water', loop: 'flow' }),
    box(1, 0, 3, 30, 10, 2, 'wood'), box(1, 0, 11, 30, 10, 2, 'wood'),
    box(1, 0, 5, 2, 10, 6, 'wood'), box(29, 0, 5, 2, 10, 6, 'wood'),
  ]) },
  { id: 'crate', name: 'Crate', prop: make('furniture', 1, 1, [
    box(4, 0, 4, 8, 8, 8, 'wood'),
    box(3, 0, 3, 10, 2, 10, 'bark'), box(3, 6, 3, 10, 2, 10, 'bark'),
    box(3, 0, 3, 2, 8, 2, 'bark'), box(11, 0, 3, 2, 8, 2, 'bark'), box(3, 0, 11, 2, 8, 2, 'bark'), box(11, 0, 11, 2, 8, 2, 'bark'),
  ]) },
  // A ladder against a cave wall (the back, -z, at turn 0): two rails and a rung every 6 px, a person high.
  { id: 'ladder', name: 'Ladder', prop: make('furniture', 1, 1, [
    box(3, 0, 1, 2, 42, 2, 'wood'), box(11, 0, 1, 2, 42, 2, 'wood'),
    ...[3, 9, 15, 21, 27, 33, 39].map((y) => box(5, y, 1, 6, 1, 2, 'bark')),
  ]) },
  // A hole in the floor: a dark pit in a ring of stone (the pit first, so the ring shows round it), the top of a ladder
  // standing out of it at the back.
  { id: 'hole', name: 'Hole with ladder', prop: make('furniture', 1, 1, [
    cyl(3, 0, 3, 10, 3, 10, 'black', { paint: 'dark' }),
    cyl(1, 0, 1, 14, 3, 14, 'stone'),
    box(5, 1, 3, 1, 14, 1, 'wood'), box(10, 1, 3, 1, 14, 1, 'wood'),
    box(6, 6, 3, 4, 1, 1, 'bark'), box(6, 11, 3, 4, 1, 1, 'bark'),
  ]) },
  { id: 'chest', name: 'Treasure chest', prop: chest(chestLid) },
  { id: 'hay', name: 'Hay', prop: make('furniture', 1, 1, [
    box(2, 0, 3, 12, 9, 10, 'straw'),
    box(5, 0, 2, 1, 10, 12, 'tan'), box(10, 0, 2, 1, 10, 12, 'tan'),
    box(3, 9, 5, 2, 1, 1, 'straw'), box(8, 9, 9, 3, 1, 1, 'straw'), box(12, 9, 4, 1, 1, 2, 'straw'),
  ]) },
  { id: 'litter', name: 'Litter tray', prop: make('device', 2, 1, [
    box(3, 0, 4, 26, 2, 8, 'blue'),
    box(4, 2, 5, 24, 3, 6, 'sandstone'),
    box(2, 0, 3, 28, 6, 2, 'blue'), box(2, 0, 11, 28, 6, 2, 'blue'),
    box(2, 0, 5, 2, 6, 6, 'blue'), box(28, 0, 5, 2, 6, 6, 'blue'),
  ], [pt('bed', 16, 5, 8)]) },
  { id: 'feeder', name: 'Feeder', prop: make('device', 1, 1, [
    box(3, 0, 2, 10, 3, 7, 'grey'),
    box(4, 3, 2, 8, 16, 6, 'steel'),
    box(5, 5, 7, 6, 12, 1, 'tan'),
    box(4, 19, 2, 8, 2, 6, 'red'),
    cyl(3, 0, 9, 10, 3, 6, 'red'),
    cyl(4, 2, 10, 8, 2, 4, 'tan'),
  ]) },
  { id: 'fountain', name: 'Fountain', prop: make('garden', 2, 2, [
    // Water first: where it lies level with the stone, the stone ring shows round it.
    cyl(4, 0, 4, 24, 7, 24, 'teal', { paint: 'water', loop: 'flow' }),
    cyl(2, 0, 2, 28, 7, 28, 'stone'),
    cyl(13, 0, 13, 6, 18, 6, 'stone'),
    cyl(10, 16, 10, 12, 3, 12, 'teal', { paint: 'water', loop: 'flow' }),
    cyl(9, 16, 9, 14, 3, 14, 'stone'),
    cyl(15, 19, 15, 2, 7, 2, 'teal', { paint: 'water', loop: 'flow' }),
    ball(14, 25, 14, 4, 4, 4, 'teal', { paint: 'water', loop: 'bob' }),
  ]) },
  { id: 'car', name: 'Car', prop: make('car', 2, 1, [
    ...wheels(),
    box(1, 3, 2, 30, 8, 12, 'red'),
    box(8, 11, 3, 15, 7, 10, 'red'),
    box(23, 12, 4, 1, 5, 8, 'steel'),
    box(10, 12, 13, 11, 5, 1, 'steel'), box(10, 12, 2, 11, 5, 1, 'steel'), box(7, 12, 4, 1, 5, 8, 'steel'),
    box(31, 6, 3, 1, 2, 2, 'yellow', { paint: 'glow' }), box(31, 6, 11, 1, 2, 2, 'yellow', { paint: 'glow' }),
    box(0, 6, 3, 1, 2, 2, 'red', { paint: 'glow' }), box(0, 6, 11, 1, 2, 2, 'red', { paint: 'glow' }),
  ]) },
  { id: 'bubble', name: 'Bubble car (pets)', prop: make('car', 2, 1, [
    ...wheels(7),
    box(3, 3, 3, 26, 7, 10, 'pink'),
    ball(7, 5, 3, 18, 15, 10, 'steel'),
    box(29, 6, 4, 1, 2, 2, 'yellow', { paint: 'glow' }), box(29, 6, 10, 1, 2, 2, 'yellow', { paint: 'glow' }),
  ]) },
  { id: 'jeep', name: 'Jeep (wild)', prop: make('car', 2, 1, [
    ...wheels(9),
    box(1, 4, 2, 30, 8, 12, 'jungle'),
    box(6, 12, 4, 5, 4, 8, 'brown'), box(15, 12, 4, 5, 4, 8, 'brown'),
    box(13, 12, 2, 1, 10, 1, 'grey'), box(13, 12, 13, 1, 10, 1, 'grey'), box(13, 21, 2, 1, 1, 12, 'grey'),
    box(23, 12, 3, 1, 6, 10, 'steel'),
    cyl(-1, 4, 5, 2, 9, 6, 'black', { axis: 'x' }),
    box(31, 7, 3, 1, 2, 2, 'yellow', { paint: 'glow' }), box(31, 7, 11, 1, 2, 2, 'yellow', { paint: 'glow' }),
  ]) },
  { id: 'truck', name: 'Truck (big)', prop: make('car', 2, 1, [
    ...wheels(9),
    box(1, 4, 2, 20, 4, 12, 'wood'),
    box(1, 8, 2, 1, 10, 1, 'brown'), box(10, 8, 2, 1, 10, 1, 'brown'), box(20, 8, 2, 1, 10, 1, 'brown'),
    box(1, 8, 13, 1, 10, 1, 'brown'), box(10, 8, 13, 1, 10, 1, 'brown'), box(20, 8, 13, 1, 10, 1, 'brown'),
    box(1, 11, 13, 20, 1, 1, 'wood'), box(1, 15, 13, 20, 1, 1, 'wood'), box(1, 11, 2, 20, 1, 1, 'wood'), box(1, 15, 2, 20, 1, 1, 'wood'),
    box(1, 11, 3, 1, 1, 10, 'wood'), box(1, 15, 3, 1, 1, 10, 'wood'),
    box(21, 4, 2, 10, 17, 12, 'blue'),
    box(31, 13, 4, 1, 5, 8, 'steel'),
    box(23, 13, 14, 6, 5, 1, 'steel'), box(23, 13, 1, 6, 5, 1, 'steel'),
    box(31, 7, 3, 1, 2, 2, 'yellow', { paint: 'glow' }), box(31, 7, 11, 1, 2, 2, 'yellow', { paint: 'glow' }),
  ]) },
];

export const objectPresetById = (id: string) => OBJECT_PRESETS.find((p) => p.id === id);
