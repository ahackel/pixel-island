// The first island: a low patch of sand in the sea with a few palms, the same every time from a seed.
import { createScene, type PlacedPlant, type Scene } from '@pixel/engine/world/scene.ts';
import { generateIsland, levelAt, SEA_LEVEL } from '@pixel/engine/world/terrain.ts';
import { grows } from '@pixel/engine/world/world.ts';
import { rng } from '@pixel/shared/random.ts';

const SIZE = 16;
const SEED = 7;
/** The palm recipes in the flora catalogue: leaning, bushy, sapling. */
const PALMS = ['plant-palms-0', 'plant-palms-1', 'plant-palms-0', 'plant-palms-2'];

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
