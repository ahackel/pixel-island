// The first island: a low patch of sand in the sea with a few palms, the same every time from a seed.
// The island is shaped in a square of its own and set in the middle of a larger map, with the sea bed
// round it laid by hand (see `seaBed`), so there is open water on every side. Driftwood is the game's
// own, to pick up (see fire.ts), so it is not among the decorations.
import { createScene, readSceneFile, type PlacedPlant, type Scene } from '@pixel/engine/world/scene.ts';
import type { PlacedDecor } from '@pixel/engine/world/decor.ts';
import { createHeightMap, generateIsland, levelAt, MIN_LEVEL, PAINTS, SEA_LEVEL, setLevel, surfaceAt, type HeightMap } from '@pixel/engine/world/terrain.ts';
import { grows } from '@pixel/engine/world/world.ts';
import { rng } from '@pixel/shared/random.ts';

/** How an island is made: the square it is shaped in, the map it is set in the middle of, its seed and its hills. */
interface Shape { island: number; size: number; seed: number; peak: number; land: number }
const FIRST: Shape = { island: 16, size: 24, seed: 7, peak: 2, land: 0.55 };
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

/** Scenes saved from the scene editor ("Save to project" writes `content/scenes/<name>.json`), by file name without `.json`. */
const SAVED = import.meta.glob('./content/scenes/*.json', { eager: true, import: 'default' });
export const savedScene = (slug: string): Scene | null => {
  const file = SAVED[`./content/scenes/${slug}.json`];
  return file ? readSceneFile(JSON.stringify(file)) : null;
};

/** The first island: the scene saved as `island` when there is one, else the one made from its seed. */
export const firstIsland = (): Scene => savedScene('island') ?? islandOf(FIRST);

/** An island of a shape, with `ground` changing its land before the sea bed is laid and the palms placed. */
function islandOf({ island: ISLAND, size: SIZE, seed: SEED, peak, land }: Shape, name = 'Island', ground?: (map: HeightMap) => void): Scene {
  /** How far in from the map's edge the island square begins. */
  const EDGE = (SIZE - ISLAND) / 2;
  const scene = createScene(name, SIZE, SIZE, false, SEED);
  // The island is shaped in its own square and set in the middle of the map.
  const shaped = generateIsland(SEED, ISLAND, ISLAND, { peak, land });
  const map: HeightMap & { paint?: Uint8Array } = createHeightMap(SIZE, SIZE);
  for (let j = 0; j < ISLAND; j++) for (let i = 0; i < ISLAND; i++) setLevel(map, i + EDGE, j + EDGE, levelAt(shaped, i, j));
  ground?.(map);
  seaBed(map);
  scene.levels = Array.from(map.levels);
  if (map.paint) scene.paint = Array.from(map.paint);
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

// ------------------------------------------------------------------ island 2, a first try

/** The rocky island, bigger, round a rock hill with a cave in it: only a first try at it so far (`?island=2`). */
const ROCKY: Shape = { island: 28, size: 38, seed: 11, peak: 3, land: 0.6 };
/** The rock hill's side, in tiles, and how far it stands over the ground round it: well over a slope, so its sides are cliffs. */
const HILL = 4;
const HILL_UP = 4;
const ROCK = PAINTS.indexOf('rock') + 1;

/** The rocky island and the cave mouth in its hill: where to stand to go in, at the foot of the hill's front cliff. */
export function rockyIsland(): { scene: Scene; mouth: { i: number; j: number }; face: { i: number; j: number } } {
  const i0 = Math.floor(ROCKY.size / 2 - HILL / 2);
  const j0 = i0;
  // The scene saved as `rocky-island` when there is one (the hill and cave mouth below stay where they were made), else the one made from its seed.
  const scene = savedScene('rocky-island') ?? islandOf(ROCKY, 'Rocky island', (map: HeightMap & { paint?: Uint8Array }) => {
    map.paint = new Uint8Array(map.w * map.h);
    // The higher ground is rock, and a hill of it stands in the middle.
    let top = SEA_LEVEL;
    for (let j = j0 - 1; j <= j0 + HILL; j++) for (let i = i0 - 1; i <= i0 + HILL; i++) top = Math.max(top, levelAt(map, i, j));
    for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) if (levelAt(map, i, j) >= SEA_LEVEL + 2) map.paint[j * map.w + i] = ROCK;
    for (let j = j0; j < j0 + HILL; j++) for (let i = i0; i < i0 + HILL; i++) {
      setLevel(map, i, j, top + HILL_UP);
      map.paint[j * map.w + i] = ROCK;
    }
  });
  // The mouth is in the middle of the hill's front cliff (the side toward +j, facing down the screen): drawn on the
  // face, and gone into from a little way out, where the survivor can stand.
  return { scene, mouth: { i: i0 + HILL / 2, j: j0 + HILL + 0.6 }, face: { i: i0 + HILL / 2, j: j0 + HILL + 0.02 } };
}

/** The cave's map, in tiles; its floor's level; and how high its walls rise over the floor, in levels. */
/** A cave, made in the scene editor (a cave scene, exported) and kept with the game's content. */
export interface Cave {
  scene: Scene;
  /** Where the survivor stands on coming in, and the daylight at its open side that is the way out. */
  entry: { i: number; j: number };
  exit: { i: number; j: number };
}

/** The rocky island's cave, from `content/scenes/smuggler-cave.json`. */
export function caveScene(): Cave {
  const scene = savedScene('smuggler-cave')!;
  const exit = scene.cave?.exits[0] ?? scene.spawn;
  return { scene, entry: scene.spawn, exit };
}
