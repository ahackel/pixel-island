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
import { OWN, propOf, type PlacedItem } from './props.ts';
import { cleanBuild, type Build } from '../objects/object.ts';
import { carriedFor, cleanPlacedProp, useCarried, type Carried, type PlacedProp } from './prop.ts';
import { createHeightMap, generateIsland, MAX_LEVEL, MIN_LEVEL, PAINTS, type HeightMap } from './terrain.ts';

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
  /** Level per tile, row by row. */
  levels: number[];
  /** Painted surface per tile: 0 follows the height, otherwise `PAINTS[n - 1]`. */
  paint: number[];
  plants: PlacedPlant[];
  /** Starfish, shells and the like, lying on the ground. */
  decor: PlacedDecor[];
  animals: PlacedAnimal[];
  people: PlacedPerson[];
  /** Objects standing on the ground: crates (carried in Play), chests, and any other object. */
  items: PlacedItem[];
  /** The scene's own objects, made in the object editor, by `OWN` id: kept here so the scene stands on its own. */
  objects?: Record<string, Build>;
  /** Anything else standing on the ground, from the props library (engine/world/prop.ts). Missing in older scenes. */
  props?: PlacedProp[];
  /** The painted props and locked pixels it uses, so it draws the same in a game or on another device (see prop.ts). */
  carried?: Carried;
  spawn: { i: number; j: number };
  /** Set for a cave: all rock but what is carved open, seen into from the front (see cave.ts). */
  cave?: CaveSettings;
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

export const MIN_SIZE = 8;
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
  return { id: newId(), name, w, h, levels: Array.from(map.levels), paint: new Array(w * h).fill(0), plants: [], decor: [], animals: [], people: [], items: [], props: [], spawn: { i: w / 2, j: h / 2 } };
}

/** A new cave: solid rock all through, to be carved open (cave.ts `carve`). */
export function createCave(name: string, w: number, h: number): Scene {
  const scene = createScene(name, w, h, false);
  scene.levels.fill(MIN_LEVEL);
  scene.paint.fill(PAINTS.indexOf('cave') + 1);
  return { ...scene, cave: { ...CAVE_DEFAULTS, exits: [] } };
}

/** The scene's ground as the terrain code reads it. */
export const mapOf = (scene: Scene): HeightMap & { paint: Uint8Array } =>
  ({ w: scene.w, h: scene.h, levels: Int8Array.from(scene.levels), paint: Uint8Array.from(scene.paint) });

/** A scene with a new size, keeping what fits; new ground is sea. */
export function resized(scene: Scene, w: number, h: number): Scene {
  w = clamp(Math.round(w), MIN_SIZE, MAX_SIZE);
  h = clamp(Math.round(h), MIN_SIZE, MAX_SIZE);
  const levels = new Array(w * h).fill(MIN_LEVEL);
  // New ground is sea, or in a cave solid rock.
  const paint = new Array(w * h).fill(scene.cave ? PAINTS.indexOf('cave') + 1 : 0);
  for (let j = 0; j < Math.min(h, scene.h); j++) for (let i = 0; i < Math.min(w, scene.w); i++) {
    levels[j * w + i] = scene.levels[j * scene.w + i];
    paint[j * w + i] = scene.paint[j * scene.w + i];
  }
  return {
    ...scene, w, h, levels, paint,
    plants: scene.plants.filter((p) => p.i < w && p.j < h),
    decor: scene.decor.filter((d) => d.i < w && d.j < h),
    animals: scene.animals.filter((a) => a.i < w && a.j < h),
    items: scene.items.filter((it) => it.i < w && it.j < h),
    props: (scene.props ?? []).filter((p) => p.i < w && p.j < h),
    spawn: { i: Math.min(scene.spawn.i, w - 0.5), j: Math.min(scene.spawn.j, h - 0.5) },
    ...(scene.cave && { cave: { ...scene.cave, exits: scene.cave.exits.filter((e) => e.i < w && e.j < h) } }),
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
  const levels = s.levels.map((n) => clamp(Math.round(Number(n)) || 0, MIN_LEVEL, MAX_LEVEL));
  const paint = Array.isArray(s.paint) && s.paint.length === w * h
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
    }));
  // What the scene brought along first, so its props are known when they are checked.
  useCarried(s.carried);
  const props = (Array.isArray(s.props) ? s.props : []).map((p) => cleanPlacedProp(p, w, h)).filter((p): p is PlacedProp => !!p);
  const scene: Scene = {
    id: typeof s.id === 'string' && s.id ? s.id : newId(),
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 40) : s.cave ? 'Cave' : 'Island',
    w, h, levels, paint, plants, decor, animals, people, items, props,
    ...(Object.keys(objects).length && { objects }),
    spawn: { i: num(s.spawn?.i, 0, w, w / 2), j: num(s.spawn?.j, 0, h, h / 2) },
  };
  const c = s.cave;
  if (c && typeof c === 'object') {
    scene.cave = {
      tint: typeof c.tint === 'string' && /^#[0-9a-f]{6}$/i.test(c.tint) ? c.tint : CAVE_DEFAULTS.tint,
      dark: num(c.dark, 0, 1, CAVE_DEFAULTS.dark),
      rubble: num(c.rubble, 0, 1, CAVE_DEFAULTS.rubble),
      exits: (Array.isArray(c.exits) ? c.exits : []).filter((e) => !!e && typeof e === 'object').map((e) => ({ i: num(e.i, 0, w, w / 2), j: num(e.j, 0, h, h / 2) })),
    };
  }
  refreshLinks(scene, sources);
  return scene;
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

export interface Library { current: string; scenes: Scene[] }

/** The scenes saved here; the first visit gets one island to start with. Broken scenes are skipped. */
export function loadLibrary(firstName: string): Library {
  let scenes: Scene[] = [];
  let current = '';
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
    }
  } catch {
    // Without storage the page starts with a fresh island.
  }
  if (!scenes.length) scenes = [createScene(firstName, 28, 28, true, 7)];
  if (!scenes.some((s) => s.id === current)) current = scenes[0].id;
  return { current, scenes };
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
