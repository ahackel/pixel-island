// The 21 Lop Hop animals, redrawn in the engine's look: their species and colours kept, mapped onto
// the master palette (Lop Hop's own colours in brackets where they differ).
//
// The proportions follow Lop Hop's rigs (lop-hop/assets/*.js), which is what makes them cute: a head
// about as big as the body is deep, a short snout (about half the head), short legs with little of
// them showing under the body, a short body. The numbers are in Lop Hop's pixels; `scale` then
// brings each animal to its size class (docs/animal-spec.md).
import { cleanAnimal, type Animal } from './animal.ts';

type Preset = { id: string; name: string; animal: Animal };
const make = (id: string, name: string, spec: Partial<Animal>): Preset => ({ id, name, animal: cleanAnimal(spec) });

export const PRESETS: Preset[] = [
  // ---- small
  make('rabbit', 'Rabbit', {
    scale: 1.15, fur: 0.5,
    length: 4.5, girth: 4.4, width: 0.95, legs: 2.4, legWidth: 1.2, neck: 0, neckAngle: 55, head: 4.4, muzzle: 1.6, muzzleWidth: 2, snoutDown: 15,
    ears: 'lop', earSize: 2.6, earColor: 'third', tail: 'stub', tailLength: 2, features: ['blush'], marks: ['tailTip'],
    colors: { fur: 'white', second: 'cream', third: 'driftwood', nose: 'pink', horn: 'cream' }, pickable: true, hops: true, // (ears: beige)
  }),
  make('guineapig', 'Guinea pig', {
    scale: 1.2, fur: 0.7,
    length: 5.5, girth: 4.6, width: 1, legs: 2.4, legWidth: 1, neck: 0, neckAngle: 30, head: 4.2, muzzle: 1.8, muzzleWidth: 2, snoutDown: 15,
    ears: 'round', earSize: 1.3, earColor: 'nose', tail: 'none', features: ['blush'], marks: ['saddle', 'hood', 'face', 'belly'],
    colors: { fur: 'white', second: 'white', third: 'tan', nose: 'pink', horn: 'cream' }, pickable: true, hops: true, // (camel)
  }),
  make('hedgehog', 'Hedgehog', {
    scale: 1.15, fur: 0,
    length: 4.5, girth: 4.8, width: 1.05, legs: 2.4, legWidth: 1, neck: 0, neckAngle: 20, head: 3.4, muzzle: 2.4, muzzleWidth: 1.4, snoutDown: 15,
    ears: 'tiny', earSize: 1.2, earColor: 'second', tail: 'none', features: ['spines'], marks: ['face', 'muzzle', 'belly', 'socks'],
    colors: { fur: 'brown', second: 'cream', third: 'hairBlack', nose: 'black', horn: 'cream' }, pickable: true, // (face: beige)
  }),
  make('squirrel', 'Squirrel', {
    scale: 0.95, fur: 0.6,
    length: 4.5, girth: 3.6, width: 0.9, tilt: 15, legs: 3.6, legWidth: 0.7, neck: 0.5, neckWidth: 2.4, neckAngle: 50, head: 3.6, muzzle: 1.4, muzzleWidth: 1.5,
    ears: 'pointed', earSize: 1.5, tail: 'bushy', tailLength: 11, tailUp: 70, tailCurl: 100, marks: ['belly', 'chest'],
    colors: { fur: 'hairRed', second: 'white', third: 'white', nose: 'black', horn: 'cream' }, hops: true, // (rust)
  }),
  make('skunk', 'Skunk', {
    scale: 1.05, fur: 0.7,
    length: 4.5, girth: 4.4, width: 0.95, legs: 2.6, legWidth: 1.1, neck: 0, neckAngle: 35, head: 3.8, muzzle: 1.6, muzzleWidth: 1.6,
    ears: 'tiny', earSize: 1.2, tail: 'bushy', tailLength: 8, tailUp: 95, tailCurl: 150, marks: ['stripe', 'blaze'],
    colors: { fur: 'black', second: 'white', third: 'white', nose: 'black', horn: 'cream' },
  }),
  make('otter', 'Otter', {
    scale: 1.15, fur: 0.2,
    length: 8.5, girth: 3.4, width: 0.85, legs: 2.4, legWidth: 1.1, neck: 1.2, neckWidth: 2.8, neckAngle: 35, head: 3.6, muzzle: 1.6, muzzleWidth: 1.9,
    ears: 'tiny', earSize: 1, tail: 'thick', tailLength: 9, tailUp: -5, marks: ['muzzle', 'belly', 'chest'],
    colors: { fur: 'hairBrown', second: 'cream', third: 'cream', nose: 'black', horn: 'cream' }, // (brown)
  }),
  // ---- medium
  make('cat', 'Cat', {
    scale: 1.1, fur: 0.4,
    length: 5.5, girth: 3.6, width: 0.9, legs: 3.8, legWidth: 1.0, neck: 0.5, neckWidth: 2.6, neckAngle: 50, head: 3.8, muzzle: 1.3, muzzleWidth: 1.6,
    ears: 'pointed', earSize: 1.6, tail: 'thin', tailLength: 7, tailUp: 25, tailCurl: 70, marks: ['bands', 'muzzle', 'chest', 'belly'],
    colors: { fur: 'orange', second: 'white', third: 'hairRed', nose: 'pink', horn: 'cream' }, pickable: true, // (tan, ochre stripes)
  }),
  make('dog', 'Dog', {
    scale: 1.2, fur: 0.4,
    length: 6.5, girth: 4.2, width: 0.85, legs: 4.8, legWidth: 1.3, neck: 1.2, neckWidth: 2.8, neckAngle: 55, head: 4.3, muzzle: 2.2, muzzleWidth: 2, snoutDown: 10,
    ears: 'lop', earSize: 2.2, earColor: 'second', tail: 'thin', tailLength: 6, tailUp: 50, features: ['blush'], marks: ['saddle', 'hood'],
    colors: { fur: 'white', second: 'brown', third: 'tan', nose: 'black', horn: 'cream' }, pickable: true,
  }),
  make('fox', 'Fox', {
    scale: 1.35, fur: 0.7, // the wolf's build: in Lop Hop they are one animal, recoloured
    length: 6.5, girth: 3.7, width: 0.8, legs: 5, legWidth: 0.8, neck: 1, neckWidth: 2.6, neckAngle: 45, head: 3.9, muzzle: 2.6, muzzleWidth: 1.5, snoutDown: 5,
    ears: 'pointed', earSize: 2.2, tail: 'bushy', tailLength: 10, tailUp: -15, marks: ['muzzle', 'chest', 'belly', 'tailTip', 'socks'],
    colors: { fur: 'orange', second: 'white', third: 'hairBlack', nose: 'black', horn: 'cream' }, pickable: true,
  }),
  make('wolf', 'Wolf', {
    scale: 1.35, fur: 0.7,
    length: 6.5, girth: 3.7, width: 0.8, legs: 5, legWidth: 0.8, neck: 1, neckWidth: 2.6, neckAngle: 45, head: 3.9, muzzle: 2.6, muzzleWidth: 1.5, snoutDown: 5,
    ears: 'pointed', earSize: 2.2, tail: 'bushy', tailLength: 10, tailUp: -15, marks: ['muzzle', 'chest', 'belly', 'tailTip'],
    colors: { fur: 'grey', second: 'white', third: 'basalt', nose: 'black', horn: 'cream' }, // (the fox in grey and charcoal)
  }),
  make('pig', 'Pig', {
    scale: 1.3, fur: 0,
    length: 6.5, girth: 5, width: 0.95, legs: 3.8, legWidth: 1.0, neck: 0, neckAngle: 30, head: 4.6, muzzle: 2.2, eye: 0.55, muzzleWidth: 2, snoutDown: -5,
    ears: 'pointed', earSize: 1.9, earColor: 'second', tail: 'thin', tailLength: 3, tailUp: 40, tailCurl: 300, features: ['blush'], marks: ['muzzle'],
    colors: { fur: 'piglet', second: 'pink', third: 'pink', nose: 'pink', horn: 'cream' }, // (lightPink, pink)
  }),
  make('cheetah', 'Cheetah', {
    scale: 1.3, fur: 0.2,
    length: 7.5, girth: 3.2, width: 0.75, legs: 5.6, legWidth: 0.7, neck: 1.2, neckWidth: 2.2, neckAngle: 40, head: 3.6, muzzle: 1.5, muzzleWidth: 1.6,
    ears: 'round', earSize: 1.3, tail: 'thin', tailLength: 11, tailUp: -40, tailCurl: 80, marks: ['spots', 'muzzle', 'belly'],
    colors: { fur: 'tan', second: 'white', third: 'black', nose: 'black', horn: 'cream' },
  }),
  make('boar', 'Boar', {
    scale: 1.3, fur: 0.8,
    length: 6.5, girth: 4.8, width: 0.85, legs: 4, legWidth: 0.9, neck: 0, neckAngle: 20, head: 4.2, muzzle: 3.4, eye: 0.55, muzzleWidth: 1.8, snoutDown: 15,
    ears: 'pointed', earSize: 1.8, tail: 'tuft', tailLength: 4, tailUp: -40, horns: 'tusks', hornSize: 1.1, marks: ['stripe'],
    colors: { fur: 'bark', second: 'hairBlack', third: 'hairBlack', nose: 'piglet', horn: 'white' }, // (deepBrown, a pink snout)
  }),
  // ---- large
  make('bear', 'Bear', {
    scale: 1.8, fur: 0.7,
    length: 6.5, girth: 5, width: 0.95, legs: 4.4, legWidth: 1.9, hump: 2.2, humpAt: 0.8, neck: 0.5, neckWidth: 3.6, neckAngle: 25, head: 4.4, muzzle: 1.8, muzzleWidth: 1.9,
    ears: 'round', earSize: 1.5, tail: 'stub', tailLength: 2, marks: ['muzzle'],
    colors: { fur: 'brown', second: 'sandstone', third: 'sandstone', nose: 'black', horn: 'cream' },
  }),
  make('gorilla', 'Gorilla', {
    plan: 'ape', scale: 1.6, fur: 0.6,
    length: 5.5, girth: 4.4, width: 1, tilt: 75, legs: 3.6, legWidth: 1.6, arms: 9, neck: 0, head: 3.9, muzzle: 1.4, muzzleWidth: 2.1, snoutDown: 10,
    ears: 'tiny', earSize: 1, tail: 'none', marks: ['face', 'muzzle', 'saddle'],
    colors: { fur: 'basalt', second: 'grey', third: 'steel', nose: 'black', horn: 'cream' }, // (charcoal, slate face)
  }),
  make('yak', 'Yak', {
    scale: 1.75, fur: 1,
    length: 6.5, girth: 4.8, width: 0.95, legs: 5, legWidth: 1.8, hump: 2.2, humpAt: 0.85, neck: 0, neckAngle: 20, head: 4.2, muzzle: 1.8, muzzleWidth: 2, snoutDown: 30,
    ears: 'tiny', earSize: 1.3, tail: 'tuft', tailLength: 6, tailUp: -55, horns: 'horns', hornSize: 2, marks: ['face'],
    colors: { fur: 'bark', second: 'cream', third: 'cream', nose: 'hairBlack', horn: 'steel' }, // (deepBrown, a beige face, lightGrey horns)
  }),
  make('ostrich', 'Ostrich', {
    plan: 'biped', scale: 1.6, fur: 0.3,
    length: 6.5, girth: 3.8, width: 0.85, tilt: -5, legs: 8, legWidth: 0.7, neck: 7, neckWidth: 0.8, neckAngle: 82, head: 2.6, muzzle: 2.2, muzzleWidth: 0.9, snoutDown: 5,
    ears: 'none', tail: 'plume', tailLength: 4, tailUp: 40, features: ['wings', 'beak'], marks: ['hood', 'socks'],
    colors: { fur: 'black', second: 'white', third: 'piglet', nose: 'black', horn: 'straw' }, // (skin neck and legs)
  }),
  make('dromedary', 'Dromedary', {
    scale: 1.55, fur: 0.3,
    length: 6, girth: 3.8, width: 0.8, legs: 7, legWidth: 0.8, hump: 3.4, humpAt: 0.45, neck: 4.5, neckWidth: 1.6, neckAngle: 40, head: 2.9, muzzle: 2, muzzleWidth: 1.5, snoutDown: 5,
    ears: 'tiny', earSize: 1, tail: 'tuft', tailLength: 5, tailUp: -70, marks: ['muzzle'],
    colors: { fur: 'tan', second: 'sandstone', third: 'wood', nose: 'hairBrown', horn: 'cream' }, // (camel)
  }),
  make('rhino', 'Rhino', {
    scale: 1.8, fur: 0,
    length: 7, girth: 5, width: 0.95, legs: 4.4, legWidth: 1.9, neck: 0, neckAngle: 15, head: 3.9, muzzle: 3, muzzleWidth: 2.2, snoutDown: 25,
    ears: 'pointed', earSize: 1.4, tail: 'tuft', tailLength: 4, tailUp: -60, horns: 'nose', hornSize: 1.9,
    colors: { fur: 'grey', second: 'grey', third: 'basalt', nose: 'basalt', horn: 'cream' },
  }),
  // ---- huge (Lop Hop's numbers times 1.3, as scale stops at 2)
  make('elephant', 'Elephant', {
    scale: 2, fur: 0,
    length: 8.5, girth: 7.7, width: 0.95, legs: 6.2, legWidth: 2.7, neck: 0, neckAngle: 35, head: 6, muzzle: 2, muzzleWidth: 2.8, snoutDown: 30,
    ears: 'flap', earSize: 4.6, tail: 'tuft', tailLength: 6, tailUp: -70, horns: 'tusks', hornSize: 1.9, trunk: 9,
    colors: { fur: 'hairGrey', second: 'hairGrey', third: 'basalt', nose: 'black', horn: 'cream' }, // (blueGrey)
  }),
  make('dino', 'Dino', {
    plan: 'biped', scale: 2, fur: 0,
    length: 8, girth: 5, width: 0.85, tilt: 10, legs: 7, legWidth: 1.6, arms: 3, neck: 2.5, neckWidth: 3.2, neckAngle: 55, head: 5.2, muzzle: 3.2, muzzleWidth: 3, snoutDown: 0,
    ears: 'none', tail: 'thick', tailLength: 10, tailUp: -5, features: ['teeth'], marks: ['belly'],
    colors: { fur: 'grey', second: 'steel', third: 'steel', nose: 'basalt', horn: 'cream' },
  }),
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);
