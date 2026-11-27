// The engine's rock in front of the survivor (front-rock.ts): rock at a cave's front is never drawn, rock that hides floor
// behind it dissolves while it stands in front of the survivor near that floor, a whole joined mass at a time, and holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FADE_MS, FRONT, RockFade, rockView, STANDS } from '../engine/world/front-rock.ts';
import { BRICK, ROCK_LEVEL, type HeightMap } from '../engine/world/terrain.ts';

/** A cave of rows: `#` rock, `.` floor at level 3. */
const cave = (...rows: string[]): HeightMap => ({
  w: rows[0].length, h: rows.length, water: null,
  levels: Int8Array.from(rows.join(''), (ch) => (ch === '#' ? ROCK_LEVEL : 3)),
});
// Two rooms, one behind the other on screen, rock between them; the rock's top stands five levels over the floor.
const TWO = cave('######', '#....#', '#....#', '######', '######', '#....#', '#....#', '######');
const TOP = 8;
const at = (m: HeightMap, i: number, j: number) => j * m.w + i;

test('rock with only rock between it and the camera is not drawn; rock between rooms stands and hides the floor behind it', () => {
  const v = rockView(TWO, TOP);
  // The cave's front row, and the rock at a room's near (+i) side.
  assert.equal(v.kind[at(TWO, 2, 7)], FRONT);
  assert.equal(v.kind[at(TWO, 5, 1)], FRONT);
  // Between the rooms: the back room's floor lies behind it.
  assert.equal(v.kind[at(TWO, 2, 3)], STANDS);
  assert.ok(v.hides.get(at(TWO, 2, 3))!.includes(at(TWO, 2, 2)));
  // The back wall stands, but with nothing behind it there is nothing for it to hide: it never fades.
  assert.equal(v.kind[at(TWO, 2, 0)], STANDS);
  assert.ok(!v.hides.has(at(TWO, 2, 0)));
});

test('rock in front of the survivor that hides floor near them goes, a whole mass at once, and holds while any of it is wanted', () => {
  const v = rockView(TWO, TOP);
  const fade = new RockFade(v);
  fade.aim({ i: 1, j: 2 });
  const mass = [...v.hides.keys()].filter((c) => fade.target[c]);
  assert.ok(fade.target[at(TWO, 2, 3)] && !fade.target[at(TWO, 2, 0)]);
  // All the hiding rock joined to it goes with it, including what lies beside the survivor rather than in front.
  assert.deepEqual(mass.sort(), [...v.hides.keys()].filter((c) => Math.floor(c / TWO.w) >= 3 && Math.floor(c / TWO.w) <= 4).sort());
  // Walking along the room the mass stays as it is.
  fade.aim({ i: 4, j: 2 });
  assert.deepEqual([...v.hides.keys()].filter((c) => fade.target[c]).sort(), mass.sort());
  // In the front room, the rock between is behind them: it comes back.
  fade.aim({ i: 2, j: 6 });
  assert.ok(!fade.target[at(TWO, 2, 3)]);
});

test('without a survivor every rock that hides floor is down to its stub; a fade takes a quarter second, in sixteenths', () => {
  const v = rockView(TWO, TOP);
  const fade = new RockFade(v);
  fade.aim(null);
  for (const c of v.hides.keys()) assert.equal(fade.target[c], 1);
  const c = at(TWO, 2, 3);
  fade.advance(FADE_MS * 0.3);
  assert.equal(fade.fadeOf(c), 5 / 16);
  fade.advance(FADE_MS);
  assert.equal(fade.fadeOf(c), 1);
  fade.aim({ i: 2, j: 6 });
  fade.settle();
  assert.equal(fade.fadeOf(c), 0);
});

test('a dissolving mass stops where the rock it is built of changes', () => {
  // Two long rooms with rock between them, brick from the ninth column on.
  const long = cave('############', '#..........#', '#..........#', '############', '############', '#..........#', '#..........#', '############');
  const m = { ...long, paint: Uint8Array.from({ length: long.w * long.h }, (_, c) => ((c % long.w) >= 8 && Math.floor(c / long.w) >= 3 && Math.floor(c / long.w) <= 4 ? BRICK : 0)) };
  const v = rockView(m, TOP);
  const fade = new RockFade(v);
  // At the back room's left end, near floor the stone hides only; the stone it joins goes as far as the brick.
  fade.aim({ i: 1, j: 2 });
  const going = [...v.hides.keys()].filter((c) => fade.target[c]);
  assert.ok(going.length > 0 && going.every((c) => v.material[c] === 0));
  assert.ok(going.includes(at(long, 7, 3)));
  assert.ok([...v.hides.keys()].some((c) => v.material[c] === BRICK) && [...v.hides.keys()].every((c) => v.material[c] !== BRICK || !fade.target[c]));
});
