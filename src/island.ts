// The first island: a low patch of sand in the sea with a few palms, the same every time from a seed.
// Driftwood is the game's own, to pick up (see fire.ts), so it is not among the decorations.
import { createScene, type PlacedPlant, type Scene } from '@pixel/engine/world/scene.ts';
import type { PlacedDecor } from '@pixel/engine/world/decor.ts';
import { generateIsland, levelAt, SEA_LEVEL, surfaceAt, type HeightMap } from '@pixel/engine/world/terrain.ts';
import { grows } from '@pixel/engine/world/world.ts';
import { rng } from '@pixel/shared/random.ts';

const SIZE = 16;
const SEED = 7;
/** The palms, from the flora catalogue: three tall leaning ones (no bushy palm, no sapling), each grown from its own seed. */
const PALMS = ['plant-palms-0', 'plant-palms-0', 'plant-palms-0'];
/** Things lying about, by where they go: the beach, the sand above it, the shallows. */
const DECOR: [string[], (map: HeightMap, i: number, j: number) => boolean][] = [
  [['starfish-orange', 'starfish-pink', 'shell-spiral', 'shell-scallop', 'shell-spiral'], (m, i, j) => surfaceAt(m, i, j) === 'beach'],
  [['pebbles-grey', 'pebbles-brown', 'shell-scallop'], (m, i, j) => levelAt(m, i, j) > SEA_LEVEL],
  [['coral', 'coral', 'coral', 'starfish-orange', 'pebbles-grey'], (m, i, j) => levelAt(m, i, j) === SEA_LEVEL - 1],
];

export function firstIsland(): Scene {
  const scene = createScene('Island', SIZE, SIZE, false, SEED);
  const map = generateIsland(SEED, SIZE, SIZE, { peak: 2, land: 0.55 });
  scene.levels = Array.from(map.levels);
  const random = rng(SEED);
  const plants: PlacedPlant[] = [];
  for (let tries = 0; plants.length < PALMS.length && tries < 500; tries++) {
    const i = 1 + random() * (SIZE - 2);
    const j = 1 + random() * (SIZE - 2);
    const plant = PALMS[plants.length];
    if (!grows(map, plant, Math.floor(i), Math.floor(j))) continue;
    if (plants.some((p) => Math.hypot(p.i - i, p.j - j) < 2.2)) continue;
    plants.push({ plant, i, j, seed: plants.length % 4, size: 1, turn: Math.floor(random() * 8) });
  }
  scene.plants = plants;
  const decor: PlacedDecor[] = [];
  for (const [kinds, fits] of DECOR) {
    for (let tries = 0, n = 0; n < kinds.length && tries < 500; tries++) {
      const i = 0.5 + random() * (SIZE - 1);
      const j = 0.5 + random() * (SIZE - 1);
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
