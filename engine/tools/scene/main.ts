import './style.css';
import { frameDone, part } from '../../shared/stats.ts';
import { box, choice, library as tileLibrary, sidePanel, colorPicker, confirmDialog, field, fields, formDialog, iconPicture, numberField, pixelButton, searchField, slider as pixelSlider, textField, tileGrid, toast, toggle, type Option } from '../../ui/components.ts';
import { pixelCanvas } from '../../shared/pixel-ui.ts';
import { C } from '../../ui/theme.ts';
import { canSaveToProject, saveToProject } from '../../shared/project.ts';
import { defaultState, download, loadRoster, lookOf, pickFile, type Saved } from '../../engine/character/character.ts';
import { FRAMES } from '../../engine/flora/flora.ts';
import { FLORA, plantById } from '../../engine/flora/flora-catalog.ts';
import { castShadow, footOf, layShadow, ROOM, stamp, withSunShadow, type Picture } from '../../engine/world/island.ts';
import { heightAt, inside, levelAt, MAX_LEVEL, MIN_LEVEL, PAINTS, SEA_LEVEL, setLevel, standingHeight, surfaceAt, TILE_H, TILE_W } from '../../engine/world/terrain.ts';
import { Actor, EMOTES, type Carried, type Emote } from '../../engine/world/actor.ts';
import { CARRIED, itemPicture, LINKING, nameLink, openFrames, OWN, type PlacedItem } from '../../engine/world/props.ts';
import { OBJECT_PRESETS } from '../../engine/objects/object-presets.ts';
import { savedProps, type Build } from '../../engine/objects/object.ts';
import { LOOT } from '../../engine/world/loot.ts';
import { Herd } from '../../engine/world/herd.ts';
import { findPath } from '../../engine/world/path.ts';
import {
  CAVE_DEFAULTS, CAVE_OPEN, createCave, createScene, loadLibrary, MAX_SIZE, MIN_SIZE, readSceneFile, refreshLinks, resized, saveLibrary, sceneFile, SEEDS, TURNS, type PlacedPerson, type PlacedPlant, type Scene,
} from '../../engine/world/scene.ts';
import { grows, rasterOf, smooth, World, type Rect, type Thing } from '../../engine/world/world.ts';
import { DECOR, decorById, decorPixels } from '../../engine/world/decor.ts';
import { carve, caveLamps, caveThings, caveTint, CAVE_DAY, flicker } from '../../engine/world/cave.ts';
import { lightByTile } from '../../engine/world/daylight.ts';
import { isHidden, propKind, propKinds, propPicture, variantsOf } from '../../engine/world/prop.ts';
import { pictureCache, trimmed } from '../../shared/pixels.ts';
import { CLIPS, drawAnimal, savedAnimals, type Animal } from '../../engine/animals/animal.ts';
import { drawCharacter, FACING_RING, SPRITE_H, SPRITE_W, turnFacing, type Facing } from '../../engine/core/puppet.ts';
import { AUTHORED, STAND } from '../../engine/core/poses.ts';
import { PRESETS } from '../../engine/animals/animal-presets.ts';
import { ocean } from '../../engine/world/ocean.ts';
import { plantName } from '../flora/i18n.ts';
import { roundBrush } from '../../shared/brush.ts';
import { h, nameTag, topBar, word } from '../../shared/shell.ts';
import { currentLang } from '../../shared/lang.ts';
import { t, type Key } from './i18n.ts';

// The scene editor: build a scene's ground and plants in Edit, walk around it with a saved
// character in Play. Scenes, and the editor's own settings, are kept in this browser.

// ------------------------------------------------------------------ settings

/** Tints of a cave's dark to choose from: night blue first (the default), then deep green, purple, red-brown, brown and black. */
const CAVE_TINTS = [CAVE_DEFAULTS.tint, '#0a3a3a', '#2a1060', '#501010', '#3a2a08', '#000000'];

const TOOLS = ['move', 'raise', 'lower', 'smooth', 'level', 'paint', 'carve', 'prop', 'plant', 'decor', 'animal', 'person', 'item', 'erase', 'spawn', 'exit'] as const;
type Tool = (typeof TOOLS)[number];
/** An island's ground is shaped by height and paint; a cave's is carved out of the rock and has ways out. */
const CAVE_ONLY: Tool[] = ['carve', 'exit'];
const ISLAND_ONLY: Tool[] = ['raise', 'lower', 'smooth', 'level'];
const toolsHere = () => TOOLS.filter((tool) => !(sceneNow().cave ? ISLAND_ONLY : CAVE_ONLY).includes(tool));
const BRUSHED: Tool[] = ['raise', 'lower', 'smooth', 'level', 'paint', 'carve', 'erase'];
const ZOOM = { min: 1, max: 8 };
const BRUSH_MAX = 7;
/** Each tool's icon in the pixel library. */
const TOOL_ICONS: Record<Tool, string> = {
  move: 'pointer', raise: 'raise', lower: 'lower', smooth: 'smooth', level: 'flat', paint: 'brush', carve: 'pickaxe', prop: 'tool', exit: 'door', plant: 'palm', decor: 'shell', animal: 'paw', person: 'person', item: 'box', erase: 'eraser', spawn: 'flag',
};

interface Prefs {
  mode: 'edit' | 'play';
  tool: Tool;
  /** 0 by height, otherwise `PAINTS[n - 1]`. */
  paint: number;
  /** Brush size in tiles across, 1 to 7; the brush is round. */
  brush: number;
  plant: string;
  /** A prop kind id: what the Props tool sets down, and what its search box holds. */
  prop: string;
  propQuery: string;
  /** A `DECOR` id: what the Decor tool lays down. */
  decor: string;
  /** What the Object tool sets down: an object preset id, or `OWN` and an object editor id. */
  item: string;
  /** Which way it faces, in quarter turns: the way the last object was turned. */
  itemTurn: number;
  /** What the Animal tool sets down: a saved animal's id, or `preset:` and a preset id. */
  animal: string;
  /** A saved character id, or '' for the default one. */
  character: string;
  /** Who the Person tool sets down: a saved character id, or '' for the default one. */
  person: string;
  /** Held pose for the Person tool's next characters: a clip name, or '' for alive and roaming; and the frame of it. */
  pose: string;
  poseFrame: number;
  /** Which side the scene is seen from: quarter turns, 0 to 3. */
  rot: number;
  /** Tile lines on the ground while editing. */
  grid: boolean;
  /** What stops a walker drawn in red. */
  colliders: boolean;
  /** Frames per second under the zoom buttons. */
  fps: boolean;
  /** A cave evenly lit while editing, rather than as dark as in Play. */
  bright: boolean;
}
const PREFS_KEY = 'pixel-scenes-ui';
function loadPrefs(): Prefs {
  const prefs: Prefs = { mode: 'edit', tool: 'raise', paint: 2, brush: 1, plant: FLORA.find((e) => e.category === 'palm')?.id ?? FLORA[0].id, prop: propKinds()[0]?.id ?? '', propQuery: '', decor: DECOR[0].id, item: 'crate', itemTurn: 0, animal: `preset:${PRESETS[0].id}`, character: '', person: '', pose: '', poseFrame: 0, rot: 0, grid: false, colliders: false, fps: false, bright: false };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    if (saved?.mode === 'edit' || saved?.mode === 'play') prefs.mode = saved.mode;
    if (TOOLS.includes(saved?.tool)) prefs.tool = saved.tool;
    if (Number.isInteger(saved?.paint) && saved.paint >= 0 && saved.paint <= PAINTS.length) prefs.paint = saved.paint;
    if (Number.isInteger(saved?.brush) && saved.brush >= 1 && saved.brush <= BRUSH_MAX) prefs.brush = saved.brush;
    if (plantById(saved?.plant)) prefs.plant = saved.plant;
    if (decorById(saved?.decor)) prefs.decor = saved.decor;
    if (typeof saved?.item === 'string') prefs.item = saved.item;
    if ([0, 1, 2, 3].includes(saved?.itemTurn)) prefs.itemTurn = saved.itemTurn;
    if (propKind(saved?.prop)) prefs.prop = saved.prop;
    if (typeof saved?.propQuery === 'string') prefs.propQuery = saved.propQuery.slice(0, 60);
    if (typeof saved?.animal === 'string') prefs.animal = saved.animal;
    if (typeof saved?.character === 'string') prefs.character = saved.character;
    if (typeof saved?.person === 'string') prefs.person = saved.person;
    if (typeof saved?.pose === 'string' && (saved.pose === '' || AUTHORED[saved.pose])) prefs.pose = saved.pose;
    if (Number.isInteger(saved?.poseFrame) && saved.poseFrame >= 0) prefs.poseFrame = saved.poseFrame;
    if ([0, 1, 2, 3].includes(saved?.rot)) prefs.rot = saved.rot;
    prefs.grid = saved?.grid === true;
    prefs.colliders = saved?.colliders === true;
    prefs.fps = saved?.fps === true;
    prefs.bright = saved?.bright === true;
  } catch {
    // Settings are a convenience; without storage the defaults apply.
  }
  return prefs;
}
const prefs = loadPrefs();
function savePrefs(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore: they then last for this visit.
  }
}

// ------------------------------------------------------------------ scenes

const library = loadLibrary(t('scene.first'));
const sceneNow = () => library.scenes.find((s) => s.id === library.current)!;
let world = new World(sceneNow(), prefs.rot);
let groundDirty = false;
let version = 0;

/** A scene as text to compare, without its id (a new one on every import). */
const canon = (scene: Scene): string => {
  const file = JSON.parse(sceneFile(scene));
  delete file.scene.id;
  return JSON.stringify(file);
};
/** The scene shown as it was last stored, and each project scene file (by name) as it reads back: they differ when there is something to save. */
let current = '';
const projectCanon = new Map<string, string>();
let saveTimer = 0;
function store(): void {
  clearTimeout(saveTimer);
  saveTimer = 0;
  // The ground is copied to the scene when it is redrawn, which may not have happened yet.
  world.commit();
  current = canon(sceneNow());
  if (!saveLibrary(library)) say(t('scene.saveFailed'));
}
/** After any change to the scene: saved shortly after, so a drag is one write. */
function sceneChanged(): void {
  version++;
  syncUndo();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(store, 400);
}
// Nothing made in the last moment before closing is lost.
window.addEventListener('pagehide', () => saveTimer && store());

/** The scene as it was before each of the last edits, to step back to. */
const undoStack: Scene[] = [];
const UNDO_MAX = 40;
/** The scenes undone, to step forward to again; any new edit empties it. */
const redoStack: Scene[] = [];
let barUndo: HTMLButtonElement | null = null;
let barRedo: HTMLButtonElement | null = null;
const syncUndo = () => {
  if (barUndo) barUndo.disabled = !undoStack.length;
  if (barRedo) barRedo.disabled = !redoStack.length;
};
/** Keeps the scene as it is now, before an edit changes it. */
function remember(): void {
  world.commit();
  redoStack.length = 0;
  undoStack.push(structuredClone(world.scene));
  if (undoStack.length > UNDO_MAX) undoStack.shift();
}
/** Shows `scene` in place of the current one (the same scene as it was before or after an edit). */
function show(scene: Scene): void {
  library.scenes[library.scenes.findIndex((s) => s.id === scene.id)] = scene;
  world = new World(scene, prefs.rot);
  selected = null;
  sceneChanged();
  showOptions();
}
function undo(): void {
  const before = undoStack.pop();
  if (!before) return;
  world.commit();
  redoStack.push(structuredClone(world.scene));
  show(before);
}
function redo(): void {
  const after = redoStack.pop();
  if (!after) return;
  world.commit();
  undoStack.push(structuredClone(world.scene));
  show(after);
}

function switchTo(scene: Scene): void {
  if (saveTimer) store();
  undoStack.length = 0;
  redoStack.length = 0;
  if (!library.scenes.includes(scene)) library.scenes.push(scene);
  library.current = scene.id;
  selected = null;
  world = new World(scene, prefs.rot);
  store();
  centerOn(world.toView(scene.spawn));
  if (prefs.mode === 'play') startPlay();
  version++;
  render();
}

// ------------------------------------------------------------------ page helpers

/** Saves the scene as a file of the project (the game's content/scenes), for committing. */
async function saveScene(): Promise<boolean> {
  store();
  const name = slug(sceneNow().name);
  const ok = await saveToProject(`scenes/${name}.json`, JSON.parse(sceneFile(sceneNow())));
  if (ok) projectCanon.set(name, current);
  say(ok ? t('scene.projectDone').replace('{0}', name) : t('scene.projectFail'));
  return ok;
}

function say(text: string): void {
  if (text) toast(text, 5000);
}

// ------------------------------------------------------------------ view

const viewport = h('div', { class: 'viewport' });
const canvas = h('canvas', { class: 'viewport__canvas' });
canvas.setAttribute('role', 'img');
const ctx = canvas.getContext('2d')!;
let zoom = 3;
const cam = { x: 0, y: 0 };
let vw = 1;
let vh = 1;

function fitCanvas(): void {
  const box = viewport.getBoundingClientRect();
  vw = Math.max(1, Math.ceil(box.width / zoom));
  vh = Math.max(1, Math.ceil(box.height / zoom));
  canvas.width = vw;
  canvas.height = vh;
  canvas.style.width = `${vw * zoom}px`;
  canvas.style.height = `${vh * zoom}px`;
  version++;
}
const clampZoom = (z: number) => Math.max(ZOOM.min, Math.min(ZOOM.max, z));
/** Where the zoom is heading; the view eases toward it each frame. */
let zoomTarget = zoom;
let zoomAnchor: { x: number; y: number } | null = null;
function setZoom(next: number): void {
  zoom = zoomTarget = clampZoom(next);
  fitCanvas();
}
/** Sets the zoom, keeping the ground under the given screen point (default: the view's centre) in place. */
function zoomAt(next: number, at: { x: number; y: number } | null): void {
  next = clampZoom(next);
  if (next === zoom) return;
  if (at) {
    const box = viewport.getBoundingClientRect();
    const dx = at.x - (box.left + box.width / 2);
    const dy = at.y - (box.top + box.height / 2);
    cam.x += dx / zoom - dx / next;
    cam.y += dy / zoom - dy / next;
  }
  zoom = next;
  fitCanvas();
}
/** Steps the zoom toward its target. */
function easeZoom(dt: number): void {
  if (zoom === zoomTarget) return;
  const next = zoom + (zoomTarget - zoom) * (1 - Math.exp(-14 * dt));
  zoomAt(Math.abs(zoomTarget - next) < 0.005 ? zoomTarget : next, zoomAnchor);
}
function stepZoom(by: number): void {
  zoomTarget = clampZoom(Math.round(zoomTarget) + by);
  zoomAnchor = null;
}
const viewRect = (): Rect => ({ x: Math.round(cam.x - vw / 2), y: Math.round(cam.y - vh / 2), w: vw, h: vh });
function centerOn(at: { i: number; j: number }): void {
  const p = world.screenOf(at.i, at.j);
  cam.x = p.x;
  cam.y = p.y - 16;
}

/** The pixel of the ground image under a pointer. */
function groundPixel(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const box = canvas.getBoundingClientRect();
  const view = viewRect();
  return { x: (e.clientX - box.left) / zoom + view.x, y: (e.clientY - box.top) / zoom + view.y };
}
const tileUnder = (e: { clientX: number; clientY: number }) => {
  const p = groundPixel(e);
  return world.tileAt(p.x, p.y);
};

/** The start point, shown while editing: a small flag. */
const FLAG: Picture = {
  get: (x, y) => (x === 0 && y < 12 ? '#3a2a2a' : x >= 1 && x <= 5 && y < 4 ? '#e0533d' : null),
};

// ------------------------------------------------------------------ editing

let hover: { i: number; j: number } | null = null;

function brushCells(at: { i: number; j: number }, tool = prefs.tool): number[] {
  const size = BRUSHED.includes(tool) ? prefs.brush : 1;
  return roundBrush(size).filter(([di, dj]) => inside(world.map, at.i + di, at.j + dj)).map(([di, dj]) => (at.j + dj) * world.map.w + at.i + di);
}

/** Whether the tool would do nothing on a tile, so the brush shows red there. */
function cannotEdit(at: { i: number; j: number }): boolean {
  switch (prefs.tool) {
    case 'plant':
      return !grows(world.map, prefs.plant, at.i + 0.5, at.j + 0.5);
    case 'spawn':
    case 'animal':
    case 'person':
      return levelAt(world.map, at.i, at.j) < SEA_LEVEL;
    case 'decor':
      return !decorFits(at);
    case 'item':
      return levelAt(world.map, at.i, at.j) < SEA_LEVEL;
    case 'prop': {
      const kind = propKind(prefs.prop);
      if (kind?.place === 'plant') return !grows(world.map, kind.id, at.i + 0.5, at.j + 0.5);
      if (kind?.place === 'decor') return levelAt(world.floor, at.i, at.j) < DECOR_DEPTH;
      return levelAt(world.map, at.i, at.j) < SEA_LEVEL;
    }
    case 'raise':
      return brushCells(at).every((c) => world.map.levels[c] >= MAX_LEVEL);
    case 'lower':
      return brushCells(at).every((c) => world.map.levels[c] <= MIN_LEVEL);
    case 'exit':
      return levelAt(world.map, at.i, at.j) < SEA_LEVEL;
    default:
      return false;
  }
}

/** The ground-image pixel under the pointer when the tool last worked, for picking plants by their picture. */
let pointerPixel: { x: number; y: number } | null = null;

function placePlant(at: { i: number; j: number }, placed: Set<PlacedPlant>): void {
  const entry = plantById(prefs.plant)!;
  // Over a plant's picture, the new plant takes its place; otherwise it goes somewhere in the tile.
  const under = pointerPixel ? world.plantAt(pointerPixel.x, pointerPixel.y) : null;
  const spot = under && !placed.has(under) ? world.toView(under) : null;
  const i = spot ? spot.i : at.i + 0.2 + Math.random() * 0.6;
  const j = spot ? spot.j : at.j + 0.2 + Math.random() * 0.6;
  if (!grows(world.map, entry.id, i, j)) {
    say(t('plant.cannot', { plant: plantName(entry.id, entry.label), ground: t(`surface.${surfaceAt(world.map, Math.floor(i), Math.floor(j))}` as Key) }));
    return;
  }
  // Planting where plants already stand replaces them, except ones set down earlier in the same drag.
  const seen = world.viewPlants();
  const near = new Set(world.scene.plants.filter((p, k) => p === under || Math.hypot(seen[k].vi - i, seen[k].vj - j) < (ROOM[plantById(seen[k].plant)!.category] + ROOM[entry.category]) * 0.45));
  if ([...near].some((p) => placed.has(p))) return;
  world.scene.plants = world.scene.plants.filter((p) => !near.has(p));
  const plant = { plant: entry.id, ...world.toData({ i, j }), seed: Math.floor(Math.random() * SEEDS), size: 0.85 + Math.random() * 0.3, turn: Math.floor(Math.random() * TURNS) };
  world.scene.plants.push(plant);
  placed.add(plant);
}

/** Decorations lie on land and on the sea floor down to this level, where the water still shows them. */
const DECOR_DEPTH = SEA_LEVEL - 2;

/** Where on a tile a thing hung on a wall goes: just in front of the wall at its back, if it has one. */
function onWall(at: { i: number; j: number }): { i: number; j: number } | null {
  const rock = (i: number, j: number) => !inside(world.map, i, j) || levelAt(world.map, i, j) < SEA_LEVEL;
  if (rock(at.i, at.j - 1)) return { i: at.i + 0.5, j: at.j + 0.28 };
  if (rock(at.i - 1, at.j)) return { i: at.i + 0.28, j: at.j + 0.5 };
  return null;
}

/** Decorations lie on land and the sea floor near it; in a cave only on its floor, not in the rock. */
const decorFits = (at: { i: number; j: number }) =>
  world.scene.cave ? levelAt(world.map, at.i, at.j) >= SEA_LEVEL : levelAt(world.floor, at.i, at.j) >= DECOR_DEPTH;

function placeDecor(at: { i: number; j: number }): void {
  if (!decorFits(at)) return;
  if (decorById(prefs.decor)?.lift) {
    const spot = onWall(at);
    if (!spot) return say(t('decor.wall'));
    if (world.viewDecor().some((d) => Math.hypot(d.vi - spot.i, d.vj - spot.j) < 0.4)) return;
    world.scene.decor.push({ decor: prefs.decor, ...world.toData(spot) });
    return;
  }
  const i = at.i + 0.15 + Math.random() * 0.7;
  const j = at.j + 0.15 + Math.random() * 0.7;
  if (world.viewDecor().some((d) => Math.hypot(d.vi - i, d.vj - j) < 0.2)) return;
  world.scene.decor.push({ decor: prefs.decor, ...world.toData({ i, j }) });
}

/** The animals made in the animal editor, then its presets; read again each time the picker shows, since that editor may be open in another tab. */
function animalChoices(): { id: string; name: string; animal: Animal }[] {
  return [...savedAnimals(), ...PRESETS.map((p) => ({ ...p, id: `preset:${p.id}` }))];
}

function placeAnimal(at: { i: number; j: number }): void {
  if (levelAt(world.map, at.i, at.j) < SEA_LEVEL) return say(t('animal.cannot'));
  const choices = animalChoices();
  const choice = choices.find((c) => c.id === prefs.animal) ?? choices[0];
  const i = at.i + 0.5;
  const j = at.j + 0.5;
  // An animal set down on another's tile takes its place.
  const seen = world.viewAnimals();
  world.scene.animals = world.scene.animals.filter((_, k) => Math.floor(seen[k].vi) !== at.i || Math.floor(seen[k].vj) !== at.j);
  world.scene.animals.push({ name: choice.name, animal: structuredClone(choice.animal), ref: choice.id, ...world.toData({ i, j }), facing: Math.floor(Math.random() * 8) as Facing });
}

/** The characters made in the wardrobe, after the default one; read again each time, since the wardrobe may be open in another tab. */
function personChoices(): Saved[] {
  return [{ id: '', name: t('character.default'), state: defaultState() }, ...loadRoster()];
}

/** A character in the middle of a tile, on land; one per tile. */
function placePerson(at: { i: number; j: number }): void {
  if (levelAt(world.map, at.i, at.j) < SEA_LEVEL) return;
  const choice = personChoices().find((c) => c.id === prefs.person) ?? personChoices()[0];
  const seen = world.scene.people.map((p) => world.toView(p));
  world.scene.people = world.scene.people.filter((_, k) => Math.floor(seen[k].i) !== at.i || Math.floor(seen[k].j) !== at.j);
  world.scene.people.push({ name: choice.name, state: structuredClone(choice.state), ref: choice.id, ...world.toData({ i: at.i + 0.5, j: at.j + 0.5 }), turn: Math.floor(Math.random() * 4), ...(prefs.pose && { pose: { clip: prefs.pose, frame: Math.min(prefs.poseFrame, AUTHORED[prefs.pose].frames.length - 1) } }) });
}

/** Each placed character is drawn by an actor of its own; in Edit it stands where it was placed. */
const extras = new WeakMap<PlacedPerson, { actor: Actor; state: PlacedPerson['state'] }>();
function personActor(p: PlacedPerson): Actor {
  let e = extras.get(p);
  if (!e) extras.set(p, (e = { actor: new Actor(lookOf(p.state), p), state: p.state }));
  // The character was edited in the wardrobe: it keeps its place and gets the new look.
  else if (e.state !== p.state) { e.actor.setLook(lookOf(p.state)); e.state = p.state; }
  return e.actor;
}
/** Puts a character's actor back where and as it was placed. */
function standAtHome(p: PlacedPerson): Actor {
  const a = personActor(p);
  a.frozen = p.pose ?? null;
  Object.assign(a, world.toView(p));
  a.facing = turnFacing(0, 2 * (p.turn + prefs.rot));
  a.heading = (p.turn + prefs.rot) * (Math.PI / 2);
  return a;
}
function personThing(p: PlacedPerson, ms: number): Thing {
  return (prefs.mode === 'play' ? personActor(p) : standAtHome(p)).thing(world, ms);
}

/**
 * In Play the characters roam as the animals do: rest a while, then walk to a spot near where they
 * were placed. Home and target are in scene coordinates, so turning the view does not move them.
 */
const ROAM = { far: 2.5, rest: [3, 9] };
const roaming = new Map<PlacedPerson, { target: { i: number; j: number } | null; until: number }>();
function roam(dt: number, ms: number): void {
  for (const p of world.scene.people) {
    const a = personActor(p);
    a.frozen = p.pose ?? null;
    // A prop stays where it is.
    if (p.pose) continue;
    let r = roaming.get(p);
    if (!r) roaming.set(p, (r = { target: null, until: ms + ROAM.rest[0] * 1000 * Math.random() }));
    if (!r.target && ms >= r.until) {
      const angle = Math.random() * Math.PI * 2;
      const far = ROAM.far * Math.sqrt(Math.random());
      r.target = { i: p.i + Math.cos(angle) * far, j: p.j + Math.sin(angle) * far };
    }
    let di = 0, dj = 0;
    if (r.target) {
      const v = world.toView(r.target);
      di = v.i - a.i;
      dj = v.j - a.j;
    }
    const before = [a.i, a.j];
    a.update(world, dt, di, dj, false, ms);
    // Arrived, or the way is blocked: rest.
    if (r.target && (Math.hypot(di, dj) < 0.08 || (before[0] === a.i && before[1] === a.j))) {
      r.target = null;
      r.until = ms + (ROAM.rest[0] + Math.random() * (ROAM.rest[1] - ROAM.rest[0])) * 1000;
    }
  }
}

/** The objects to pick from: every preset, then the ones made in the object editor (read each time, as it may be open in another tab). */
function objectChoices(): { id: string; name: string; prop: Build }[] {
  return [...OBJECT_PRESETS.map((p) => ({ id: p.id, name: p.name, prop: p.prop })), ...savedProps().map((s) => ({ id: OWN + s.id, name: s.name, prop: s.prop }))];
}

/** An object in the middle of a tile, on land, facing the way the last one was turned; one per tile. */
function placeItem(at: { i: number; j: number }): void {
  if (levelAt(world.map, at.i, at.j) < SEA_LEVEL) return;
  const seen = world.viewItems();
  world.scene.items = world.scene.items.filter((_, k) => Math.floor(seen[k].vi) !== at.i || Math.floor(seen[k].vj) !== at.j);
  const choice = objectChoices().find((c) => c.id === prefs.item) ?? objectChoices()[0];
  // One of the object editor's goes into the scene with its parts, so the scene stands on its own.
  if (choice.id.startsWith(OWN)) world.scene.objects = { ...world.scene.objects, [choice.id]: choice.prop };
  const placed: PlacedItem = { item: choice.id, ...world.toData({ i: at.i + 0.5, j: at.j + 0.5 }), ...(prefs.itemTurn && { turn: prefs.itemTurn }) };
  nameLink(world.scene.items, placed);
  world.scene.items.push(placed);
}

/** The way the last prop set down was turned, in eighths: the next one is turned the same way. */
let propTurn = 0;
/**
 * Sets down the prop picked in the library. Plants, decorations and the crate go into their own
 * lists, as their own tools put them; everything else is a placed prop in the middle of the tile.
 */
function placeProp(at: { i: number; j: number }, placed: Set<PlacedPlant>): void {
  const kind = propKind(prefs.prop);
  if (!kind) return;
  if (kind.place === 'plant') {
    const was = prefs.plant;
    prefs.plant = kind.id;
    placePlant(at, placed);
    prefs.plant = was;
    return;
  }
  if (kind.place === 'decor') {
    const was = prefs.decor;
    prefs.decor = kind.id.replace(/^decor:/, '');
    placeDecor(at);
    prefs.decor = was;
    return;
  }
  if (kind.place === 'item') {
    // Every object goes into the scene's items, as they open, hold loot and turn by quarter turns there.
    const was = prefs.item;
    prefs.item = kind.id.startsWith('my-object:') ? OWN + kind.id.slice('my-object:'.length) : kind.id.replace(/^object:/, '');
    placeItem(at);
    prefs.item = was;
    return;
  }
  if (levelAt(world.map, at.i, at.j) < SEA_LEVEL) return;
  const seen = world.viewProps();
  const list = world.scene.props ?? [];
  world.scene.props = list.filter((_, k) => Math.floor(seen[k].vi) !== at.i || Math.floor(seen[k].vj) !== at.j);
  // Small painted things land anywhere in the tile; built ones in its middle, where their footprint fits.
  const jitter = kind.build ? 0 : 0.5;
  const i = at.i + 0.5 + (Math.random() - 0.5) * jitter, j = at.j + 0.5 + (Math.random() - 0.5) * jitter;
  // Turned as seen: the view's quarter turns are taken off, so it faces the same way on screen.
  world.scene.props.push({ kind: kind.id, ...world.toData({ i, j }), turn: (((propTurn - world.rot * 2) % 8) + 8) % 8, seed: Math.floor(Math.random() * variantsOf(kind)), size: 1 });
}

/**
 * Applies the tool once to a tile. `stroke.touched` keeps a drag from raising, lowering or
 * painting a tile twice; smoothing works again on every tile the drag enters, and levelling
 * keeps to the height of the tile the drag started on.
 */
function apply(at: { i: number; j: number }, stroke: { touched: Set<number>; level?: number; placed?: Set<PlacedPlant>; alt?: true }): void {
  const map = world.map;
  const fresh = brushCells(at).filter((c) => !stroke.touched.has(c));
  fresh.forEach((c) => stroke.touched.add(c));
  const tile = (c: number): [number, number] => [c % map.w, Math.floor(c / map.w)];
  switch (prefs.tool) {
    case 'smooth':
      smooth(map, brushCells(at));
      groundDirty = true;
      break;
    case 'level':
      stroke.level ??= levelAt(map, at.i, at.j);
      for (const c of brushCells(at)) setLevel(map, ...tile(c), stroke.level);
      groundDirty = true;
      break;
    case 'raise':
    case 'lower':
      for (const c of fresh) setLevel(map, c % map.w, Math.floor(c / map.w), map.levels[c] + (prefs.tool === 'raise' ? 1 : -1));
      groundDirty ||= fresh.length > 0;
      break;
    case 'paint':
      for (const c of fresh) map.paint[c] = prefs.paint;
      groundDirty ||= fresh.length > 0;
      break;
    case 'carve':
      // Alt carves back to rock.
      groundDirty = carve(map, fresh, !stroke.alt) || groundDirty;
      break;
    case 'exit':
      if (fresh.length) toggleExit(at);
      break;
    case 'plant':
      if (fresh.length) placePlant(at, (stroke.placed ??= new Set()));
      break;
    case 'decor':
      if (fresh.length) placeDecor(at);
      break;
    case 'animal':
      if (fresh.length) placeAnimal(at);
      break;
    case 'person':
      if (fresh.length) placePerson(at);
      break;
    case 'item':
      if (fresh.length) placeItem(at);
      break;
    case 'prop':
      if (fresh.length) placeProp(at, (stroke.placed ??= new Set()));
      break;
    case 'erase': {
      const cells = new Set(brushCells(at));
      const kept = <T>(list: T[], seen: { vi: number; vj: number }[]) => list.filter((_, k) => !cells.has(Math.floor(seen[k].vj) * map.w + Math.floor(seen[k].vi)));
      world.scene.plants = kept(world.scene.plants, world.viewPlants());
      world.scene.decor = kept(world.scene.decor, world.viewDecor());
      world.scene.animals = kept(world.scene.animals, world.viewAnimals());
      world.scene.people = kept(world.scene.people, world.scene.people.map((p) => { const v = world.toView(p); return { vi: v.i, vj: v.j }; }));
      world.scene.items = kept(world.scene.items, world.viewItems());
      if (world.scene.cave) world.scene.cave.exits = kept(world.scene.cave.exits, world.scene.cave.exits.map((e) => { const v = world.toView(e); return { vi: v.i, vj: v.j }; }));
      world.scene.props = kept(world.scene.props ?? [], world.viewProps());
      break;
    }
    case 'spawn':
      world.scene.spawn = world.toData({ i: at.i + 0.5, j: at.j + 0.5 });
      break;
  }
  sceneChanged();
}

/** A way out of the cave on a tile of floor, or none there any more if it had one. */
function toggleExit(at: { i: number; j: number }): void {
  const cave = world.scene.cave;
  if (!cave || levelAt(world.map, at.i, at.j) < SEA_LEVEL) return;
  const here = (e: { i: number; j: number }) => { const v = world.toView(e); return Math.floor(v.i) === at.i && Math.floor(v.j) === at.j; };
  if (cave.exits.some(here)) cave.exits = cave.exits.filter((e) => !here(e));
  else cave.exits.push(world.toData({ i: at.i + 0.5, j: at.j + 0.5 }));
}

/** A way out, shown while editing: a little patch of daylight. */
const EXIT_MARK: Picture = {
  get: (x, y) => (Math.abs(x - 3) + Math.abs(y - 3) > 3 ? null : Math.abs(x - 3) + Math.abs(y - 3) === 3 ? '#5a6a86' : CAVE_DAY),
};

/** A placed thing the Move tool holds: the object in the scene (data coordinates) and what it is. */
type Selected = { kind: 'plant' | 'decor' | 'animal' | 'person' | 'item' | 'prop' | 'spawn'; obj: { i: number; j: number } };
let selected: Selected | null = null;

/** Takes a placed thing out of the scene. */
function removeObject(gone: object): void {
  const s = world.scene;
  s.plants = s.plants.filter((p) => p !== gone);
  s.decor = s.decor.filter((d) => d !== gone);
  s.animals = s.animals.filter((a) => a !== gone);
  s.people = s.people.filter((p) => p !== gone);
  s.items = s.items.filter((it) => it !== gone);
  s.props = (s.props ?? []).filter((p) => p !== gone);
}

/** A copy of a placed thing, in the scene at the same place (the flag cannot be copied). */
function duplicate(sel: Selected): Selected | null {
  const s = world.scene;
  const copy = structuredClone(sel.obj);
  const list = { plant: s.plants, decor: s.decor, animal: s.animals, person: s.people, item: s.items, prop: s.props }[sel.kind as Exclude<Selected['kind'], 'spawn'>] as object[] | undefined;
  if (!list) return null;
  if (sel.kind === 'item') { const it = copy as PlacedItem; delete it.id; delete it.to; nameLink(s.items, it); } // a copy is another way, not the same one
  list.push(copy);
  return { kind: sel.kind, obj: copy };
}

/** The placed thing under a ground-image pixel, the front-most; decorations lie flat, so they come last. */
function objectAt(x: number, y: number): Selected | null {
  const s = world.toView(world.scene.spawn);
  const flag = world.screenOf(s.i, s.j);
  const found: [Selected, { i: number; j: number }, boolean][] = [
    ...world.scene.animals.map((a, k): [Selected, { i: number; j: number }, boolean] => {
      const thing = world.animalSprite(a, k, 0);
      return [{ kind: 'animal', obj: a }, thing.spot, covers(thing, x, y)];
    }),
    ...world.scene.people.map((p): [Selected, { i: number; j: number }, boolean] => {
      const thing = personThing(p, 0);
      return [{ kind: 'person', obj: p }, thing.spot, covers(thing, x, y)];
    }),
    ...world.itemThings().map((thing, k): [Selected, { i: number; j: number }, boolean] => [{ kind: 'item', obj: world.scene.items[k] }, thing.spot, covers(thing, x, y)]),
    ...world.propThings(0).map((thing, k): [Selected, { i: number; j: number }, boolean] => [{ kind: 'prop', obj: world.scene.props![k] }, thing.spot, covers(thing, x, y)]),
    [{ kind: 'spawn', obj: world.scene.spawn }, s, x >= flag.x - 1 && x <= flag.x + 6 && y >= flag.y - 13 && y <= flag.y + 1],
  ];
  const plant = world.plantAt(x, y);
  if (plant) found.push([{ kind: 'plant', obj: plant }, world.toView(plant), true]);
  let best: Selected | null = null;
  let front = -Infinity;
  for (const [sel, at, hit] of found) if (hit && at.i + at.j > front) [best, front] = [sel, at.i + at.j];
  if (best) return best;
  const decor = world.viewDecor().findIndex((d) => {
    const at = footOf(world.ground, { i: d.vi, j: d.vj, level: heightAt(world.floor, d.vi, d.vj) });
    return Math.abs(x - at.x) <= 3 && Math.abs(y - at.y) <= 3;
  });
  return decor >= 0 ? { kind: 'decor', obj: world.scene.decor[decor] } : null;
}

/** Whether a selected thing may stand at a view point: the same rules as setting it down. */
function canStand(sel: Selected, at: { i: number; j: number }): boolean {
  const i = Math.floor(at.i);
  const j = Math.floor(at.j);
  if (!inside(world.map, i, j)) return false;
  if (sel.kind === 'plant') return grows(world.map, (sel.obj as PlacedPlant).plant, at.i, at.j);
  if (sel.kind === 'decor') return decorFits({ i, j });
  return levelAt(world.map, i, j) >= SEA_LEVEL;
}

/**
 * The view point under a ground-image pixel: the tile drawn there, and within it the spot the
 * pixel stands for at that tile's height.
 */
function pointAt(x: number, y: number): { i: number; j: number } | null {
  const tile = world.tileAt(x, y);
  if (!tile) return null;
  const mid = world.screenOf(tile.i + 0.5, tile.j + 0.5);
  const dx = (x - mid.x) / TILE_W;
  const dy = (y - mid.y) / TILE_H;
  const clamp = (v: number) => Math.max(-0.49, Math.min(0.49, v));
  return { i: tile.i + 0.5 + clamp(dx + dy), j: tile.j + 0.5 + clamp(dy - dx) };
}

// ------------------------------------------------------------------ resizing by the level's edges

/** The side of the red level edge under a pointer, if it is within a few pixels of one: its view corners are (0, 0) to (w, h). */
function edgeAt(e: { clientX: number; clientY: number }): 'n' | 'e' | 's' | 'w' | null {
  const p = groundPixel(e);
  const { w, h } = world.map;
  const at = (i: number, j: number) => world.edgeScreen(i, j);
  const sides = { n: [at(0, 0), at(w, 0)], e: [at(w, 0), at(w, h)], s: [at(0, h), at(w, h)], w: [at(0, 0), at(0, h)] } as const;
  const reach = Math.max(2, 6 / zoom);
  let best: 'n' | 'e' | 's' | 'w' | null = null;
  let far = reach;
  for (const side of ['n', 'e', 's', 'w'] as const) {
    const [a, b] = sides[side];
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2));
    const d = Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
    if (d < far) { far = d; best = side; }
  }
  return best;
}

/** Drags one edge to the tile line under the pointer: the scene becomes that much bigger or smaller at that border. */
function dragEdge(g: Extract<Gesture, { kind: 'edge' }>, side: 'n' | 'e' | 's' | 'w', e: { clientX: number; clientY: number }): void {
  const p = groundPixel(e);
  const o = world.edgeScreen(0, 0);
  const u = ((p.x - o.x) * 2) / TILE_W, v = ((p.y - o.y) * 2) / TILE_H;
  // The pointer on the ground, in the view frame the drag started in.
  const i = Math.round((u + v) / 2) + g.a0, j = Math.round((v - u) / 2) + g.b0;
  const lim = (n: number, from: number, dir: 1 | -1) => Math.max(Math.min(from + dir * MIN_SIZE, from + dir * MAX_SIZE), Math.min(Math.max(from + dir * MIN_SIZE, from + dir * MAX_SIZE), n));
  let { a0, a1, b0, b1 } = g;
  if (side === 'e') a1 = lim(i, a0, 1);
  else if (side === 'w') a0 = lim(i, a1, -1);
  else if (side === 's') b1 = lim(j, b0, 1);
  else b0 = lim(j, b1, -1);
  if (a0 === g.a0 && a1 === g.a1 && b0 === g.b0 && b1 === g.b1) return;
  // The new rectangle as the scene's own tiles: its corners through the turn of the view.
  const p0 = g.base.toData({ i: a0, j: b0 }), p1 = g.base.toData({ i: a1, j: b1 });
  const i0 = Math.min(p0.i, p1.i), j0 = Math.min(p0.j, p1.j);
  const next = resized(g.orig, Math.abs(p1.i - p0.i), Math.abs(p1.j - p0.j), -i0, -j0);
  // The middle of the old ground stays where it is on the screen.
  const mid = { i: Math.floor(g.base.map.w / 2), j: Math.floor(g.base.map.h / 2) };
  const here = (ox: number, oy: number) => world.screenOf(mid.i - ox, mid.j - oy);
  const before = here(g.a0, g.b0);
  Object.assign(g, { a0, a1, b0, b1, changed: true });
  show(next);
  const after = here(a0, b0);
  cam.x += after.x - before.x;
  cam.y += after.y - before.y;
}

// ------------------------------------------------------------------ playing

let roster: Saved[] = [];
let actor: Actor | null = null;
let herd: Herd | null = null;
/** Something that can be picked up in Play: a loose item by its place in `world.loose`, or an animal by its place in the scene. */
type Pickable = { item: PlacedItem } | { animal: number };
let target: { i: number; j: number; run: boolean; pick?: Pickable } | null = null;
/** The way on after `target`, round what is in the way (path.ts). */
let route: { i: number; j: number }[] = [];
/** What the character holds, if anything. */
let held: Pickable | null = null;
/** How near the character must come to pick something up, in metres. */
const REACH = 0.7;

function characterLook() {
  const saved = roster.find((c) => c.id === prefs.character);
  return lookOf(saved?.state ?? defaultState());
}
function startPlay(): void {
  roster = loadRoster();
  if (prefs.character && !roster.some((c) => c.id === prefs.character)) prefs.character = '';
  let at = world.toView(world.scene.spawn);
  if (!inside(world.map, Math.floor(at.i), Math.floor(at.j)) || levelAt(world.map, Math.floor(at.i), Math.floor(at.j)) < SEA_LEVEL) {
    at = world.nearestLand(at.i, at.j);
  }
  actor = new Actor(characterLook(), at);
  herd = new Herd(world, performance.now());
  world.loose = structuredClone(world.scene.items);
  world.scene.people.forEach(standAtHome);
  roaming.clear();
  target = null;
  held = null;
  // The camera stays where it is, unless the character would start out of sight.
  const p = world.screenOf(at.i, at.j);
  const view = viewRect();
  if (p.x < view.x || p.y < view.y || p.x > view.x + view.w || p.y > view.y + view.h) centerOn(at);
}

/** Turns the view a quarter, keeping in the middle what was there (or the character). */
function rotate(step: number): void {
  const middle = world.tileAt(cam.x, cam.y + 16);
  const focus = world.toData(actor ?? (middle ? { i: middle.i + 0.5, j: middle.j + 0.5 } : { i: world.map.w / 2, j: world.map.h / 2 }));
  const people = world.scene.people.map((p) => world.toData(personActor(p)));
  prefs.rot = (prefs.rot + step + 4) % 4;
  savePrefs();
  world.setRotation(prefs.rot);
  world.scene.people.forEach((p, k) => Object.assign(personActor(p), world.toView(people[k])));
  const v = world.toView(focus);
  if (actor) {
    actor.i = v.i;
    actor.j = v.j;
    target = null;
  }
  hover = null;
  centerOn(v);
  version++;
}
/** Where a pickable stands now, in view coordinates. */
function whereIs(p: Pickable): { i: number; j: number } {
  return world.toView('item' in p ? p.item : herd!.poses[p.animal]);
}

/** Whether a thing's picture covers a ground-image pixel, with a pixel of slack all round since the small animals are only a few pixels across. */
const OUTLINE = [255, 216, 74];
/** Draws a one-pixel line round a thing's picture into an image of the view. */
function outline(image: { data: Uint8ClampedArray; width: number; height: number }, view: Rect, thing: Thing, [r, g, b]: number[]): void {
  const at = footOf(world.ground, thing.spot);
  const x0 = at.x - thing.foot.x - view.x, y0 = at.y - thing.foot.y - view.y;
  const solid = (x: number, y: number) => {
    const c = x >= 0 && y >= 0 && x < thing.w && y < thing.h ? thing.picture.get(x, y) : null;
    return !!c;
  };
  for (let y = -1; y <= thing.h; y++) for (let x = -1; x <= thing.w; x++) {
    if (solid(x, y) || !(solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) continue;
    const px = x0 + x, py = y0 + y;
    if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
    const p = (py * image.width + px) * 4;
    image.data[p] = r; image.data[p + 1] = g; image.data[p + 2] = b; image.data[p + 3] = 255;
  }
}

/** The picture a selected thing is drawn with (none for a decoration that lies flat, or the flag: the tile is lit instead). */
function thingOf(sel: Selected | null, wind: number): Thing | null {
  if (!sel) return null;
  const o = sel.obj;
  const at = <T>(list: readonly T[] | undefined, things: Thing[]) => (list && things.length === list.length ? things[list.indexOf(o as T)] : undefined) ?? null;
  if (sel.kind === 'item') return at(world.scene.items, world.itemThings());
  if (sel.kind === 'prop') return at(world.scene.props, world.propThings(wind));
  if (sel.kind === 'plant') return at(world.scene.plants, world.plantThings(wind));
  if (sel.kind === 'animal') return world.animalSprite(o as PlacedAnimal, world.scene.animals.indexOf(o as PlacedAnimal), 0);
  if (sel.kind === 'person') return personThing(o as PlacedPerson, 0);
  if (sel.kind === 'decor') return world.decorThings().find((t) => t.spot.i === world.toView(o).i && t.spot.j === world.toView(o).j) ?? null;
  return null;
}

function covers(thing: Thing, x: number, y: number): boolean {
  const at = footOf(world.ground, thing.spot);
  return [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => {
    const px = Math.floor(x) + dx - (at.x - thing.foot.x);
    const py = Math.floor(y) + dy - (at.y - thing.foot.y);
    const c = px >= 0 && py >= 0 && px < thing.w && py < thing.h ? thing.picture.get(px, py) : null;
    return !!c;
  }));
}

/** The thing to pick up under a ground-image pixel, the front-most, or null. Animals count only when they may be carried. */
function pickableAt(x: number, y: number, ms: number): Pickable | null {
  // Animals too big to carry still count, so one standing in front hides what is behind it.
  const found: [Pickable | null, Thing][] = [
    ...world.itemThings().map((thing, n): [Pickable | null, Thing] => [CARRIED.includes(world.loose![n].item) ? { item: world.loose![n] } : null, thing]),
    ...world.scene.animals.flatMap((a, k): [Pickable | null, Thing][] => (herd?.poses[k].carried ? [] : [[a.animal.pickable ? { animal: k } : null, world.animalSprite(a, k, ms, herd ?? undefined)]])),
  ];
  let best: Pickable | null = null;
  let front = -Infinity;
  for (const [p, thing] of found) {
    if (covers(thing, x, y) && thing.spot.i + thing.spot.j > front) {
      front = thing.spot.i + thing.spot.j;
      best = p;
    }
  }
  return best;
}

/** Takes up what is in reach into the character's arms. */
function pickUp(p: Pickable, ms: number): void {
  if (!actor || !herd || held) return;
  let carried: Carried;
  if ('item' in p) {
    world.loose = world.loose!.filter((it) => it !== p.item);
    // Eight views: the item turns with the character, an eighth of a turn per facing.
    carried = (facing) => ({ ...itemPicture(p.item.item, FACING_RING.indexOf(facing) / 2), below: 2 });
  } else {
    herd.pickUp(p.animal, ms);
    const placed = world.scene.animals[p.animal];
    // Held across the arms: a quarter turn from the way the character faces.
    carried = (facing, now) => ({ ...world.animalSprite(placed, p.animal, now, herd!, turnFacing(facing, 2)), below: 3 });
  }
  held = p;
  actor.carry(carried);
  showActions();
}

/** Sets down what is held, just in front of the character, on land a walker could reach. */
function drop(): void {
  if (!actor || !herd || !held) return;
  const spot = actor.ahead(0.55);
  const dry = inside(world.map, Math.floor(spot.i), Math.floor(spot.j)) && levelAt(world.map, Math.floor(spot.i), Math.floor(spot.j)) >= SEA_LEVEL;
  if (!dry || !world.canWalk(actor, spot)) return say(t('drop.cannot'));
  const at = world.toData(spot);
  if ('item' in held) world.loose!.push({ item: held.item.item, ...at });
  else herd.setDown(held.animal, at, turnFacing(actor.facing, -world.rot * 2), performance.now());
  held = null;
  actor.carry(null);
  showActions();
}

function walkTo(e: PointerEvent, start = false): void {
  if (start && actor && !held) {
    const p = groundPixel(e);
    const pick = pickableAt(p.x, p.y, performance.now());
    if (pick) {
      target = { ...whereIs(pick), run: false, pick };
      route = [];
      return;
    }
  }
  if (target?.pick) return;
  const tile = tileUnder(e);
  if (!tile || !actor) return;
  // Somewhere nobody can stand (the sea, a cave's rock) is no place to go; elsewhere the way goes round what blocks.
  const to = { i: tile.i + 0.5, j: tile.j + 0.5 };
  const way = findPath(world, actor, to);
  if (!way.length) return;
  const d = Math.hypot(to.i - actor.i, to.j - actor.j);
  target = { ...way[0], run: target?.run ?? d > 4 };
  route = way.slice(1);
}
function emote(e: Emote): void {
  target = null;
  actor?.emote(e, performance.now());
}

// ------------------------------------------------------------------ input

const keys = new Set<string>();
const typing = (e: Event) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || !!document.querySelector('dialog[open]');
window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && !e.shiftKey && prefs.mode === 'edit') {
    e.preventDefault();
    undo();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && ((e.code === 'KeyZ' && e.shiftKey) || e.code === 'KeyY') && prefs.mode === 'edit') {
    e.preventDefault();
    redo();
    return;
  }
  if (e.metaKey || e.ctrlKey) return;
  if (prefs.mode === 'play' && e.code === 'KeyE') emote('wave');
  if (prefs.mode === 'play' && e.code === 'KeyF') emote('use');
  if (prefs.mode === 'edit' && selected && selected.kind !== 'spawn' && (e.code === 'Delete' || e.code === 'Backspace')) {
    remember();
    removeObject(selected.obj);
    selected = null;
    sceneChanged();
    showOptions();
  }
  // T turns the selected prop or plant an eighth; the next one set down is turned the same way.
  if (prefs.mode === 'edit' && selected && (selected.kind === 'prop' || selected.kind === 'plant') && e.code === 'KeyT') {
    turnObject(selected.obj as unknown as { turn: number }, e.shiftKey ? -1 : 1);
  }
  // With an object selected, Q and R turn it; otherwise the view.
  const turning = prefs.mode === 'edit' && selected?.kind === 'item' ? (step: number) => turnItem(selected!.obj as PlacedItem, step) : rotate;
  if (e.code === 'KeyQ') turning(-1);
  if (e.code === 'KeyR') turning(1);
  if (/^(Arrow|Key[WASD]$|Shift|Space)/.test(e.code)) {
    keys.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

/** The direction held on the keyboard, on screen: x to the right, y down. */
function keyDirection(): [number, number] {
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  return [x, y];
}

type Gesture =
  | { kind: 'stroke'; touched: Set<number>; last: string; level?: number; placed?: Set<PlacedPlant>; alt?: true; tile?: { i: number; j: number }; at: number }
  | { kind: 'walk' }
  | { kind: 'edge'; base: World; orig: Scene; a0: number; a1: number; b0: number; b1: number; changed: boolean }
  | { kind: 'move'; sel: Selected; grab: { x: number; y: number }; from: { i: number; j: number }; copy?: true }
  | { kind: 'pan'; x: number; y: number; cam: { x: number; y: number } }
  | { kind: 'pinch'; dist: number; zoom: number; mid: { x: number; y: number }; cam: { x: number; y: number } };
let gesture: Gesture | null = null;
const pointers = new Map<number, { x: number; y: number }>();
const pair = () => {
  const [a, b] = [...pointers.values()];
  return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
};

/** Ground tools that keep working while the pointer is held still, and how often they repeat. */
const HELD: Tool[] = ['raise', 'lower', 'smooth', 'level'];
const REPEAT_MS = 200;

function strokeAt(e: { clientX: number; clientY: number }): void {
  if (gesture?.kind !== 'stroke') return;
  const tile = tileUnder(e);
  if (!tile) return;
  const key = `${tile.i},${tile.j}`;
  if (key === gesture.last) return;
  gesture.last = key;
  // Every tile on the way from the last one, side by side, so a fast or slanted drag leaves no gap and no way that
  // only meets at a corner, which nobody can walk through.
  const from = gesture.tile ?? tile;
  gesture.tile = tile;
  gesture.at = performance.now();
  pointerPixel = groundPixel(e);
  for (const step of sideBySide(from, tile)) apply(step, gesture);
}

/** The tiles from a to b (without a, unless it is b), each next to the one before along i or j. */
function sideBySide(a: { i: number; j: number }, b: { i: number; j: number }): { i: number; j: number }[] {
  const out: { i: number; j: number }[] = [];
  let { i, j } = a;
  const n = Math.abs(b.i - a.i) + Math.abs(b.j - a.j);
  for (let k = 1; k <= n; k++) {
    // Step along whichever way lags behind the straight line more.
    const t = k / n;
    if (Math.abs(a.i + (b.i - a.i) * t - i) >= Math.abs(a.j + (b.j - a.j) * t - j)) i += Math.sign(b.i - i);
    else j += Math.sign(b.j - j);
    out.push({ i, j });
  }
  return out.length ? out : [b];
}

/**
 * While held, the tool works again on the tile it last worked on. That tile is kept rather than
 * picked again: as the ground rises, another tile can come to lie under the same pixel.
 */
function repeatStroke(ms: number): void {
  if (gesture?.kind !== 'stroke' || !gesture.tile || !HELD.includes(prefs.tool) || ms - gesture.at < REPEAT_MS) return;
  gesture.touched.clear();
  gesture.at = ms;
  apply(gesture.tile, gesture);
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const { dist, mid } = pair();
    gesture = { kind: 'pinch', dist, zoom, mid, cam: { ...cam } };
  } else if (pointers.size === 1) {
    if (e.button === 1 || e.button === 2 || keys.has('Space')) gesture = { kind: 'pan', x: e.clientX, y: e.clientY, cam: { ...cam } };
    else if (prefs.mode === 'edit' && (gesture = edgeGesture(e))) { /* dragging an edge of the level */ }
    else if (prefs.mode === 'edit' && prefs.tool === 'move') {
      const p = groundPixel(e);
      selected = objectAt(p.x, p.y);
      // Shift-drag drags a copy and leaves the original where it is.
      const copy = e.shiftKey && selected ? duplicate(selected) : null;
      if (copy) selected = copy;
      version++;
      showOptions();
      if (selected) {
        const v = world.toView(selected.obj);
        const foot = world.screenOf(v.i, v.j);
        remember();
        gesture = { kind: 'move', sel: selected, grab: { x: p.x - foot.x, y: p.y - foot.y }, from: { ...selected.obj }, ...(copy && { copy: true }) };
      } else gesture = { kind: 'pan', x: e.clientX, y: e.clientY, cam: { ...cam } };
    } else if (prefs.mode === 'edit') {
      remember();
      gesture = { kind: 'stroke', touched: new Set(), last: '', at: 0, ...(e.altKey && { alt: true as const }) };
      strokeAt(e);
    } else {
      gesture = { kind: 'walk' };
      target = null;
      walkTo(e, true);
    }
  }
});
/** The start of dragging a red level edge, if the pointer is on one. */
let edgeSide: 'n' | 'e' | 's' | 'w' | null = null;
/** The red edge to light up: the one under the pointer, or the one being dragged. */
let hotEdge: 'n' | 'e' | 's' | 'w' | null = null;
function edgeGesture(e: { clientX: number; clientY: number }): Gesture | null {
  edgeSide = edgeAt(e);
  if (!edgeSide) return null;
  remember();
  return { kind: 'edge', base: world, orig: structuredClone(world.scene), a0: 0, a1: world.map.w, b0: 0, b1: world.map.h, changed: false };
}
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture?.kind === 'pinch' && pointers.size === 2) {
    const { dist, mid } = pair();
    setZoom(gesture.zoom * (dist / gesture.dist));
    cam.x = gesture.cam.x - (mid.x - gesture.mid.x) / zoom;
    cam.y = gesture.cam.y - (mid.y - gesture.mid.y) / zoom;
  } else if (gesture?.kind === 'pan') {
    cam.x = gesture.cam.x - (e.clientX - gesture.x) / zoom;
    cam.y = gesture.cam.y - (e.clientY - gesture.y) / zoom;
  } else if (gesture?.kind === 'move') {
    const p = groundPixel(e);
    const at = pointAt(p.x - gesture.grab.x, p.y - gesture.grab.y);
    if (at) {
      Object.assign(gesture.sel.obj, world.toData(at));
      sceneChanged();
    }
  } else if (gesture?.kind === 'edge' && edgeSide) dragEdge(gesture, edgeSide, e);
  else if (gesture?.kind === 'stroke') strokeAt(e);
  else if (gesture?.kind === 'walk') walkTo(e);
  if (prefs.mode === 'edit' && e.pointerType === 'mouse') hover = tileUnder(e);
  hotEdge = prefs.mode === 'edit' && e.pointerType === 'mouse' ? (gesture?.kind === 'edge' ? edgeSide : gesture ? null : edgeAt(e)) : null;
});
const release = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (gesture?.kind === 'move' && gesture.copy && (gesture.sel.obj.i === gesture.from.i && gesture.sel.obj.j === gesture.from.j || !canStand(gesture.sel, world.toView(gesture.sel.obj)))) {
    // A copy that was not dragged anywhere, or dropped where it cannot stand, is not made.
    removeObject(gesture.sel.obj);
    selected = null;
    sceneChanged();
  } else if (gesture?.kind === 'move' && !canStand(gesture.sel, world.toView(gesture.sel.obj))) {
    Object.assign(gesture.sel.obj, gesture.from);
    sceneChanged();
  }
  if (gesture?.kind === 'move') showOptions();
  // An edge dragged nowhere leaves nothing to undo.
  if (gesture?.kind === 'edge' && !gesture.changed) { undoStack.pop(); syncUndo(); }
  // Lifting one finger of a pinch does not start painting with the other.
  if (!pointers.size || gesture?.kind === 'pinch') gesture = pointers.size ? { kind: 'pan', x: [...pointers.values()][0].x, y: [...pointers.values()][0].y, cam: { ...cam } } : null;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { hover = null; if (gesture?.kind !== 'edge') hotEdge = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// A trackpad sends a two-finger move as scrolling, which pans, and a pinch as scrolling with Ctrl
// held, which zooms, smoothly and around the pointer.
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  if (e.ctrlKey) {
    zoomTarget = clampZoom(zoomTarget * Math.exp(-e.deltaY * scale * 0.01));
    zoomAnchor = { x: e.clientX, y: e.clientY };
    return;
  }
  cam.x += (e.deltaX * scale) / zoom;
  cam.y += (e.deltaY * scale) / zoom;
}, { passive: false });

// ------------------------------------------------------------------ the loop

let last = performance.now();
let shown = '';
let shownThings: Thing[] = [];
const fpsLine = h('p', { class: 'fps', 'aria-hidden': 'true' });
let fpsCount = 0;
let fpsSince = performance.now();
function frame(ms: number): void {
  fpsCount++;
  if (ms - fpsSince >= 500) {
    if (prefs.fps) fpsLine.textContent = `${Math.round((fpsCount * 1000) / (ms - fpsSince))} fps`;
    fpsCount = 0;
    fpsSince = ms;
  }
  const dt = Math.min(0.1, (ms - last) / 1000);
  last = ms;
  repeatStroke(ms);
  easeZoom(dt);
  if (groundDirty) {
    // shortcut: redraws the whole ground per changed tile; fine up to 64 by 64, draw only the changed rows if it ever lags.
    world.redraw();
    groundDirty = false;
  }
  const [kx, ky] = keyDirection();
  if (prefs.mode === 'play' && actor) {
    let di = kx + ky;
    let dj = ky - kx;
    let run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (di || dj) target = null;
    else if (target) {
      // Something to pick up is followed as it moves, and taken once in reach.
      if (target.pick) Object.assign(target, whereIs(target.pick));
      di = target.i - actor.i;
      dj = target.j - actor.j;
      run = target.run;
      if (target.pick && Math.hypot(di, dj) < REACH) {
        actor.update(world, dt, di * 1e-4, dj * 1e-4, false, ms);
        pickUp(target.pick, ms);
        target = null;
        di = dj = 0;
      } else if (Math.hypot(di, dj) < 0.08) {
        // At a turn of the way, on to the next; at its end, stop.
        const next = route.shift();
        target = next ? { ...next, run: target.run } : null;
        di = dj = 0;
      }
    }
    const before = [actor.i, actor.j];
    actor.update(world, dt, di, dj, run, ms);
    // The animal being fetched waits to be picked up; the others shy away from the character.
    const fetching = target?.pick && 'animal' in target.pick ? target.pick.animal : undefined;
    herd?.update(world, dt, ms, world.toData(actor), fetching);
    roam(dt, ms);
    // A target that cannot be reached is given up rather than walked against forever.
    if (target && before[0] === actor.i && before[1] === actor.j) target = null;
  } else if (kx || ky) {
    cam.x += (kx * 360 * dt) / zoom;
    cam.y += (ky * 360 * dt) / zoom;
  }

  const view = viewRect();
  const wind = Math.floor((ms / 1000) * 6) % FRAMES;
  const waves = Math.floor(ms / 100);
  const idle = Math.floor((ms / 1000) * CLIPS.idle.rate);
  const key = `${version}|${view.x},${view.y},${vw},${vh}|${wind}|${waves}|${idle}|${hover?.i},${hover?.j}|${prefs.mode}|${prefs.bright}|${prefs.colliders}|${hotEdge}`;
  if (prefs.mode === 'play' || key !== shown) {
    const begun = performance.now();
    const cave = world.scene.cave;
    const things: Thing[] = [
      ...world.plantThings(wind), ...world.decorThings(ms), ...world.animalThings(ms, herd ?? undefined), ...world.itemThings(), ...world.propThings(wind), ...world.scene.people.map((p) => personThing(p, ms)),
      // In Play the rock is cut in front of the room the character is in; while editing, in front of every room.
      ...(cave ? caveThings(world, prefs.mode === 'play' && actor ? actor : undefined) : []),
    ];
    if (prefs.mode === 'play' && actor) things.push(actor.thing(world, ms), ...actor.dropThings());
    else {
      const s = world.toView(world.scene.spawn);
      things.push({ spot: { i: s.i, j: s.j, level: Math.max(SEA_LEVEL, levelAt(world.map, Math.floor(s.i), Math.floor(s.j))) }, picture: FLAG, w: 6, h: 13, foot: { x: 0, y: 12 } });
      for (const e of cave?.exits ?? []) {
        const v = world.toView(e);
        things.push({ spot: { i: v.i, j: v.j, level: standingHeight(world.map, v.i, v.j) }, picture: EXIT_MARK, w: 7, h: 7, foot: { x: 3, y: 3 }, shadow: [] });
      }
    }
    // In Play the key alone does not say whether anyone moved: the picture is the same while every thing shows the same frame in the same place.
    const still = key === shown && things.length === shownThings.length
      && things.every((t, k) => t.picture === shownThings[k].picture && t.spot.i === shownThings[k].spot.i && t.spot.j === shownThings[k].spot.j && t.spot.level === shownThings[k].spot.level);
    if (still) return void requestAnimationFrame(frame);
    shown = key;
    shownThings = things;
    const blocked = prefs.mode === 'edit' && !!hover && cannotEdit(hover);
    let highlight = prefs.mode === 'edit' && hover ? { cells: new Set(brushCells(hover)), color: blocked ? '#e0332e99' : '#ffffff66' } : undefined;
    if (prefs.mode === 'edit' && prefs.tool === 'move') {
      // Objects are not tied to a tile, so the Move tool marks one only where what it holds may not stay.
      const v = selected && world.toView(selected.obj);
      highlight = v && !canStand(selected!, v) ? { cells: new Set([Math.floor(v.j) * world.map.w + Math.floor(v.i)]), color: '#e0332e99' } : undefined;
    }
    world.hotEdge = prefs.mode === 'edit' ? hotEdge : null;
    canvas.style.cursor = hotEdge && prefs.mode === 'edit' ? (gesture?.kind === 'edge' ? 'grabbing' : 'grab') : prefs.mode === 'edit' && prefs.tool === 'move' ? (gesture?.kind === 'move' ? 'grabbing' : 'default') : blocked ? 'not-allowed' : prefs.mode === 'edit' ? 'crosshair' : 'pointer';
    let t0 = part('things', begun);
    const image = world.compose(view, things, highlight, prefs.mode === 'edit', waves * 100, prefs.mode === 'edit' && prefs.grid);
    t0 = performance.now();
    // A cave is as dark as in the game, but where its lights and the character's lantern reach; while editing it can be seen into.
    if (cave && !(prefs.mode === 'edit' && prefs.bright)) {
      const lantern = prefs.mode === 'play' && actor ? [{ i: actor.i, j: actor.j, r: 4.2 * flicker(ms), amount: 1 }] : [];
      lightByTile(image, caveTint(world.scene), 0, world.spots!, world.lightField([...caveLamps(world, ms), ...lantern]));
    }
    // The selected object, outlined over everything (lights included), so it shows even behind rock or in the dark.
    const chosen = prefs.mode === 'edit' ? thingOf(selected, wind) : null;
    if (chosen) outline(image, view, chosen, OUTLINE);
    if (prefs.colliders) world.drawColliders(image, view);
    t0 = part('light', t0);
    ctx.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
    part('show', t0);
    part('whole frame', begun);
    frameDone();
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ panels

const thumbs = new Map<string, HTMLCanvasElement>();
/** A small picture of a plant, cropped to what it paints. */
function thumb(id: string): HTMLCanvasElement {
  const known = thumbs.get(id);
  if (known) return known;
  const raster = rasterOf({ plant: id, seed: 0, size: 1 }, 0)!;
  // Cropped to the plant and its shadow, cast from the sun on flat ground.
  const { x0, y0, x1, y1 } = withSunShadow(raster, raster.w, raster.h, raster.foot).bounds;
  const w = Math.max(1, x1 - x0 + 1);
  const hh = Math.max(1, y1 - y0 + 1);
  const c = h('canvas', { width: String(w), height: String(hh) });
  const g = c.getContext('2d')!;
  const image = g.createImageData(w, hh);
  const mask = new Uint8Array(w * hh);
  castShadow(mask, w, hh, raster, raster.w, raster.h, -x0, -y0, raster.foot);
  layShadow(image, mask);
  stamp(image, raster, raster.w, raster.h, -x0, -y0);
  g.putImageData(image, 0, 0);
  const scale = Math.min(2, 44 / Math.max(w, hh));
  c.style.width = `${Math.round(w * scale)}px`;
  c.style.height = `${Math.round(hh * scale)}px`;
  thumbs.set(id, c);
  return c;
}

const animalThumbs = new Map<string, HTMLCanvasElement>();
/** An animal standing, cropped to what it paints. */
function animalThumb(animal: Animal): HTMLCanvasElement {
  const id = JSON.stringify(animal);
  const known = animalThumbs.get(id);
  if (known) return known;
  const { sprite } = drawAnimal(animal, 'idle', 0, 0);
  const c = cropped(sprite);
  animalThumbs.set(id, c);
  return c;
}

const personThumbs = new Map<string, HTMLCanvasElement>();
/** A character standing, cropped to what it paints. */
function personThumb(state: Saved['state']): HTMLCanvasElement {
  const id = JSON.stringify(state);
  const known = personThumbs.get(id);
  if (known) return known;
  const sprite = drawCharacter(lookOf(state), STAND, 0);
  const c = cropped({ w: SPRITE_W, h: SPRITE_H, get: (x, y) => sprite.get(x, y) });
  personThumbs.set(id, c);
  return c;
}

/** A picture cropped to what it paints, at most 44 pixels across on screen. */
function cropped(sprite: { w: number; h: number; get(x: number, y: number): string | null }): HTMLCanvasElement {
  let x0 = sprite.w, y0 = sprite.h, x1 = 0, y1 = 0;
  for (let y = 0; y < sprite.h; y++) for (let x = 0; x < sprite.w; x++) {
    const c = sprite.get(x, y);
    if (!c) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const w = Math.max(1, x1 - x0 + 1);
  const hh = Math.max(1, y1 - y0 + 1);
  const c = h('canvas', { width: String(w), height: String(hh) });
  const g = c.getContext('2d')!;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const color = sprite.get(x, y);
    if (!color) continue;
    g.fillStyle = color;
    g.fillRect(x - x0, y - y0, 1, 1);
  }
  const scale = Math.min(2, 44 / Math.max(w, hh));
  c.style.width = `${Math.round(w * scale)}px`;
  c.style.height = `${Math.round(hh * scale)}px`;
  return c;
}

/** A decoration drawn four times its size on sand, for the picker. */
function decorThumb(id: string): HTMLCanvasElement {
  const pixels = decorPixels(decorById(id)!);
  // At least 11 by 9, taller for a tall one (the torch), at a scale that keeps it in the button.
  const w = Math.max(11, ...pixels.map((p) => 2 * Math.abs(p.x) + 1)), hh = Math.max(9, ...pixels.map((p) => 2 * Math.abs(p.y) + 2));
  const c = h('canvas', { width: String(w), height: String(hh) });
  const g = c.getContext('2d')!;
  g.fillStyle = '#f6e4b4';
  g.fillRect(0, 0, w, hh);
  for (const p of pixels) {
    g.fillStyle = p.color;
    g.fillRect(p.x + Math.floor(w / 2), p.y + Math.floor(hh / 2), 1, 1);
  }
  const scale = Math.min(4, 36 / hh);
  c.style.width = `${w * scale}px`;
  c.style.height = `${hh * scale}px`;
  return c;
}

/** An object's picture, cut to what it covers, on the sand colour. */
function itemThumb(id: string, prop: Build): HTMLCanvasElement {
  const { picture, w, h: ph } = itemPicture(id, 0, { [id]: prop });
  let x0 = w, y0 = ph, x1 = 0, y1 = 0;
  for (let y = 0; y < ph; y++) for (let x = 0; x < w; x++) if (picture.get(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cw = Math.max(1, x1 - x0 + 3), ch = Math.max(1, y1 - y0 + 3);
  const c = h('canvas', { width: String(cw), height: String(ch) });
  const g = c.getContext('2d')!;
  g.fillStyle = '#f6e4b4';
  g.fillRect(0, 0, cw, ch);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const color = picture.get(x, y);
    if (!color) continue;
    g.fillStyle = color;
    g.fillRect(x - x0 + 1, y - y0 + 1, 1, 1);
  }
  const scale = Math.min(3, 36 / ch);
  c.style.width = `${cw * scale}px`;
  c.style.height = `${ch * scale}px`;
  return c;
}

const barSlot = h('div', { style: 'display: contents' });
/** The scene's name in the bar: type to rename. */
const name = nameTag();
name.onRename((n) => { sceneNow().name = n.slice(0, 40); sceneChanged(); render(); });
/** What the character can do in Play, as buttons floating over the scene: the emotes, or putting down what it holds. */
const actions = h('div', { class: 'actions' });
const EMOTE_ICONS: Record<Emote, string> = { wave: 'hand', use: 'hammer' };
const EMOTE_KEYS: Record<Emote, string> = { wave: 'E', use: 'F' };
function showActions(): void {
  actions.hidden = prefs.mode !== 'play';
  actions.replaceChildren(...(held
    ? [pixelButton(t('drop'), { icon: 'down', lit: true }, drop)]
    : EMOTES.map((e) => pixelButton(`${t(`emote.${e}` as Key)} (${EMOTE_KEYS[e]})`, { icon: EMOTE_ICONS[e] }, () => emote(e)))));
}
/** Switches the cave's even light, built in `mount` (hidden outside a cave). */
let brightToggle: HTMLElement | null = null;
const dock = h('nav', { class: 'ubox__in toolbar' });
/** The tools float over the scene in a pixel box (rounded corners, like every floating panel). */
const dockBox = h('div', { class: 'ubox toolwrap' }, dock);
/** The inspector: the tool's options while editing, and what the selected object lets you change. */
const inspector = sidePanel('right', 'pixel-scene-inspector', 384);
const inspect = () => inspector.body.replaceChildren(...(prefs.mode === 'edit' ? [h('div', { class: 'opts__body' }, ...editOptions())] : []));
/** A button to another editor. */
const link = (href: string, label: string) => pixelButton(label, { icon: 'pencil' }, () => { location.href = href; });

/** Pictures to pick from: plants, decorations or animals. */
function picks<T extends { id: string; name: string; picture: HTMLElement }>(label: string, list: T[], current: string, choose: (id: string) => void): HTMLElement {
  const grid = tileGrid(list.map((c) => ({ id: c.id, picture: c.picture, words: c.name })), current, choose);
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', label);
  return grid;
}

const propThumbs = pictureCache('plant__picture', 400);
/** The props tool's library: one search box over every prop, then pictures to pick from. */
function propLibrary(): Node[] {
  const grid = h('div');
  const fill = () => {
    const q = prefs.propQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = propKinds().filter((k) => !isHidden(k.id) && q.every((w) => [k.name, k.source, ...k.tags, ...k.features, k.locked ? 'locked' : ''].join(' ').toLowerCase().includes(w)));
    grid.replaceChildren(picks(t('props'), list.slice(0, 80).map((k) => ({
      id: k.id, name: k.name,
      picture: propThumbs.of(`${k.id}|${k.art ? k.art.views[0].join('').length : ''}|${k.locked}`, () => {
        const p = propPicture(k, 0, 0, 0);
        return p ? trimmed(p, p.w, p.h, 40) : h('canvas');
      }),
    })), prefs.prop, (prop) => set({ prop })), list.length ? '' : h('p', { class: 'opts__tip' }, t('props.none')));
  };
  fill();
  return [searchField(t('props.search'), (query) => { prefs.propQuery = query; savePrefs(); fill(); }, prefs.propQuery), grid, link('../props/', t('props.edit'))];
}

/** The round brush as a little picture of the tiles it covers. */
function brushPicture(size: number): HTMLCanvasElement {
  const on = new Set(roundBrush(size).map(([di, dj]) => `${di},${dj}`));
  const { canvas, ctx } = pixelCanvas(20, 20, 2);
  for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
    ctx.fillStyle = on.has(`${di},${dj}`) ? C.lit : C.track;
    ctx.fillRect((di + 3) * 3, (dj + 3) * 3, 2, 2);
  }
  return canvas;
}

/** The options panel again, as the selection changed. */
function showOptions(): void {
  inspect();
}

/** Turns a selected plant or prop an eighth; the next prop set down is turned the same way. */
function turnObject(obj: { turn: number }, step: number): void {
  remember();
  obj.turn = (obj.turn + step + 8) % 8;
  if (selected?.kind === 'prop') propTurn = (obj.turn + world.rot * 2) % 8;
  sceneChanged();
}

/** Turns a placed object a quarter; new ones then face the same way. */
function turnItem(it: PlacedItem, step: number): void {
  remember();
  it.turn = (((it.turn ?? 0) + step) % 4 + 4) % 4;
  if (!it.turn) delete it.turn;
  prefs.itemTurn = it.turn ?? 0;
  savePrefs();
  sceneChanged();
}

/** The scenes a way can lead to: the editor's own and the project's, by file name, with what each holds that a way can arrive at. */
function linkTargets(): Map<string, PlacedItem[]> {
  const out = new Map<string, PlacedItem[]>();
  for (const p of projectScenes) { try { out.set(p.name, readSceneFile(p.text).items.filter((o) => LINKING.includes(o.item))); } catch { /* a broken file leads nowhere */ } }
  for (const sc of library.scenes) out.set(slug(sc.name), (sc === sceneNow() ? world.scene : sc).items.filter((o) => LINKING.includes(o.item)));
  return out;
}

/** For a hole or ladder: the scene it leads to and the way there it arrives at, and a note when the other end does not lead back. */
function linkFields(it: PlacedItem): Node {
  const targets = linkTargets();
  const here = slug(sceneNow().name);
  const target = it.to && targets.get(it.to.scene);
  const there = target?.find((o) => o.id === it.to?.id);
  const set = (to: PlacedItem['to']) => { remember(); if (to) it.to = to; else delete it.to; sceneChanged(); showOptions(); };
  const scenes: Option[] = [{ id: '', words: t('link.none') }, ...[...targets.keys()].filter((n) => n !== here || (targets.get(n)?.length ?? 0) > 1).map((n) => ({ id: n, words: n }))];
  const label = (o: PlacedItem) => `${t(`link.${o.item}` as Key)} ${o.id} (${Math.floor(o.i)}, ${Math.floor(o.j)})`;
  const ways: Option[] = (target ?? []).filter((o) => o !== it).map((o) => ({ id: o.id!, words: label(o) }));
  const note = !it.to ? '' : !target ? t('link.gone') : !there ? t('link.nowhere') : there.to?.scene === here && there.to.id === it.id ? '' : t('link.noreturn');
  return h('div', {},
    fields(
      field({ words: t('link.scene') }, choice(t('link.scene'), scenes, () => it.to?.scene ?? '', (n) => set(n ? { scene: n, id: targets.get(n)?.find((o) => o !== it)?.id ?? '' } : undefined), 'list')),
      ...(it.to && target ? [field({ words: t('link.way') }, choice(t('link.way'), ways, () => it.to?.id ?? null, (id) => set({ scene: it.to!.scene, id }), 'list'))] : []),
    ),
    ...(note ? [h('span', { class: 'opts__label' }, note)] : []),
  );
}

/** For a selected object: turning it, and for a chest what lies in it. */
function itemOptions(it: PlacedItem): Node[] {
  const out: Node[] = [h('div', { class: 'urow' },
    pixelButton(`${t('turn.left')} (Q)`, { icon: 'turnleft' }, () => turnItem(it, -1)),
    pixelButton(`${t('turn.right')} (R)`, { icon: 'turnright' }, () => turnItem(it, 1)),
  )];
  if (LINKING.includes(it.item)) out.push(linkFields(it));
  if (!openFrames(it.item)) return out;
  const lang = currentLang() === 'de' ? 'de' : 'en';
  out.push(h('span', { class: 'opts__label' }, t('chest.loot')), h('div', { class: 'urow' }, ...LOOT.map((l) => {
    const has = it.loot?.includes(l.id) ?? false;
    return pixelButton(l[lang], { words: l[lang], pressed: has }, () => {
      remember();
      it.loot = has ? it.loot!.filter((x) => x !== l.id) : [...(it.loot ?? []), l.id];
      if (!it.loot.length) delete it.loot;
      sceneChanged();
      showOptions();
    });
  })));
  return out;
}

const KIND_ICON = { plant: 'palm', decor: 'shell', animal: 'paw', person: 'person', item: 'box', prop: 'tool', spawn: 'flag' } as const;

/** Edits made in a quick run (dragging a number) are one undo step: a new step is remembered after a pause. */
let lastEdit = 0;
function edit(change: () => void): void {
  const now = performance.now();
  if (now - lastEdit > 700) remember();
  lastEdit = now;
  change();
  sceneChanged();
}

/** Puts the selected thing at a typed place, unless it may not stand there. */
function moveTo(sel: Selected, i: number, j: number): void {
  if (!canStand(sel, world.toView({ i, j }))) return showOptions();
  edit(() => Object.assign(sel.obj, { i, j }));
}

/** What the Move tool shows of the selected thing: what it is, then every property it has. */
function selectionOptions(sel: Selected): Node[] {
  const o = sel.obj as any;
  const title = {
    plant: () => plantName(o.plant, FLORA.find((e) => e.id === o.plant)?.label),
    decor: () => t(`decor.${o.decor}` as Key),
    animal: () => o.name as string,
    person: () => o.name as string,
    item: () => objectChoices().find((c) => c.id === o.item)?.name ?? o.item,
    prop: () => propKind(o.kind)?.name ?? o.kind,
    spawn: () => t('tool.spawn'),
  }[sel.kind]();
  const num = (face: { icon?: string; words?: string }, tip: string, value: number, change: (n: number) => void, min: number, max: number, step = 1) =>
    numberField({ ...face, tip }, value, change, { min, max, step, width: 28 });
  const half = (v: number) => Math.round(v * 2) / 2;
  /** A slider over whole steps 0 to `max`, with the number beside it. */
  const steps = (label: string, value: number, max: number, change: (n: number) => void) =>
    pixelSlider(label, value / max, (v) => { const n = Math.round(v * max); if (n !== value) { value = n; change(n); } }, 56, (v) => String(Math.round(v * max)));
  const out: Node[] = [
    h('div', { class: 'opts__head' }, iconPicture(KIND_ICON[sel.kind]), h('b', {}, title)),
    h('span', { class: 'opts__label' }, t(`tool.${sel.kind}` as Key)),
  ];
  const rows: Node[] = [field({ words: t('sel.position') }, h('div', { class: 'urow' },
    num({ words: 'X' }, t('sel.x'), half(o.i), (n) => moveTo(sel, n, o.j), 0, world.map.w, 0.5),
    num({ words: 'Y' }, t('sel.y'), half(o.j), (n) => moveTo(sel, o.i, n), 0, world.map.h, 0.5)))];
  const turn = (max: number, key: 'turn' | 'facing') => rows.push(field({ words: t('sel.turn') }, steps(t('sel.turn'), o[key], max, (n) => edit(() => (o[key] = n)))));
  if (sel.kind === 'plant' || sel.kind === 'prop') turn(7, 'turn');
  if (sel.kind === 'person') turn(3, 'turn');
  if (sel.kind === 'animal') turn(7, 'facing');
  const variants = sel.kind === 'plant' ? SEEDS : sel.kind === 'prop' ? variantsOf(propKind(o.kind)!) : 1;
  if (variants > 1) rows.push(field({ words: t('sel.variant') }, steps(t('sel.variant'), o.seed, variants - 1, (n) => edit(() => (o.seed = n)))));
  // Foliage keeps the size it grew to; other props can be scaled.
  if (sel.kind === 'prop' && propKind(o.kind)?.place !== 'plant') rows.push(field({ words: t('sel.size') }, num({ icon: 'zoomin' }, t('sel.size'), Math.round(o.size * 100), (n) => edit(() => (o.size = n / 100)), 50, 200, 5)));
  if (sel.kind === 'person') {
    const poses: Option[] = [{ id: '', words: t('pose.alive') }, ...Object.entries(AUTHORED).map(([id, clip]) => ({ id, words: clip.name }))];
    const frames = AUTHORED[o.pose?.clip]?.frames.length ?? 0;
    rows.push(field({ words: t('pose') }, choice(t('pose'), poses, () => o.pose?.clip ?? '', (clip) => { edit(() => (clip ? (o.pose = { clip, frame: 0 }) : delete o.pose)); showOptions(); }, 'list')));
    if (frames > 1) rows.push(field({ words: t('pose.frame') }, steps(t('pose.frame'), o.pose.frame, frames - 1, (n) => edit(() => (o.pose.frame = n)))));
  }
  out.push(fields(...rows));
  if (sel.kind === 'item') out.push(...itemOptions(o as PlacedItem));
  return out;
}

function editOptions(): Node[] {
  const tool = prefs.tool;
  const out: Node[] = [
    h('div', { class: 'opts__head' }, iconPicture(TOOL_ICONS[tool]), h('b', {}, t(`tool.${tool}` as Key))),
    h('p', { class: 'opts__tip' }, t(`tip.${tool}` as Key)),
  ];
  // One block of fields, so their labels are as wide as each other's.
  const rows: Node[] = [];
  if (tool === 'paint') {
    // Ground follows the height by default; in a cave, where the height is flat, the default is the cave's own stone.
    const grounds = sceneNow().cave ? [CAVE_OPEN, 1, 2, 3, 5] : [0, 1, 2, 3, 5];
    if (!grounds.includes(prefs.paint)) prefs.paint = grounds[0];
    rows.push(field({ words: t('paint') }, choice(t('paint'), grounds.map((n) => ({ id: String(n), words: t(`paint.${n}` as Key) })), () => String(prefs.paint), (n) => set({ paint: Number(n) }), 'list')));
  }
  if (BRUSHED.includes(tool)) {
    const picture = h('span', {}, brushPicture(prefs.brush));
    // Dragging only changes the number and the picture: a redraw of the panel would drop the drag.
    const sized = (v: number) => 1 + Math.round(v * (BRUSH_MAX - 1));
    const size = pixelSlider(t('brush'), (prefs.brush - 1) / (BRUSH_MAX - 1), (v) => {
      const n = sized(v);
      if (n === prefs.brush) return;
      prefs.brush = n;
      savePrefs();
      picture.replaceChildren(brushPicture(n));
    }, 60, (v) => String(sized(v)));
    rows.push(field({ words: t('brush') }, h('div', { class: 'urow' }, size, picture)));
  }
  if (rows.length) out.push(fields(...rows));
  if (tool === 'prop') out.push(...propLibrary());
  if (tool === 'plant') out.push(picks(t('plants'), FLORA.map((e) => ({ id: e.id, name: plantName(e.id, e.label), picture: thumb(e.id) })), prefs.plant, (plant) => set({ plant })));
  if (tool === 'decor') out.push(picks(t('decor'), DECOR.map((d) => ({ id: d.id, name: t(`decor.${d.id}` as Key), picture: decorThumb(d.id) })), prefs.decor, (decor) => set({ decor })));
  if (tool === 'item') {
    out.push(picks(t('items'), objectChoices().map((c) => ({ id: c.id, name: c.name, picture: itemThumb(c.id, c.prop) })), prefs.item, (item) => set({ item })));
    out.push(link('../objects/', t('object.edit')));
  }
  if (tool === 'move' && selected) out.push(...selectionOptions(selected));
  if (tool === 'animal') {
    const choices = animalChoices();
    const current = choices.some((c) => c.id === prefs.animal) ? prefs.animal : choices[0].id;
    out.push(picks(t('animals'), choices.map((c) => ({ id: c.id, name: c.name, picture: animalThumb(c.animal) })), current, (animal) => set({ animal })));
    out.push(link('../animals/', t('animal.edit')));
  }
  if (tool === 'person') {
    const choices = personChoices();
    const current = choices.some((c) => c.id === prefs.person) ? prefs.person : '';
    out.push(picks(t('character'), choices.map((c) => ({ id: c.id, name: c.name, picture: personThumb(c.state) })), current, (person) => set({ person })));
    out.push(poseOptions());
    out.push(link('../wardrobe/', t('character.edit')));
  }
  return out;
}

/** Alive and roaming, or held in one frame of a clip, as a prop. */
function poseOptions(): HTMLElement {
  const poses: Option[] = [{ id: '', words: t('pose.alive') }, ...Object.entries(AUTHORED).map(([id, clip]) => ({ id, words: clip.name }))];
  const frames = AUTHORED[prefs.pose]?.frames.length ?? 0;
  return fields(
    field({ words: t('pose') }, choice(t('pose'), poses, () => prefs.pose, (pose) => set({ pose, poseFrame: 0 }), 'list')),
    ...(frames < 2 ? [] : [field({ words: t('pose.frame') }, numberField({ words: '#', tip: t('pose.frame') }, prefs.poseFrame, (n) => { prefs.poseFrame = n; savePrefs(); }, { min: 0, max: frames - 1, width: 30 }))]),
  );
}

/** One line of tool buttons, in Edit only: Play's actions float over the scene. */
function toolbar(): Node[] {
  return toolsHere().map((tool) => pixelButton(t(`tool.${tool}` as Key), { icon: TOOL_ICONS[tool], flat: true, pressed: tool === prefs.tool }, () => set({ tool })));
}

function set(change: Partial<Prefs>): void {
  const entering = change.mode === 'play' && prefs.mode !== 'play';
  Object.assign(prefs, change);
  selected = null;
  savePrefs();
  if (entering) startPlay();
  if (prefs.mode === 'edit') {
    actor = herd = held = null;
    world.loose = null;
  }
  hover = null;
  version++;
  render();
}

function render(): void {
  name.set(sceneNow().name, t('scene.first'));
  // A tool the scene has no use for (raising the ground of a cave, say) gives way to Move.
  if (!toolsHere().includes(prefs.tool)) prefs.tool = 'move';
  const other = prefs.mode === 'edit' ? 'play' : 'edit';
  const { bar, undo: u, redo: r, pops } = topBar({
    sidebar: true,
    inspector: true,
    tool: 'scene',
    title: word('scene'),
    about: [t('hint.edit'), t('hint.play')],
    name: name.el,
    more: [
      { label: t('scene.new'), icon: 'plus', run: () => sceneDialog('new') },
      { label: t('scene.export'), icon: 'download', run: () => download(`${sceneNow().name}.json`, sceneFile(sceneNow())) },
      { label: t('scene.project'), icon: 'download', main: true, disabled: !canSaveToProject(), run: () => void saveScene(), track: { unsaved: () => current !== projectCanon.get(slug(sceneNow().name)), saveNow: saveScene } },
      { label: t('scene.import'), icon: 'upload', run: () => void importScene() },
      { label: t('scene.delete'), icon: 'trash', run: deleteScene, danger: true },
    ],
    status: h('span', { class: 'bar__status' }),
    undo,
    redo,
    // One button: it shows where it takes you, Play while editing and Edit while playing.
    extra: pixelButton(t(`mode.${other}`), { icon: other === 'play' ? 'play' : 'pencil', flat: true, lit: true }, () => set({ mode: other })),
    relabel: mount,
  });
  barSlot.replaceChildren(bar, ...pops);
  sceneList.redraw();
  const editing = prefs.mode === 'edit';
  barUndo = u;
  barRedo = r;
  u!.hidden = r!.hidden = !editing;
  syncUndo();
  dockBox.hidden = !editing;
  dock.replaceChildren(...(editing ? toolbar() : []));
  inspector.panel.style.display = editing ? '' : 'none';
  inspect();
  showActions();
  if (brightToggle) brightToggle.hidden = !editing || !sceneNow().cave;
  viewport.style.background = sceneNow().cave ? '#000' : ocean.deep;
  fpsLine.hidden = !prefs.fps;
}

// ------------------------------------------------------------------ scene dialog

function sceneDialog(kind: 'new' | 'settings'): void {
  const scene = sceneNow();
  let name = kind === 'new' ? t('scene.first') : scene.name;
  let w = kind === 'new' ? 28 : scene.w;
  let hh = kind === 'new' ? 28 : scene.h;
  const kinds = [{ id: 'island', icon: 'palm' }, { id: 'sea', icon: 'flat' }, { id: 'cave', icon: 'rock' }] as const;
  let startWith: (typeof kinds)[number]['id'] = 'island';
  // A cave's own settings: how its dark looks and how much rubble lies about.
  const caveNow = kind === 'settings' ? scene.cave : undefined;
  let tint = caveNow?.tint ?? CAVE_DEFAULTS.tint;
  let dark = caveNow?.dark ?? CAVE_DEFAULTS.dark;
  let rubble = caveNow?.rubble ?? CAVE_DEFAULTS.rubble;
  let character = prefs.character;
  roster = loadRoster();
  if (!roster.some((c) => c.id === character)) character = '';
  const who: Option[] = [{ id: '', words: t('character.default') }, ...roster.map((c) => ({ id: c.id, words: c.name }))];
  const size = { min: MIN_SIZE, max: MAX_SIZE, width: 44 };
  const level = (label: string, icon: string, value: number, set: (n: number) => void) => field({ icon, tip: label }, pixelSlider(label, value, (v) => set(Math.round(v * 20) / 20), 60));
  // Any dark tint, a few good ones offered in the picker.
  const color = colorPicker(t('dialog.tint'), () => tint, (hex) => (tint = hex), { presets: [...CAVE_TINTS] });
  formDialog(t(kind === 'new' ? 'dialog.new' : 'dialog.settings'), [
    fields(
      field({ icon: 'pencil', tip: t('dialog.name') }, textField(t('dialog.name'), name, (v) => (name = v), { width: 80 })),
      field({ icon: 'grid', tip: `${t('dialog.width')}, ${t('dialog.height')}` }, h('div', { class: 'urow' },
        numberField({ words: 'W', tip: t('dialog.width') }, w, (n) => (w = n), size),
        numberField({ words: 'H', tip: t('dialog.height') }, hh, (n) => (hh = n), size))),
      ...(kind === 'new' ? [field({ icon: 'home', tip: t('dialog.kind') }, choice(t('dialog.kind'), kinds.map((k) => ({ id: k.id, icon: k.icon, words: t(`dialog.kind.${k.id}`) })), () => startWith, (id) => (startWith = id as typeof startWith), 'buttons'))] : []),
      ...(caveNow ? [field({ icon: 'palette', tip: t('dialog.tint') }, color), level(t('dialog.dark'), 'moon', dark, (n) => (dark = n)), level(t('dialog.rubble'), 'rock', rubble, (n) => (rubble = n))] : []),
      ...(kind === 'settings' ? [field({ icon: 'person', tip: t('character') }, choice(t('character'), who, () => character, (id) => (character = id), 'list'))] : []),
    ),
    ...(kind === 'new' ? [] : [h('p', { class: 'opts__tip' }, t('dialog.shrink')), link('../wardrobe/', t('character.edit'))]),
  ], () => {
    const label = name.trim().slice(0, 40) || t('scene.first');
    if (kind === 'new') {
      return switchTo(startWith === 'cave' ? createCave(label, w, hh) : createScene(label, w, hh, startWith === 'island'));
    }
    if (character !== prefs.character) {
      prefs.character = character;
      savePrefs();
      actor?.setLook(characterLook());
    }
    const next = w !== scene.w || hh !== scene.h ? resized(scene, w, hh) : scene;
    next.name = label;
    if (next.cave) Object.assign(next.cave, { tint, dark, rubble });
    library.scenes[library.scenes.indexOf(scene)] = next;
    switchTo(next);
  });
}

async function deleteScene(): Promise<void> {
  const scene = sceneNow();
  if (!(await confirmDialog(t('scene.confirmDelete', { name: scene.name })))) return;
  library.scenes = library.scenes.filter((s) => s !== scene);
  switchTo(library.scenes[0] ?? createScene(t('scene.first'), 28, 28, true));
}

async function importScene(): Promise<void> {
  let scene: Scene;
  try {
    scene = readSceneFile(await pickFile());
  } catch {
    say(t('scene.badFile'));
    return;
  }
  switchTo(scene);
  say(t('scene.imported', { name: scene.name }));
}

// ------------------------------------------------------------------ scene list

/** The scenes saved in the project (content/scenes) by file name; the dev server and the build both see them. */
const projectScenes = Object.entries(import.meta.glob('/src/content/scenes/*.json', { eager: true, import: 'default' }))
  .map(([file, data]) => ({ name: file.slice(file.lastIndexOf('/') + 1, -5), text: JSON.stringify(data) }));
/** The scenes of the editor, then the project's own that the editor has not opened yet (a tap on one opens a copy of it). */
const sceneTiles = () => [
  ...library.scenes.map((s) => ({ id: s.id, words: s.name, picture: sceneThumb(s) })),
  ...projectScenes.filter((p) => !library.scenes.some((s) => slug(s.name) === p.name)).map((p) => {
    let picture: HTMLCanvasElement | undefined;
    try { picture = sceneThumb(readSceneFile(p.text)); } catch { /* a broken file shows its name */ }
    return { id: `file:${p.name}`, words: p.name, picture };
  }),
];
/** A scene seen from above, one pixel per tile by its height, plants as dark dots. */
function sceneThumb(s: Scene): HTMLCanvasElement {
  const c = h('canvas', { width: String(s.w), height: String(s.h) });
  const g = c.getContext('2d')!;
  const im = g.createImageData(s.w, s.h);
  const put = (i: number, rgb: number[]) => { im.data.set([...rgb, 255], i * 4); };
  s.levels.forEach((l, i) => put(i, s.cave ? (s.paint[i] ? [226, 204, 140] : [0, 0, 0]) : l <= 0 ? [58, 124, 170] : l === 1 ? [226, 204, 140] : l === 2 ? [110, 160, 80] : [120, 116, 108]));
  for (const p of s.plants) { const i = Math.floor(p.j) * s.w + Math.floor(p.i); if (i >= 0 && i < s.w * s.h) put(i, [40, 90, 50]); }
  g.putImageData(im, 0, 0);
  const k = 52 / Math.max(s.w, s.h);
  c.style.width = `${s.w * k}px`;
  c.style.height = `${s.h * k}px`;
  return c;
}
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene';
for (const p of projectScenes) {
  try { projectCanon.set(p.name, canon(readSceneFile(p.text))); } catch { /* a broken file counts as not saved */ }
}
current = canon(sceneNow());
const sceneList = tileLibrary({
  key: 'pixel-scenes', label: t('scene.search'), empty: t('scene.none'), items: sceneTiles, selected: () => library.current,
  pick: (id) => {
    const file = projectScenes.find((p) => `file:${p.name}` === id);
    if (!file) return switchTo(library.scenes.find((s) => s.id === id)!);
    try { switchTo(readSceneFile(file.text)); } catch { say(t('scene.badFile')); }
  },
});
const side = sidePanel('left', 'pixel-scene-list', 200);
side.body.append(sceneList);

// ------------------------------------------------------------------ mount

function mount(): void {
  document.documentElement.lang = currentLang();
  document.title = t('title');
  canvas.setAttribute('aria-label', t('view'));
  brightToggle = toggle(t('bright'), { icon: 'sun' }, prefs.bright, (bright) => set({ bright }));
  viewport.replaceChildren(
    canvas,
    dockBox,
    h('div', { class: 'zoom' },
      pixelButton(t('scene.settings'), { icon: 'cog' }, () => sceneDialog('settings')),
      pixelButton(t('zoom.in'), { icon: 'zoomin' }, () => stepZoom(1)),
      pixelButton(t('zoom.out'), { icon: 'zoomout' }, () => stepZoom(-1)),
      pixelButton(t('rotate.left'), { icon: 'turnleft' }, () => rotate(-1)),
      pixelButton(t('rotate.right'), { icon: 'turnright' }, () => rotate(1)),
      brightToggle,
      toggle(t('zoom.grid'), { icon: 'grid' }, prefs.grid, (grid) => set({ grid })),
      toggle(t('zoom.colliders'), { icon: 'collider' }, prefs.colliders, (colliders) => set({ colliders })),
      toggle(t('zoom.fps'), { icon: 'gauge' }, prefs.fps, (fps) => set({ fps })),
      fpsLine,
    ),
    actions,
  );
  document.getElementById('scene')!.replaceChildren(
    h('div', { class: 'editor' },
      barSlot,
      h('div', { class: 'uworkspace' }, side.panel, viewport, inspector.panel),
    ),
  );
  render();
}

mount();
// Characters saved in the wardrobe in another tab show up when coming back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // Animals and characters edited in their own tools change in the scene, too.
  if (refreshLinks(world.scene)) {
    herd?.poses.forEach((pose, k) => { pose.hops = world.scene.animals[k].animal.hops; });
    sceneChanged();
  }
  if (prefs.mode !== 'edit') {
    roster = loadRoster();
    actor?.setLook(characterLook());
  }
});
new ResizeObserver(fitCanvas).observe(viewport);
setZoom(Math.max(2, Math.min(5, Math.floor(window.innerWidth / 360))));
centerOn(world.toView(sceneNow().spawn));
if (prefs.mode === 'play') {
  startPlay();
  render();
}
requestAnimationFrame(frame);
document.body.dataset.ready = '1';
