// The first island: a low patch of sand in the sea with a few palms, the same every time from a seed.
// The island is shaped in a square of its own and set in the middle of a larger map, with the sea bed
// round it laid by hand (see `seaBed`), so there is open water on every side. Driftwood is the game's
// own, to pick up (see fire.ts), so it is not among the decorations.
import { createScene, type PlacedPlant, type Scene } from '@pixel/engine/world/scene.ts';
import type { PlacedDecor } from '@pixel/engine/world/decor.ts';
import { createHeightMap, generateIsland, levelAt, MIN_LEVEL, SEA_LEVEL, setLevel, surfaceAt, type HeightMap } from '@pixel/engine/world/terrain.ts';
import { grows } from '@pixel/engine/world/world.ts';
import { rng } from '@pixel/shared/random.ts';

/** The square the island itself is shaped in, and the map it is set in the middle of. */
const ISLAND = 16;
const SIZE = 24;
/** How far in from the map's edge the island square begins. */
const EDGE = (SIZE - ISLAND) / 2;
const SEED = 7;
/** How many tiles of sea bed there are to a level: how far the shallows reach, and how gently the bed falls away. */
const SHELF = 2;
/** The palms, from the flora catalogue: three tall leaning ones (no bushy palm, no sapling), each grown from its own seed. */
const PALMS = ['plant-palms-0', 'plant-palms-0', 'plant-palms-0'];
/** Things lying about, by where they go: the beach, the sand above it, the shallows. */
const DECOR: [string[], (map: HeightMap, i: number, j: number) => boolean][] = [
  [['starfish-orange', 'starfish-pink', 'shell-spiral', 'shell-scallop', 'shell-spiral'], (m, i, j) => surfaceAt(m, i, j) === 'beach'],
  [['pebbles-grey', 'pebbles-brown', 'shell-scallop'], (m, i, j) => levelAt(m, i, j) > SEA_LEVEL],
  [['coral', 'coral', 'coral', 'starfish-orange', 'pebbles-grey'], (m, i, j) => levelAt(m, i, j) === SEA_LEVEL - 1],
];

/**
 * The sea bed: every water tile is set from its distance to the nearest land, so the bed falls away from the shore
 * gently and has reached the deep before the map ends. Two things hang on that. The water's colours go by depth, so
 * a bed that is still shelving where the map stops leaves a visible edge against the open sea painted beyond it.
 * And the shallows are where the crabs walk: the wider they are, the further out a crab can wade, sinking and
 * washing out with the water as it goes.
 */
function seaBed(map: HeightMap): void {
  const land: { i: number; j: number }[] = [];
  for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) if (levelAt(map, i, j) >= SEA_LEVEL) land.push({ i, j });
  for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) {
    if (levelAt(map, i, j) >= SEA_LEVEL) continue;
    let near = Infinity;
    for (const l of land) near = Math.min(near, Math.hypot(l.i - i, l.j - j));
    setLevel(map, i, j, Math.max(MIN_LEVEL, -Math.ceil(near / SHELF)));
  }
}

export function firstIsland(): Scene {
  const scene = createScene('Island', SIZE, SIZE, false, SEED);
  // The island is shaped as it always was, in its own 16 by 16 square, and set in the middle of the map.
  const island = generateIsland(SEED, ISLAND, ISLAND, { peak: 2, land: 0.55 });
  const map = createHeightMap(SIZE, SIZE);
  for (let j = 0; j < ISLAND; j++) for (let i = 0; i < ISLAND; i++) setLevel(map, i + EDGE, j + EDGE, levelAt(island, i, j));
  seaBed(map);
  scene.levels = Array.from(map.levels);
  const random = rng(SEED);
  const plants: PlacedPlant[] = [];
  // Everything is placed in the island's own square and set over by EDGE, so it stands where it always did.
  for (let tries = 0; plants.length < PALMS.length && tries < 500; tries++) {
    const i = EDGE + 1 + random() * (ISLAND - 2);
    const j = EDGE + 1 + random() * (ISLAND - 2);
    const plant = PALMS[plants.length];
    if (!grows(map, plant, Math.floor(i), Math.floor(j))) continue;
    if (plants.some((p) => Math.hypot(p.i - i, p.j - j) < 2.2)) continue;
    plants.push({ plant, i, j, seed: plants.length % 4, size: 1, turn: Math.floor(random() * 8) });
  }
  scene.plants = plants;
  const decor: PlacedDecor[] = [];
  for (const [kinds, fits] of DECOR) {
    for (let tries = 0, n = 0; n < kinds.length && tries < 500; tries++) {
      const i = EDGE + 0.5 + random() * (ISLAND - 1);
      const j = EDGE + 0.5 + random() * (ISLAND - 1);
      if (!fits(map, Math.floor(i), Math.floor(j)) || [...decor, ...plants].some((p) => Math.hypot(p.i - i, p.j - j) < 1)) continue;
      decor.push({ decor: kinds[n++], i, j });
    }
  }
  scene.decor = decor;
  // The survivor wakes on dry land nearest the middle.
  let best = { i: SIZE / 2, j: SIZE / 2 };
  let bestD = Infinity;
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const d = Math.hypot(i + 0.5 - SIZE / 2, j + 0.5 - SIZE / 2);
    if (levelAt(map, i, j) >= SEA_LEVEL && d < bestD && !plants.some((p) => Math.hypot(p.i - i - 0.5, p.j - j - 0.5) < 1.2)) {
      bestD = d;
      best = { i: i + 0.5, j: j + 0.5 };
    }
  }
  scene.spawn = best;
  return scene;
}
