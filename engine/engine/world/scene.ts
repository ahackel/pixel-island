// A scene as it is saved: the ground (a height per tile and an optional painted surface), the
// plants and decorations placed on it and where the character starts. Scenes live in this browser's storage and
// can be written to and read from files. Everything read back is checked, since storage and
// files may hold anything.
import { newId } from '../../shared/files.ts';
import { TURNS } from '../flora/flora.ts';
import type { Facing } from '../core/puppet.ts';
import { AUTHORED } from '../core/poses.ts';
import { plantById } from '../flora/flora-catalog.ts';
import { cleanAnimal, savedAnimals, type Animal } from '../animals/animal.ts';
import { PRESETS } from '../animals/animal-presets.ts';
import { cleanState, defaultState, loadRoster, type State } from '../character/character.ts';
import { decorById, type PlacedDecor } from './decor.ts';
import { LINKING, nameLink, OWN, propOf, type PlacedItem } from './props.ts';
import { cleanBuild, type Build } from '../objects/object.ts';
import { carriedFor, cleanPlacedProp, useCarried, type Carried, type PlacedProp } from './prop.ts';
import { CUT, defaultShape, HOLE, SHAPES } from './ground.ts';
import { edgeKey, type Edge } from './building/building.ts';
import { cleanDoors, cleanLadders, type SceneDoor, type SceneLadder } from './ways.ts';
import { BRICK, BY_HEIGHT, createHeightMap, generateIsland, isRock, MAX_LEVEL, MINE, MIN_LEVEL, PAINTS, ROCK_LEVEL, SEA_LEVEL, type HeightMap } from './terrain.ts';

export interface PlacedPlant {
  /** A flora catalogue id. */
  plant: string;
  /** Where its root stands, in metres from the north corner of the map. */
  i: number;
  j: number;
  /** Which variant of the recipe grows, 0 to 3. */
  seed: number;
  size: number;
  /** Which way it faces, in eighths of a turn, 0 to 7. */
  turn: number;
}

export interface PlacedAnimal {
  /** The name it has in the animal editor. */
  name: string;
  /** The animal as last seen in the editor: a stand-in, kept in case its source is gone. */
  animal: Animal;
  /** What the animal is: a saved animal's id, or `preset:` and a preset id. The scene always takes it as it is now (see `refreshLinks`). Missing only for a copy from an old scene. */
  ref?: string;
  /** Where it stands, in metres from the north corner of the map. */
  i: number;
  j: number;
  /** Which way it faces on the map, as a character does. */
  facing: Facing;
}

/** A character from the wardrobe standing in the scene; like an animal, it is a reference. */
export interface PlacedPerson {
  name: string;
  /** The character as last seen in the wardrobe: a stand-in, kept in case its source is gone. */
  state: State;
  /** A saved character's id, or '' for the default one. Missing only for a copy from an old scene. */
  ref?: string;
  /** Where it stands, in metres from the north corner of the map. */
  i: number;
  j: number;
  /** Which way it faces on the map, in quarter turns, 0 to 3. */
  turn: number;
  /** Held in one frame of a clip, as a prop: it does not move, and does not roam in Play. */
  pose?: { clip: string; frame: number };
}

export interface Scene {
  id: string;
  name: string;
  w: number;
  h: number;
  /** Level per tile, row by row; `ROCK_LEVEL` is solid rock (terrain.ts). */
  levels: number[];
  /** Painted surface per tile: 0 follows the height (in a cave, the cave's own stone), otherwise `PAINTS[n - 1]`. */
  paint: number[];
  /** The material of each tile's step faces, where any differs from its top's (terrain.ts `HeightMap.side`); missing when none does. */
  side?: number[];
  /** Shape per tile (ground.ts: smooth, cut, a ramp's four directions, hole). Missing only in scenes from before shapes, which get theirs by rule (ground.ts `defaultShape`). */
  shape?: number[];
  plants: PlacedPlant[];
  /** Starfish, shells and the like, lying on the ground. */
  decor: PlacedDecor[];
  animals: PlacedAnimal[];
  people: PlacedPerson[];
  /** Objects standing on the ground: crates (carried in Play), chests, and any other object. */
  items: PlacedItem[];
  /** The scene's own objects, made in the object editor, by `OWN` id: kept here so the scene stands on its own. */
  objects?: Record<string, Build>;
  /** Thin walls on cell edges, in scene coordinates (the world turns them with the view), by wall kind (building/walls.ts). */
  walls?: SceneWall[];
  /** Ladders up a step inside the scene, on the edge between the lower floor and the higher, in scene coordinates (ways.ts). */
  ladders?: SceneLadder[];
  /** Doors on cell edges, in scene coordinates (ways.ts); one on a wall's edge stands in the wall's place. */
  doors?: SceneDoor[];
  /** Anything else standing on the ground, from the props library (engine/world/prop.ts). Missing in older scenes. */
  props?: PlacedProp[];
  /** The painted props and locked pixels it uses, so it draws the same in a game or on another device (see prop.ts). */
  carried?: Carried;
  spawn: { i: number; j: number };
  /** How far resizing at the north or west border has moved the ground since the scene was made, in tiles: what is drawn by position (rock, rubble, speckle) is seeded from the position without it, so it keeps its look. */
  shift?: { i: number; j: number };
  /** The size the scene had when it was first resized: the ground's speckle is seeded as for that size, so it keeps its look. */
  origin?: { w: number; h: number };
  /** Set for a cave: all rock but what is carved open, seen into from the front (see cave.ts). */
  cave?: CaveSettings;
  /** What lies beyond it, its light, its water line and the room over its floor. Missing, the preset its kind has (`settingsOf`). */
  settings?: SceneSettings;
  /** Where the scene lies on the scene editor's desk, beside the other scenes open there: its north corner, in tiles. Only the editor uses it. */
  desk?: { i: number; j: number };
}

/** A thin wall on a cell edge: `H` runs from (i, j) to (i + 1, j), `V` from (i, j) to (i, j + 1); `kind` a wall kind's id. */
export interface SceneWall { edge: Edge; kind: string }

/** The walls of a scene as read back: on edges inside its map, of a named kind, one per edge. */
export function cleanWalls(raw: unknown, w: number, h: number): SceneWall[] {
  const out = new Map<string, SceneWall>();
  for (const x of Array.isArray(raw) ? raw : []) {
    const e = x?.edge, kind = x?.kind;
    if (!e || (e.axis !== 'H' && e.axis !== 'V') || !Number.isInteger(e.i) || !Number.isInteger(e.j) || typeof kind !== 'string' || !kind) continue;
    const fits = e.axis === 'H' ? e.i >= 0 && e.i < w && e.j >= 0 && e.j <= h : e.i >= 0 && e.i <= w && e.j >= 0 && e.j < h;
    if (fits) out.set(edgeKey(e), { edge: { axis: e.axis, i: e.i, j: e.j }, kind: kind.slice(0, 40) });
  }
  return [...out.values()];
}

export interface CaveSettings {
  /** The colour the dark goes toward, and how dark it is away from any light, 0 to 1. */
  tint: string;
  dark: number;
  /** How much rubble lies along the walls' feet, 0 to 1. */
  rubble: number;
  /** The ways out, where daylight comes in, in metres from the north corner of the map. */
  exits: { i: number; j: number }[];
}
export const CAVE_DEFAULTS: Omit<CaveSettings, 'exits'> = { tint: '#080e50', dark: 0.9, rubble: 0.45 };

/** How a scene is set, whatever its ground. */
export interface SceneSettings {
  /** Beyond the map's edge: open sea, or nothing at all (black, for an inside such as a cave). */
  outside: 'sea' | 'void';
  /** Daylight with the time of day and the weather, or dark but where lamps and the daylight at its open sides reach. */
  light: 'day' | 'dark';
  /** The level water fills up to (terrain.ts `HeightMap.water`), or null for none. */
  water: number | null;
  /** How far a cave's rock stands over its floor, in levels; 0 under open sky. */
  headroom: number;
}
/** The tallest a cave's rock stands over its floor, in levels. */
export const MAX_HEADROOM = 10;
/** The kinds of scene, as settings: an island in the sea, a dry cave with nothing round it, a cave the sea comes into. */
export const SCENE_PRESETS = {
  island: { outside: 'sea', light: 'day', water: SEA_LEVEL, headroom: 0 },
  cave: { outside: 'void', light: 'dark', water: null, headroom: 5 },
  seaCave: { outside: 'sea', light: 'dark', water: SEA_LEVEL, headroom: 5 },
} as const satisfies Record<string, SceneSettings>;
/** A scene's settings: its own, or the preset of its kind (a cave's, or an island's). */
export const settingsOf = (scene: Scene): SceneSettings => scene.settings ?? (scene.cave ? SCENE_PRESETS.cave : SCENE_PRESETS.island);
/** Gives a scene settings, keeping none where they are what its kind has anyway. */
export function setSettings(scene: Scene, settings: SceneSettings): void {
  const preset = scene.cave ? SCENE_PRESETS.cave : SCENE_PRESETS.island;
  if ((Object.keys(preset) as (keyof SceneSettings)[]).every((k) => preset[k] === settings[k])) delete scene.settings;
  else scene.settings = { ...settings };
}

export const MIN_SIZE = 8;
/** How far from the middle of the editor's desk a scene may lie, in tiles. */
const DESK_REACH = 100000;
export const MAX_SIZE = 64;
export const SEEDS = 4;
export { TURNS };
export const SIZE_RANGE = [0.6, 1.6] as const;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A held pose that names a real clip and frame, or nothing. */
function cleanPose(pose: unknown): PlacedPerson['pose'] {
  const p = pose as { clip?: unknown; frame?: unknown } | null;
  const clip = typeof p?.clip === 'string' ? AUTHORED[p.clip] : undefined;
  if (!p || !clip) return undefined;
  const frame = typeof p.frame === 'number' && Number.isFinite(p.frame) ? clamp(Math.round(p.frame), 0, clip.frames.length - 1) : 0;
  return { clip: p.clip as string, frame };
}

/** A new scene: a generated island, or open sea to build on. */
export function createScene(name: string, w: number, h: number, island: boolean, seed = Math.floor(Math.random() * 1000)): Scene {
  w = clamp(Math.round(w), MIN_SIZE, MAX_SIZE);
  h = clamp(Math.round(h), MIN_SIZE, MAX_SIZE);
  const map = island ? generateIsland(seed, w, h) : createHeightMap(w, h, -1);
  return { id: newId(), name, w, h, levels: Array.from(map.levels), paint: new Array(w * h).fill(0), shape: Array.from(defaultShape(map)), plants: [], decor: [], animals: [], people: [], items: [], props: [], spawn: { i: w / 2, j: h / 2 } };
}

/**
 * A cave's ground: solid rock (`ROCK_LEVEL`) with floor carved out of it, the floor at `CAVE_FLOOR`, a tier over the
 * water line so there is room to dig down. Unpainted floor is the cave's own stone, `CAVE_OPEN` as the terrain paints it.
 */
export const CAVE_OPEN = PAINTS.indexOf('cave') + 1;
export const CAVE_FLOOR = SEA_LEVEL + 3;

/** A new cave: solid rock all through, to be carved open (cave.ts `carve`); with `settings`, a sea cave say. */
export function createCave(name: string, w: number, h: number, settings?: SceneSettings): Scene {
  const scene: Scene = { ...createScene(name, w, h, false), cave: { ...CAVE_DEFAULTS, exits: [] } };
  scene.levels.fill(ROCK_LEVEL);
  scene.paint.fill(0);
  // A cave's floor is cut: flat, with hard steps between its tiers.
  scene.shape = new Array(w * h).fill(CUT);
  if (settings) setSettings(scene, settings);
  return scene;
}

/**
 * The scene's ground as the terrain code reads it, with its water line. In a cave unpainted floor is its own stone, and
 * with nothing beyond it, beyond the map is rock; with the sea beyond, it is the open sea.
 */
export const mapOf = (scene: Scene): HeightMap & { paint: Uint8Array } => ({
  w: scene.w, h: scene.h,
  paint: scene.cave ? Uint8Array.from(scene.paint, (p) => p || CAVE_OPEN) : Uint8Array.from(scene.paint),
  levels: Int8Array.from(scene.levels),
  ...(scene.shape && { shape: Uint8Array.from(scene.shape) }),
  ...(scene.side && { side: Uint8Array.from(scene.side) }),
  water: settingsOf(scene).water,
  ...(scene.cave && settingsOf(scene).outside === 'void' && { outside: ROCK_LEVEL }),
});

/**
 * A cave saved before rock was stored as rock comes in two older forms: all of it flat at the water line with the
 * floor painted and the rock not (the paint said what was open), or before that the rock below the water line. Both
 * have no ground above the water line, which a cave never has since (its floor is at `CAVE_FLOOR`). Its levels and
 * paint as they are now, or nothing when it is no old cave.
 */
function oldCave(levels: number[], paint: number[]): { levels: number[]; paint: number[] } | null {
  if (levels.some((l) => l > SEA_LEVEL)) return null;
  const sunk = levels.some((l) => l < SEA_LEVEL);
  const open = levels.map((l, c) => (sunk ? l >= SEA_LEVEL : paint[c] > 0));
  return {
    levels: open.map((o) => (o ? CAVE_FLOOR : ROCK_LEVEL)),
    paint: open.map((o, c) => (o && !sunk ? paint[c] : 0)),
  };
}

/**
 * A scene with a new size, keeping what fits; new ground is sea, or in a cave rock. With `dx` and `dy` the old ground
 * moves that many tiles toward the far corner first (so a border at the north corner can be dragged), and so does
 * everything standing on it.
 */
export function resized(scene: Scene, w: number, h: number, dx = 0, dy = 0): Scene {
  w = clamp(Math.round(w), MIN_SIZE, MAX_SIZE);
  h = clamp(Math.round(h), MIN_SIZE, MAX_SIZE);
  const levels = new Array(w * h).fill(scene.cave ? ROCK_LEVEL : MIN_LEVEL);
  const paint = new Array(w * h).fill(0);
  const was = scene.shape ?? Array.from(defaultShape(mapOf(scene)));
  const shape = new Array(w * h).fill(scene.cave ? CUT : 0);
  const side = scene.side && new Array(w * h).fill(0);
  for (let j = 0; j < scene.h; j++) for (let i = 0; i < scene.w; i++) {
    const ni = i + dx, nj = j + dy;
    if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
    levels[nj * w + ni] = scene.levels[j * scene.w + i];
    paint[nj * w + ni] = scene.paint[j * scene.w + i];
    if (side) side[nj * w + ni] = scene.side![j * scene.w + i];
    shape[nj * w + ni] = was[j * scene.w + i];
  }
  const moved = <T extends { i: number; j: number }>(o: T): T => ({ ...o, i: o.i + dx, j: o.j + dy });
  const inMap = (o: { i: number; j: number }) => o.i >= 0 && o.j >= 0 && o.i < w && o.j < h;
  const kept = <T extends { i: number; j: number }>(list: T[]) => list.map(moved).filter(inMap);
  const spot = (o: { i: number; j: number }) => ({ i: Math.max(0, Math.min(w - 0.5, o.i + dx)), j: Math.max(0, Math.min(h - 0.5, o.j + dy)) });
  return {
    ...scene, w, h, levels, paint, shape,
    ...(side && { side }),
    plants: kept(scene.plants),
    decor: kept(scene.decor),
    animals: kept(scene.animals),
    people: kept(scene.people),
    items: kept(scene.items),
    props: kept(scene.props ?? []),
    ...(scene.walls && { walls: cleanWalls(scene.walls.map((x) => ({ ...x, edge: { ...x.edge, i: x.edge.i + dx, j: x.edge.j + dy } })), w, h) }),
    ...(scene.ladders && { ladders: cleanLadders(scene.ladders.map((x) => ({ ...x, edge: { ...x.edge, i: x.edge.i + dx, j: x.edge.j + dy } })), w, h) }),
    ...(scene.doors && { doors: cleanDoors(scene.doors.map((x) => ({ ...x, edge: { ...x.edge, i: x.edge.i + dx, j: x.edge.j + dy } })), w, h) }),
    spawn: spot(scene.spawn),
    ...((scene.origin || w !== scene.w || h !== scene.h) && { origin: scene.origin ?? { w: scene.w, h: scene.h } }),
    ...((scene.shift || dx || dy) && { shift: { i: (scene.shift?.i ?? 0) + dx, j: (scene.shift?.j ?? 0) + dy } }),
    ...(scene.cave && { cave: { ...scene.cave, exits: kept(scene.cave.exits) } }),
    // Grown or shrunk at the north or west border, it moves on the desk by as much, so its ground stays where it lay.
    ...(scene.desk && { desk: { i: scene.desk.i - dx, j: scene.desk.j - dy } }),
  };
}

/** Checks a scene read from storage or a file. Throws with a short reason when it cannot be used. */
export function cleanScene(input: unknown): Scene {
  const s = input as Partial<Scene> | null;
  if (!s || typeof s !== 'object') throw new Error('not a scene');
  const w = Number(s.w);
  const h = Number(s.h);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < MIN_SIZE || h < MIN_SIZE || w > MAX_SIZE || h > MAX_SIZE) throw new Error('bad size');
  if (!Array.isArray(s.levels) || s.levels.length !== w * h) throw new Error('bad ground');
  let levels = s.levels.map((n) => {
    const level = Math.round(Number(n)) || 0;
    return isRock(level) ? ROCK_LEVEL : clamp(level, MIN_LEVEL, MAX_LEVEL);
  });
  let paint = Array.isArray(s.paint) && s.paint.length === w * h
    ? s.paint.map((n) => (Number.isInteger(n) && n >= 0 && n <= PAINTS.length ? n : 0))
    : new Array(w * h).fill(0);
  const num = (n: unknown, lo: number, hi: number, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? clamp(n, lo, hi) : fallback);
  const plants = (Array.isArray(s.plants) ? s.plants : [])
    .filter((p): p is PlacedPlant => !!p && typeof p === 'object' && !!plantById(p.plant))
    .map((p) => ({
      plant: p.plant,
      i: num(p.i, 0, w, w / 2),
      j: num(p.j, 0, h, h / 2),
      seed: Math.round(num(p.seed, 0, SEEDS - 1, 0)),
      size: num(p.size, SIZE_RANGE[0], SIZE_RANGE[1], 1),
      turn: Math.round(num(p.turn, 0, TURNS - 1, 0)),
    }));
  const decor = (Array.isArray(s.decor) ? s.decor : [])
    .filter((d): d is PlacedDecor => !!d && typeof d === 'object' && !!decorById(d.decor))
    .map((d) => ({ decor: d.decor, i: num(d.i, 0, w, w / 2), j: num(d.j, 0, h, h / 2) }));
  const sources = linkSources();
  const animals = (Array.isArray(s.animals) ? s.animals : [])
    .filter((a): a is PlacedAnimal => !!a && typeof a === 'object')
    .map((a) => {
      const animal = cleanAnimal(a.animal);
      const name = typeof a.name === 'string' ? a.name.slice(0, 40) : '';
      // Scenes from before animals were linked hold `preset`, or only a copy: a source with the same name and colours marks one.
      const ref = typeof a.ref === 'string' ? a.ref
        : typeof (a as { preset?: unknown }).preset === 'string' ? `preset:${(a as unknown as { preset: string }).preset}`
          : sources.animals.find((c) => c.name === name && JSON.stringify(c.animal.colors) === JSON.stringify(animal.colors))?.ref;
      return {
        name,
        animal,
        ...(ref && { ref }),
        i: num(a.i, 0, w, w / 2),
        j: num(a.j, 0, h, h / 2),
        facing: Math.round(num(a.facing, 0, 7, 0)) as Facing,
      };
    });
  const people = (Array.isArray(s.people) ? s.people : [])
    .filter((p): p is PlacedPerson => !!p && typeof p === 'object')
    .map((p) => {
      const state = cleanState(p.state);
      const name = typeof p.name === 'string' ? p.name.slice(0, 40) : '';
      const json = JSON.stringify(state);
      const ref = typeof p.ref === 'string' ? p.ref
        : sources.people.find((c) => c.name === name && JSON.stringify(c.state) === json)?.id
          ?? (json === JSON.stringify(defaultState()) ? '' : undefined);
      return {
        name,
        state,
        ...(ref !== undefined && { ref }),
        i: num(p.i, 0, w, w / 2),
        j: num(p.j, 0, h, h / 2),
        turn: Math.round(num(p.turn, 0, 3, 0)),
        ...(cleanPose(p.pose) && { pose: cleanPose(p.pose) }),
      };
    });
  const objects: Record<string, Build> = {};
  if (s.objects && typeof s.objects === 'object') for (const [id, o] of Object.entries(s.objects)) if (id.startsWith(OWN)) objects[id] = cleanBuild(o);
  const items = (Array.isArray(s.items) ? s.items : [])
    .filter((it): it is PlacedItem => !!it && typeof it === 'object' && typeof it.item === 'string' && !!propOf(it.item, objects))
    .map((it) => ({
      item: it.item, i: num(it.i, 0, w, w / 2), j: num(it.j, 0, h, h / 2),
      ...(it.turn && { turn: Math.round(num(it.turn, 0, 3, 0)) }),
      ...(Array.isArray(it.loot) && it.loot.length && { loot: it.loot.filter((l: unknown) => typeof l === 'string').slice(0, 20) }),
      ...(LINKING.includes(it.item) && typeof it.id === 'string' && it.id && { id: it.id.slice(0, 24) }),
      ...(LINKING.includes(it.item) && it.to && typeof it.to.scene === 'string' && typeof it.to.id === 'string' && it.to.scene && { to: { scene: it.to.scene.slice(0, 60), id: it.to.id.slice(0, 24) } }),
    }));
  // A way to another scene is always named, so the other end can point at it; a name given here is kept once saved.
  for (const it of items) nameLink(items, it);
  // What the scene brought along first, so its props are known when they are checked.
  useCarried(s.carried);
  const props = (Array.isArray(s.props) ? s.props : []).map((p) => cleanPlacedProp(p, w, h)).filter((p): p is PlacedProp => !!p);
  const walls = cleanWalls(s.walls, w, h);
  const ladders = cleanLadders(s.ladders, w, h);
  const doors = cleanDoors(s.doors, w, h);
  const scene: Scene = {
    id: typeof s.id === 'string' && s.id ? s.id : newId(),
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 40) : s.cave ? 'Cave' : 'Island',
    w, h, levels, paint, plants, decor, animals, people, items, props,
    ...(Object.keys(objects).length && { objects }),
    ...(walls.length && { walls }),
    ...(ladders.length && { ladders }),
    ...(doors.length && { doors }),
    spawn: { i: num(s.spawn?.i, 0, w, w / 2), j: num(s.spawn?.j, 0, h, h / 2) },
    ...(s.origin && typeof s.origin === 'object' && Number.isInteger(s.origin.w) && Number.isInteger(s.origin.h) && { origin: { w: clamp(s.origin.w, MIN_SIZE, MAX_SIZE), h: clamp(s.origin.h, MIN_SIZE, MAX_SIZE) } }),
    ...(s.shift && typeof s.shift === 'object' && (Number(s.shift.i) || Number(s.shift.j)) && { shift: { i: Math.round(num(s.shift.i, -MAX_SIZE * 8, MAX_SIZE * 8, 0)), j: Math.round(num(s.shift.j, -MAX_SIZE * 8, MAX_SIZE * 8, 0)) } }),
    ...(s.desk && typeof s.desk === 'object' && { desk: { i: Math.round(num(s.desk.i, -DESK_REACH, DESK_REACH, 0)), j: Math.round(num(s.desk.j, -DESK_REACH, DESK_REACH, 0)) } }),
  };
  const c = s.cave;
  if (c && typeof c === 'object') {
    scene.cave = {
      tint: typeof c.tint === 'string' && /^#[0-9a-f]{6}$/i.test(c.tint) ? c.tint : CAVE_DEFAULTS.tint,
      dark: num(c.dark, 0, 1, CAVE_DEFAULTS.dark),
      rubble: num(c.rubble, 0, 1, CAVE_DEFAULTS.rubble),
      exits: (Array.isArray(c.exits) ? c.exits : []).filter((e) => !!e && typeof e === 'object').map((e) => ({ i: num(e.i, 0, w, w / 2), j: num(e.j, 0, h, h / 2) })),
    };
    const old = oldCave(levels, paint);
    if (old) ({ levels, paint } = old);
    // The cave's own stone is unpainted floor, and rock has no paint but what it is built of (brick or mine).
    scene.levels = levels;
    scene.paint = paint.map((p, c) => (p === CAVE_OPEN || (isRock(levels[c]) && p !== BRICK && p !== MINE) ? 0 : p));
  }
  const set = s.settings;
  if (set && typeof set === 'object') {
    setSettings(scene, {
      outside: set.outside === 'void' ? 'void' : 'sea',
      light: set.light === 'dark' ? 'dark' : 'day',
      water: set.water === null ? null : Math.round(num(set.water, MIN_LEVEL, MAX_LEVEL, SEA_LEVEL)),
      headroom: Math.round(num(set.headroom, 0, MAX_HEADROOM, 0)),
    });
  }
  // Shapes as saved, or for a scene from before shapes, by rule from its ground (with its water line).
  scene.shape = Array.isArray(s.shape) && s.shape.length === w * h && s.shape.every((n) => Number.isInteger(n) && n >= 0 && n < SHAPES)
    ? s.shape.slice() : Array.from(defaultShape(mapOf(scene)));
  // Faces of another material than their tops, kept only where some are: rock has no faces of its own.
  const side = Array.isArray(s.side) && s.side.length === w * h
    ? s.side.map((n, c) => (Number.isInteger(n) && n >= 0 && n <= BY_HEIGHT && !isRock(scene.levels[c]) ? n : 0)) : null;
  if (side?.some((n) => n > 0)) scene.side = side;
  for (const it of scene.items) if (it.item === 'hole') digHole(scene, it);
  refreshLinks(scene, sources);
  return scene;
}

/**
 * Makes the cell a hole object stands on a hole (ground.ts `HOLE`): the ground's own pit, the object only the ladder
 * down it and the way it leads. Holes from before shapes stood on any ground, drawn as a pit of their own; this
 * upgrades them as they are read, and the scene editor calls it where a hole is put down. The ladder leans on the
 * floor at the hole's back (its turn), or turns to the next floor round where there is none there.
 */
export function digHole(scene: Scene, it: PlacedItem): void {
  const i = Math.floor(it.i), j = Math.floor(it.j);
  if (i < 0 || j < 0 || i >= scene.w || j >= scene.h || isRock(scene.levels[j * scene.w + i])) return;
  if (!scene.shape) scene.shape = Array.from(defaultShape(mapOf(scene)));
  scene.shape[j * scene.w + i] = HOLE;
  const floor = (a: number, b: number) => a >= 0 && b >= 0 && a < scene.w && b < scene.h && !isRock(scene.levels[b * scene.w + a]) && scene.shape![b * scene.w + a] !== HOLE;
  const turn = it.turn ?? 0;
  for (let k = 0; k < 4; k++) {
    const t = (turn + k) % 4;
    const back = [[0, -1], [1, 0], [0, 1], [-1, 0]][t];
    if (!floor(i + back[0], j + back[1])) continue;
    if (t) it.turn = t;
    else delete it.turn;
    return;
  }
}

// ------------------------------------------------------------------ references

interface LinkSources {
  animals: { ref: string; name: string; animal: Animal }[];
  people: { id: string; name: string; state: State }[];
}

/** Everything a scene can refer to: the animals made in the animal editor and its presets, and the wardrobe's characters. */
function linkSources(): LinkSources {
  return {
    animals: [
      ...savedAnimals().map((a) => ({ ref: a.id, name: a.name, animal: a.animal })),
      ...PRESETS.map((p) => ({ ref: `preset:${p.id}`, name: p.name, animal: p.animal })),
    ],
    people: loadRoster(),
  };
}

/**
 * Brings every placed animal and character up to date with the thing it refers to, so editing
 * that in the animal editor or the wardrobe changes it in the scene too. One whose source is gone
 * keeps the look it last had. Only what differs is replaced, so unchanged things keep their
 * identity (and the pictures drawn for them). Says whether anything changed.
 */
export function refreshLinks(scene: Scene, sources = linkSources()): boolean {
  let changed = false;
  for (const a of scene.animals) {
    const src = a.ref === undefined ? undefined : sources.animals.find((c) => c.ref === a.ref);
    if (!src) continue;
    if (a.name !== src.name) { a.name = src.name; changed = true; }
    if (JSON.stringify(a.animal) !== JSON.stringify(src.animal)) { a.animal = structuredClone(src.animal); changed = true; }
  }
  const standard = defaultState();
  for (const p of scene.people) {
    if (p.ref === undefined) continue;
    const src = p.ref === '' ? { name: p.name, state: standard } : sources.people.find((c) => c.id === p.ref);
    if (!src) continue;
    if (p.name !== src.name) { p.name = src.name; changed = true; }
    if (JSON.stringify(p.state) !== JSON.stringify(src.state)) { p.state = structuredClone(src.state); changed = true; }
  }
  return changed;
}

// ------------------------------------------------------------------ storage

const STORAGE_KEY = 'pixel-scenes';

/** The editor's scenes: the one being edited, those open on its desk beside it (by id, the current one among them), and all of them. */
export interface Library { current: string; open: string[]; scenes: Scene[] }

/** The scenes saved here; the first visit gets one island to start with. Broken scenes are skipped. */
export function loadLibrary(firstName: string): Library {
  let scenes: Scene[] = [];
  let current = '';
  let open: string[] = [];
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && Array.isArray(saved.scenes)) {
      for (const s of saved.scenes) {
        try {
          scenes.push(cleanScene(s));
        } catch {
          // One unreadable scene does not take the others with it.
        }
      }
      current = typeof saved.current === 'string' ? saved.current : '';
      if (Array.isArray(saved.open)) open = saved.open.filter((id: unknown) => typeof id === 'string');
    }
  } catch {
    // Without storage the page starts with a fresh island.
  }
  if (!scenes.length) scenes = [createScene(firstName, 28, 28, true, 7)];
  if (!scenes.some((s) => s.id === current)) current = scenes[0].id;
  open = [...new Set(open)].filter((id) => scenes.some((s) => s.id === id));
  if (!open.includes(current)) open.push(current);
  return { current, open, scenes };
}

/** The ids of every prop kind a scene draws: its plants, items and props. */
const kindsUsed = (scene: Scene) => [...scene.plants.map((p) => p.plant), ...scene.items.filter((it) => !it.item.startsWith(OWN)).map((it) => `object:${it.item}`), ...(scene.props ?? []).map((p) => p.kind)];
/** A scene with what it carries brought up to date, for saving and export. */
export const withCarried = (scene: Scene): Scene => {
  const carried = carriedFor(kindsUsed(scene));
  const { carried: _, ...rest } = scene;
  return carried ? { ...rest, carried } : rest;
};

/** False when the browser refuses, so the page can warn that changes are not kept. */
export function saveLibrary(library: Library): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...library, scenes: library.scenes.map(withCarried) }));
    return true;
  } catch {
    return false;
  }
}

const FILE_TYPE = 'pixel-scene';
export const sceneFile = (scene: Scene) => JSON.stringify({ type: FILE_TYPE, version: 1, scene: withCarried(scene) });

export function readSceneFile(text: string): Scene {
  const data = JSON.parse(text);
  if (data?.type !== FILE_TYPE) throw new Error('not a scene file');
  return { ...cleanScene(data.scene), id: newId() };
}
