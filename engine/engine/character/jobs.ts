// Job clothes for Animal Hospital's staff: the vet's coat with a stethoscope, scrubs, the
// receptionist's cardigan with a collar and name badge, the janitor's overalls and the keeper's
// vest. Each starts as a clothing recipe (engine/character/items.ts) and gets its details painted on the torso.
import { compileRecipe } from './items.ts';
import type { PaletteKey } from '../core/palette.ts';
import type { Item, Stamp } from '../core/puppet.ts';

/**
 * Torso stamps are 21 wide; the body is columns 6 to 14 and the waist is row 12. Seen from the
 * front the centre front is column 11, where an open neck parts.
 */
type Paint = [x: number, y: number, key: PaletteKey | null, shade?: boolean][];

const painted = (stamp: Stamp, paint: Paint): Stamp => {
  const out = stamp.map((row) => [...row]);
  for (const [x, y, key, shade = false] of paint) if (out[y]) out[y][x] = key && { key, shade };
  return out;
};

const column = (x: number, y0: number, y1: number, key: PaletteKey | null, shade = false): Paint =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i, key, shade]);
const span = (x0: number, x1: number, y: number, key: PaletteKey | null, shade = false): Paint =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y, key, shade]);

function job(recipe: Record<string, unknown>, front: Paint = [], back: Paint = []): Item {
  const item = compileRecipe(recipe).item;
  if (item.torso) item.torso = { front: painted(item.torso.front, front), back: painted(item.torso.back, back) };
  return item;
}

const top = (name: string, color: PaletteKey, neck: string, sleeves: number, length: number) =>
  ({ name, slot: 'top', color, pattern: null, neck, length, sleeves, ragged: 0, holes: 0 });
const trousers = (name: string, color: PaletteKey) =>
  ({ name, slot: 'bottom', color, pattern: null, length: 10, ragged: 0, holes: 0, belt: null, skirt: false });

// The stethoscope: tubes from both sides of the neck down to the chest piece.
const STETHOSCOPE: Paint = [
  ...column(9, 1, 4, 'black'), [10, 5, 'black'], ...column(13, 1, 3, 'black'), [12, 4, 'black'],
  [11, 5, 'black'], [11, 6, 'steel'],
];

// A surgical cap: a snug teal cap over the crown with a darker band, tied at the back.
const blank = '.'.repeat(21);
const CAP = [
  '......TTTTTTTTT......',
  '....TTTTTTTTTTTTT....',
  '...TTTTTTTTTTTTTTT...',
  '..TTTTTTTTTTTTTTTTT..',
  '..TTTTTTTTTTTTTTTTT..',
  '..TTTTTTTTTTTTTTTTT..',
  '..ttttttttttttttttt..',
];
const capFront = [...Array(3).fill(blank), ...CAP, '.t...................', 't....................', ...Array(18).fill(blank)];
const capBack = [...Array(3).fill(blank), ...CAP, '..................t..', '...................t.', ...Array(18).fill(blank)];

export const JOB_ITEMS: { id: string; label: string; item: Item }[] = [
  {
    id: 'vet-coat',
    label: "Vet's coat",
    item: job(top("Vet's coat", 'white', 'open', 10, 5), [
      // Scrubs show where the coat is open, the trousers below the waist.
      ...column(11, 1, 11, 'teal'), ...column(11, 12, 17, null),
      ...column(10, 1, 2, 'white', true), ...column(12, 1, 2, 'white', true),
      ...STETHOSCOPE,
      ...span(7, 9, 9, 'white', true), ...span(12, 13, 9, 'white', true),
    ], [
      ...span(8, 12, 1, 'black'),
    ]),
  },
  { id: 'surgical-cap', label: 'Surgical cap', item: compileRecipe({ name: 'Surgical cap', slot: 'hat', legend: { T: 'teal' }, front: capFront, back: capBack }).item },
  { id: 'scrubs', label: 'Scrubs top', item: job(top('Scrubs top', 'teal', 'v', 3, 1), [...span(7, 9, 4, 'teal', true)]) },
  { id: 'scrub-trousers', label: 'Scrubs trousers', item: job(trousers('Scrubs trousers', 'teal')) },
  {
    id: 'cardigan',
    label: 'Cardigan with badge',
    item: job(top('Cardigan with badge', 'blue', 'v', 10, 1), [
      // A white collar in the neck and a name badge on the chest.
      [10, 1, 'white'], [11, 1, 'white'], [12, 1, 'white'], [11, 2, 'white'], [11, 3, 'white', true],
      ...span(7, 8, 4, 'white'), [9, 4, 'red'],
      ...column(11, 4, 12, 'blue', true),
    ], [
      ...span(8, 12, 1, 'white'),
    ]),
  },
  {
    id: 'overalls',
    label: 'Overalls',
    item: job(top('Overalls', 'cream', 'round', 3, 0), [
      // A green bib with a pocket, on straps over a cream shirt.
      ...span(7, 13, 5, 'green'), ...span(7, 13, 6, 'green'), [8, 7, 'green'], ...span(9, 11, 7, 'green', true), ...span(12, 13, 7, 'green'),
      ...[8, 9, 10, 11, 12].flatMap((y) => span(7, 13, y, 'green')), ...span(14, 14, 5, 'green', true),
      ...column(14, 6, 12, 'green', true),
      ...column(7, 1, 4, 'green'), ...column(13, 1, 4, 'green'),
      [8, 6, 'yellow'], [12, 6, 'yellow'],
    ], [
      // The straps cross on the back.
      ...column(8, 1, 3, 'green'), ...column(12, 1, 3, 'green'), [9, 4, 'green'], [11, 4, 'green'], [10, 5, 'green'],
      ...[6, 7, 8, 9, 10, 11, 12].flatMap((y) => span(7, 13, y, 'green')), ...column(6, 6, 12, 'green', true),
    ]),
  },
  { id: 'work-trousers', label: 'Work trousers', item: job(trousers('Work trousers', 'green')) },
  {
    id: 'keeper-vest',
    label: "Keeper's vest",
    item: job(top("Keeper's vest", 'tan', 'round', 3, 0), [
      // An open vest with two pockets over a tan shirt.
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((y) => [...span(6, 9, y, 'leaf'), ...span(13, 14, y, 'leaf')]),
      ...column(14, 1, 12, 'leaf', true),
      ...span(7, 8, 8, 'leaf', true), [13, 8, 'leaf', true],
      ...column(10, 1, 12, 'tan', true),
    ], [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((y) => span(6, 14, y, 'leaf')),
      ...column(6, 1, 12, 'leaf', true),
    ]),
  },
];
