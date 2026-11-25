import './style.css';
import { frameDone, part } from '../../shared/stats.ts';
import { choice, rangeSlider, library as tileLibrary, sidePanel, colorPicker, confirmDialog, field, fields, formDialog, iconPicture, numberField, pixelButton, searchField, slider as pixelSlider, textField, tileGrid, toast, toggle, type Option } from '../../ui/components.ts';
import { pixelCanvas } from '../../shared/pixel-ui.ts';
import { C, S } from '../../ui/theme.ts';
import { canSaveToProject, removeFromProject, saveToProject } from '../../shared/project.ts';
import { defaultState, download, loadRoster, lookOf, pickFile, type Saved } from '../../engine/character/character.ts';
import { FRAMES } from '../../engine/flora/flora.ts';
import { FLORA, plantById } from '../../engine/flora/flora-catalog.ts';
import { blend, castShadow, footOf, layShadow, ROOM, stamp, withSunShadow, type Picture, type Pixels } from '../../engine/world/island.ts';
import { BRICK, BY_HEIGHT, heightAt, inside, isLand, isRock, LEVEL_PX, levelAt, MAX_LEVEL, MIN_LEVEL, MINE, PAINTS, setLevel, standingHeight, surfaceAt, TILE_H, TILE_W, toScreen } from '../../engine/world/terrain.ts';
import { Actor, EMOTES, type Carried, type Emote } from '../../engine/world/actor.ts';
import { CARRIED, itemPicture, LINKING, nameLink, openFrames, OWN, type PlacedItem } from '../../engine/world/props.ts';
import { OBJECT_PRESETS } from '../../engine/objects/object-presets.ts';
import { savedProps, type Build } from '../../engine/objects/object.ts';
import { LOOT } from '../../engine/world/loot.ts';
import { Herd } from '../../engine/world/herd.ts';
import { findPath, type Waypoint } from '../../engine/world/path.ts';
import {
  CAVE_DEFAULTS, CAVE_OPEN, cleanWalls, createCave, createScene, loadLibrary, MAX_HEADROOM, MAX_SIZE, MIN_SIZE, readSceneFile, refreshLinks, resized, saveLibrary, SCENE_PRESETS, sceneFile, SEEDS, setSettings, settingsOf, TURNS, type PlacedAnimal, type PlacedPerson, type PlacedPlant, type Scene, type SceneSettings,
} from '../../engine/world/scene.ts';
import { digHole } from '../../engine/world/scene.ts';
import { doorFits, ladderOn, type Climb, type DoorState } from '../../engine/world/ways.ts';
import { grows, rasterOf, smooth, World, type Rect, type Thing } from '../../engine/world/world.ts';
import { DECOR, decorById, decorPixels } from '../../engine/world/decor.ts';
import { bestRamp, CUT, HOLE, RAMP, rampDir, SMOOTH } from '../../engine/world/ground.ts';
import { carve, caveLamps, rockWallAt, caveThings, caveTint, CAVE_DAY, flicker } from '../../engine/world/cave.ts';
import { edgeBetween, edgeEnds, edgeKey, type Edge } from '../../engine/world/building/building.ts';
import { wallById, wallKinds, type WallKind } from '../../engine/world/building/walls.ts';
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
import { crowds, DESK_GAP, deskOf, freePlace, nearestFree, offsetOf, outline as deskOutline, placeFor, seenAt, seenCorner, tilesOf } from './desk.ts';
import { Overlay, type Line, type Pin } from './overlay.ts';

// The scene editor: build a scene's ground and plants in Edit, walk around it with a saved
// character in Play. Scenes, and the editor's own settings, are kept in this browser.

// ------------------------------------------------------------------ settings

/** Tints of a cave's dark to choose from: night blue first (the default), then deep green, purple, red-brown, brown and black. */
const CAVE_TINTS = [CAVE_DEFAULTS.tint, '#0a3a3a', '#2a1060', '#501010', '#3a2a08', '#000000'];

const TOOLS = ['move', 'ground', 'paint', 'walls', 'ways', 'prop', 'plant', 'decor', 'animal', 'person', 'item', 'erase', 'spawn', 'exit', 'settings'] as const;
type Tool = (typeof TOOLS)[number];
/**
 * What a stroke works as: a tool, or what the Ground tool does with a modifier key held (smooth, level) and what the
 * Ways tool does in a cell (shape: ramps and holes).
 */
type Work = Tool | 'smooth' | 'level' | 'shape';
/** A cave has ways out. */
const CAVE_ONLY: Tool[] = ['exit'];
/** What the Material tool paints, with its icon. */
/** What the Material tool paints: the top of the ground, or the faces of its steps and a cave's rock walls, as pressed; Shift both. */
type Target = 'floor' | 'walls' | 'both';
/** What the Ground tool makes of the edges of the cells it works on: leaves them, or makes them smooth or cut (ground.ts). */
const EDGES = [{ id: 'keep', icon: 'shapes' }, { id: 'soft', icon: 'smooth' }, { id: 'hard', icon: 'rect' }] as const;
type Edges = (typeof EDGES)[number]['id'];
/** What the Ways tool makes: a ladder or a door on an edge, a ramp or a hole in a cell. */
const WAYS = [{ id: 'ladder', icon: 'ladder' }, { id: 'door', icon: 'door' }, { id: 'ramp', icon: 'slope' }, { id: 'hole', icon: 'down' }] as const;
type WayPick = (typeof WAYS)[number]['id'];
/** The Ways tool's picks that work on cells (a stroke's `shape` work), not on edges. */
const cellWay = (way: WayPick): way is 'ramp' | 'hole' => way === 'ramp' || way === 'hole';
const toolsFor = (s: Scene) => TOOLS.filter((tool) => s.cave || !CAVE_ONLY.includes(tool));
const toolsHere = () => toolsFor(sceneNow());
/**
 * The tool at work in a scene: the one chosen, or Move where it has no use (a way out of a cave, on an island). The
 * choice is kept, so going back to an island brings the tool back.
 */
const toolIn = (s: Scene): Tool => (toolsFor(s).includes(prefs.tool) ? prefs.tool : 'move');
const toolNow = () => toolIn(sceneNow());
const BRUSHED: Work[] = ['ground', 'smooth', 'level', 'paint', 'erase'];
/** The tools that shape the ground: their strokes keep to one flat plane, and the tile under the pointer is read out. */
const SHAPING: Work[] = ['ground', 'smooth', 'level', 'shape'];
const GROUND_TOOLS: Tool[] = ['ground', 'paint'];
/** Whether the tool at work works on the ground's cells, so the tile under the pointer is outlined and read out: a ground tool, or Ways laying ramps or holes. */
const onGround = () => GROUND_TOOLS.includes(toolNow()) || (toolNow() === 'ways' && cellWay(prefs.way));
/** The tools that pick something up from the tile under a Ctrl-click (Cmd-click on a Mac) instead of working there. */
const PICKING: Tool[] = ['ground', 'paint'];

/** The modifier keys held, as last seen on a key or the pointer. */
const mods = { alt: false, shift: false, pick: false };
function readMods(e: { altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): void {
  mods.alt = e.altKey;
  mods.shift = e.shiftKey;
  mods.pick = e.ctrlKey || e.metaKey;
}
/** What a stroke of a tool works as with modifier keys held: the Ground tool smooths with Shift and levels with Alt. */
function withMods(tool: Tool, m: { alt?: boolean; shift?: boolean }): Work {
  if (m.shift && tool === 'ground') return 'smooth';
  if (m.alt && tool === 'ground') return 'level';
  return tool;
}
/** The tool at work in a scene with the modifier keys held now. */
const toolHeld = (s: Scene) => withMods(toolIn(s), mods);
const ZOOM = { min: 0.5, max: 8 };
const BRUSH_MAX = 7;
/** Each tool's icon in the pixel library. */
const TOOL_ICONS: Record<Work, string> = {
  move: 'pointer', ground: 'mountain', smooth: 'smooth', level: 'flat', shape: 'shapes', paint: 'brush', walls: 'wall', ways: 'ladder', prop: 'tool', exit: 'door', plant: 'palm', decor: 'shell', animal: 'paw', person: 'person', item: 'box', erase: 'eraser', spawn: 'flag', settings: 'cog',
};

interface Prefs {
  mode: 'edit' | 'play';
  tool: Tool;
  /** 0 by height, otherwise `PAINTS[n - 1]`. */
  paint: number;
  /** The height the Ground tool levels to with Alt, picked with Ctrl-click; null for the height where a stroke starts. */
  levelTo: number | null;
  /** What the Ground tool makes of the edges of the cells it works on. */
  edges: Edges;
  /** The kind of wall the Walls tool builds (building/walls.ts). */
  wall: string;
  /** What the Ways tool makes: a ladder up a step or a door, on an edge; a ramp or a hole, in a cell. */
  way: WayPick;
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
  /** The water drawn while editing; hidden, the sea floor shows bare. */
  water: boolean;
  /** What stops a walker drawn in red. */
  colliders: boolean;
  /** Frames per second under the zoom buttons. */
  fps: boolean;
  /** A cave evenly lit while editing, rather than as dark as in Play. */
  bright: boolean;
}
const PREFS_KEY = 'pixel-scenes-ui';
function loadPrefs(): Prefs {
  const prefs: Prefs = { mode: 'edit', tool: 'ground', paint: 2, levelTo: null, edges: 'keep', wall: 'brick', way: 'ladder', brush: 1, plant: FLORA.find((e) => e.category === 'palm')?.id ?? FLORA[0].id, prop: propKinds()[0]?.id ?? '', propQuery: '', decor: DECOR[0].id, item: 'crate', itemTurn: 0, animal: `preset:${PRESETS[0].id}`, character: '', person: '', pose: '', poseFrame: 0, rot: 0, grid: false, water: true, colliders: false, fps: false, bright: false };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    if (saved?.mode === 'edit' || saved?.mode === 'play') prefs.mode = saved.mode;
    if (TOOLS.includes(saved?.tool)) prefs.tool = saved.tool;
    if (Number.isInteger(saved?.paint) && saved.paint >= 0 && saved.paint <= PAINTS.length) prefs.paint = saved.paint;
    if (Number.isInteger(saved?.levelTo) && saved.levelTo >= MIN_LEVEL && saved.levelTo <= MAX_LEVEL) prefs.levelTo = saved.levelTo;
    if (typeof saved?.wall === 'string' && wallById(saved.wall)) prefs.wall = saved.wall;
    if (WAYS.some((p) => p.id === saved?.way)) prefs.way = saved.way;
    if (EDGES.some((p) => p.id === saved?.edges)) prefs.edges = saved.edges;
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
    prefs.water = saved?.water !== false;
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
/** A scene's world in the editor: drawn alone while editing, so the other scenes on the desk show round it. */
function worldFor(scene: Scene): World {
  const w = new World(scene, prefs.rot);
  w.alone = prefs.mode === 'edit';
  return w;
}
let world = worldFor(sceneNow());
let groundDirty = false;
let version = 0;

/**
 * A scene as text to compare, without its id (a new one on every import) or its place on the desk (opening a scene
 * or moving it about is no change to save; the place is saved along with one).
 */
const canon = (scene: Scene): string => {
  const file = JSON.parse(sceneFile(scene));
  delete file.scene.id;
  delete file.scene.desk;
  return JSON.stringify(file);
};
/** The scene shown as it was last stored, and each project scene file (by name) as it reads back: they differ when there is something to save. */
let current = '';
const projectCanon = new Map<string, string>();
/** The scenes changed since the page opened, by id: Save writes these (and the edited one) where they differ from the project. */
const changedHere = new Set<string>();
/**
 * The project file a renamed scene was read from or last saved as (its name then), by scene id: once the scene is
 * saved under its new name, that file is removed, so the game does not see the scene twice.
 */
const fileOf = new Map<string, string>();
/** A scene as text to compare with its project file: the edited one as last stored, the others worked out after each change. */
const canonMemo = new WeakMap<Scene, { version: number; text: string }>();
function textOf(s: Scene): string {
  if (s === sceneNow()) return current;
  const m = canonMemo.get(s);
  if (m?.version === version) return m.text;
  const text = canon(s);
  canonMemo.set(s, { version, text });
  return text;
}
/** What Save writes: the edited scene and every one changed here, each where it differs from its project file. */
const scenesToSave = () => library.scenes.filter((s) => (s.id === library.current || changedHere.has(s.id)) && textOf(s) !== projectCanon.get(slug(s.name)));
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

/**
 * The scenes as they were before each of the last edits, to step back to. One list for every scene: a step holds
 * each scene the edit changed, whole and by its id (most edits change one; carrying a thing into another scene or
 * linking two ways changes two or more), so stepping back to an edit of another scene edits that one again.
 */
const undoStack: Scene[][] = [];
const UNDO_MAX = 40;
/** The steps undone, to step forward to again; any new edit empties it. */
const redoStack: Scene[][] = [];
let barUndo: HTMLButtonElement | null = null;
let barRedo: HTMLButtonElement | null = null;
const syncUndo = () => {
  if (barUndo) barUndo.disabled = !undoStack.length;
  if (barRedo) barRedo.disabled = !redoStack.length;
};
/**
 * Keeps a scene (the edited one if none is given) as it is now, before an edit changes it: as a step of its own, or
 * with `join` as part of the last step, which then undoes both together (a scene already in it is kept as it was).
 */
function remember(scene = world.scene, join = false): void {
  world.commit();
  redoStack.length = 0;
  changedHere.add(scene.id);
  const last = undoStack[undoStack.length - 1];
  if (join && last) {
    if (!last.some((s) => s.id === scene.id)) last.push(structuredClone(scene));
    return;
  }
  undoStack.push([structuredClone(scene)]);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
}
/** Drops the steps back and forward of one scene (one gone, or changed in a way that is not undone), or of all. */
function forget(id?: string): void {
  for (const stack of [undoStack, redoStack]) {
    const kept = stack.map((step) => step.filter((s) => id !== undefined && s.id !== id)).filter((step) => step.length);
    stack.splice(0, stack.length, ...kept);
  }
  syncUndo();
}
/**
 * Puts `scene` (the same scene as it was before or after an edit) in place of its scene now. It stays where that one
 * lies on the desk: undoing an edit does not move a scene about. The edited scene is shown with `show`.
 */
function putBack(scene: Scene): Scene | null {
  const now = library.scenes.find((s) => s.id === scene.id);
  if (!now) return null;
  if (now.desk) scene.desk = { ...now.desk };
  else delete scene.desk;
  library.scenes[library.scenes.indexOf(now)] = scene;
  dropLying(scene.id);
  return now;
}
/** Shows `scene` (as it was before or after an edit) in place of its scene now, and edits it. */
function show(scene: Scene): void {
  const now = library.scenes.find((s) => s.id === scene.id);
  if (!now) return;
  if (scene.id !== world.scene.id) switchTo(now, library.open.includes(now.id));
  putBack(scene);
  world = worldFor(scene);
  selected = null;
  sceneChanged();
  showOptions();
  showCut();
}
/**
 * One step back or forward: its scenes are kept as they are now on the other list, then put back as they were. The
 * edited scene stays the edited one if the step changed it; otherwise its first scene is edited.
 */
function step(from: Scene[][], to: Scene[][]): void {
  const then = from.pop();
  if (!then) return;
  world.commit();
  const known = then.filter((s) => library.scenes.some((n) => n.id === s.id));
  if (!known.length) return syncUndo();
  to.push(known.map((s) => structuredClone(library.scenes.find((n) => n.id === s.id)!)));
  const edited = known.find((s) => s.id === world.scene.id) ?? known[0];
  for (const s of known) if (s !== edited) putBack(s);
  show(edited);
}
const undo = () => step(undoStack, redoStack);
const redo = () => step(redoStack, undoStack);

/**
 * Edits another scene: it is opened on the desk if it is not there yet, and the one edited so far stays on the desk
 * beside it. `keepView` keeps the desk where it is on the screen (a scene picked on the desk); otherwise the view goes
 * to the new scene's start.
 */
function switchTo(scene: Scene, keepView = false): void {
  if (saveTimer) store();
  // A scene kept from before an undo put it back is edited as it is now.
  scene = library.scenes.find((s) => s.id === scene.id) ?? scene;
  if (!library.scenes.includes(scene)) library.scenes.push(scene);
  placeOnDesk(scene);
  const before = offsetOf(world);
  // The scene edited so far lies on the desk as it is now (its world is kept, so it need not be worked out again).
  if (world.scene.id !== scene.id && library.open.includes(world.scene.id)) lay(world);
  library.current = scene.id;
  selected = null;
  const kept = lying.get(scene.id);
  world = kept?.world.scene === scene ? kept.world : worldFor(scene);
  dropLying(scene.id);
  world.alone = prefs.mode === 'edit';
  if (world.rot !== prefs.rot) world.setRotation(prefs.rot);
  store();
  if (keepView) {
    const after = offsetOf(world);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
  } else centerOn(world.toView(scene.spawn));
  if (prefs.mode === 'play') startPlay();
  version++;
  render();
}

// ------------------------------------------------------------------ the desk

// While editing, the scenes open on the desk lie side by side (desk.ts), the one being edited among them. The others
// are drawn once into pictures and kept until the view turns; a click on one edits it. In Play only the scene played shows.

/** An open scene other than the one edited: its world (kept, so going back to it is quick), its picture and what that was drawn for. */
interface Lying { world: World; picture: HTMLCanvasElement; drawn: string }
const lying = new Map<string, Lying>();
/** How far a lying scene's picture reaches past its ground image: up for what stands on its back rows, aside and down for wide things. */
const PAD = { x: 16, y: 48 };
/** The desk round the scenes. */
const DESK = '#2b2936';

const openScenes = () => library.open.map((id) => library.scenes.find((s) => s.id === id)).filter((s): s is Scene => !!s);

/** Opens a scene on the desk; one with no place there yet, or one too near another open scene, gets a free place. */
function placeOnDesk(scene: Scene): void {
  if (!library.open.includes(scene.id)) library.open.push(scene.id);
  const others = openScenes().filter((s) => s.id !== scene.id);
  if (!scene.desk || others.some((o) => crowds(deskOf(scene), scene, o))) scene.desk = freePlace(scene, others, prefs.rot);
  version++;
}
/** Leaves a world lying on the desk, as the scene is when not played. */
function lay(w: World): void {
  w.loose = null;
  w.alone = true;
  lying.set(w.scene.id, { world: w, picture: h('canvas', {}), drawn: '' });
}
function dropLying(id: string): void {
  lying.delete(id);
}
function lyingOf(scene: Scene): Lying {
  let l = lying.get(scene.id);
  if (l?.world.scene !== scene) {
    lay(worldFor(scene));
    l = lying.get(scene.id)!;
  }
  return l;
}

/** The scene a way leads to, by file name: the editor's own of that name, else the project's file, kept in the editor from now on. */
function sceneNamed(name: string): Scene | null {
  const own = library.scenes.find((s) => slug(s.name) === name);
  if (own) return own;
  const file = projectScenes.find((p) => p.name === name);
  if (!file) return null;
  try {
    const scene = readSceneFile(file.text);
    library.scenes.push(scene);
    return scene;
  } catch {
    return null;
  }
}
/**
 * Opens a scene on the desk at `at` without editing it; a scene open already moves there. The place is taken as it
 * is: the caller has made sure it is free (`nearestFree`).
 */
function openAt(scene: Scene, at: { i: number; j: number }): void {
  if (!library.scenes.includes(scene)) library.scenes.push(scene);
  if (library.open.includes(scene.id)) moveOnDesk(scene, at);
  else {
    scene.desk = at;
    library.open.push(scene.id);
  }
  store();
  version++;
  render();
}
/** Takes a scene off the desk (it stays in the list); the last one stays. */
function closeScene(id: string): void {
  if (library.open.length < 2) return;
  library.open = library.open.filter((o) => o !== id);
  dropLying(id);
  if (id === library.current) return switchTo(openScenes()[openScenes().length - 1], true);
  store();
  version++;
  render();
}

/** Moves a scene on the desk. The one being edited moves on the screen while the others stay. */
function moveOnDesk(scene: Scene, at: { i: number; j: number }): void {
  const before = offsetOf(world);
  scene.desk = at;
  if (scene.id === world.scene.id) {
    const after = offsetOf(world);
    cam.x -= after.x - before.x;
    cam.y -= after.y - before.y;
  }
  version++;
}

/** Whether a scene is dark but where its lights reach (`SceneSettings.light`). */
const isDark = (s: Scene) => settingsOf(s).light === 'dark';

/** The start point, shown while editing: a small flag. */
function flagOf(w: World): Thing {
  const s = w.toView(w.scene.spawn);
  const level = levelAt(w.map, Math.floor(s.i), Math.floor(s.j));
  return { spot: { i: s.i, j: s.j, level: isRock(level) ? w.flatLevel : Math.max(w.water, level) }, picture: FLAG, w: 6, h: 13, foot: { x: 0, y: 12 } };
}

/** Draws a lying scene's picture again if the view turned (or the cave's light was switched) since it was last drawn. */
function drawLying(l: Lying): void {
  const key = `${l.world.rot}|${prefs.bright}`;
  if (l.drawn === key) return;
  l.drawn = key;
  const w = l.world;
  const g = w.ground;
  const things: Thing[] = [
    ...w.plantThings(0), ...w.decorThings(0), ...w.animalThings(0), ...w.itemThings(), ...w.propThings(0),
    ...w.scene.people.map((p) => personThing(p, 0, w)),
    ...(w.scene.cave ? caveThings(w) : []),
    ...w.wallThings(),
    flagOf(w),
  ];
  const view = { x: -PAD.x, y: -PAD.y, w: g.w + 2 * PAD.x, h: g.h + PAD.y + PAD.x };
  const image = w.compose(view, things, undefined, false, 0, false);
  if (isDark(w.scene) && !prefs.bright) lightByTile(image, caveTint(w.scene), 0, w.spots!, w.lightField(caveLamps(w, 0)));
  l.picture.width = view.w;
  l.picture.height = view.h;
  l.picture.getContext('2d')!.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, view.w, view.h), 0, 0);
}

/** The edited scene's picture, as composed, ready to be drawn over what lies behind it. */
const layer = h('canvas', {});
/** What is shown over the desk at the screen's own size: the scenes' tabs, the stubs of ways. */
const overlay = new Overlay();
/** Paints the desk: the scenes on it back to front, the edited one (its picture just composed) among them; in Play only that one. */
function paintDesk(image: { data: Uint8ClampedArray; width: number; height: number }, view: Rect): void {
  if (layer.width !== image.width || layer.height !== image.height) {
    layer.width = image.width;
    layer.height = image.height;
  }
  layer.getContext('2d')!.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const here = offsetOf(world);
  const scenes = prefs.mode === 'edit' ? openScenes() : [world.scene];
  const bottom = (s: Scene) => deskOutline(s, prefs.rot)[2].y;
  for (const s of scenes.sort((a, b) => bottom(a) - bottom(b))) {
    if (s.id === world.scene.id) {
      ctx.drawImage(layer, 0, 0);
      continue;
    }
    const l = lyingOf(s);
    drawLying(l);
    const o = offsetOf(l.world);
    const at = { x: Math.round(o.x - here.x - view.x), y: Math.round(o.y - here.y - view.y) };
    ctx.drawImage(l.picture, at.x - PAD.x, at.y - PAD.y);
    if (away?.scene === s && toolIn(s) !== 'move') paintBrushAway(l, away.tile, at);
  }
  const toCanvas = (p: { x: number; y: number }) => ({ x: Math.round(p.x - here.x - view.x), y: Math.round(p.y - here.y - view.y) });
  if (ghost) {
    // Where a scene dragged from the list lands: white where it was let go, orange when moved aside to a free place.
    const corners = deskOutline({ ...ghost.scene, desk: ghost.at }, prefs.rot).map(toCanvas);
    ctx.fillStyle = ghost.moved ? '#f0b35a33' : '#ffffff26';
    ctx.beginPath();
    corners.forEach((c, k) => (k ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.fill();
    corners.forEach((c, k) => pixelLine(c, corners[(k + 1) % 4], ghost!.moved ? '#f0b35a' : '#ffffff'));
  }
  // The scenes' names and the ways to scenes not open, over the desk at the screen's own size.
  const editing = prefs.mode === 'edit';
  const ways = editing ? waysOnDesk() : [];
  const pins = editing ? [
    ...stubs(ways).map(stubPin),
    ...ways.filter((w) => w.scene.id === world.scene.id).map(handlePin),
    ...openScenes().map(tabPin),
  ] : [];
  const lines = editing ? [...linkLines(ways), ...linkDragLine()] : [];
  overlay.show(pins, (p) => ({ x: (p.x - here.x - view.x) * zoom, y: (p.y - here.y - view.y) * zoom }), lines);
}

/** A line of whole pixels on the desk canvas, as the pixel art is drawn; thicker when zoomed out, so it still shows. */
function pixelLine(a: { x: number; y: number }, b: { x: number; y: number }, color: string): void {
  ctx.fillStyle = color;
  const t = Math.max(1, Math.round(1.5 / zoom)), o = Math.floor(t / 2);
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
  for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(a.x + ((b.x - a.x) * k) / n) - o, Math.round(a.y + ((b.y - a.y) * k) / n) - o, t, t);
}

/** A scene being dragged from the list over the desk: where it would land, and whether it was moved aside to a free place. */
let ghost: { scene: Scene; at: { i: number; j: number }; moved: boolean } | null = null;

/** Where on the desk a scene let go at the pointer lands: its middle under the pointer, or the nearest free place to that. */
function landing(scene: Scene, e: { clientX: number; clientY: number }): { at: { i: number; j: number }; moved: boolean } {
  const p = groundPixel(e);
  const here = offsetOf(world);
  const want = placeFor(scene, seenAt(p.x + here.x, p.y + here.y), prefs.rot);
  const at = nearestFree(scene, want, openScenes().filter((o) => o.id !== scene.id));
  return { at, moved: at.i !== want.i || at.j !== want.j };
}

// Ways between scenes on the desk. A way (hole or ladder) whose scene is not on the desk gets a stub: a short line to a
// label naming that scene, which a click opens beside the way. Once that scene is open a line joins the two ways
// (dashed where the other end does not lead back). Each way of the edited scene has a handle to drag onto another way
// to link the two, or onto open ground to make the way there.

/** A way (hole or ladder) in an open scene: the scene, its world, the way itself, where it is seen and on the desk. */
interface Way { scene: Scene; w: World; item: PlacedItem; vi: number; vj: number; at: { x: number; y: number } }
function waysOnDesk(): Way[] {
  const out: Way[] = [];
  for (const s of openScenes()) {
    const w = s.id === world.scene.id ? world : lyingOf(s).world;
    const o = offsetOf(w);
    // While editing nothing is carried, so the seen items are the scene's own, in the same order.
    w.viewItems().forEach((v, k) => {
      const item = w.scene.items[k];
      if (!item || !LINKING.includes(item.item)) return;
      const g = toScreen(v.vi, v.vj, standingHeight(w.map, v.vi, v.vj));
      out.push({ scene: s, w, item, vi: v.vi, vj: v.vj, at: { x: g.x + w.ground.origin.x + o.x, y: g.y + w.ground.origin.y + o.y } });
    });
  }
  return out;
}
const wayName = (s: Scene, id: string | undefined) => `${slug(s.name)}:${id}`;
const leadsTo = (a: Way, b: Way) => a.item.to?.scene === slug(b.scene.name) && a.item.to.id === b.item.id;

/** The lines between ways whose both ends are open: one per pair that leads both ways, dashed where only one end leads. */
function linkLines(ways: Way[]): Line[] {
  const byName = new Map(ways.map((w) => [wayName(w.scene, w.item.id), w]));
  const out: Line[] = [];
  for (const a of ways) {
    const b = a.item.to && byName.get(`${a.item.to.scene}:${a.item.to.id}`);
    if (!b || b === a) continue;
    const back = leadsTo(b, a);
    if (back && wayName(a.scene, a.item.id) > wayName(b.scene, b.item.id)) continue;
    out.push({ from: a.at, to: b.at, color: STUB_LINE, dashed: !back });
  }
  return out;
}

/** A way leading off the desk: where it is and where its label goes (desk pixels), its scene's file name and name. */
interface Stub { key: string; way: { x: number; y: number }; out: { x: number; y: number }; to: string; name: string; seen: { i: number; j: number }; dir: { i: number; j: number } }
const STUB_LINE = '#f0b35a';
/** How far a label stands from its way, in screen pixels, at any zoom. */
const STUB_REACH = 72;

/** The scene a way leads to by file name, if there is one, without opening it: the editor's own of that name, else the project's file. */
function nameOfScene(file: string): string | null {
  const own = library.scenes.find((s) => slug(s.name) === file);
  if (own) return own.name;
  const p = projectScenes.find((p) => p.name === file);
  if (!p) return null;
  p.title ??= (() => { try { return readSceneFile(p.text).name; } catch { return p.name; } })();
  return p.title;
}

function stubs(ways = waysOnDesk()): Stub[] {
  const open = new Set(openScenes().map((s) => slug(s.name)));
  const out: Stub[] = [];
  for (const { scene: s, w, item: it, vi, vj, at: way } of ways) {
    if (!it.to || open.has(it.to.scene)) continue;
    const name = nameOfScene(it.to.scene);
    if (!name) continue;
    const corner = seenCorner(s, w.rot);
    const [sw, sh] = w.rot % 2 ? [s.h, s.w] : [s.w, s.h];
    // Out from the scene's middle through the way, as seen; a way in the very middle points east on the screen.
    let di = vi - sw / 2, dj = vj - sh / 2;
    const len = Math.hypot(di, dj);
    [di, dj] = len > 0.5 ? [di / len, dj / len] : [Math.SQRT1_2, -Math.SQRT1_2];
    const sx = (di - dj) * (TILE_W / 2), sy = (di + dj) * (TILE_H / 2);
    const sl = Math.hypot(sx, sy) || 1;
    out.push({
      key: `${s.id}:${it.to.scene}:${it.to.id}:${Math.floor(vi)},${Math.floor(vj)}`, way,
      out: { x: (sx / sl) * STUB_REACH, y: (sy / sl) * STUB_REACH },
      to: it.to.scene, name, seen: { i: corner.i + vi, j: corner.j + vj }, dir: { i: di, j: dj },
    });
  }
  return out;
}

/** Opens the scene a stub leads to, without editing it: at its own place on the desk if that is free, else beside the way. */
function openStub(st: Stub): void {
  const target = sceneNamed(st.to);
  if (!target || library.open.includes(target.id)) return;
  const others = openScenes().filter((o) => o.id !== target.id);
  if (target.desk && !others.some((o) => crowds(target.desk!, target, o))) return openAt(target, target.desk);
  const out = Math.max(target.w, target.h) / 2 + DESK_GAP + 1;
  const want = placeFor(target, { i: st.seen.i + st.dir.i * out, j: st.seen.j + st.dir.j * out }, prefs.rot);
  openAt(target, nearestFree(target, want, others));
}

/** A stub as a pin over the desk: a line from the way out to a label naming the scene, which opens it. */
function stubPin(st: Stub): Pin {
  return {
    key: `stub:${st.key}:${st.name}`, at: st.way, out: st.out, line: STUB_LINE,
    make: () => {
      // The stub as it is when clicked (the view may have turned since the label was made).
      const b = pixelButton(t('desk.stub', { name: st.name }), { icon: 'right', words: st.name }, () => {
        const now = stubs().find((x) => x.key === st.key);
        if (now) openStub(now);
      });
      b.classList.add('desk-stub');
      return b;
    },
  };
}

/**
 * Linking by drag: from a way's handle to another way (any open scene, this one too), which links the two both ways;
 * or onto open ground of an open scene, which makes the other end there (a ladder for a hole, a hole for a ladder).
 */
let linkDrag: { pointer: number; from: Way; at: { x: number; y: number }; to: LinkEnd | null } | null = null;
type LinkEnd = { way: Way } | { scene: Scene; w: World; tile: { i: number; j: number } };

/** Where a link let go at the pointer would end: a way near it, else open ground (above the water) of an open scene. */
function linkEnd(e: { clientX: number; clientY: number }, from: Way): LinkEnd | null {
  const p = groundPixel(e);
  const here = offsetOf(world);
  const at = { x: p.x + here.x, y: p.y + here.y };
  let best: Way | null = null;
  let near = 14 / zoom + 6;
  for (const w of waysOnDesk()) {
    const d = Math.hypot(w.at.x - at.x, w.at.y - at.y);
    if (w.item !== from.item && d < near) [best, near] = [w, d];
  }
  if (best) return { way: best };
  const tile = world.tileAt(p.x, p.y);
  const ground = tile ? { scene: world.scene, w: world, tile } : (() => {
    const away = awayUnder(e);
    return away && { scene: away.scene, w: lyingOf(away.scene).world, tile: away.tile };
  })();
  return ground && isLand(ground.w.map, ground.tile.i, ground.tile.j) ? ground : null;
}

/** The line of a link being dragged: to where it would end, or loose and dashed to the pointer. */
function linkDragLine(): Line[] {
  const d = linkDrag;
  if (!d) return [];
  return [{ from: d.from.at, to: d.to && 'way' in d.to ? d.to.way.at : d.at, color: d.to ? STUB_LINE : '#ffffff', dashed: !d.to }];
}

/** A way's handle as a pin, just below the way: dragged, it links the way. */
function handlePin(way: Way): Pin {
  return {
    key: `handle:${way.scene.id}:${way.item.id ?? `${Math.floor(way.vi)},${Math.floor(way.vj)}`}`, at: way.at, out: { x: 0, y: 10 }, align: { x: 0.5, y: 0 },
    make: () => {
      const b = pixelButton(t('desk.link'), { icon: 'link' }, () => {});
      b.classList.add('desk-handle');
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || linkDrag) return;
        // The way as it is now (the pin is kept while its key stays, and the way may have moved since).
        const from = waysOnDesk().find((w) => w.item === way.item || (w.scene.id === way.scene.id && !!w.item.id && w.item.id === way.item.id));
        if (!from) return;
        e.stopPropagation();
        b.setPointerCapture(e.pointerId);
        document.body.classList.add('desk-dragging');
        linkDrag = { pointer: e.pointerId, from, at: from.at, to: null };
      });
      b.addEventListener('pointermove', (e) => {
        const d = linkDrag;
        if (!d || e.pointerId !== d.pointer) return;
        const p = groundPixel(e);
        const here = offsetOf(world);
        d.at = { x: p.x + here.x, y: p.y + here.y };
        d.to = linkEnd(e, d.from);
        version++;
      });
      const drop = (e: PointerEvent) => {
        const d = linkDrag;
        if (!d || e.pointerId !== d.pointer) return;
        linkDrag = null;
        document.body.classList.remove('desk-dragging');
        version++;
        if (e.type === 'pointerup' && d.to) linkWays(d.from, d.to);
      };
      b.addEventListener('pointerup', drop);
      b.addEventListener('pointercancel', drop);
      return b;
    },
  };
}

/** Links a way to the end it was dragged to, both ways, making the way there first if it was dropped on open ground. */
function linkWays(from: Way, to: LinkEnd): void {
  remember(from.scene);
  let there: { scene: Scene; item: PlacedItem };
  if ('way' in to) {
    remember(to.way.scene, true);
    there = { scene: to.way.scene, item: to.way.item };
  } else {
    remember(to.scene, true);
    const item: PlacedItem = { item: from.item.item === 'hole' ? 'ladder' : 'hole', ...to.w.toData({ i: to.tile.i + 0.5, j: to.tile.j + 0.5 }) };
    nameLink(to.scene.items, item);
    to.scene.items.push(item);
    if (item.item === 'hole') {
      digHole(to.scene, item);
      if (to.scene.id === world.scene.id) world.setRotation(world.rot);
    }
    there = { scene: to.scene, item };
  }
  nameLink(from.scene.items, from.item);
  nameLink(there.scene.items, there.item);
  from.item.to = { scene: slug(there.scene.name), id: there.item.id! };
  there.item.to = { scene: slug(from.scene.name), id: from.item.id! };
  // A scene lying on the desk is drawn again with its new way.
  if (there.scene.id !== world.scene.id) dropLying(there.scene.id);
  sceneChanged();
  showOptions();
}

/** The open scene other than the edited one whose ground is under the pointer, the front-most, and its tile there. */
function awayUnder(e: { clientX: number; clientY: number }): { scene: Scene; tile: { i: number; j: number } } | null {
  const p = groundPixel(e);
  if (world.tileAt(p.x, p.y)) return null;
  const here = offsetOf(world);
  const bottom = (s: Scene) => deskOutline(s, prefs.rot)[2].y;
  for (const s of openScenes().sort((a, b) => bottom(b) - bottom(a))) {
    if (s.id === world.scene.id) continue;
    const l = lyingOf(s);
    const o = offsetOf(l.world);
    const tile = l.world.tileAt(p.x + here.x - o.x, p.y + here.y - o.y);
    if (tile) return { scene: s, tile };
  }
  return null;
}

/**
 * The brush over another scene on the desk, where the pointer is: that scene's tiles it would work on, tinted over its
 * picture, as the edited scene shows its own. Made again only when the tile, the tool or the brush changes.
 */
const brushAway = h('canvas', {});
let brushAwayKey = '';
let brushAwayAt = { x: 0, y: 0 };
function paintBrushAway(l: Lying, tile: { i: number; j: number }, at: { x: number; y: number }): void {
  const w = l.world;
  const key = `${w.scene.id}|${tile.i},${tile.j}|${toolIn(w.scene)}|${prefs.brush}|${w.rot}|${version}`;
  if (key !== brushAwayKey) {
    brushAwayKey = key;
    const cells = new Set(brushCells(tile, toolIn(w.scene), w));
    const [r, g, b, a] = cannotEdit(tile, w) ? [224, 51, 46, 0x99] : [255, 255, 255, 0x66];
    // Only the ground round the brush is looked through: its tiles' tops, and their cliffs below them.
    const spots = [...cells].map((c) => w.screenOf((c % w.map.w) + 0.5, Math.floor(c / w.map.w) + 0.5));
    const x0 = Math.max(0, Math.floor(Math.min(...spots.map((p) => p.x)) - TILE_W));
    const x1 = Math.min(w.ground.w, Math.ceil(Math.max(...spots.map((p) => p.x)) + TILE_W));
    const y0 = Math.max(0, Math.floor(Math.min(...spots.map((p) => p.y)) - TILE_H));
    const y1 = Math.min(w.ground.h, Math.ceil(Math.max(...spots.map((p) => p.y)) + TILE_H + (MAX_LEVEL - MIN_LEVEL) * (TILE_H / 2)));
    brushAway.width = Math.max(1, x1 - x0);
    brushAway.height = Math.max(1, y1 - y0);
    const image = new ImageData(brushAway.width, brushAway.height);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!cells.has(w.ground.cell[y * w.ground.w + x])) continue;
      const o = ((y - y0) * brushAway.width + (x - x0)) * 4;
      image.data[o] = r; image.data[o + 1] = g; image.data[o + 2] = b; image.data[o + 3] = a;
    }
    brushAway.getContext('2d')!.putImageData(image, 0, 0);
    brushAwayAt = { x: x0, y: y0 };
  }
  ctx.drawImage(brushAway, at.x + brushAwayAt.x, at.y + brushAwayAt.y);
}

// Each open scene has a tab above its north corner: its name, to pick it or drag it about the desk, and a button to close it.
let tabDrag: { pointer: number; scene: Scene; tab: HTMLElement; x: number; y: number; from: { i: number; j: number }; moved: boolean; ok: boolean } | null = null;

/** A scene's tab as a pin over the desk, just above its north corner as seen. */
function tabPin(scene: Scene): Pin {
  const here = scene.id === library.current;
  const closes = library.open.length > 1;
  return {
    key: `tab:${scene.id}:${scene.name}:${scene.cave ? 'cave' : 'island'}:${here}:${closes}`,
    at: deskOutline(scene, prefs.rot)[0], out: { x: 0, y: -6 }, align: { x: 0.5, y: 1 },
    make: () => tabOf(scene, here, closes),
  };
}
function tabOf(shown: Scene, here: boolean, closes: boolean): HTMLElement {
  const name = pixelButton(shown.name, { icon: shown.cave ? 'rock' : 'palm', words: shown.name, lit: here }, () => {});
  const close = pixelButton(t('desk.close'), { icon: 'close' }, () => closeScene(shown.id));
  close.hidden = !closes;
  close.addEventListener('pointerdown', (e) => e.stopPropagation());
  const tab = h('div', { class: 'desk-tab' }, name, close);
  tab.addEventListener('pointerdown', (e) => {
    // The scene as it is now: the tab is kept while it looks the same, and an undo may have put back the scene since.
    const scene = library.scenes.find((s) => s.id === shown.id);
    if (e.button !== 0 || tabDrag || !scene) return;
    tab.setPointerCapture(e.pointerId);
    tabDrag = { pointer: e.pointerId, scene, tab, x: e.clientX, y: e.clientY, from: deskOf(scene), moved: false, ok: true };
  });
  tab.addEventListener('pointermove', (e) => {
    const d = tabDrag;
    if (!d || e.pointerId !== d.pointer) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.moved = true;
    const step = tilesOf((e.clientX - d.x) / zoom, (e.clientY - d.y) / zoom, prefs.rot);
    moveOnDesk(d.scene, { i: d.from.i + step.i, j: d.from.j + step.j });
    // Let go too near another scene, it goes back to where it was.
    d.ok = !openScenes().some((o) => o.id !== d.scene.id && crowds(deskOf(d.scene), d.scene, o));
    d.tab.classList.toggle('desk-tab--crowded', !d.ok);
  });
  tab.addEventListener('pointerup', dropTab);
  tab.addEventListener('pointercancel', dropTab);
  return tab;
}
function dropTab(e: PointerEvent): void {
  const d = tabDrag;
  if (!d || e.pointerId !== d.pointer) return;
  tabDrag = null;
  d.tab.classList.remove('desk-tab--crowded');
  if (!d.moved) {
    if (d.scene.id !== world.scene.id) switchTo(d.scene, true);
    return;
  }
  if (!d.ok) moveOnDesk(d.scene, d.from);
  store();
  render();
}

// ------------------------------------------------------------------ page helpers

/**
 * Saves the scenes changed here as files of the project (the game's content/scenes), for committing: every one that
 * differs from its file, so a change that reached into other scenes (a thing carried over, a link, a rename) is saved
 * whole. A renamed scene's old file goes once it is saved under its new name.
 */
async function saveScenes(): Promise<boolean> {
  store();
  const done: string[] = [];
  for (const s of scenesToSave()) {
    const name = slug(s.name);
    const data = JSON.parse(sceneFile(s));
    if (!(await saveToProject(`scenes/${name}.json`, data))) {
      say(t('scene.projectFail'));
      return false;
    }
    done.push(`scenes/${name}.json`);
    projectCanon.set(name, textOf(s));
    const text = JSON.stringify(data);
    const known = projectScenes.find((p) => p.name === name);
    if (known) Object.assign(known, { text, title: s.name });
    else projectScenes.push({ name, text, title: s.name });
    changedHere.delete(s.id);
    const old = fileOf.get(s.id);
    fileOf.delete(s.id);
    if (old && old !== name && !library.scenes.some((o) => slug(o.name) === old) && (await removeFromProject(`scenes/${old}.json`))) {
      projectCanon.delete(old);
      projectScenes.splice(projectScenes.findIndex((p) => p.name === old), 1);
      done.push(t('scene.projectRemoved', { file: `scenes/${old}.json` }));
    }
  }
  say(done.length ? t('scene.projectDone').replace('{0}', done.join(', ')) : t('scene.projectNothing'));
  sceneList.redraw();
  return true;
}

/** Saves the scene to the project, then opens it as the island of the game (`?scene=`), which reads the saved file. */
async function openInGame(): Promise<void> {
  // Opened before the save finishes, or the browser takes it for a pop-up.
  // Without the dev server the game would not find the scene, and would quietly show another island.
  if (!canSaveToProject()) return say(t('scene.projectFail'));
  const tab = window.open('about:blank', '_blank');
  if (!(await saveScenes())) return void tab?.close();
  const url = new URL(`../../../?scene=${encodeURIComponent(slug(sceneNow().name))}`, location.href).href;
  if (tab) tab.location.href = url;
  else window.open(url, '_blank');
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
  const tile = tileDrawn(e);
  // Ground cut away, or under the cutaway's floor, is not there to work on.
  return tile && !world.outsideCut(tile.j * world.map.w + tile.i) ? tile : null;
};
/** The tile drawn under the pointer, as the tools take it. */
function tileDrawn(e: { clientX: number; clientY: number }): { i: number; j: number } | null {
  const p = groundPixel(e);
  // A cave's walls stand over the ground behind them, and past the map along its back: what is there is their rock.
  const wall = world.scene.cave ? rockWallAt(world, p.x, p.y) : null;
  if (wall !== null) return { i: wall % world.map.w, j: Math.floor(wall / world.map.w) };
  const tile = world.tileAt(p.x, p.y);
  if (!tile) return null;
  // A hole's walls are the faces of the ground behind it reaching down into it; below the hole's rim they are the hole's.
  const g = world.ground, m = world.map;
  const px = Math.floor(p.y) * g.w + Math.floor(p.x);
  if (g.tops[px]) return tile;
  const level = g.height[px];
  const holes = [{ i: tile.i + 1, j: tile.j }, { i: tile.i, j: tile.j + 1 }]
    .filter((h) => inside(m, h.i, h.j) && m.shape[h.j * m.w + h.i] === HOLE && level < m.levels[h.j * m.w + h.i]);
  if (holes.length < 2) return holes[0] ?? tile;
  // Behind two holes, the one whose side the face is on.
  const q = world.planeAt(p.x, p.y, level);
  return Math.abs(q.i - tile.i - 1) < Math.abs(q.j - tile.j - 1) ? holes[0] : holes[1];
}

/** Tints the walls of the cells of rock among `cells` in a composed window, where they are drawn in front. */
function tintWalls(image: Pixels, view: Rect, cells: number[], color: string): void {
  const m = world.map, g = world.ground;
  const high = (settingsOf(world.scene).headroom || 6) * LEVEL_PX + 4;
  for (const c of cells) {
    if (!isRock(m.levels[c])) continue;
    const i = c % m.w, j = Math.floor(c / m.w);
    const left = toScreen(i, j + 1, world.flatLevel), right = toScreen(i + 1, j, world.flatLevel), back = toScreen(i, j, world.flatLevel), front = toScreen(i + 1, j + 1, world.flatLevel);
    const x0 = Math.max(0, Math.floor(g.origin.x + left.x - view.x)), x1 = Math.min(view.w, Math.ceil(g.origin.x + right.x - view.x));
    const y0 = Math.max(0, Math.floor(g.origin.y + back.y - high - view.y)), y1 = Math.min(view.h, Math.ceil(g.origin.y + front.y - view.y + 1));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (rockWallAt(world, x + view.x, y + view.y) === c) blend(image, x, y, color);
  }
}

/** Whether the pointer is on the top of the ground or on a face (a step's, or rock): what the Material tool paints there. */
let aimed: 'floor' | 'walls' = 'floor';
function aimAt(e: { clientX: number; clientY: number }): 'floor' | 'walls' {
  const p = groundPixel(e), g = world.ground;
  if (world.scene.cave && rockWallAt(world, p.x, p.y) !== null) return 'walls';
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 'floor';
  const c = g.cell[y * g.w + x];
  // A cave's rock is drawn flat, but what is painted on it is what its walls are built of.
  if (c >= 0 && isRock(world.map.levels[c])) return 'walls';
  return g.tops[y * g.w + x] ? 'floor' : 'walls';
}
/** What the Material tool paints now: what the pointer is on, or with Shift held the top and faces both. */
const aimNow = (): Target => (mods.shift ? 'both' : aimed);

// ------------------------------------------------------------------ cutaway

/**
 * Each open scene's cutaway while editing, by scene id: the level the ground is cut away above (World.cutaway) and the
 * level under which it lies out of reach (World.cutBelow), null for none. Not saved.
 */
const cuts = new Map<string, { above: number | null; below: number | null }>();
/** The levels a scene's cutaway reaches over: from its lowest floor over the water to its highest ground; null if flat. */
function cutRange(w = world): { lo: number; top: number } | null {
  let lo = Infinity, top = -Infinity;
  for (const l of w.map.levels) if (!isRock(l)) { lo = Math.min(lo, l); top = Math.max(top, l); }
  lo = Math.max(lo, w.water);
  return top > lo ? { lo, top } : null;
}
/** The cutaway in force: the level the scene's ground is cut away above, kept inside its range; none in Play. */
function cutNow(): number | null {
  const n = cuts.get(sceneNow().id)?.above, r = cutRange();
  return prefs.mode !== 'edit' || n === null || n === undefined || !r || n >= r.top ? null : Math.max(r.lo, n);
}
/** The cutaway's floor in force: the level under which the scene's ground is out of reach; none in Play. */
function belowNow(): number | null {
  const n = cuts.get(sceneNow().id)?.below, r = cutRange();
  return prefs.mode !== 'edit' || n === null || n === undefined || !r || n <= r.lo ? null : Math.min(cutNow() ?? r.top, n);
}
function setCut(above: number | null, below: number | null = belowNow()): void {
  if (above === null && below === null) cuts.delete(sceneNow().id);
  else cuts.set(sceneNow().id, { above, below: below !== null && above !== null ? Math.min(below, above) : below });
  hover = null;
  version++;
}
/** Page Up and Page Down: the cutaway a level up or down; down from none starts under the highest ground, up past it ends it. */
function stepCut(by: number): void {
  const r = cutRange(), now = cutNow();
  if (!r) return;
  const next = now === null ? (by < 0 ? r.top - 1 : null) : now + by;
  setCut(next === null || next >= r.top ? null : Math.max(r.lo, next));
  showCut();
}
/**
 * The cutaway, floating at the left of the view: a standing slider over the scene's levels with two knobs. Ground over
 * the upper one is cut away, ground under the lower one is out of reach; both at their ends, all of it is there. Hidden
 * where there is nothing to cut.
 */
const cutSlot = h('div', { class: 'cutaway' });
function showCut(): void {
  const r = prefs.mode === 'edit' ? cutRange() : null;
  cutSlot.hidden = !r;
  if (!r) return void cutSlot.replaceChildren();
  cutSlot.replaceChildren(rangeSlider(t('cut'), {
    min: r.lo, max: r.top, length: 64,
    get: () => [belowNow() ?? r.lo, cutNow() ?? r.top],
    change: (lo, hi) => setCut(hi >= r.top ? null : hi, lo <= r.lo ? null : lo),
  }));
}

/** The start point, shown while editing: a small flag. */
const FLAG: Picture = {
  get: (x, y) => (x === 0 && y < 12 ? '#3a2a2a' : x >= 1 && x <= 5 && y < 4 ? '#e0533d' : null),
};

// ------------------------------------------------------------------ editing

let hover: { i: number; j: number } | null = null;
/** The tile under the pointer in another open scene: the tools work there too, a press there edits that scene. */
let away: { scene: Scene; tile: { i: number; j: number } } | null = null;

function brushCells(at: { i: number; j: number }, tool: Work = toolNow(), w = world): number[] {
  const size = BRUSHED.includes(tool) ? prefs.brush : 1;
  return roundBrush(size).filter(([di, dj]) => inside(w.map, at.i + di, at.j + dj)).map(([di, dj]) => (at.j + dj) * w.map.w + at.i + di).filter((c) => !w.outsideCut(c));
}

/** Whether the tool would do nothing on a tile, so the brush shows red there. */
function cannotEdit(at: { i: number; j: number }, w = world): boolean {
  const tool = toolHeld(w.scene);
  switch (tool) {
    case 'plant':
      return !grows(w.map, prefs.plant, at.i + 0.5, at.j + 0.5);
    case 'spawn':
    case 'animal':
    case 'person':
      return !isLand(w.map, at.i, at.j);
    case 'decor':
      return !decorFits(at, w);
    case 'item':
      return !isLand(w.map, at.i, at.j);
    case 'prop': {
      const kind = propKind(prefs.prop);
      if (kind?.place === 'plant') return !grows(w.map, kind.id, at.i + 0.5, at.j + 0.5);
      if (kind?.place === 'decor') return levelAt(w.floor, at.i, at.j) < DECOR_DEPTH;
      return !isLand(w.map, at.i, at.j);
    }
    case 'smooth':
    case 'level':
      return brushCells(at, tool, w).every((c) => isRock(w.map.levels[c]));
    case 'exit':
      return !isLand(w.map, at.i, at.j);
    case 'paint':
      return brushCells(at, tool, w).every((c) => !paintable(w.map, c));
    case 'ways': {
      // Ramps and holes go on floor; a ramp where it can rise, or on a ramp, which it then takes away.
      const c = at.j * w.map.w + at.i;
      if (!cellWay(prefs.way)) return false;
      if (isRock(w.map.levels[c])) return true;
      return prefs.way === 'ramp' && rampDir(w.map.shape[c]) < 0 && bestRamp(w.map, at.i, at.j) < 0;
    }
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

/** Decorations lie on land and on the sea floor down to this many levels under the water line, where the water still shows them. */
const DECOR_DEPTH = 2;

/** Where on a tile a thing hung on a wall goes: just in front of the wall at its back, if it has one. */
function onWall(at: { i: number; j: number }): { i: number; j: number } | null {
  const rock = (i: number, j: number) => !inside(world.map, i, j) || !isLand(world.map, i, j);
  if (rock(at.i, at.j - 1)) return { i: at.i + 0.5, j: at.j + 0.28 };
  if (rock(at.i - 1, at.j)) return { i: at.i + 0.28, j: at.j + 0.5 };
  return null;
}

/** Decorations lie on land and the sea floor near it; in a cave only on its floor, not in the rock. */
const decorFits = (at: { i: number; j: number }, w = world) =>
  w.scene.cave ? isLand(w.map, at.i, at.j) : levelAt(w.floor, at.i, at.j) >= w.water - DECOR_DEPTH;

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
  if (!isLand(world.map, at.i, at.j)) return say(t('animal.cannot'));
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
  if (!isLand(world.map, at.i, at.j)) return;
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
/** Puts a character's actor back where and as it was placed (in the edited world, or another scene's on the desk). */
function standAtHome(p: PlacedPerson, w = world): Actor {
  const a = personActor(p);
  a.frozen = p.pose ?? null;
  Object.assign(a, w.toView(p));
  a.facing = turnFacing(0, 2 * (p.turn + prefs.rot));
  a.heading = (p.turn + prefs.rot) * (Math.PI / 2);
  return a;
}
function personThing(p: PlacedPerson, ms: number, w = world): Thing {
  return (prefs.mode === 'play' && w === world ? personActor(p) : standAtHome(p, w)).thing(w, ms);
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
  if (!isLand(world.map, at.i, at.j)) return;
  const seen = world.viewItems();
  world.scene.items = world.scene.items.filter((_, k) => Math.floor(seen[k].vi) !== at.i || Math.floor(seen[k].vj) !== at.j);
  const choice = objectChoices().find((c) => c.id === prefs.item) ?? objectChoices()[0];
  // One of the object editor's goes into the scene with its parts, so the scene stands on its own.
  if (choice.id.startsWith(OWN)) world.scene.objects = { ...world.scene.objects, [choice.id]: choice.prop };
  const placed: PlacedItem = { item: choice.id, ...world.toData({ i: at.i + 0.5, j: at.j + 0.5 }), ...(prefs.itemTurn && { turn: prefs.itemTurn }) };
  nameLink(world.scene.items, placed);
  world.scene.items.push(placed);
  // A hole is a hole in the ground, with the object its ladder down.
  if (placed.item === 'hole') {
    digHole(world.scene, placed);
    world.setRotation(world.rot);
  }
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
  if (!isLand(world.map, at.i, at.j)) return;
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
 * What a stroke of a ground tool carries from tile to tile: the tiles it has worked (`touched`), the height it levels
 * to, what it planted, whether Alt was held, whether it takes ramps (or holes) away, the tool as the modifier keys made
 * it, whether the Ground tool began it (so it sets edges), and the ramp or hole the Ways tool lays.
 */
interface StrokeState { touched: Set<number>; level?: number; placed?: Set<PlacedPlant>; alt?: true; unramp?: boolean; tool?: Work; ground?: true; shape?: 'ramp' | 'hole'; target?: Target }

/** Makes the edges of cells smooth or cut, as the Ground tool's Edges say; ramps, holes and rock stay. */
function setEdges(map: World['map'], cells: number[]): void {
  if (prefs.edges === 'keep') return;
  const shape = prefs.edges === 'soft' ? SMOOTH : CUT;
  for (const c of cells) if (!isRock(map.levels[c]) && map.shape[c] !== HOLE && rampDir(map.shape[c]) < 0) map.shape[c] = shape;
}

/**
 * The Ground tool's press and pull: the brush stays on the cells pressed, and the pointer drawn up or down raises or
 * lowers them a level for each level's height on screen, the ground following the pointer. Cells come up to the height
 * the pressed one is pulled to and no higher, or go down to it and no lower, so a pull makes a plateau or a pit. In a
 * cave, a pull down on rock carves it open to the floor beside it (and deeper as it goes on). Only how far the pointer
 * is above or below where it was pressed counts, until it is let go. Each step is worked from the ground as it was at
 * the press, so it previews live.
 * A quick tap in a cave, with no pull, turns rock into floor and floor into rock (`tapRock`).
 */
interface Pull { y: number; tile: { i: number; j: number }; cells: number[]; from: number | null; was: { levels: Int8Array; shape: Uint8Array; paint: Uint8Array; side: Uint8Array }; d: number; ms: number; went?: true }
/** Screen pixels the pointer moves for a level: a level's height on screen, but not so little that it jumps. */
const pullStep = () => Math.max(LEVEL_PX * zoom, 12);
function startPull(e: { clientY: number }, tile: { i: number; j: number }): Pull {
  const map = world.map;
  const level = map.levels[tile.j * map.w + tile.i];
  const was = { levels: Int8Array.from(map.levels), shape: Uint8Array.from(map.shape), paint: Uint8Array.from(map.paint), side: Uint8Array.from(map.side) };
  return { y: e.clientY, tile, cells: brushCells(tile, 'ground'), from: isRock(level) ? null : level, was, d: NaN, ms: performance.now() };
}
/** A tap without a pull to toggle a cave's rock: no longer than this, in milliseconds. */
const TAP_MS = 350;
/** A quick tap of the Ground tool in a cave: rock pressed is carved open, floor pressed filled with rock. Says whether it did. */
function tapRock(pull: Pull): boolean {
  if (!world.scene.cave || pull.went || performance.now() - pull.ms > TAP_MS) return false;
  const map = world.map;
  if (!carve(map, pull.cells, pull.from === null)) return false;
  groundDirty = true;
  sceneChanged();
  return true;
}
function pullTo(pull: Pull, clientY: number): void {
  const dy = (pull.y - clientY) / pullStep();
  // A little past half a level before the first step, so a press that wobbles changes nothing.
  let d = Math.sign(dy) * Math.floor(Math.abs(dy) + 0.4);
  const low = MIN_LEVEL - (pull.from ?? MIN_LEVEL);
  // Not over a cutaway, where it would be cut away unseen, nor under its floor, out of reach.
  if (pull.from !== null) d = Math.max(Math.max(low, (world.cutBelow ?? -Infinity) - pull.from), Math.min(Math.min(MAX_LEVEL, world.cutaway ?? Infinity) - pull.from, d));
  if (d === pull.d) return;
  pull.d = d;
  if (d) pull.went = true;
  const map = world.map;
  map.levels.set(pull.was.levels);
  map.shape.set(pull.was.shape);
  map.paint.set(pull.was.paint);
  map.side.set(pull.was.side);
  if (pull.from === null) {
    // Rock: pulled down, carved open to the floor beside it, then deeper.
    if (d < 0) {
      const rock = pull.cells.filter((c) => isRock(map.levels[c]));
      carve(map, rock, true);
      for (const c of rock) setLevel(map, c % map.w, Math.floor(c / map.w), map.levels[c] + d + 1);
    }
  } else {
    const to = pull.from + d;
    for (const c of pull.cells) {
      const level = map.levels[c];
      if (isRock(level) || (d > 0 ? level >= to : level <= to)) continue;
      setLevel(map, c % map.w, Math.floor(c / map.w), to);
    }
  }
  setEdges(map, pull.cells);
  groundDirty = true;
  sceneChanged();
}

/**
 * Applies the tool once to a tile. `stroke.touched` keeps a drag from raising, lowering or
 * painting a tile twice; smoothing works again on every tile the drag enters, and levelling
 * keeps to the height of the tile the drag started on.
 */
function apply(at: { i: number; j: number }, stroke: StrokeState): void {
  const map = world.map;
  // The tool as the modifier keys held at the press made it.
  const tool = stroke.tool ?? toolNow();
  // The Ways tool lays ramps and holes a cell at a time.
  const cells = stroke.shape ? [at.j * map.w + at.i] : brushCells(at, tool);
  // Under a cutaway nothing is raised over it, where it would be cut away unseen.
  const cut = world.cutaway, below = world.cutBelow, was = cut === null && below === null ? null : cells.map((c) => map.levels[c]);
  const fresh = cells.filter((c) => !stroke.touched.has(c));
  fresh.forEach((c) => stroke.touched.add(c));
  const tile = (c: number): [number, number] => [c % map.w, Math.floor(c / map.w)];
  switch (tool) {
    case 'smooth':
      smooth(map, cells);
      if (stroke.ground) setEdges(map, cells);
      groundDirty = true;
      break;
    case 'level':
      // To the height picked, else to the height where the stroke started. Rock is carved, not levelled.
      stroke.level ??= prefs.levelTo ?? levelAt(map, at.i, at.j);
      if (isRock(stroke.level)) break;
      for (const c of cells) if (!isRock(map.levels[c])) setLevel(map, ...tile(c), stroke.level);
      if (stroke.ground) setEdges(map, cells);
      groundDirty = true;
      break;
    case 'shape':
      for (const c of fresh) {
        if (isRock(map.levels[c])) continue;
        // Holes come and go as ladders do: a drag starting on a hole, or with Alt held, fills holes in.
        if (stroke.shape === 'hole') {
          stroke.unramp ??= !!stroke.alt || map.shape[c] === HOLE;
          const shape = stroke.unramp ? (map.shape[c] === HOLE ? CUT : map.shape[c]) : HOLE;
          if (map.shape[c] !== shape) { map.shape[c] = shape; groundDirty = true; }
          continue;
        }
        // A drag that starts on a ramp, or with Alt held, takes ramps away (cut again); otherwise it lays them, each the way it can rise.
        stroke.unramp ??= !!stroke.alt || rampDir(map.shape[c]) >= 0;
        if (stroke.unramp) {
          if (rampDir(map.shape[c]) >= 0) { map.shape[c] = CUT; groundDirty = true; }
          continue;
        }
        if (rampDir(map.shape[c]) >= 0) continue;
        const d = bestRamp(map, ...tile(c));
        if (d < 0) { say(t('shape.noRamp')); continue; }
        map.shape[c] = RAMP + d;
        groundDirty = true;
      }
      break;
    case 'paint':
      for (const c of fresh) groundDirty = paintCell(map, c, stroke.target ?? 'floor') || groundDirty;
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
      const hit = new Set(cells);
      const kept = <T>(list: T[], seen: { vi: number; vj: number }[]) => list.filter((_, k) => !hit.has(Math.floor(seen[k].vj) * map.w + Math.floor(seen[k].vi)));
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
  // Nor is anything lowered under the cutaway's floor, out of reach.
  if (was) cells.forEach((c, k) => {
    if (isRock(was[k]) || isRock(map.levels[c])) return;
    if (cut !== null && was[k] <= cut && map.levels[c] > cut) map.levels[c] = cut;
    if (below !== null && was[k] >= below && map.levels[c] < below) map.levels[c] = below;
  });
  sceneChanged();
}

/** The stone of a cave's rock walls and unpainted floor, as the edited map holds it (scene.ts `mapOf`); stone in daylight. */
const STONE = PAINTS.indexOf('rock') + 1;
/** What a cave's rock is built of with a material painted on it: brick, mine or stone; null for what rock cannot be (sand, say). */
const rockOf = (n: number) => (n === BRICK || n === MINE ? n : n === CAVE_OPEN || n === STONE ? CAVE_OPEN : null);
/** Whether the Material tool, with its target, can paint a cell at all, so the brush shows red where none can. */
function paintable(map: World['map'], c: number, target = aimNow()): boolean {
  if (!isRock(map.levels[c])) return true;
  return target === 'both' || (target === 'walls' && rockOf(prefs.paint) !== null);
}
/**
 * Paints a cell with the Material tool's material, as its target says: Floor its top, keeping its faces as they were;
 * Walls the faces of its steps, or on a cave's rock what its walls are built of; Both all of it. Says whether it changed.
 */
function paintCell(map: World['map'], c: number, target: Target, n = prefs.paint): boolean {
  const before = map.paint[c], sideBefore = map.side[c];
  if (isRock(map.levels[c])) {
    if (target === 'floor') return false;
    // Rock painted with what no wall is built of, with Both, is stone again.
    const built = rockOf(n) ?? (target === 'both' ? CAVE_OPEN : null);
    if (built === null) return false;
    map.paint[c] = built;
  } else if (target === 'both') {
    map.paint[c] = n;
    map.side[c] = 0;
  } else if (target === 'floor') {
    // Faces that went with the top keep what they were.
    if (map.side[c] === 0 && before !== n) map.side[c] = before || BY_HEIGHT;
    map.paint[c] = n;
  } else map.side[c] = n || BY_HEIGHT;
  // Faces of the top's own material, or by height under unpainted ground, go with the top again.
  if (map.side[c] === map.paint[c] || (map.side[c] === BY_HEIGHT && map.paint[c] === 0)) map.side[c] = 0;
  return map.paint[c] !== before || map.side[c] !== sideBefore;
}
/** The material of a cell's faces as the Material tool names it: its own, or its top's. */
const sideOf = (map: World['map'], c: number) => (map.side[c] === BY_HEIGHT ? 0 : map.side[c] || map.paint[c]);

/** What a Ctrl-click picks up from a tile for the tool: the height to level to, or the material. */
function pickFrom(at: { i: number; j: number }): void {
  const map = world.map;
  const c = at.j * map.w + at.i;
  const tool = toolNow();
  if (tool === 'ground' && !isRock(map.levels[c])) set({ levelTo: map.levels[c] });
  if (tool === 'paint') {
    const grounds = paintsFor(sceneNow());
    // Ground by height in a cave is the cave's own stone.
    const had = aimNow() === 'walls' && !isRock(map.levels[c]) ? sideOf(map, c) : map.paint[c];
    const n = had === 0 && sceneNow().cave ? CAVE_OPEN : had;
    if (grounds.includes(n)) set({ paint: n });
  }
}

/** The materials the Material tool offers in a scene. Ground follows the height by default; in a cave, where the height is flat, the default is the cave's own stone. */
const paintsFor = (s: Scene) => (s.cave ? [CAVE_OPEN, 1, 2, 3, 5, 6, 7] : [0, 1, 2, 3, 5, 6, 7]);

/** A way out of the cave on a tile of floor, or none there any more if it had one. */
function toggleExit(at: { i: number; j: number }): void {
  const cave = world.scene.cave;
  if (!cave || !isLand(world.map, at.i, at.j)) return;
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

/** The list of a scene that holds things of a kind (the flag is no list). */
function listOf(s: Scene, kind: Exclude<Selected['kind'], 'spawn'>): object[] {
  return { plant: s.plants, decor: s.decor, animal: s.animals, person: s.people, item: s.items, prop: (s.props ??= []) }[kind];
}

/**
 * Carries a thing being moved into another open scene, which is then the one edited, so the drag goes on there. Both
 * scenes are one undo step. What the thing needs comes along: an object of the scene's own its parts, a way its name
 * (a new one if the scene has a way of that name) with every way that led to it now leading to it there.
 */
function carryInto(g: Extract<Gesture, { kind: 'move' }>, into: Scene): void {
  if (g.sel.kind === 'spawn') return;
  const from = world.scene;
  const obj = g.sel.obj;
  removeObject(obj);
  switchTo(into, true);
  remember(world.scene, true);
  listOf(world.scene, g.sel.kind).push(obj);
  if (g.sel.kind === 'item') bringItem(obj as PlacedItem, from, world.scene);
  g.crossed = true;
  selected = g.sel;
  showOptions();
}
function bringItem(it: PlacedItem, from: Scene, to: Scene): void {
  const own = it.item.startsWith(OWN) ? from.objects?.[it.item] : undefined;
  if (own) to.objects = { ...to.objects, [it.item]: own };
  if (!LINKING.includes(it.item)) return;
  const was = { scene: slug(from.name), id: it.id };
  if (!it.id || to.items.some((o) => o !== it && o.id === it.id)) {
    delete it.id;
    nameLink(to.items, it);
  }
  for (const sc of library.scenes) {
    const leading = sc.items.filter((o) => o.to?.scene === was.scene && o.to.id === was.id);
    if (!leading.length) continue;
    remember(sc, true);
    for (const o of leading) o.to = { scene: slug(to.name), id: it.id! };
  }
}

/** Whether a view point lies on ground cut away, where what stands is neither shown nor picked. */
const cutOff = (at: { i: number; j: number }) => inside(world.map, Math.floor(at.i), Math.floor(at.j)) && world.aboveCut(Math.floor(at.j) * world.map.w + Math.floor(at.i));

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
  for (const [sel, at, hit] of found) if (hit && !cutOff(at) && at.i + at.j > front) [best, front] = [sel, at.i + at.j];
  if (best) return best;
  const decor = world.viewDecor().findIndex((d) => {
    if (cutOff({ i: d.vi, j: d.vj })) return false;
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
  return isLand(world.map, i, j);
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
  // It grows no nearer to another scene on the desk than the gap between scenes.
  if (openScenes().some((o) => o.id !== next.id && crowds(deskOf(next), next, o))) return;
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
let target: { i: number; j: number; run: boolean; pick?: Pickable; climb?: Climb } | null = null;
/** The way on after `target`, round what is in the way (path.ts). */
let route: Waypoint[] = [];
/** The scene's doors as they were before Play, which opens them: put back on leaving it. */
let playDoors: { doors: Scene['doors'] } | null = null;
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
  if (!inside(world.map, Math.floor(at.i), Math.floor(at.j)) || !isLand(world.map, Math.floor(at.i), Math.floor(at.j))) {
    at = world.nearestLand(at.i, at.j);
  }
  actor = new Actor(characterLook(), at);
  herd = new Herd(world, performance.now());
  world.loose = structuredClone(world.scene.items);
  // Doors open as the character walks through them; the scene keeps them as they were.
  playDoors = { doors: world.scene.doors };
  if (world.scene.doors) world.scene.doors = world.scene.doors.map((d) => ({ ...d }));
  world.scene.people.forEach((p) => standAtHome(p));
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
  for (const l of lying.values()) l.world.setRotation(prefs.rot);
  world.scene.people.forEach((p, k) => Object.assign(personActor(p), world.toView(people[k])));
  const v = world.toView(focus);
  if (actor) {
    actor.i = v.i;
    actor.j = v.j;
    target = null;
  }
  hover = null;
  away = null;
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
  const dry = inside(world.map, Math.floor(spot.i), Math.floor(spot.j)) && isLand(world.map, Math.floor(spot.i), Math.floor(spot.j));
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
  readMods(e);
  if (typing(e)) return;
  // Alt alone would open the browser's menu bar in some browsers; here it changes what a ground tool does.
  if ((e.code === 'AltLeft' || e.code === 'AltRight') && prefs.mode === 'edit') e.preventDefault();
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
  // [ and ] size the brush a step.
  if (prefs.mode === 'edit' && (e.code === 'BracketLeft' || e.code === 'BracketRight') && BRUSHED.includes(toolNow())) setBrush(prefs.brush + (e.code === 'BracketRight' ? 1 : -1));
  if (prefs.mode === 'edit' && (e.code === 'PageUp' || e.code === 'PageDown')) {
    e.preventDefault();
    stepCut(e.code === 'PageUp' ? 1 : -1);
  }
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
window.addEventListener('keyup', (e) => { readMods(e); keys.delete(e.code); });
window.addEventListener('blur', () => { keys.clear(); readMods({ altKey: false, shiftKey: false, ctrlKey: false, metaKey: false }); });

/** The direction held on the keyboard, on screen: x to the right, y down. */
function keyDirection(): [number, number] {
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  return [x, y];
}

type Gesture =
  | ({ kind: 'stroke'; last: string; tile?: { i: number; j: number }; at: number; point?: { i: number; j: number }; walls?: 'lay' | 'take'; plane?: Plane; pull?: Pull } & StrokeState)
  | { kind: 'walk' }
  | { kind: 'edge'; base: World; orig: Scene; a0: number; a1: number; b0: number; b1: number; changed: boolean }
  | { kind: 'move'; sel: Selected; grab: { x: number; y: number }; from: { i: number; j: number }; copy?: true; crossed?: true }
  | { kind: 'pan'; x: number; y: number; cam: { x: number; y: number } }
  | { kind: 'pinch'; dist: number; zoom: number; mid: { x: number; y: number }; cam: { x: number; y: number } };
let gesture: Gesture | null = null;

/**
 * The flat plane a ground stroke keeps to: the height of the ground where it was pressed, and how far the plane is
 * moved so the press lies on the tile pressed (a step's face lies in front of its tile on any plane at its height).
 */
interface Plane { level: number; di: number; dj: number }
function planeAt(e: { clientX: number; clientY: number }): Plane | null {
  const tile = tileUnder(e);
  const p = groundPixel(e);
  const level = world.heightAtPixel(p.x, p.y);
  if (!tile || level === null) return null;
  const q = world.planeAt(p.x, p.y, level);
  const onto = (v: number, from: number) => Math.min(from + 0.99, Math.max(from + 0.01, v)) - v;
  return { level, di: onto(q.i, tile.i), dj: onto(q.j, tile.j) };
}
/** The tile under the pointer on a stroke's plane, however the ground under it has risen or fallen since. */
function tileOnPlane(e: { clientX: number; clientY: number }, plane: Plane): { i: number; j: number } | null {
  const p = groundPixel(e);
  const q = world.planeAt(p.x, p.y, plane.level);
  const i = Math.floor(q.i + plane.di), j = Math.floor(q.j + plane.dj);
  return inside(world.map, i, j) ? { i, j } : null;
}
/** The tile the tools work on under the pointer: on the plane of a ground stroke while one goes on, else the one drawn there. */
const pointerTile = (e: { clientX: number; clientY: number }) => (gesture?.kind === 'stroke' && gesture.pull ? gesture.pull.tile : gesture?.kind === 'stroke' && gesture.plane ? tileOnPlane(e, gesture.plane) : tileUnder(e));
const pointers = new Map<number, { x: number; y: number }>();
const pair = () => {
  const [a, b] = [...pointers.values()];
  return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
};

/** Ground tools that keep working while the pointer is held still, and how often they repeat. */
const HELD: Work[] = ['smooth', 'level'];
const REPEAT_MS = 200;

function strokeAt(e: { clientX: number; clientY: number }): void {
  if (gesture?.kind !== 'stroke') return;
  if (gesture.pull) {
    pullTo(gesture.pull, e.clientY);
    return;
  }
  const tool = gesture.tool ?? toolNow();
  if (tool === 'walls') {
    wallStroke(e, gesture);
    return;
  }
  if (tool === 'ways') {
    if (!gesture.point) wayAt(e, gesture);
    return;
  }
  const tile = pointerTile(e);
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

/** How near a cell edge's middle, in tiles, a press has to be for the Walls tool to build on that edge alone. */
const WALL_SNAP = 0.3;
/**
 * The Walls tool: a drag goes from tile corner to tile corner, the one nearest the pointer, and builds a wall of the
 * chosen kind on each edge between them (every corner on the way, so a fast drag leaves no gap); a press near an
 * edge's middle builds on that edge. A drag that starts on a wall of that kind takes walls away.
 */
function wallStroke(e: { clientX: number; clientY: number }, g: Extract<Gesture, { kind: 'stroke' }>): void {
  const p = groundPixel(e);
  const to = pointAt(p.x, p.y);
  if (!to) return;
  const corner = { i: Math.round(to.i), j: Math.round(to.j) };
  let changed = false;
  if (!g.point) {
    const dv = Math.abs(to.i - corner.i), dh = Math.abs(to.j - corner.j);
    const edge: Edge = dh < dv ? { axis: 'H', i: Math.floor(to.i), j: corner.j } : { axis: 'V', i: corner.i, j: Math.floor(to.j) };
    const along = edge.axis === 'H' ? to.i - edge.i : to.j - edge.j;
    if (Math.min(dh, dv) <= WALL_SNAP && Math.abs(along - 0.5) <= 0.5 - WALL_SNAP / 2) changed = buildWall(edge, g);
  } else if (g.point.i !== corner.i || g.point.j !== corner.j) {
    let at = g.point;
    for (const step of sideBySide(g.point, corner)) {
      const edge = edgeBetween([at.i, at.j], [step.i, step.j]);
      if (edge) changed = buildWall(edge, g) || changed;
      at = step;
    }
  }
  g.point = corner;
  if (changed) sceneChanged();
}

/** Builds a wall of the chosen kind on a view edge, or takes it away; says whether anything changed. */
function buildWall(view: Edge, g: Extract<Gesture, { kind: 'stroke' }>): boolean {
  const [a, b] = edgeEnds(view).map(([i, j]) => world.toData({ i, j }));
  const edge = edgeBetween([Math.round(a.i), Math.round(a.j)], [Math.round(b.i), Math.round(b.j)]);
  const s = world.scene;
  if (!edge || !cleanWalls([{ edge, kind: prefs.wall }], s.w, s.h).length) return false;
  const key = edgeKey(edge);
  const walls = s.walls ?? [];
  const there = walls.find((x) => edgeKey(x.edge) === key);
  g.walls ??= there?.kind === prefs.wall ? 'take' : 'lay';
  if (g.walls === 'take' ? there?.kind !== prefs.wall : there?.kind === prefs.wall) return false;
  // A new list, so the world sees the walls changed.
  const rest = walls.filter((x) => x !== there);
  s.walls = g.walls === 'take' ? rest : [...rest, { edge, kind: prefs.wall }];
  return true;
}

/** The door states the Ways tool steps through, tap by tap; after the last, the door is taken away. */
const DOOR_NEXT: Record<DoorState, DoorState | null> = { closed: 'open', open: 'locked', locked: 'hidden', hidden: null };
/**
 * The Ways tool, on a press: the cell edge nearest the pointer. A ladder goes up a step there (of at least two levels,
 * between floors), or comes away; a door goes on the edge (floor on both sides, a step apart at most), and each tap
 * on it after makes it open, locked, hidden, then takes it away.
 */
function wayAt(e: { clientX: number; clientY: number }, g: Extract<Gesture, { kind: 'stroke' }>): void {
  const p = groundPixel(e);
  const at = pointAt(p.x, p.y);
  if (!at) return;
  g.point = { i: Math.floor(at.i), j: Math.floor(at.j) };
  const fi = at.i - Math.floor(at.i), fj = at.j - Math.floor(at.j);
  // The cell's four edges, nearest first.
  const ci = Math.floor(at.i), cj = Math.floor(at.j);
  const edges: [number, Edge][] = [[fi, { axis: 'V', i: ci, j: cj }], [1 - fi, { axis: 'V', i: ci + 1, j: cj }], [fj, { axis: 'H', i: ci, j: cj }], [1 - fj, { axis: 'H', i: ci, j: cj + 1 }]];
  edges.sort((a, b) => a[0] - b[0]);
  const s = world.scene;
  for (const [, view] of edges) {
    const edge = world.dataEdge(view);
    if (!edge) continue;
    const key = edgeKey(edge);
    if (prefs.way === 'ladder') {
      const there = (s.ladders ?? []).find((x) => edgeKey(x.edge) === key);
      if (there) {
        s.ladders = s.ladders!.filter((x) => x !== there);
        if (!s.ladders.length) delete s.ladders;
      } else if (ladderOn(world.map, view)) s.ladders = [...(s.ladders ?? []), { edge }];
      else continue;
    } else {
      const there = (s.doors ?? []).find((x) => edgeKey(x.edge) === key);
      if (there) {
        const next = DOOR_NEXT[there.state];
        s.doors = next ? s.doors!.map((x) => (x === there ? { ...x, state: next } : x)) : s.doors!.filter((x) => x !== there);
        if (!s.doors.length) delete s.doors;
        if (next) say(t(`door.${next}` as Key));
      } else if (doorFits(world.map, view)) {
        s.doors = [...(s.doors ?? []), { edge, kind: 'wood', state: 'closed' }];
        say(t('door.closed'));
      } else continue;
    }
    sceneChanged();
    return;
  }
  say(t(prefs.way === 'ladder' ? 'way.noLadder' : 'way.noDoor'));
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
  if (gesture?.kind !== 'stroke' || !gesture.tile || !HELD.includes(gesture.tool ?? toolNow()) || ms - gesture.at < REPEAT_MS) return;
  gesture.touched.clear();
  gesture.at = ms;
  apply(gesture.tile, gesture);
}

canvas.addEventListener('pointerdown', (e) => {
  readMods(e);
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const { dist, mid } = pair();
    gesture = { kind: 'pinch', dist, zoom, mid, cam: { ...cam } };
  } else if (pointers.size === 1) {
    // The Settings tool works in the inspector: on the scene a drag pans.
    const panning = e.button === 1 || e.button === 2 || keys.has('Space') || (prefs.mode === 'edit' && toolNow() === 'settings');
    // The tools work in whichever scene is under the pointer: a press on another scene on the desk edits that one, and
    // goes on as a press on it (a stroke there, an object picked up). The stroke then stays in that scene.
    if (!panning && prefs.mode === 'edit' && !edgeAt(e)) {
      const other = awayUnder(e);
      if (other) switchTo(other.scene, true);
      away = null;
    }
    if (panning) gesture = { kind: 'pan', x: e.clientX, y: e.clientY, cam: { ...cam } };
    else if (prefs.mode === 'edit' && (gesture = edgeGesture(e))) { /* dragging an edge of the level */ }
    else if (prefs.mode === 'edit' && toolNow() === 'move') {
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
    } else if (prefs.mode === 'edit' && (e.ctrlKey || e.metaKey) && PICKING.includes(toolNow())) {
      // Ctrl-click (Cmd-click) picks up what the tool lays from the tile, and changes nothing.
      const tile = tileUnder(e);
      if (tile) pickFrom(tile);
      gesture = null;
    } else if (prefs.mode === 'edit') {
      remember();
      const now = toolNow();
      // The Ways tool lays ramps and holes a cell at a time.
      const shape = now === 'ways' && cellWay(prefs.way) ? prefs.way : undefined;
      const tool: Work = shape ? 'shape' : withMods(now, { alt: e.altKey, shift: e.shiftKey });
      const pressed = tool === 'ground' ? tileUnder(e) : null;
      // The Material tool paints what was pressed, the top or the faces, all the stroke long.
      if (now === 'paint') aimed = aimAt(e);
      const plane = SHAPING.includes(tool) && !pressed ? planeAt(e) : null;
      gesture = {
        kind: 'stroke', touched: new Set(), last: '', at: 0, tool, ...(plane && { plane }), ...(e.altKey && { alt: true as const }),
        ...(now === 'ground' && { ground: true as const }), ...(shape && { shape }), ...(now === 'paint' && { target: aimNow() }), ...(pressed && { pull: startPull(e, pressed) }),
      };
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
    const g = gesture;
    const p = groundPixel(e);
    let at = pointAt(p.x - g.grab.x, p.y - g.grab.y);
    // Off this scene and over another, the thing goes along into that one, which is then the one edited.
    const other = !at && g.sel.kind !== 'spawn' ? awayUnder(e) : null;
    if (other) {
      carryInto(g, other.scene);
      const q = groundPixel(e);
      at = pointAt(q.x - g.grab.x, q.y - g.grab.y) ?? { i: other.tile.i + 0.5, j: other.tile.j + 0.5 };
    }
    if (at) {
      Object.assign(g.sel.obj, world.toData(at));
      sceneChanged();
    }
  } else if (gesture?.kind === 'edge' && edgeSide) dragEdge(gesture, edgeSide, e);
  else if (gesture?.kind === 'stroke') strokeAt(e);
  else if (gesture?.kind === 'walk') walkTo(e);
  readMods(e);
  if (prefs.mode === 'edit' && e.pointerType === 'mouse') hover = pointerTile(e);
  if (prefs.mode === 'edit' && e.pointerType === 'mouse' && !gesture) aimed = aimAt(e);
  // Over another scene the brush shows there, until a press there edits it; a stroke stays in the scene it began in.
  away = prefs.mode === 'edit' && e.pointerType === 'mouse' && !gesture && !hover ? awayUnder(e) : null;
  hotEdge = prefs.mode === 'edit' && e.pointerType === 'mouse' ? (gesture?.kind === 'edge' ? edgeSide : gesture ? null : edgeAt(e)) : null;
});
const release = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (gesture?.kind === 'move' && gesture.crossed && !canStand(gesture.sel, world.toView(gesture.sel.obj))) {
    // Carried into another scene and let go where it cannot stand: the whole move is taken back, in both scenes.
    step(undoStack, redoStack);
    redoStack.pop();
    syncUndo();
  } else if (gesture?.kind === 'move' && gesture.copy && !gesture.crossed && (gesture.sel.obj.i === gesture.from.i && gesture.sel.obj.j === gesture.from.j || !canStand(gesture.sel, world.toView(gesture.sel.obj)))) {
    // A copy that was not dragged anywhere, or dropped where it cannot stand, is not made.
    removeObject(gesture.sel.obj);
    selected = null;
    sceneChanged();
  } else if (gesture?.kind === 'move' && !canStand(gesture.sel, world.toView(gesture.sel.obj))) {
    Object.assign(gesture.sel.obj, gesture.from);
    sceneChanged();
  }
  if (gesture?.kind === 'move') showOptions();
  // An edge dragged nowhere leaves nothing to undo, nor does a Ground pull that came back to where it started.
  if (gesture?.kind === 'edge' && !gesture.changed) { undoStack.pop(); syncUndo(); }
  if (gesture?.kind === 'stroke' && gesture.pull && !gesture.pull.d && !tapRock(gesture.pull) && prefs.edges === 'keep') { undoStack.pop(); syncUndo(); }
  // The ground's highest and lowest may have changed, and with them the levels to cut away at.
  if (gesture?.kind === 'stroke') showCut();
  // Lifting one finger of a pinch does not start painting with the other.
  if (!pointers.size || gesture?.kind === 'pinch') gesture = pointers.size ? { kind: 'pan', x: [...pointers.values()][0].x, y: [...pointers.values()][0].y, cam: { ...cam } } : null;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
// Should the canvas lose the pointer mid-gesture, a pull still follows it and ends where it is let go.
window.addEventListener('pointermove', (e) => { if (e.target !== canvas && gesture?.kind === 'stroke' && gesture.pull && pointers.has(e.pointerId)) pullTo(gesture.pull, e.clientY); });
window.addEventListener('pointerup', (e) => { if (pointers.has(e.pointerId)) release(e); });
window.addEventListener('pointercancel', (e) => { if (pointers.has(e.pointerId)) release(e); });
canvas.addEventListener('pointerleave', () => { hover = null; away = null; if (gesture?.kind !== 'edge') hotEdge = null; });
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
/** The water's time, in tenths of a second: held while zoomed out. */
let waveTime = 0;
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
  const cut = cutNow();
  const floor = belowNow();
  // Water hidden only while editing; Play shows the scene as in the game.
  const water = prefs.mode !== 'edit' || prefs.water;
  if (world.cutaway !== cut || world.cutBelow !== floor || world.waterShown !== water) {
    world.cutaway = cut;
    world.cutBelow = floor;
    world.waterShown = water;
    groundDirty = true;
  }
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
        // At a turn of the way, on to the next (up or down a ladder first, if it is one); at its end, stop.
        if (target.climb) actor.climb(target.climb, ms);
        const next = route.shift();
        target = next ? { ...next, run: target.run } : null;
        di = dj = 0;
      }
    }
    // A closed door on the way swings open as the character comes up to it.
    const door = target && !actor.onLadder ? world.doorAhead(actor, target) : null;
    if (door?.state === 'closed') door.state = 'open';
    const before = [actor.i, actor.j], climbed = actor.onLadder;
    actor.update(world, dt, di, dj, run, ms);
    // The animal being fetched waits to be picked up; the others shy away from the character.
    const fetching = target?.pick && 'animal' in target.pick ? target.pick.animal : undefined;
    herd?.update(world, dt, ms, world.toData(actor), fetching);
    roam(dt, ms);
    // A target that cannot be reached is given up rather than walked against forever (not while climbing, which ends straight up or down).
    if (target && before[0] === actor.i && before[1] === actor.j && !climbed && !actor.onLadder && !door) target = null;
  } else if (kx || ky) {
    cam.x += (kx * 360 * dt) / zoom;
    cam.y += (ky * 360 * dt) / zoom;
  }

  const view = viewRect();
  const wind = Math.floor((ms / 1000) * 6) % FRAMES;
  // Zoomed out (a screen pixel to less than a ground pixel) the waves hold still: they hardly show, and drawing them
  // again every tenth of a second is most of a frame's work over that many pixels.
  if (zoom >= 1) waveTime = Math.floor(ms / 100);
  const waves = waveTime;
  const idle = Math.floor((ms / 1000) * CLIPS.idle.rate);
  const key = `${version}|${view.x},${view.y},${vw},${vh}|${wind}|${waves}|${idle}|${hover?.i},${hover?.j}|${prefs.mode}|${prefs.bright}|${prefs.colliders}|${hotEdge}|${away?.scene.id},${away?.tile.i},${away?.tile.j}|${mods.alt},${mods.shift},${mods.pick}|${aimed}|${cut},${floor}`;
  if (prefs.mode === 'play' || key !== shown) {
    const begun = performance.now();
    const cave = world.scene.cave;
    const all: Thing[] = [
      ...world.plantThings(wind), ...world.decorThings(ms), ...world.animalThings(ms, herd ?? undefined), ...world.itemThings(), ...world.propThings(wind), ...world.scene.people.map((p) => personThing(p, ms)),
      // In Play the rock in front of the character dissolves as they walk; while editing, all rock that hides floor is down to its stub.
      ...(cave ? (prefs.mode === 'play' && actor ? caveThings(world, actor, ms) : caveThings(world)) : []),
      // The scene's walls: in Play those in front of the character dissolve as they walk.
      ...(prefs.mode === 'play' && actor ? world.wallThings(actor, ms) : world.wallThings()),
    ];
    if (prefs.mode === 'play' && actor) all.push({ ...actor.thing(world, ms), silhouette: true }, ...actor.dropThings());
    else {
      all.push(flagOf(world));
      for (const e of cave?.exits ?? []) {
        const v = world.toView(e);
        all.push({ spot: { i: v.i, j: v.j, level: standingHeight(world.map, v.i, v.j) }, picture: EXIT_MARK, w: 7, h: 7, foot: { x: 3, y: 3 }, shadow: [] });
      }
    }
    // What stands on ground cut away goes with it.
    const things = cut === null ? all : all.filter((x) => !cutOff(x.spot));
    // In Play the key alone does not say whether anyone moved: the picture is the same while every thing shows the same frame in the same place.
    const still = key === shown && things.length === shownThings.length
      && things.every((t, k) => t.picture === shownThings[k].picture && t.spot.i === shownThings[k].spot.i && t.spot.j === shownThings[k].spot.j && t.spot.level === shownThings[k].spot.level);
    if (still) return void requestAnimationFrame(frame);
    shown = key;
    shownThings = things;
    const blocked = prefs.mode === 'edit' && (hover ? cannotEdit(hover) : !!away && toolIn(away.scene) !== 'move' && cannotEdit(away.tile, lyingOf(away.scene).world));
    let highlight = prefs.mode === 'edit' && hover && toolNow() !== 'settings' ? {
      cells: new Set(brushCells(hover)), color: blocked ? '#e0332e99' : '#ffffff66',
      // The Material tool tints only what it paints: the tops, or the faces and rock.
      ...(toolNow() === 'paint' && !mods.shift && { part: aimed }),
    } : undefined;
    if (prefs.mode === 'edit' && toolNow() === 'move') {
      // Objects are not tied to a tile, so the Move tool marks one only where what it holds may not stay.
      const v = selected && world.toView(selected.obj);
      highlight = v && !canStand(selected!, v) ? { cells: new Set([Math.floor(v.j) * world.map.w + Math.floor(v.i)]), color: '#e0332e99' } : undefined;
    }
    world.hotEdge = prefs.mode === 'edit' ? hotEdge : null;
    // With Ctrl (Cmd) held, the tools that pick something up from a tile show it by the cursor.
    const picking = prefs.mode === 'edit' && !hotEdge && !gesture && mods.pick && PICKING.includes(toolNow());
    canvas.style.cursor = picking ? 'copy' : gesture?.kind === 'stroke' && gesture.pull ? 'ns-resize' : hotEdge && prefs.mode === 'edit' ? (gesture?.kind === 'edge' ? 'grabbing' : 'grab') : prefs.mode === 'edit' && (away ? toolIn(away.scene) : toolNow()) === 'move' ? (gesture?.kind === 'move' ? 'grabbing' : 'default') : blocked ? 'not-allowed' : prefs.mode === 'edit' ? 'crosshair' : 'pointer';
    let t0 = part('things', begun);
    const image = world.compose(view, things, highlight, prefs.mode === 'edit', waves * 100, prefs.mode === 'edit' && prefs.grid);
    t0 = performance.now();
    // A cave is as dark as in the game, but where its lights and the character's lantern reach; while editing it can be seen into.
    if (isDark(world.scene) && !(prefs.mode === 'edit' && prefs.bright)) {
      const lantern = prefs.mode === 'play' && actor ? [{ i: actor.i, j: actor.j, r: 4.2 * flicker(ms), amount: 1 }] : [];
      lightByTile(image, caveTint(world.scene), 0, world.spots!, world.lightField([...caveLamps(world, ms), ...lantern]));
    }
    // The selected object, outlined over everything (lights included), so it shows even behind rock or in the dark.
    const chosen = prefs.mode === 'edit' ? thingOf(selected, wind) : null;
    if (chosen) outline(image, view, chosen, OUTLINE);
    // The ground tools outline the top of the tile under the pointer the same way, so it shows which tile on uneven ground, behind rock and in the dark.
    if (prefs.mode === 'edit' && hover && onGround()) world.outlineTile(image, view, hover.j * world.map.w + hover.i, blocked ? '#e0332e' : '#ffffffcc');
    // A cave's walls stand over the rock the brush lies on: they are tinted with it, but by Material on tops alone.
    if (prefs.mode === 'edit' && hover && highlight && world.scene.cave && !(toolNow() === 'paint' && highlight.part === 'floor')) tintWalls(image, view, [...highlight.cells], highlight.color);
    if (prefs.colliders) world.drawColliders(image, view);
    t0 = part('light', t0);
    paintDesk(image, view);
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
/** What the modifier keys do with a tool, for its tip. */
function keyTips(tool: Tool): string[] {
  const out: string[] = [];
  if (tool === 'ground' || tool === 'paint') out.push(t(`keys.${tool}`));
  return out;
}

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

// ------------------------------------------------------------------ brush gizmo

/**
 * The brush size, floating at the top left of the view while a brushed tool is chosen: the biggest brush's tiles in
 * beige, two by two pixels a tile, and this one's tiles over them in orange, just as they lie on the grid. A press or
 * drag on it sizes the brush to reach the tile pointed at; the wheel over it, and [ and ], size it a step.
 */
const GIZMO = { cell: 2, reach: Math.floor(BRUSH_MAX / 2) };
const gizmo = h('div', { class: 'brushgizmo', role: 'slider', 'aria-valuemin': '1', 'aria-valuemax': String(BRUSH_MAX) });
function drawGizmo(): void {
  const side = (2 * GIZMO.reach + 1) * GIZMO.cell;
  const { canvas, ctx } = pixelCanvas(side, side + 1, S);
  const tiles = (n: number, dy: number, color: string) => {
    ctx.fillStyle = color;
    for (const [di, dj] of roundBrush(n)) ctx.fillRect((di + GIZMO.reach) * GIZMO.cell, (dj + GIZMO.reach) * GIZMO.cell + dy, GIZMO.cell, GIZMO.cell);
  };
  // A shadow line under the beige, as under every pixel button.
  tiles(BRUSH_MAX, 1, C.shadow);
  tiles(BRUSH_MAX, 0, C.paper);
  tiles(prefs.brush, 0, C.lit);
  gizmo.replaceChildren(canvas);
  gizmo.title = `${t('brush')}: ${prefs.brush}`;
  gizmo.setAttribute('aria-label', t('brush'));
  gizmo.setAttribute('aria-valuenow', String(prefs.brush));
}
function setBrush(n: number): void {
  n = Math.max(1, Math.min(BRUSH_MAX, n));
  if (n === prefs.brush) return;
  prefs.brush = n;
  savePrefs();
  drawGizmo();
  version++;
}
/** Shows the gizmo while a brushed tool is chosen. */
function showGizmo(): void {
  gizmo.hidden = prefs.mode !== 'edit' || !BRUSHED.includes(toolNow());
  if (!gizmo.hidden) drawGizmo();
}
/** The size whose brush reaches the gizmo's tile under the pointer: twice the tiles out from the middle, and one. */
function gizmoSize(e: { clientX: number; clientY: number }): number {
  const r = gizmo.querySelector('canvas')!.getBoundingClientRect();
  const tile = (r.width / (2 * GIZMO.reach + 1));
  const out = Math.hypot(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.width / 2) / tile;
  return Math.round(2 * out + 0.5);
}
gizmo.addEventListener('pointerdown', (e) => { gizmo.setPointerCapture(e.pointerId); setBrush(gizmoSize(e)); });
gizmo.addEventListener('pointermove', (e) => gizmo.hasPointerCapture(e.pointerId) && setBrush(gizmoSize(e)));
gizmo.addEventListener('wheel', (e) => { e.preventDefault(); setBrush(prefs.brush + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });

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
  // The game reads only the scenes saved in the project, not those kept on this device.
  const note = !it.to ? '' : !target || !projectCanon.has(it.to.scene) ? t('link.gone') : !there ? t('link.nowhere') : there.to?.scene === here && there.to.id === it.id ? '' : t('link.noreturn');
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
    plant: () => plantName(o.plant, FLORA.find((e) => e.id === o.plant)?.label ?? o.plant),
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
  const tool = toolNow();
  const out: Node[] = [
    h('div', { class: 'opts__head' }, iconPicture(TOOL_ICONS[tool]), h('b', {}, t(`tool.${tool}` as Key))),
    h('p', { class: 'opts__tip' }, t(`tip.${tool}` as Key)),
    ...(keyTips(tool).length ? [h('p', { class: 'opts__tip' }, keyTips(tool).join(' '))] : []),
  ];
  // One block of fields, so their labels are as wide as each other's.
  const rows: Node[] = [];
  if (tool === 'paint') {
    const grounds = paintsFor(sceneNow());
    if (!grounds.includes(prefs.paint)) prefs.paint = grounds[0];
    rows.push(field({ words: t('paint') }, choice(t('paint'), grounds.map((n) => ({ id: String(n), words: t(`paint.${n}` as Key) })), () => String(prefs.paint), (n) => set({ paint: Number(n) }), 'list')));
  }
  if (tool === 'walls') {
    const kinds = wallKinds();
    if (!kinds.some((k) => k.id === prefs.wall)) prefs.wall = kinds[0].id;
    const name = (k: WallKind) => (k.builtin ? t(`wall.${k.id}` as Key) : k.name);
    rows.push(field({ words: t('wall') }, choice(t('wall'), kinds.map((k) => ({ id: k.id, words: name(k) })), () => prefs.wall, (id) => set({ wall: id }), 'list')));
  }
  if (tool === 'ways') {
    rows.push(field({ words: t('way') }, choice(t('way'), WAYS.map((p) => ({ id: p.id, icon: p.icon, words: t(`way.${p.id}` as Key) })), () => prefs.way, (id) => set({ way: id as WayPick }), 'buttons')));
  }
  if (tool === 'ground') {
    rows.push(field({ words: t('edges') }, choice(t('edges'), EDGES.map((p) => ({ id: p.id, icon: p.icon, words: t(`edges.${p.id}` as Key) })), () => prefs.edges, (id) => set({ edges: id as Edges }), 'buttons')));
    const heights = [{ id: 'start', words: t('level.start') }, ...Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, k) => ({ id: String(MIN_LEVEL + k), words: String(MIN_LEVEL + k) }))];
    rows.push(field({ words: t('level.flat') }, choice(t('level.flat'), heights, () => (prefs.levelTo === null ? 'start' : String(prefs.levelTo)), (id) => set({ levelTo: id === 'start' ? null : Number(id) }), 'list')));
  }
  if (rows.length) out.push(fields(...rows));
  if (tool === 'ground') out.push(h('p', { class: 'opts__tip' }, t(`tip.edges.${prefs.edges}` as Key)));
  if (tool === 'ways') out.push(h('p', { class: 'opts__tip' }, t(`tip.way.${prefs.way}` as Key)));
  if (tool === 'prop') out.push(...propLibrary());
  if (tool === 'plant') out.push(picks(t('plants'), FLORA.map((e) => ({ id: e.id, name: plantName(e.id, e.label), picture: thumb(e.id) })), prefs.plant, (plant) => set({ plant })));
  if (tool === 'decor') out.push(picks(t('decor'), DECOR.map((d) => ({ id: d.id, name: t(`decor.${d.id}` as Key), picture: decorThumb(d.id) })), prefs.decor, (decor) => set({ decor })));
  if (tool === 'item') {
    out.push(picks(t('items'), objectChoices().map((c) => ({ id: c.id, name: c.name, picture: itemThumb(c.id, c.prop) })), prefs.item, (item) => set({ item })));
    out.push(link('../objects/', t('object.edit')));
  }
  if (tool === 'move' && selected) out.push(...selectionOptions(selected));
  if (tool === 'settings') out.push(...settingsOptions());
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
  return toolsHere().map((tool) => pixelButton(t(`tool.${tool}` as Key), { icon: TOOL_ICONS[tool], flat: true, pressed: tool === toolNow() }, () => set({ tool })));
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
    if (playDoors) {
      if (playDoors.doors) world.scene.doors = playDoors.doors;
      else delete world.scene.doors;
      playDoors = null;
    }
  }
  hover = null;
  away = null;
  version++;
  render();
}

function render(): void {
  name.set(sceneNow().name, t('scene.first'));
  const other = prefs.mode === 'edit' ? 'play' : 'edit';
  const { bar, undo: u, redo: r, pops } = topBar({
    sidebar: true,
    inspector: true,
    tool: 'scene',
    title: word('scene'),
    about: [t('hint.edit'), t('hint.play')],
    name: name.el,
    more: [
      { label: t('scene.new'), icon: 'plus', run: () => sceneDialog() },
      { label: t('scene.export'), icon: 'download', run: () => download(`${sceneNow().name}.json`, sceneFile(sceneNow())) },
      { label: t('scene.project'), icon: 'download', main: true, disabled: !canSaveToProject(), run: () => void saveScenes(), track: { unsaved: () => scenesToSave().length > 0, saveNow: saveScenes } },
      { label: t('scene.import'), icon: 'upload', run: () => void importScene() },
      { label: t('scene.delete'), icon: 'trash', run: deleteScene, danger: true },
    ],
    status: h('span', { class: 'bar__status' }),
    undo,
    redo,
    // One button: it shows where it takes you, Play while editing and Edit while playing.
    // Alt-click on Play opens the scene in the game instead.
    extra: pixelButton(t(`mode.${other}`), { icon: other === 'play' ? 'play' : 'pencil', flat: true, lit: true }, (e) => (e.altKey && other === 'play' ? void openInGame() : set({ mode: other }))),
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
  if (brightToggle) brightToggle.hidden = !editing || !isDark(sceneNow());
  showCut();
  showGizmo();
  // While editing, the scene lies on the desk; in Play it is seen as in the game, with open sea (or a cave's dark) round it.
  world.alone = editing;
  viewport.style.background = editing ? DESK : settingsOf(sceneNow()).outside === 'void' ? '#000' : ocean.deep;
  version++;
  fpsLine.hidden = !prefs.fps;
}

// ------------------------------------------------------------------ scene dialog

function sceneDialog(): void {
  let name = t('scene.first');
  let w = 28;
  let hh = 28;
  const kinds = [{ id: 'island', icon: 'palm' }, { id: 'sea', icon: 'flat' }, { id: 'cave', icon: 'rock' }, { id: 'seaCave', icon: 'shell' }] as const;
  let startWith: (typeof kinds)[number]['id'] = 'island';
  const size = { min: MIN_SIZE, max: MAX_SIZE, width: 44 };
  formDialog(t('dialog.new'), [
    fields(
      field({ icon: 'pencil', tip: t('dialog.name') }, textField(t('dialog.name'), name, (v) => (name = v), { width: 80 })),
      field({ icon: 'grid', tip: `${t('dialog.width')}, ${t('dialog.height')}` }, h('div', { class: 'urow' },
        numberField({ words: 'W', tip: t('dialog.width') }, w, (n) => (w = n), size),
        numberField({ words: 'H', tip: t('dialog.height') }, hh, (n) => (hh = n), size))),
      field({ icon: 'home', tip: t('dialog.kind') }, choice(t('dialog.kind'), kinds.map((k) => ({ id: k.id, icon: k.icon, words: t(`dialog.kind.${k.id}`) })), () => startWith, (id) => (startWith = id as typeof startWith), 'buttons')),
    ),
  ], () => {
    const label = name.trim().slice(0, 40) || t('scene.first');
    switchTo(startWith === 'cave' ? createCave(label, w, hh) : startWith === 'seaCave' ? createCave(label, w, hh, SCENE_PRESETS.seaCave) : createScene(label, w, hh, startWith === 'island'));
  });
}

/**
 * Changes the scene edited as the Settings tool says, at once: one step back undoes it. `edit` changes the scene in
 * place or gives the one to take its place (resized); the scene's world is made again, with what lies beyond it, its
 * light and its water.
 */
function changeScene(edit: (scene: Scene) => Scene | void): void {
  const scene = sceneNow();
  remember(scene);
  const next = edit(scene) ?? scene;
  if (next !== scene) library.scenes[library.scenes.indexOf(scene)] = next;
  switchTo(next, true);
  sceneChanged();
}

/** The Settings tool's options: the scene's name and size, what lies beyond it, its light and water, a cave's look. */
function settingsOptions(): Node[] {
  const scene = sceneNow();
  const set = settingsOf(scene);
  const settings = (change: Partial<SceneSettings>) => changeScene((s) => void setSettings(s, { ...settingsOf(s), ...change }));
  const size = { min: MIN_SIZE, max: MAX_SIZE, width: 44 };
  // A name another scene has (as its file name) would leave ways not knowing which they lead to: it is kept.
  const rename = (v: string) => {
    const label = v.trim().slice(0, 40) || t('scene.first');
    const was = slug(scene.name), now = slug(label);
    if (label === scene.name) return;
    const taken = now !== was && (library.scenes.some((o) => o.id !== scene.id && slug(o.name) === now) || (projectScenes.some((p) => p.name === now) && fileOf.get(scene.id) !== now));
    if (taken) return void (say(t('scene.nameTaken', { name: label })), inspect());
    changeScene((s) => { s.name = label; });
    if (now !== was) renamed(sceneNow(), was);
  };
  const water = set.water;
  const waterRow = h('div', { class: 'urow' },
    // Below the lowest level there is no water at all.
    pixelButton(t('dialog.waterDown'), { icon: 'down' }, () => water !== null && settings({ water: water <= MIN_LEVEL ? null : water - 1 })),
    pixelButton(t('dialog.water'), { words: water === null ? t('dialog.noWater') : String(water), flat: true }, () => {}),
    pixelButton(t('dialog.waterUp'), { icon: 'up' }, () => settings({ water: water === null ? MIN_LEVEL : Math.min(MAX_LEVEL, water + 1) })),
  );
  const cave = scene.cave;
  const caveSet = (change: Partial<NonNullable<Scene['cave']>>) => changeScene((s) => void (s.cave && Object.assign(s.cave, change)));
  const level = (label: string, icon: string, value: number, change: (n: number) => void) => {
    let now = value;
    return field({ icon, tip: label }, pixelSlider(label, value, (v) => { now = Math.round(v * 20) / 20; }, 60, undefined, () => now !== value && change(now)));
  };
  roster = loadRoster();
  const who: Option[] = [{ id: '', words: t('character.default') }, ...roster.map((c) => ({ id: c.id, words: c.name }))];
  return [
    fields(
      field({ icon: 'pencil', tip: t('dialog.name') }, textField(t('dialog.name'), scene.name, () => {}, { width: 80, done: rename })),
      field({ icon: 'grid', tip: `${t('dialog.width')}, ${t('dialog.height')}` }, h('div', { class: 'urow' },
        numberField({ words: 'W', tip: t('dialog.width') }, scene.w, (n) => n !== scene.w && changeScene((s) => resized(s, n, s.h)), size),
        numberField({ words: 'H', tip: t('dialog.height') }, scene.h, (n) => n !== scene.h && changeScene((s) => resized(s, s.w, n)), size))),
      field({ icon: 'flat', tip: t('dialog.outside') }, choice(t('dialog.outside'), [{ id: 'sea', icon: 'flat', words: t('dialog.outside.sea') }, { id: 'void', icon: 'close', words: t('dialog.outside.void') }], () => set.outside, (id) => settings({ outside: id as SceneSettings['outside'] }), 'buttons')),
      field({ icon: 'sun', tip: t('dialog.light') }, choice(t('dialog.light'), [{ id: 'day', icon: 'sun', words: t('dialog.light.day') }, { id: 'dark', icon: 'moon', words: t('dialog.light.dark') }], () => set.light, (id) => settings({ light: id as SceneSettings['light'] }), 'buttons')),
      field({ icon: 'height', tip: t('dialog.water') }, waterRow),
      ...(cave ? [
        field({ icon: 'rock', tip: t('dialog.headroom') }, numberField({ icon: 'up', tip: t('dialog.headroom') }, set.headroom || 5, (n) => settings({ headroom: n }), { min: 1, max: MAX_HEADROOM, width: 44 })),
        // Any dark tint, a few good ones offered in the picker.
        field({ icon: 'palette', tip: t('dialog.tint') }, colorPicker(t('dialog.tint'), () => cave.tint ?? CAVE_DEFAULTS.tint, () => {}, { presets: [...CAVE_TINTS], done: (hex) => caveSet({ tint: hex }) })),
        level(t('dialog.dark'), 'moon', cave.dark ?? CAVE_DEFAULTS.dark, (n) => caveSet({ dark: n })),
        level(t('dialog.rubble'), 'rock', cave.rubble ?? CAVE_DEFAULTS.rubble, (n) => caveSet({ rubble: n })),
      ] : []),
      // Who walks the scenes in Play: a setting of the editor, not of the scene.
      field({ icon: 'person', tip: t('character') }, choice(t('character'), who, () => (roster.some((c) => c.id === prefs.character) ? prefs.character : ''), (id) => {
        prefs.character = id;
        savePrefs();
        actor?.setLook(characterLook());
      }, 'list')),
    ),
    h('p', { class: 'opts__tip' }, t('dialog.shrink')),
    link('../wardrobe/', t('character.edit')),
  ];
}

/**
 * After a scene's name changed from `was` (a file name): every way that led to it leads to its new name, in the
 * editor's scenes and the project's (read into the editor to be changed, and saved with the next Save).
 */
function renamed(scene: Scene, was: string): void {
  if (!fileOf.has(scene.id) && projectScenes.some((p) => p.name === was)) fileOf.set(scene.id, was);
  for (const p of projectScenes) {
    if (library.scenes.some((o) => slug(o.name) === p.name) || p.name === was) continue;
    try {
      const file = readSceneFile(p.text);
      if (file.items.some((o) => o.to?.scene === was)) library.scenes.push(file);
    } catch { /* a broken file leads nowhere */ }
  }
  for (const other of library.scenes) {
    const leading = other.items.filter((o) => o.to?.scene === was);
    if (!leading.length) continue;
    remember(other, true);
    for (const o of leading) o.to = { scene: slug(scene.name), id: o.to!.id };
  }
}

async function deleteScene(): Promise<void> {
  const scene = sceneNow();
  if (!(await confirmDialog(t('scene.confirmDelete', { name: scene.name })))) return;
  library.scenes = library.scenes.filter((s) => s !== scene);
  library.open = library.open.filter((id) => id !== scene.id);
  dropLying(scene.id);
  forget(scene.id);
  switchTo(openScenes()[0] ?? library.scenes[0] ?? createScene(t('scene.first'), 28, 28, true));
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
  .map(([file, data]) => ({ name: file.slice(file.lastIndexOf('/') + 1, -5), text: JSON.stringify(data), title: undefined as string | undefined }));
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
  // Heights count from the water line; a cave's floor is all one colour, but where water lies on it.
  const water = settingsOf(s).water ?? -Infinity;
  s.levels.forEach((l, i) => put(i, isRock(l) ? [0, 0, 0] : l < water || (l === water && !s.cave) ? [58, 124, 170] : s.cave || l === water + 1 ? [226, 204, 140] : l === water + 2 ? [110, 160, 80] : [120, 116, 108]));
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
    // A scene picked opens on the desk (beside the ones open) and is edited; one dragged onto the desk only opens there.
    const file = projectScenes.find((p) => `file:${p.name}` === id);
    let scene = library.scenes.find((s) => s.id === id);
    if (file) {
      try { scene = readSceneFile(file.text); } catch { return say(t('scene.badFile')); }
    }
    if (!scene) return;
    switchTo(scene);
  },
});

// A scene's tile dragged out of the list onto the desk opens the scene there, without editing it (a mouse drags any
// way; a finger drags sideways, as up and down scrolls the list). While over the desk, where it will land is outlined.
let listDrag: { pointer: number; id: string; tile: HTMLElement; x: number; y: number; touch: boolean; scene: Scene | null } | null = null;
sceneList.addEventListener('pointerdown', (e) => {
  const tile = (e.target as Element).closest<HTMLElement>('.utile');
  if (e.button !== 0 || listDrag || prefs.mode !== 'edit' || !tile?.dataset.id) return;
  listDrag = { pointer: e.pointerId, id: tile.dataset.id, tile, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', scene: null };
});
/** The scene a tile of the list stands for: the editor's own, or a new copy of a project file (kept only once dropped). */
function sceneOfTile(id: string): Scene | null {
  const file = projectScenes.find((p) => `file:${p.name}` === id);
  if (!file) return library.scenes.find((s) => s.id === id) ?? null;
  try { return readSceneFile(file.text); } catch { return null; }
}
const overDesk = (e: PointerEvent) => {
  const box = canvas.getBoundingClientRect();
  return document.elementsFromPoint(e.clientX, e.clientY).includes(canvas) && e.clientX >= box.left && e.clientY >= box.top && e.clientX < box.right && e.clientY < box.bottom;
};
sceneList.addEventListener('pointermove', (e) => {
  const d = listDrag;
  if (!d || e.pointerId !== d.pointer) return;
  if (!d.scene) {
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) < 6 || (d.touch && Math.abs(dx) < Math.abs(dy))) return;
    d.scene = sceneOfTile(d.id);
    if (!d.scene) return void (listDrag = null);
    d.tile.setPointerCapture(e.pointerId);
    document.body.classList.add('desk-dragging');
  }
  ghost = overDesk(e) ? { scene: d.scene, ...landing(d.scene, e) } : null;
  version++;
});
const dropListTile = (e: PointerEvent) => {
  const d = listDrag;
  if (!d || e.pointerId !== d.pointer) return;
  listDrag = null;
  if (!d.scene) return;
  document.body.classList.remove('desk-dragging');
  // The click that ends a drag does not also pick the scene.
  const eat = (c: Event) => c.stopPropagation();
  window.addEventListener('click', eat, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 0);
  const at = e.type === 'pointerup' && ghost ? ghost.at : null;
  ghost = null;
  version++;
  if (!at) return;
  // A project file dropped twice is one scene: the copy the editor already has of it, if any.
  const scene = library.scenes.find((s) => s.id === d.scene!.id) ?? d.scene;
  openAt(scene, at);
};
sceneList.addEventListener('pointerup', dropListTile);
sceneList.addEventListener('pointercancel', dropListTile);
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
    overlay.el,
    dockBox,
    gizmo,
    cutSlot,
    h('div', { class: 'zoom' },
      pixelButton(t('zoom.in'), { icon: 'zoomin' }, () => stepZoom(1)),
      pixelButton(t('zoom.out'), { icon: 'zoomout' }, () => stepZoom(-1)),
      pixelButton(t('rotate.left'), { icon: 'turnleft' }, () => rotate(-1)),
      pixelButton(t('rotate.right'), { icon: 'turnright' }, () => rotate(1)),
      brightToggle,
      toggle(t('zoom.grid'), { icon: 'grid' }, prefs.grid, (grid) => set({ grid })),
      toggle(t('zoom.water'), { icon: 'water' }, prefs.water, (water) => set({ water })),
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

// Every open scene has its place on the desk (scenes from before the desk get one).
for (const s of openScenes()) placeOnDesk(s);
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
