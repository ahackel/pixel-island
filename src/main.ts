// Pixel Island: days on the island, quest by quest. Tap to walk, pick up coconuts and eat them,
// watch the sun set, get tired, sleep, wake to what the sea brought: sticks and driftwood. Tie a stone
// to a stick for a spear, and spear the fish that swim near. On windy days crabs come out on the
// beach: speared, or grabbed by hand if lucky. A crate smashed gives rope and driftwood; a hut of
// driftwood keeps the rain and the storm off. Once lightning has burnt a palm, hold a stick to its fire
// for a torch, and with the torch light driftwood: a campfire. A vine makes an axe, which fells palms;
// logs, rope and the cloth make a raft, and setting sail ends the game.
import './style.css';
import { defaultState, lookOf, type State } from '@pixel/engine/character/character.ts';
import { characterEditor } from '@pixel/engine/character/editor.ts';
import type { Mood } from '@pixel/engine/character/base.ts';
import type { Look } from '@pixel/engine/core/puppet.ts';
import { FRAMES } from '@pixel/engine/flora/flora.ts';
import { Actor } from '@pixel/engine/world/actor.ts';
import { settingsOf, type PlacedPerson } from '@pixel/engine/world/scene.ts';
import { turnFacing } from '@pixel/engine/core/puppet.ts';
import { light, lightByTile } from '@pixel/engine/world/daylight.ts';
import { CLEAR, flashAt, lightning, type Weather } from '@pixel/engine/world/weather.ts';
import { kindFor, weatherAt } from './weather.ts';
import { footOf } from '@pixel/engine/world/island.ts';
import { emittersOf, halos, particleSystem, Particles, tileHalo } from '@pixel/engine/world/particles.ts';
import { heightAt, isLand, LEVEL_PX, standingHeight, surfaceAt, TILE_H, TILE_W } from '@pixel/engine/world/terrain.ts';
import { World, type Thing, type TileLamp } from '@pixel/engine/world/world.ts';
import type { PlacedDecor } from '@pixel/engine/world/decor.ts';
import { caveLamps as caveOwnLamps, caveThings, caveTint, setUpCave } from '@pixel/engine/world/cave.ts';
import { LINKING, openFrames, type PlacedItem } from '@pixel/engine/world/props.ts';
import { Viewport } from '@pixel/shared/viewport.ts';
import { findPath, type Waypoint } from '@pixel/engine/world/path.ts';
import { climbDown, doorSpot, edgeCells, ladderSpots, type SceneDoor } from '@pixel/engine/world/ways.ts';
import { edgeKey } from '@pixel/engine/world/building/building.ts';
import { spawnFish, swim } from '@pixel/engine/world/fish.ts';
import { crabAt, crabThing, scare, scuttle, spawnCrab, type Crab } from '@pixel/engine/world/crab.ts';
import { cruise, finShows, finThing, sharkNear, spawnSharks } from './shark.ts';
import { rng } from '@pixel/shared/random.ts';
import { DAY_S, drain, DUSK_S, faints, LOW, phaseAt, speedOf, SUNSET_S, wake } from './clock.ts';
import { C, caps, hud, pixelButton, S, slot } from '@pixel/shared/game-ui.ts';
import { label } from '@pixel/shared/pixel-ui.ts';
import { wrap } from '@pixel/shared/pixel-font.ts';
import { PALETTE } from '@pixel/engine/core/palette.ts';
import { caveScene, firstIsland, rockyIsland, savedScene } from './island.ts';
import { BAG_SLOTS, islandId, loadGame, saveGame, type Game, type Lying } from './save.ts';
import { t, type Key } from './i18n.ts';
import { idle, run, type Doer, type Handler } from './effects.ts';
import { ruleFor, type Condition, type Target } from './interactions.ts';
import { advance, KINDS, next, QUESTS, startProgress, waiting, type Goal, type Kind, type Progress, type QuestIcon } from './quests.ts';
import { cheatDrawer, statsOverlay } from '@pixel/shared/cheats.ts';
import { frameDone, part } from '@pixel/shared/stats.ts';
import { bagWords, FISH_ITEMS, FOOD, BUILD_KINDS, BUILDS, HUT_AT, isLoose, recipeFor, takeFrom, type BagItem, type BuildKind } from './crafts.ts';
import { AXE, blanketThing, heldOf, HAMMER_HELD, hatThing, hutBuilding, mouthThing, PIECE_KINDS, raftThing } from './things.ts';
import { buildSpot, dropCoconuts, headSide, lay, layStones, morningGifts, spotNear, spotsNear, topUpStones, washedUp, washUp, washWood, type Shore } from './shore.ts';
import { BLANKET, burning, burnPalm, byHut, canSail, fireNear, hutOf, isTall, onBlanket, sheltered, sleepRefused, stormWakes, wantsFire } from './camp.ts';
import { chestKey, doorKey, doorState, openDoor as openDoorRule, passable as canPass, takeFromChest } from './places.ts';
import { bagView } from './bag-ui.ts';
import { menuView, wordButton } from './menu.ts';
import { BAG_PICTURES, LYING, PICK_NEAR, questPicture } from './pictures.ts';
import { flight, landed, landing, type Thrown } from './throw.ts';
import { talkView } from './talk.ts';
import { optionsOf, withoutQuest } from './options.ts';
import { asSeen, nightfall, tintAt, weatherLight } from './sky.ts';
import { breakOf, Burst, campfireThing, STICK, Strike, stumpThings, torchAt } from './fire.ts';

/** The debug options in the address (options.ts); a tryout ends when a new game is started from the menu. */
const opts = optionsOf(location.search, QUESTS.length);
/** A new game from the menu is a real one: the first quest, saved, and the tryout's `?quest` gone from the address. */
function endTryout(): void {
  if (!opts.tryout) return;
  opts.tryout = false;
  opts.startQuest = 0;
  history.replaceState(null, '', location.pathname + withoutQuest(location.search));
}
/** The saved scene `?scene=` plays as the island, if there is one by that name. */
const SCENE_TRY = opts.scene ? savedScene(opts.scene) : null;
/** Whether this game is the real, saved one: not a tryout, the rocky island or a saved scene. */
const saves = () => !opts.tryout && !opts.island2 && !SCENE_TRY;
/** How near the survivor must come to pick something up, in metres. */
const REACH = 0.7;
const FADE = { out: 1200, hold: 1000, in: 1200 };
/** How many fish swim round the island; the ones caught are back by the next morning. */
const FISH_COUNT = 14;
/** How near a fish must swim to be speared, in metres. */
const SPEAR_REACH = 1.8;
/** How many sharks cruise the deep water, and how near one has to pass for the survivor in the water to see it. */
const SHARK_COUNT = 4;
const SHARK_SEEN = 5;
/** How many crabs come out on a windy day; how near one must be to grab it by hand, and how often that works. */
const CRAB_NIGHT = 5;
const GRAB_REACH = 1.4;
const GRAB_LUCK = 0.25;

// ------------------------------------------------------------------ the world

const rocky = opts.island2 ? rockyIsland() : null;
const islandScene = rocky?.scene ?? SCENE_TRY ?? firstIsland();
/** The island; everything of the island's own (its fish, palms, crabs and hut) lives here, wherever the survivor is. */
const island = new World(islandScene);
island.pieceKinds = PIECE_KINDS;
// The island's own loose items are the game's (see `game.items`); only the ways to and from other scenes stand in it as the scene has them.
island.fixed = islandScene.items.filter((o) => LINKING.includes(o.item));
// A scene tried on its own that is a cave (`?scene=`) needs its rock walls.
if (islandScene.cave) setUpCave(island);
/** A cave in the island, a world of its own with nothing beyond its rock: walked into at the mouth, out at the daylight. */
const cave = rocky && (() => {
  const c = caveScene();
  const w = new World(c.scene);
  setUpCave(w);
  return { ...c, world: w };
})();
/** The scene and world the survivor is in: the island, or the cave. */
let scene = islandScene;
let world = island;
/** Whether the survivor is in a cave (the rocky island's, one a way led to, or a cave tried on its own): drawn and lit as one. */
const inCave = () => !!world.scene.cave;
/** Whether the scene the survivor is in is dark but where its lights reach (a cave's settings, see `SceneSettings.light`). */
const inDark = () => settingsOf(world.scene).light === 'dark';
/** Whether the survivor is on the island's open ground, where the island's own things (hut, fires, crabs, palms, bag drops) are. */
const onIsland = () => world === island && !inCave();
const fishRandom = rng(Date.now());
island.fish = spawnFish(island.floor, FISH_COUNT, fishRandom);
/** The sharks out in the deep water: never caught, never gone, the reason there is no swimming away. */
const sharks = spawnSharks(island.floor, SHARK_COUNT, fishRandom);
/** Every palm, by the index the save uses; the scene keeps only the ones still standing. */
const palms = [...islandScene.plants];
/** The island's fingerprint, kept in the save, so a save of another island (one edited since) is not loaded onto this one. */
const ISLAND_ID = islandId(islandScene.levels, palms);
/** Shows (and lets block the way) only the palms not cut down. */
const keepStanding = () => (islandScene.plants = palms.filter((_, k) => !game.felled.includes(k)));
/** The crabs out today, and how many have come out so far; all gone by the next morning. */
let crabs: Crab[] = [];
let crabsOut = 0;
/** When the survivor set sail, which ends the game. */
let ended: number | null = null;

/** The survivor as the editor first shows them: the default, with no spear, which they must make. */
const firstWho = (): State => {
  const who = defaultState();
  who.worn.tool = null;
  return who;
};

/** Turns the survivor so that, lying down, the head is on the dry side (see `headSide`). */
function faceToLie(): void {
  // Facing 0 lies with the head to the left, 1 to the right (the engine mirrors facings 1, 2, 5 and 6).
  const right = headSide(dry, actor) === 1;
  actor.facing = right ? 1 : 0;
  actor.lookAt(right ? 0 : 1, right ? 1 : 0);
}

function newGame(who = firstWho()): Game {
  // Washed ashore along the water's edge, the hat on the sand beyond their head (shore.ts).
  const { at, hat } = washedUp(isle, scene.spawn, dry, !!who.worn.hat);
  const quest: Progress = { ...startProgress(), quest: opts.startQuest };
  const g: Game = {
    day: 1, hunger: 0.5, energy: 1, bag: [], items: [], chests: {}, doors: {}, struck: null, fires: [], lying: [], felled: [],
    builds: [], at, hat, who, quest, weather: kindFor(opts.startQuest, 1),
  };
  if (opts.island2) g.bag.push('lantern');
  // The island starts with two coconuts lying about.
  for (let n = 0; n < 2; n++) dropCoconuts(isle, g);
  washWood(isle, g);
  washWood(isle, g);
  // What the quests so far brought (in a tryout, all those before the one it starts at): their start effects, as far as
  // they lie on the island; a strike before then has burnt its palm.
  for (let k = 0; k <= opts.startQuest; k++) {
    run(QUESTS[k].start ?? [], { ...idle, washUp: (items) => washUp(isle, g, items), stones: (n) => layStones(isle, g, n), strike: () => { if (k < opts.startQuest) burnPalm(isle, g, at); } });
  }
  return g;
}

/** Whether a spot is on land, above the water (off the map is sea). */
const dry = (p: { i: number; j: number }) => isLand(world.map, Math.floor(p.i), Math.floor(p.j));

const beach: { i: number; j: number }[] = [];
for (let j = 0; j < scene.h; j++) for (let i = 0; i < scene.w; i++) if (surfaceAt(world.map, i, j) === 'beach') beach.push({ i: i + 0.5, j: j + 0.5 });
/** The island's ground for the rules in shore.ts. */
const isle: Shore = {
  beach,
  palms,
  dry: (p) => isLand(island.map, Math.floor(p.i), Math.floor(p.j)),
  aboveWater: (p) => heightAt(island.map, p.i, p.j) > island.water + 0.1,
  surface: (p) => surfaceAt(island.map, Math.floor(p.i), Math.floor(p.j)),
  random: Math.random,
};
const saved = opts.fresh || !saves() ? null : loadGame(scene.w, palms.length, ISLAND_ID);
let game = saved ?? newGame();
// Saves from before doors kept them have none opened.
game.doors ??= {};
/** Game seconds since the morning. Every load starts in the morning, since the game is saved on waking. */
let time = 0;
world.loose = game.items;
keepStanding();
const actor = new Actor(lookOf(game.who), game.at);
/** A character placed in a scene as a prop, held in one frame of a clip (a skeleton slumped in the cave). */
const props = new WeakMap<object, Actor>();
function propThing(p: PlacedPerson, ms: number) {
  let a = props.get(p);
  if (!a) {
    props.set(p, (a = new Actor(lookOf(p.state), p)));
    a.frozen = p.pose ?? null;
    a.facing = turnFacing(0, 2 * p.turn);
  }
  return a.thing(world, ms);
}
/** Whether the survivor is on the island: not before the first character is made. */
let present = !!saved;
/** How happy the survivor is, 0 to 1: fed and rested. Their face shows it. */
const happiness = () => game.hunger * game.energy;
const moodOf = (h: number): Mood => (h >= 0.75 ? 'happy' : h >= 0.5 ? 'smile' : h >= 0.25 ? 'neutral' : 'sad');
let mood: Mood | null = null;
/** What the survivor holds in their hand, out of the bag: a stick, a torch, a stone or the spear. */
let hand: BagItem | null = null;
/** Draws the survivor with the face their happiness gives, when it changes. */
function feel(): void {
  const next = moodOf(happiness());
  if (next === mood) return;
  mood = next;
  dress();
}
/** The spear, as the default survivor holds it. */
const SPEAR = lookOf(defaultState()).items.find((it) => it.slot === 'tool')!;
/** The tool item in the survivor's hand, if any. */
let held: typeof STICK | null = null;
/** Other bag things in hand, hanging from it in their bag picture; made when first held. */
const HELD = new Map<BagItem, typeof STICK>();
/** The survivor's look: their face, and in hand whatever they took out of the bag (the stick, torch, spear and axe their own way). */
function dress(): void {
  held = hand === 'wood' ? STICK : hand === 'fire' ? torchAt(performance.now()) : hand === 'spear' ? SPEAR : hand === 'axe' ? AXE : hand === 'hammer' ? HAMMER_HELD : null;
  if (!held && hand) {
    if (!HELD.has(hand)) HELD.set(hand, heldOf(hand, BAG_PICTURES[hand]));
    held = HELD.get(hand)!;
  }
  const m = mood ?? 'happy';
  // Kept per face and held thing, so the torch's flicker goes back to looks the actor has drawn already.
  let byMood = looks.get(held);
  if (!byMood) looks.set(held, (byMood = new Map()));
  let look = byMood.get(m);
  if (!look) {
    look = lookOf({ ...game.who, mood: m });
    look.items = [...look.items.filter((it) => it.slot !== 'tool' && !(it.slot === 'hat' && game.hat)), ...(held ? [held] : [])];
    byMood.set(m, look);
  }
  actor.setLook(look);
}
const looks = new Map<typeof STICK | null, Map<Mood, Look>>();
feel();
/** A minute with nothing to do and the survivor sits down; any tap gets them up. */
actor.sitAfter = 60_000;

// ------------------------------------------------------------------ pictures

/** Where something lies on the island's ground, its height there worked out once for each spot object (they never move). */
const groundSpots = new WeakMap<object, Thing['spot']>();
function groundSpot(p: { i: number; j: number }): Thing['spot'] {
  let s = groundSpots.get(p);
  if (!s) groundSpots.set(p, (s = { i: p.i, j: p.j, level: standingHeight(island.map, p.i, p.j) }));
  return s;
}
/** A thing lying still on the island's ground (a coconut, the blanket, the hat), made once for each spot object, not every frame. */
const stillThings = new WeakMap<object, Thing>();
function still(p: { i: number; j: number }, make: (spot: Thing['spot']) => Thing): Thing {
  let t = stillThings.get(p);
  if (!t) stillThings.set(p, (t = make(groundSpot(p))));
  return t;
}

// ------------------------------------------------------------------ page

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => Object.assign(document.createElement(tag), { className: cls });
// The page is set every frame: each write is made only when it changes something, so the browser is not made to work
// the page out again for nothing.
const setHidden = (e: HTMLElement, hidden: boolean) => { if (e.hidden !== hidden) e.hidden = hidden; };
const setAttr = (e: HTMLElement, name: string, value: string) => { if (e.getAttribute(name) !== value) e.setAttribute(name, value); };
const styled = new WeakMap<HTMLElement, Record<string, string>>();
function setStyle(e: HTMLElement, name: 'opacity' | 'transform', value: string): void {
  let set = styled.get(e);
  if (!set) styled.set(e, (set = {}));
  if (set[name] === value) return;
  set[name] = value;
  e.style[name] = value;
}
const app = document.getElementById('app')!;

type Pick = { crab: Crab } | { item: PlacedItem } | { stump: true } | { loose: Lying } | { palm: number } | { hat: true } | { blanket: true } | { torch: PlacedDecor } | { chest: PlacedItem } | { way: PlacedItem } | { door: SceneDoor };
/** Where the survivor is going: waypoints round what is in the way (ladders climbed on the way), the last one the goal. */
let target: { way: Waypoint[]; run: boolean; pick?: Pick; replans?: number } | null = null;
/** How often a way that stalls is planned again from where the survivor stands before it is given up. */
const REPLANS = 3;
/** The doors a way may go through: closed ones, which the survivor opens on the way, and locked ones while a key is in the bag. */
const passable = (d: SceneDoor) => canPass(d.state, game.bag);
function goTo(at: { i: number; j: number }, run: boolean, pick?: Pick): void {
  const way = findPath(world, actor, at, passable);
  target = way.length ? { way, run, pick } : null;
  // Being sent somewhere gets the survivor up; eating or picking something out of the bag does not.
  if (target) actor.rouse(performance.now());
}

const view = new Viewport({ zoom: 4, min: 2, max: 6, press: (p, start) => press(p, start) });
app.append(view.el);

const status = hud({ hunger: t('hunger'), energy: t('energy') });
const hudBox = el('div', 'hud');
/** The current quest's picture beside the bars; a tap says it again. */
const questButton = el('button', 'pbtn quest');
questButton.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!paused && !sleeping) think(questThought());
});
hudBox.append(status.canvas, questButton);

const buttons = el('div', 'buttons');
const sleepButton = pixelButton(t('sleep'), { icon: 'moon', words: t('sleep'), dark: true }, () => sleep(false));
const buildButtons = Object.fromEntries(BUILD_KINDS.map((k) => [k, wordButton(`build.${k}`, () => build(k))])) as Record<BuildKind, HTMLButtonElement>;
const sailButton = wordButton('setSail', () => setSail());
// The view's buttons top right; what the survivor can do now (sleep, build, set sail) above the bag, where long words
// have room and never run into the day and bars.
buttons.append(
  pixelButton(t('menu'), { icon: 'menu' }, () => setPaused(true)),
);
const actions = el('div', 'actions');
actions.append(...Object.values(buildButtons), sailButton, sleepButton);

function hold(item: BagItem | null): void {
  hand = item;
  dress();
  showBag();
}
const bagUi = bagView({
  items: () => game.bag,
  hand: () => hand,
  canAct: () => !paused && !sleeping,
  picture: (item) => BAG_PICTURES[item],
  words: (item) => t(bagWords(item)),
  eat: (n, item) => {
    if (!FOOD[item]) return false;
    eat(n);
    return true;
  },
  hold,
  tie: (recipe) => make(recipe),
  noMatch: () => think('think.noMatch'),
  putDown: (n, x, y) => putDown(n, view.toGround(x, y)),
  ghostParent: app,
});
const bag = bagUi.el;
bag.setAttribute('aria-label', t('bag'));
function showBag(): void {
  bagUi.show();
}

/** A screen offset in ground pixels as a map offset in metres: a tile is TILE_W by TILE_H pixels, map +i is screen right and down. */
const mapOffset = (dx: number, dy: number) => ({ i: dx / TILE_W + dy / TILE_H, j: dy / TILE_H - dx / TILE_W });

/** Things in the air, thrown from the bag (throw.ts). */
let thrown: Thrown[] = [];

/**
 * Throws a thing from the bag toward a ground-image point, at most THROW.far from the survivor and
 * never over a wall or into the sea (then shorter); it lands there to be picked up again. The torch is kept.
 */
function putDown(n: number, p: { x: number; y: number }): void {
  const item = game.bag[n];
  if (!item || item === 'fire' || paused || sleeping) return;
  // The point on the map under `p`, taken at the survivor's own ground level.
  const s = world.screenOf(actor.i, actor.j);
  const { i: di, j: dj } = mapOffset(p.x - s.x, p.y - s.y);
  const to = landing(actor, { i: di, j: dj }, (at) => dry(at) && world.canWalk(actor, at));
  game.bag.splice(n, 1);
  const now = performance.now();
  thrown.push({ item, from: { i: actor.i, j: actor.j }, to, start: now });
  if (di || dj) actor.lookAt(di, dj);
  actor.emote('use', now);
  hold(hand && game.bag.includes(hand) ? hand : null);
}
/** Lands what has flown its time: on the ground with its kind. */
function land(ms: number): void {
  for (const t of thrown.filter((t) => landed(t, ms))) {
    // Put down, the crate stands on the ground again, in the way like before.
    if (t.item === 'crate') game.items.push({ item: 'crate', ...t.to });
    else lay(game, t.item, t.to);
  }
  thrown = thrown.filter((t) => !landed(t, ms));
}
/** A thing in flight: along the line from hand height up in an arc and down onto the ground. */
function thrownThing(t: Thrown, ms: number): Thing {
  const { i, j, up } = flight(t, ms);
  return LYING[t.item]({ i, j, level: standingHeight(world.map, i, j) + up });
}

/** Things tied together, one dragged onto another in the bag: a stick and a stone a spear, with a vine an axe. */
function make(recipe: ReturnType<typeof recipeFor> & {}): void {
  takeFrom(game.bag, recipe.needs);
  game.bag.push(recipe.makes);
  hold(recipe.makes);
  think(recipe.thought);
}

const { bubble, dialog, think, thinking, tell, telling, forget, follow } = talkView(app, actor, () => paused);

const veil = el('div', 'veil');
/** The day whose title the veil shows, 0 for none: the title comes up once the screen is black. */
let veilDay = 0;
/** No title while fading out: the last one would show yesterday's day. */
function clearVeil(): void {
  veil.replaceChildren();
  veilDay = 0;
}
// ------------------------------------------------------------------ quests

const questNow = () => QUESTS[game.quest.quest];
/** Done, with the next quest waiting for the morning: then the survivor should rest. */
const resting = () => !!waiting(game.quest);
const questThought = () => (resting() ? 'quest.rest' : questNow().thought);
let questShown = '';
/** The quest's picture beside the bars, or the moon once it is done and the next waits for the morning. */
function showQuest(): void {
  const icon: QuestIcon = resting() ? 'moon' : questNow().icon;
  const words = t(questThought());
  if (questShown === icon + words) return;
  questShown = icon + words;
  questButton.replaceChildren(slot(questPicture(icon)));
  questButton.setAttribute('aria-label', words);
  questButton.title = words;
}
/** `goal` happened: the current quest counts it, if it is its own; a next quest that says `now` starts at once. */
function reach(goal: Goal): void {
  const before = game.quest;
  game.quest = advance(game.quest, goal);
  if (game.quest === before) return;
  const after = next(game.quest, false);
  if (after !== game.quest) tell(startQuest(after));
  showQuest();
}
/** Starts a quest: its start effects are done (its weather sets in, what it brings is on the beach, its lightning waits to strike). Its thought, to tell. */
function startQuest(p: Progress): string {
  game.quest = p;
  // A fair day's weather, unless a `weather` effect of the quest says otherwise.
  game.weather = kindFor(p.quest, game.day);
  run(questNow().start ?? [], doer());
  showQuest();
  return questNow().thought;
}
/** Today's weather: the one the quest that is under way brought, or the one the cheat forces. */
const kindNow = () => weatherCheat ?? game.weather;
/** Tomorrow's, toward which the afternoon sky turns: unchanged, unless a new quest starts in the morning. */
const kindTomorrow = () => {
  const after = next(game.quest, true);
  return weatherCheat ?? (after === game.quest ? game.weather : kindFor(after.quest, game.day + 1));
};

function startNew(who: State): void {
  game = newGame(who);
  for (const w of visited.values()) doorsOf(w);
  present = true;
  veilDay = 0;
  looks.clear();
  mood = null;
  feel();
  world.loose = game.items;
  Object.assign(actor, game.at);
  keepStanding();
  centerOn(actor);
  time = 0;
  stormWoken = false;
  strikeNow = false;
  weatherCheat = undefined;
  taught.clear();
  ended = null;
  questShown = '';
  showQuest();
  // The new game replaces the old save at once, but with `?new` only from its first sleep.
  if (!opts.fresh) store();
  hold(null);
}

// The menu, which is also the pause (menu.ts).
const menu = menuView({
  state: () => ({ editing, present, ended: !!ended, started }),
  play,
  // Over the editor, play goes on once the survivor is made and the screen is fading to the island.
  backToEditor: () => { menuBox.hidden = true; editor!.hidden = false; if (editor!.inert) setPaused(false); },
  newGame: () => { endTryout(); present = false; showMenu(); },
  createCharacter: makeCharacter,
});
const menuBox = menu.el;
/** Whether the player has played since the page loaded. */
let started = false;
function play(): void {
  setPaused(false);
  // Back on the island, the survivor recalls what they were about.
  if (!started) tell(questThought());
  started = true;
}
/**
 * The character editor, over the menu. Once confirmed the whole screen fades to black over it, and only then is it
 * closed and the survivor washed up on the beach (see `fadeAt`).
 */
let editor: HTMLElement | null = null;
/** Whether the character editor is open: then, as before the first game, only the sea behind it. */
let editing = false;
function makeCharacter(): void {
  if (editor) return;
  editing = true;
  // The last survivor's looks to start from; before any, the default.
  editor = characterEditor(game.who, { done: (who) => {
    // Nothing more to press while it fades.
    editor!.inert = true;
    clearVeil();
    setPaused(false);
    forget();
    started = true;
    sleeping = { start: performance.now(), fainted: false, woken: false, wakes: false, intro: who };
  } });
  menuBox.hidden = true;
  // Under the menu button and the veil, so it fades to black with everything else.
  buttons.before(editor);
}
function showMenu(): void {
  // Over the editor, it steps aside meanwhile, so the two do not show through each other.
  if (editing) editor!.hidden = true;
  menu.show();
}

app.append(hudBox, buttons, actions, bag, bubble, dialog, veil, menuBox);
showBag();
showQuest();

// F2 jumps to the scene editor and back (in the editors too). Dev server only: the published build has no editors.
if (import.meta.env.DEV) addEventListener('keydown', (e) => e.key === 'F2' && (location.href = '/engine/tools/scene/index.html'));

// ?cheats: an orange button in the corner opens a drawer of buttons to get somewhere quickly while developing.
let fast = 1;
/** A weather the cheat forces, instead of the day's own. */
let weatherCheat: Kind | undefined;
if (opts.cheats) {
  const cheat = (words: string, on: () => void) => ({ words, on });
  // Under the menu, so it does not show over it.
  const stats = statsOverlay(app, S);
  cheatDrawer(app, [
    cheat('STATS', stats),
    ...(import.meta.env.DEV ? [cheat('EDITOR', () => (location.href = '/engine/tools/scene/index.html'))] : []),
    cheat('FULL', () => Object.assign(game, { hunger: 1, energy: 1 })),
    cheat('HUNGRY', () => (game.hunger = LOW - 0.01)),
    cheat('TIRED', () => (game.energy = LOW - 0.01)),
    cheat('+COCO', () => {
      while (game.bag.length < BAG_SLOTS) game.bag.push('coconut');
      showBag();
    }),
    {
      words: 'GIVE',
      more: (['wood', 'stone', 'spear', 'leaf', 'vine', 'axe', 'rope', 'cloth', 'log', 'fire', 'hammer', 'drift', 'lantern', 'key', 'pot', 'flint', 'fishSoup'] as const).map((it) => cheat(it.toUpperCase(), () => {
        if (game.bag.length < BAG_SLOTS) game.bag.push(it);
        showBag();
      })),
    },
    cheat('SUNSET', () => (time = DAY_S - SUNSET_S)),
    cheat('NIGHT', () => (time = DAY_S + DUSK_S)),
    cheat('MORNING', () => sleep(false, true)),
    ...(cave ? [cheat('CAVE', () => (world === cave.world ? leaveCave() : goInto(cave.world, cave.entry)))] : []),
    // The current quest done, as if its goal had happened as often as it needs.
    cheat('QUEST+', () => {
      for (let n = 0; n < (questNow().count ?? 1) && !game.quest.done; n++) reach(questNow().goal);
      think(questThought());
    }),
    // The survivor as bones, and back; looks are kept per mood, so they are dropped.
    cheat('SKELETON', () => {
      game.who = { ...game.who, skeleton: game.who.skeleton ? undefined : true };
      looks.clear();
      dress();
    }),
    cheat('X10', () => (fast = fast === 1 ? 10 : 1)),
    // The ways of lying, to compare: the survivor lies down awake as each one.
    {
      words: 'LIE',
      more: ([['FRONT UP', {}], ['FRONT DOWN', { down: true }], ['BACK UP', { back: true }], ['BACK DOWN', { back: true, down: true }]] as const)
        .map(([words, how]) => cheat(words, () => actor.lieDown(performance.now(), false, how))),
    },
    {
      words: 'WEATHER',
      more: KINDS.map((k) => cheat(k.toUpperCase(), () => {
        weatherCheat = k;
        think(`think.${k === 'sunny' ? 'morning' : k}`);
      })),
    },
  ], S, menuBox);
}

// ------------------------------------------------------------------ acting

let paused = true;
function setPaused(on: boolean): void {
  paused = on;
  if (on) showMenu();
  menuBox.hidden = !on;
}
setPaused(true);
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

/** Asleep, the survivor lies face down, seen in three-quarter from the front. */
const SLEEPS = { down: true };
/** How long lying down takes before the night fades in, and lying awake in the morning before getting up, in ms. */
const LIE_MS = 1100;
const WAKE_MS = 1400;
/**
 * The sleep (or faint) under way: when the fade began, and whether it was a faint. `intro`: not a night but the
 * start, with the survivor made in the editor washed up on the beach. `night`: woken in the night by the next quest
 * starting (the storm), which says so.
 */
let sleeping: { start: number; fainted: boolean; woken: boolean; wakes: boolean; intro?: State; night?: boolean } | null = null;

/** Whether the press under way began on the survivor: then moving it walks nowhere. */
let onSelf = false;
function press(p: { x: number; y: number }, start: boolean): void {
  if (paused || sleeping || ended || warp) return;
  if (start) {
    // The survivor themself: they sit down, or get up again if they are already sitting.
    const foot = world.screenOf(actor.i, actor.j);
    // The survivor's body: about 8 pixels either side of the feet and 32 up.
    onSelf = Math.abs(p.x - foot.x) <= 8 && p.y <= foot.y + 2 && p.y >= foot.y - 32;
    if (onSelf) {
      target = null;
      // Sitting or lying, a tap on themselves gets them up again; standing, it sits them down.
      actor.rouse(performance.now());
      return actor.sit(performance.now());
    }
    // Wherever the tap is, the survivor turns to look there first: the screen offset from the feet back onto the map,
    // so only the direction counts.
    const look = mapOffset(p.x - foot.x, p.y - foot.y);
    if (look.i || look.j) actor.lookAt(look.i, look.j);
    // A hole or ladder that leads to another scene: walked up to, and taken; a hole from the top of its ladder.
    const way = world.scene.items.find((o) => o.to && near(p, o, 10, 6));
    if (way) {
      const down = world.holeLadder(way);
      return goTo(down ? ladderSpots(down).top : nearSide(way), false, { way });
    }
    // A door: walked up to, and through; one locked or hidden, or leading to another scene, is seen to there.
    const door = doorAt(p);
    if (door) {
      if (door.state === 'open' || (door.state === 'closed' && !door.to)) return walkTo(world.screenOf(...centreOf(farSide(door))));
      return goTo(nearSideOf(door), false, { door });
    }
    // Off the island (in a cave, or a scene a way led to) nothing of the island's is to pick, only a torch off a wall (its
    // picture stands on the wall, a stick and flame some 4 to 22 pixels over the floor) or a chest.
    if (!onIsland()) {
      const torch = world.scene.decor.find((d) => d.decor === 'torch' && near(p, d, 9, 13));
      if (torch) return goTo(torch, false, { torch });
      // A chest: walked up to, and opened.
      const chest = world.scene.items.find((it) => openFrames(it.item) && near(p, it, 10, 6));
      return chest ? goTo(nearSide(chest), false, { chest }) : walkTo(p);
    }
    // The cave mouth: walked into.
    if (rocky && near(p, rocky.face, 9, 8)) return goTo(rocky.mouth, false);
    // A crab: grabbed or speared if near enough, else walked up to, stopping just near enough.
    const crab = crabAt(world, crabs, p, 7);
    if (crab) {
      const reach = crabReach();
      if (Math.hypot(crab.i - actor.i, crab.j - actor.j) <= reach) return catchCrab(crab);
      return goTo(nearSide(crab, reach * 0.8), false, { crab });
    }
    // A shark's fin, while it shows: nothing to be done about it but keep out of the water.
    if (sharks.some((s) => finShows(s, performance.now()) && near(p, s, 7, 4))) return think('think.sharks');
    // With the spear in hand, a tap on a fish swimming near spears it.
    const fish = hand === 'spear' ? island.fishAt(p, 8) : null;
    if (fish) {
      if (Math.hypot(fish.i - actor.i, fish.j - actor.j) <= SPEAR_REACH) return spear(fish);
      think('think.missed');
    }
    // The burning stump comes first, over coconuts lying under it; it blocks the way like the palm did, so the goal is the near side of it.
    const stump = game.struck === null ? null : palms[game.struck];
    if (stump && near(p, stump, 10, 11)) return goTo(nearSide(stump), false, { stump: true });
    const lo = game.lying.find((l) => near(p, l, ...(PICK_NEAR[l.item] ?? [6, 2])));
    if (lo) return goTo(lo, false, { loose: lo });
    if (game.hat && near(p, game.hat, 6, 2)) return goTo(game.hat, false, { hat: true });
    if (near(p, BLANKET, 15, 0)) return goTo(BLANKET, false, { blanket: true });
    const it = game.items.find((it) => near(p, it, 9, 7));
    // A crate blocks the way, so the goal is the near side of it.
    if (it) return goTo(nearSide(it), false, { item: it });
    // A palm's trunk or crown: walked up to, for its leaves or, with the axe, to cut it down.
    const k = palms.findIndex((q, k) => k !== game.struck && !game.felled.includes(k) && (near(p, q, 6, 8) || near(p, q, 12, 26)));
    if (k >= 0) return goTo(nearSide(palms[k]), false, { palm: k });
  }
  if (target?.pick || onSelf) return;
  walkTo(p);
}
/** Walks to the tile under a ground pixel, running if it is far. */
function walkTo(p: { x: number; y: number }): void {
  const tile = world.tileAt(p.x, p.y);
  if (!tile) return;
  const far = Math.hypot(tile.i + 0.5 - actor.i, tile.j + 0.5 - actor.j) > 4;
  goTo({ i: tile.i + 0.5, j: tile.j + 0.5 }, far && speedOf(game) === 1);
}

/** Where a chest stands, as the save knows it. */
/** Chests opening, and when they began to: the lid swings up a frame at a time. */
const opening = new Map<PlacedItem, number>();
const LID_MS = 150;

/** Opens a chest: its lid swings up, and what is in it goes into the bag as far as there is room; the rest stays for later. */
function openChest(it: PlacedItem): void {
  const key = chestKey(it);
  const { first, took } = takeFromChest(game, key, it.loot, BAG_SLOTS);
  if (first) opening.set(it, performance.now());
  actor.emote('use', performance.now());
  showBag();
  if (game.chests[key].length) return think('think.full');
  think(took.length ? 'think.chestLoot' : 'think.chestEmpty');
}

/** Into another world (the cave, or back out onto the island), standing at a spot of it. */
function goInto(to: World, at: { i: number; j: number }): void {
  // Chests opened before stand open.
  for (const it of to.scene.items) if (chestKey(it) in game.chests && !opening.has(it)) it.open = openFrames(it.item);
  doorsOf(to);
  downHole = false;
  world = to;
  scene = to.scene;
  actor.i = at.i;
  actor.j = at.j;
  target = null;
  centerOn(actor);
}
/** Out of the cave, a step in front of its mouth; from a scene a way led to, back where the survivor left the island. */
function leaveCave(): void {
  if (rocky && (world === cave?.world || !outside)) goInto(island, { i: rocky.mouth.i, j: rocky.mouth.j + 0.8 });
  else goInto(island, outside ?? island.scene.spawn);
}

/** The scenes the survivor can be led to (by file name), made into worlds when first visited; the island is one of them. */
const visited = new Map<string, World>([
  // By the island's own file name (see island.ts), so a way back to it comes back to this world.
  [rocky ? 'rocky-island' : (opts.scene ?? 'island'), island],
  // The rocky island's cave is the same world whether walked into at its mouth or climbed down into.
  ...(cave ? [['smuggler-cave', cave.world] as [string, World]] : []),
]);
/** Where the survivor last left the island by a way. */
let outside: { i: number; j: number } | null = null;
function worldOf(name: string): World | null {
  let w = visited.get(name);
  if (!w) {
    const s = savedScene(name);
    if (!s) return null;
    w = new World(s);
    if (s.cave) setUpCave(w);
    else w.pieceKinds = PIECE_KINDS;
    visited.set(name, w);
  }
  return w;
}
/** A portal being taken: when the fade began, and what happens at its darkest (once). */
let warp: { start: number; go: () => void; gone: boolean } | null = null;
const WARP = { out: 350, in: 350 };
/** Where a way of another scene is met: a hole or ladder object, or a door (in front of it), in that scene's coordinates. */
function wayIn(to: World, id: string): { i: number; j: number } | null {
  const it = to.scene.items.find((o) => o.id === id);
  if (it) return it;
  const door = to.scene.doors?.find((d) => d.id === id);
  return door ? doorSpot(door) : null;
}
/** A climb down a hole before a way out through it, while it lasts: the way is taken once the survivor is down. */
let climbing: (() => void) | null = null;
/** Down a hole and out of sight, until the way through it has been taken. */
let downHole = false;
/**
 * Takes a hole, ladder or door to the way it leads to: fades out, into that scene beside the way there, fades in. Down
 * a hole the survivor climbs a little way down its ladder first.
 */
function takeWay(it: PlacedItem | SceneDoor): void {
  const door = 'edge' in it ? it : null;
  const at = world.toView(door ? doorSpot(door) : (it as PlacedItem));
  if (!it.to || Math.hypot(at.i - actor.i, at.j - actor.j) > (door ? 1.4 : 1.6)) return;
  const to = worldOf(it.to.scene);
  const end = to && wayIn(to, it.to.id);
  if (!to || !end) return think('think.noWay');
  if (warp || climbing) return;
  target = null;
  const go = () => {
    warp = { start: performance.now(), gone: false, go: () => {
      if (world === island) outside = { i: actor.i, j: actor.j };
      const beside = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([a, b]) => ({ i: end.i + a, j: end.j + b })).find((q) => to.canWalk(q, q));
      goInto(to, beside ?? end);
    } };
  };
  const down = door ? null : world.holeLadder(it as PlacedItem);
  if (!down) return go();
  actor.climb(climbDown(down), performance.now());
  climbing = go;
}
/** At a door tapped: through it if it opens, to where it leads if anywhere; a locked one wants a key, a hidden one finding. */
function atDoor(door: SceneDoor): void {
  if (door.state === 'hidden') {
    // shortcut: how hidden doors are found is undecided; for now the hammer breaks through where the wall sounds hollow.
    if (hand !== 'hammer') return think('think.hollow');
    actor.emote('use', performance.now());
    setDoor(door, 'closed');
    return think('think.doorFound');
  }
  if (!openDoor(door)) return think('think.locked');
  if (door.to) return takeWay(door);
  walkTo(world.screenOf(...centreOf(farSide(door))));
}
/** Walked onto the cave mouth, the survivor goes in; onto the daylight at the cave's open side, out. */
function throughCave(): void {
  if (!rocky || !cave || !present || sleeping) return;
  if (world === island && Math.hypot(actor.i - rocky.mouth.i, actor.j - rocky.mouth.j) < 0.4) goInto(cave.world, cave.entry);
  else if (world === cave.world && Math.hypot(actor.i - cave.exit.i, actor.j - cave.exit.j) < 1) leaveCave();
}

/** Where a thing's picture starts on the ground image. */
function topLeft(t: Thing): { x: number; y: number } {
  const f = footOf(world.ground, t.spot);
  return { x: f.x - t.foot.x, y: f.y - t.foot.y };
}
/**
 * Whether the hut's parts hide any of the survivor behind them. Not while they are inside: then the roof is off and
 * the front walls cut already.
 */
function hides(parts: Thing[], me: Thing | null): boolean {
  if (!me || !parts.length || sheltered(game, actor)) return false;
  const m = topLeft(me);
  return parts.some((p) => {
    // Behind: further back than the part's footprint middle (the box the world sorts by).
    if (!p.box || actor.i + actor.j >= (p.box.x0 + p.box.x1 + p.box.y0 + p.box.y1) / 2) return false;
    const o = topLeft(p);
    const x0 = Math.max(m.x, o.x), x1 = Math.min(m.x + me.w, o.x + p.w);
    const y0 = Math.max(m.y, o.y), y1 = Math.min(m.y + me.h, o.y + p.h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (me.picture.get(x - m.x, y - m.y) && p.picture.get(x - o.x, y - o.y)) return true;
    }
    return false;
  });
}

/** `gap` metres (half a metre unless given) short of something that blocks the way, on the survivor's side of it. */
function nearSide(at: { i: number; j: number }, gap = 0.5): { i: number; j: number } {
  const d = Math.hypot(actor.i - at.i, actor.j - at.j) || 1;
  return { i: at.i + ((actor.i - at.i) / d) * gap, j: at.j + ((actor.j - at.j) / d) * gap };
}

/** The door whose picture is under a ground pixel: across its edge, from its floor up to its top. */
function doorAt(p: { x: number; y: number }): SceneDoor | null {
  for (const v of world.viewDoors()) {
    const mid = v.edge.axis === 'H' ? { i: v.edge.i + 0.5, j: v.edge.j } : { i: v.edge.i, j: v.edge.j + 0.5 };
    const s = world.screenOf(mid.i, mid.j);
    // Its edge runs half a tile each way across, sloping half as far down as along.
    const dx = p.x - s.x, dy = p.y - (s.y + (v.edge.axis === 'H' ? dx / 2 : -dx / 2));
    if (Math.abs(dx) <= 8 && dy <= 2 && dy >= -v.height * LEVEL_PX) return v.door;
  }
  return null;
}
/** A door's two cells in the view, the survivor's side first. */
function sidesOf(door: SceneDoor): [[number, number], [number, number]] {
  const v = world.viewDoors().find((x) => x.door === door)!;
  const [a, b] = edgeCells(v.edge);
  const da = Math.hypot(a[0] + 0.5 - actor.i, a[1] + 0.5 - actor.j), db = Math.hypot(b[0] + 0.5 - actor.i, b[1] + 0.5 - actor.j);
  return da <= db ? [a, b] : [b, a];
}
const centreOf = (c: [number, number]): [number, number] => [c[0] + 0.5, c[1] + 0.5];
const farSide = (door: SceneDoor) => sidesOf(door)[1];
/** Where to stand at a door: in the cell on the survivor's side of it, a little short of its middle. */
function nearSideOf(door: SceneDoor): { i: number; j: number } {
  const [near, far] = sidesOf(door);
  return { i: near[0] + 0.5 + (far[0] - near[0]) * 0.2, j: near[1] + 0.5 + (far[1] - near[1]) * 0.2 };
}

/** The scene a world shows, by the name the ways use. */
const nameOf = (w: World) => [...visited].find(([, v]) => v === w)?.[0] ?? 'island';
/** Each door's state as its scene has it, before the game changed any. */
const doorsAsMade = new WeakMap<SceneDoor, SceneDoor['state']>();
/** A door's key in the save (`scene|edge`). */
const doorKeyOf = (w: World, d: SceneDoor) => doorKey(nameOf(w), edgeKey(d.edge));
/** Puts a world's doors in the states the game left them in, the rest as their scene has them. */
function doorsOf(w: World): void {
  for (const d of w.scene.doors ?? []) {
    if (!doorsAsMade.has(d)) doorsAsMade.set(d, d.state);
    d.state = doorState(game, doorKeyOf(w, d), doorsAsMade.get(d)!);
  }
}
// The worlds there are from the start, as the save left them.
for (const w of visited.values()) doorsOf(w);
/** Sets a door of the world the survivor is in, and keeps it so. */
function setDoor(door: SceneDoor, state: SceneDoor['state']): void {
  door.state = state;
  game.doors[doorKeyOf(world, door)] = state;
}
/**
 * A door the survivor comes up to on the way: a closed one swings open, a locked one opens with a key from the bag
 * (which stays in the lock). Says whether it is open now.
 */
function openDoor(door: SceneDoor): boolean {
  const { state, unlocked } = openDoorRule(game, doorKeyOf(world, door), door.state);
  door.state = state;
  if (unlocked) {
    if (hand === 'key' && !game.bag.includes('key')) hold(null);
    showBag();
    think('think.unlocked');
  }
  return state === 'open';
}

/** Whether a ground pixel is within `r` pixels of a map point's picture, centred `up` pixels above its foot. */
function near(p: { x: number; y: number }, at: { i: number; j: number }, r: number, up: number): boolean {
  const s = world.screenOf(at.i, at.j);
  return Math.hypot(p.x - s.x, p.y - (s.y - up)) <= r;
}

const bagFull = () => game.bag.length >= BAG_SLOTS;
/** Into the bag, reached for with the use animation, as for throwing or spearing. */
function pocket(item: BagItem): void {
  game.bag.push(item);
  actor.emote('use', performance.now());
  showBag();
}

/** What a rule may act on: a crate, a palm's index, driftwood on the ground, or nothing (the stump). */
type Subject = PlacedItem | number | Lying | null;

/** The questions a rule's `when` and `unless` ask. */
const IS: Record<Condition, (s: Subject) => boolean> = {
  tall: (s) => isTall(palms[s as number]),
  byHut: (s) => byHut(s as Lying),
  wantsFire: () => wantsFire(game),
};

/** What only the game can do, for the rules' `call` effects (see interactions.ts). */
const DO: Record<Handler, (s: Subject) => void> = {
  smashCrate: (s) => breakCrate(s as PlacedItem, true),
  priseCrate: (s) => breakCrate(s as PlacedItem, false),
  removeItem: (s) => void game.items.splice(game.items.indexOf(s as PlacedItem), 1),
  fell: (s) => fell(s as number),
  // A stick in hand held to the burning stump catches: a torch.
  lightTorch: () => {
    game.bag[game.bag.indexOf('wood')] = 'fire';
    hold('fire');
  },
  // The torch in hand lights driftwood where it lies: a campfire.
  lightFire: (s) => {
    const at = s as Lying;
    game.lying = game.lying.filter((l) => l !== at);
    game.fires.push({ i: at.i, j: at.j });
    game.bag.splice(game.bag.indexOf('fire'), 1);
    hold(null);
  },
};

/** What effects do in the game (effects.ts): the same for an interaction and a quest's start. `subject`: what a rule acts on. */
const doer = (subject: Subject = null): Doer => ({
  think,
  reach,
  give: pocket,
  full: bagFull,
  call: (h) => DO[h](subject),
  weather: (kind) => void (game.weather = kind),
  washUp: (items) => washUp(isle, game, items),
  stones: (n) => layStones(isle, game, n),
  strike: () => void (strikeNow = true),
});

/** The hand on a thing: the first rule in content/interactions.json that fits is done. False if none fits. */
function interact(on: Target, subject: Subject): boolean {
  const rule = ruleFor(on, hand, (c) => IS[c](subject));
  if (rule) run(rule.do, doer(subject));
  return !!rule;
}

// Whatever is picked up, the survivor reaches for it.
function arrive(pick: Pick): void {
  if ('crab' in pick) {
    const c = pick.crab;
    if (crabs.includes(c) && Math.hypot(c.i - actor.i, c.j - actor.j) <= crabReach() + 0.2) return catchCrab(c);
    return think('think.missed');
  }
  // A torch taken down off a cave wall: into the bag, and into the hand if it is empty.
  if ('torch' in pick) {
    if (!world.scene.decor.includes(pick.torch)) return;
    if (bagFull()) return think('think.full');
    world.scene.decor = world.scene.decor.filter((d) => d !== pick.torch);
    game.bag.push('fire');
    actor.emote('use', performance.now());
    if (!hand) hold('fire');
    else showBag();
    return think('think.wallTorch');
  }
  if ('way' in pick) return takeWay(pick.way);
  if ('door' in pick) return atDoor(pick.door);
  if ('chest' in pick) return openChest(pick.chest);
  // Once on the blanket, the sleep button shows, by day too: sleep then lasts till the next morning.
  if ('blanket' in pick) return;
  // The hat goes straight on the head, not into the bag.
  if ('hat' in pick) {
    game.hat = null;
    actor.emote('use', performance.now());
    looks.clear();
    mood = null;
    feel();
    return think('think.hat');
  }
  // What a hand does to a crate, a palm, the burning stump or driftwood is in content/interactions.json.
  if ('item' in pick) return void interact('crate', pick.item);
  if ('palm' in pick) return void interact('palm', pick.palm);
  if ('stump' in pick) return void interact('stump', null);
  if ('loose' in pick && pick.loose.item === 'drift' && interact('drift', pick.loose)) return;
  if (bagFull()) return think('think.full');
  const { item } = pick.loose;
  game.lying = game.lying.filter((l) => l !== pick.loose);
  pocket(item);
  // Only a stick, a stone and what the sea or the crate brought are worth a thought.
  if (item === 'wood') think(game.struck === null ? 'think.wood' : 'think.woodFire');
  else if (item === 'stone') think('think.stone');
  else if (isLoose(item)) think(`think.${item}`);
}

/** A thrust of the spear at a fish near enough: caught, into the bag, if there is room. */
function spear(fish: (typeof island.fish)[number]): void {
  target = null;
  actor.lookAt(fish.i - actor.i, fish.j - actor.j);
  actor.emote('use', performance.now());
  if (bagFull()) return think('think.full');
  island.fish.splice(island.fish.indexOf(fish), 1);
  game.bag.push(FISH_ITEMS[fish.kind % FISH_ITEMS.length]);
  showBag();
  think('think.caught');
  reach('fish');
}

const crabReach = () => (hand === 'spear' ? SPEAR_REACH : GRAB_REACH);

/** A crab near enough: speared, or grabbed by hand, which mostly ends in a pinch and the crab running off. */
function catchCrab(crab: Crab): void {
  target = null;
  actor.lookAt(crab.i - actor.i, crab.j - actor.j);
  actor.emote('use', performance.now());
  if (bagFull()) return think('think.full');
  if (hand !== 'spear' && Math.random() >= GRAB_LUCK) {
    scare(crab, actor);
    return think('think.pinched');
  }
  crabs.splice(crabs.indexOf(crab), 1);
  game.bag.push('crab');
  showBag();
  think('think.caught');
  reach('crab');
}

/** The axe prises the crate open, or a stone or the hammer smashes it to boards: rope from the ship, laid beside it. */
function breakCrate(crate: PlacedItem, smashed: boolean): void {
  actor.emote('use', performance.now());
  game.items.splice(game.items.indexOf(crate), 1);
  const beside = () => spotNear(isle, crate, 0.4, 0.5) ?? { i: crate.i, j: crate.j };
  lay(game, 'rope', beside());
  // Smashed, its boards are driftwood to build with, and splinters fly.
  if (smashed) for (let n = 0; n < 2; n++) lay(game, 'drift', beside());
  const foot = world.screenOf(crate.i, crate.j);
  if (smashed) bursts.push(new Burst({ x: foot.x, y: foot.y - 6 }, foot.y, performance.now(), [PALETTE.wood.base, PALETTE.wood.shade, PALETTE.bark.shade, PALETTE.wood.light]));
}

/** The axe cuts a palm down: two logs where it stood, no more coconuts from it. Hard work. */
function fell(k: number): void {
  actor.emote('use', performance.now());
  game.felled.push(k);
  keepStanding();
  for (const at of spotsNear(isle, palms[k], 2, 0.3, 0.8)) {
    lay(game, 'log', at);
    reach('log');
  }
  game.energy = Math.max(0, game.energy - 0.08);
}

/** The hut or raft, as far as it is built. */
const buildOf = (kind: BuildKind) => game.builds.find((b) => b.kind === kind);
/** The hut or raft that could be built (or built further) right here with what is in the bag; none in the cave. */
const buildable = (kind: BuildKind) => (onIsland() ? buildSpot(isle, game, kind, actor) : null);
function build(kind: BuildKind): void {
  const b = buildable(kind);
  if (!b || paused || sleeping || ended) return;
  const stage = b === 'new' ? 0 : b.stage;
  takeFrom(game.bag, BUILDS[kind].stages[stage]);
  // The raft is set just behind the survivor, so they stand in front of it.
  if (b === 'new') game.builds.push({ kind, ...(kind === 'hut' ? HUT_AT : { i: actor.i - 0.35, j: actor.j - 0.35 }), stage: 1 });
  else b.stage++;
  if (hand && !game.bag.includes(hand)) hand = null;
  target = null;
  actor.emote('use', performance.now());
  game.energy = Math.max(0, game.energy - 0.05);
  hold(hand);
  think(`think.${kind}${stage + 1}`);
  if (kind === 'hut' && hutOf(game)) reach('hut');
}
/** How fast a frightened fish turns away, in radians a second. */
const FISH_TURN = 3;
/** No animal stays by a fire: a crab runs off sideways as it does from the survivor, a fish turns and swims away. */
function fleeFire(dt: number): void {
  const lit = burning(game, palms, hand === 'fire' && present ? actor : null);
  if (!lit.length) return;
  for (const c of crabs) {
    const f = fireNear(c, lit);
    if (f) scare(c, f);
  }
  for (const fish of island.fish) {
    const f = fireNear(fish, lit);
    if (!f) continue;
    // Round to the heading straight away from the fire, the short way about.
    const d = Math.atan2(fish.j - f.j, fish.i - f.i) - fish.a;
    fish.a += Math.max(-FISH_TURN * dt, Math.min(FISH_TURN * dt, Math.atan2(Math.sin(d), Math.cos(d))));
  }
}

const END_FADE = 2500;
function setSail(): void {
  if (!canSail(game, actor, kindNow()) || paused || sleeping || ended) return;
  target = null;
  forget();
  ended = performance.now();
  veil.replaceChildren(label(caps(t('end')), C.moon, S * 2), ...wrap(t('end.more'), 100).map((line) => label(line, C.paper, S)));
  veilDay = -1;
  reach('sail');
  setTimeout(() => setPaused(true), END_FADE + 3500);
}

/** The fire quest's lightning burns down the tall palm nearest the survivor, so they see it. */
function strike(): void {
  if (burnPalm(isle, game, actor)) think('think.struck');
}
function eat(slot: number): void {
  if (paused || sleeping) return;
  const food = FOOD[game.bag[slot]]!;
  game.bag.splice(slot, 1);
  game.hunger = Math.min(1, game.hunger + food.fills);
  showBag();
  think(food.yum);
  reach('eat');
}

/** Whether the storm has woken the survivor tonight; then only a fire lets them sleep again. */
let stormWoken = false;
function sleep(fainted: boolean, anywhere = false): void {
  if (sleeping || ended) return;
  // The night is the island's: a faint in the cave (or a scene a way led to) wakes the survivor back on the island.
  if (world !== island) leaveCave();
  const chosen = !fainted && !anywhere;
  if (chosen && !dry(actor)) return think('think.wet');
  const refused = chosen && sleepRefused(game, actor, weatherAt(kindNow(), kindTomorrow(), time));
  if (refused) return think(refused);
  // In a storm, sleep out of the hut and away from a fire is broken by thunder, and then does not come back.
  const wakes = chosen && stormWakes(game, actor, kindNow());
  if (wakes && stormWoken) return think('think.scared');
  target = null;
  forget();
  // Chosen, sleep is on the blanket (the button only shows there): settled onto its middle.
  if (chosen) Object.assign(actor, BLANKET);
  // The survivor lies down and shuts their eyes; the night fades in once they lie.
  faceToLie();
  actor.lieDown(performance.now(), true, SLEEPS);
  clearVeil();
  // A done quest whose next one starts in the night (the storm) wakes the survivor in it, the new quest begun.
  const night = !!waiting(game.quest)?.night;
  sleeping = { start: performance.now() + LIE_MS, fainted, woken: false, wakes: wakes || night, night };
}

/** The night is over: a new morning, rested, with what the palms dropped and the sea brought, and maybe a new quest. Saved. */
function morning(fainted: boolean): void {
  // A night slept through, not fainted: the sleep quest's goal, and in a storm the storm quest's.
  if (!fainted) {
    if (kindNow() === 'storm') reach('stormSleep');
    reach('sleep');
  }
  Object.assign(game, wake(game, fainted));
  stormWoken = false;
  game.day++;
  time = 0;
  warned.clear();
  // Every night ends on the blanket: one who fainted somewhere crawled back to it in the dark.
  Object.assign(actor, BLANKET);
  game.at = { i: actor.i, j: actor.j };
  // A palm only drops a new coconut once the last one has been eaten.
  morningGifts(isle, game);
  island.fish.push(...spawnFish(island.floor, FISH_COUNT - island.fish.length, fishRandom));
  crabs = [];
  crabsOut = 0;
  // A done quest gives way to the next, which brings what it needs; else the morning's own thought.
  const after = next(game.quest, true);
  const thought = after !== game.quest ? startQuest(after) : morningThought();
  topUpStones(isle, game);
  showQuest();
  store();
  tellAfterFade(thought);
}

/** A morning with no new quest: what the weather is like, or on a fine day what the quest still wants. */
function morningThought(): string {
  const kind = kindNow();
  return kind === 'sunny' ? questThought() : `think.${kind}`;
}

/** The fire quest's lightning, waiting until the survivor is up, its thought read and the hut left behind. */
let strikeNow = false;

/** Saves the game, if this one is saved; says so when the browser refuses. */
function store(): void {
  if (saves() && !saveGame(game, ISLAND_ID)) tellAfterFade('think.notSaved');
}
/** Tells a thought once the fade has come back in. */
const tellAfterFade = (key: string) => setTimeout(() => tell(key), FADE.hold + FADE.in);
/** How dark the fade is now, and runs the morning at its darkest. */
function fadeAt(ms: number): number {
  if (warp) {
    const e = ms - warp.start;
    if (e >= WARP.out && !warp.gone) { warp.gone = true; warp.go(); }
    if (e < WARP.out + WARP.in) return e < WARP.out ? e / WARP.out : 1 - (e - WARP.out) / WARP.in;
    warp = null;
  }
  if (!sleeping) return 0;
  const e = ms - sleeping.start;
  if (e < FADE.out) return Math.max(0, e) / FADE.out;
  if (!sleeping.woken) {
    sleeping.woken = true;
    if (sleeping.intro) {
      editor?.remove();
      editor = null;
      editing = false;
      startNew(sleeping.intro);
      faceToLie();
      actor.lieDown(ms, true, SLEEPS);
    }
    // The next quest wakes the survivor, deep in the night.
    else if (sleeping.night) {
      const thought = startQuest(next(game.quest, true));
      time = Math.max(time, DAY_S + DUSK_S + 60);
      // Half a night's sleep.
      game.energy = Math.max(game.energy, 0.6);
      tellAfterFade(thought);
    }
    // Thunder: awake again in the same night.
    else if (sleeping.wakes) {
      stormWoken = true;
      tellAfterFade('think.thunder');
    } else morning(sleeping.fainted);
  }
  if (e < FADE.out + FADE.hold) return 1;
  if (e < FADE.out + FADE.hold + FADE.in) return 1 - (e - FADE.out - FADE.hold) / FADE.in;
  const intro = !!sleeping.intro;
  sleeping = null;
  // Morning: lying there, the survivor opens their eyes, and a moment later gets up.
  actor.asleep = false;
  // At the start they wonder first, and get up at the tap that puts the thought away.
  if (intro) setTimeout(() => (tell('think.howHere'), tell(questThought())), WAKE_MS);
  else setTimeout(() => actor.rouse(performance.now()), WAKE_MS);
  return 0;
}

/**
 * The cave's lights, tile by tile (see `World.lightField`): its own (the daylight at its open side, its crystals,
 * mushrooms and torches), and the torch or lantern in hand, which flickers a little. Reaches are in tiles.
 */
function caveLamps(me: Thing | null, ms: number): TileLamp[] {
  if (!inDark()) return [];
  // The halo of what is in hand (its particle system's), in tiles.
  const held = me?.fx ? tileHalo(particleSystem(me.fx.system), actor, ms) : null;
  return [...caveOwnLamps(world, ms), ...(held ? [held] : [])];
}

/** Hints said once a game (and again after a reload): how to tie things together and how to drop them. */
const taught = new Set<Key>();
function teach(key: Key, when: () => boolean): void {
  if (!thinking() && !telling() && !taught.has(key) && when()) {
    taught.add(key);
    think(key);
  }
}
/** Whether two things in the bag tie into something. */
const canTie = () => game.bag.some((a, n) => game.bag.some((b, m) => m > n && recipeFor(a, b, game.bag)));

/** Thoughts said once a day. */
const warned = new Set<Key>();
function warnOnce(key: Key, when: boolean): void {
  if (when && !warned.has(key)) {
    warned.add(key);
    think(key);
  }
}

// ------------------------------------------------------------------ the loop

function centerOn(at: { i: number; j: number }): void {
  const p = world.screenOf(at.i, at.j);
  view.cam.x = p.x;
  view.cam.y = p.y - 16;
}
centerOn(actor);

/**
 * Panning is free, but never so far that the survivor leaves the middle of the view: like a follow camera's dead
 * zone, the view is pushed along when they near its edge, walking or panned. Before there is a survivor, open sea.
 */
function keepInView(): void {
  if (!present || editing) {
    const p = world.screenOf(scene.spawn.i, scene.spawn.j);
    view.cam.x = p.x;
    view.cam.y = p.y - SEA_AWAY;
    return;
  }
  const p = world.screenOf(actor.i, actor.j);
  // Within the middle half of the view, clear of the bars and the bag at its edges; the body is centred 16 above the feet.
  const mx = view.w / 4;
  const my = view.h / 4;
  view.cam.x = Math.min(p.x + mx, Math.max(p.x - mx, view.cam.x));
  view.cam.y = Math.min(p.y - 16 + my, Math.max(p.y - 16 - my, view.cam.y));
}
/** How far up from the island the start screen looks, in ground pixels: far enough that none of it shows. */
const SEA_AWAY = 400;

/** The lightning strike being drawn, for the few seconds its bolt and burst last. */
let strikeFx: Strike | null = null;
/** Splinters flying from the crate smashed. */
let bursts: Burst[] = [];
const particles = new Particles();
let last = performance.now();
/** Whether a frame has failed; the first failure is reported, later ones only logged. */
let failed = false;
/**
 * Runs a frame and asks for the next one whatever happens in it, so one bad frame does not stop the game for good.
 * The first error goes to `reportError` (the console, and the page's error box in index.html).
 */
function frame(ms: number): void {
  try {
    step(ms);
  } catch (e) {
    if (failed) console.error(e);
    else reportError(e);
    failed = true;
  }
  requestAnimationFrame(frame);
}
/** One frame: the clock, walking, the creatures, the sky, drawing the world, and the page around it, in that order. */
function step(ms: number): void {
  const begun = performance.now();
  const dt = Math.min(0.1, (ms - last) / 1000);
  last = ms;
  view.update(dt);
  keepInView();
  // Before the first survivor and while making one, only the menu or editor over the sea, and the menu button.
  for (const b of [hudBox, actions, bag]) setHidden(b, !present || editing);
  // Sleep fades out and back in; setting sail fades out for good.
  const fade = ended ? Math.min(1, (ms - ended) / END_FADE) : fadeAt(ms);

  live(dt, ms);
  walk(dt, ms);
  stir(dt, ms);
  const sky = skyNow(ms);
  const { things, me } = sceneThings(ms, sky.striking);
  draw(ms, dt, begun, things, me, fade, sky);
  showPage(ms, fade, sky.weather);
}

/** The clock and the survivor's needs run while they are up and about (fainting when one runs out); their face shows how they feel. */
function live(dt: number, ms: number): void {
  if (!paused && !sleeping && !ended && !telling()) {
    time += dt * opts.speed * fast;
    Object.assign(game, drain(game, dt * opts.speed * fast));
    warnOnce('think.hungry', game.hunger < LOW);
    warnOnce('think.tired', game.energy < LOW);
    warnOnce('think.shark', !dry(actor) && !!sharkNear(sharks, actor, SHARK_SEEN));
    teach('think.canTie', canTie);
    teach('think.canDrop', bagFull);
    if (faints(game)) {
      think('think.faint');
      sleep(true);
    }
  }
  feel();
  // The torch's flame flickers with the stump's.
  if (hand === 'fire' && held !== torchAt(ms)) dress();
}

/** The survivor walks the way planned: ladders climbed, doors opened on the way, what was tapped picked up at the end. */
function walk(dt: number, ms: number): void {
  let di = 0;
  let dj = 0;
  let run = false;
  /** A door opened on the way, which the survivor waits at rather than giving the way up. */
  let doorOpen = false;
  if (target && !paused && !sleeping && !telling() && !actor.onLadder) {
    // On at each turn of the way once there (the walk stops on it), so the next stretch starts where it was planned from.
    if (target.way.length > 1 && Math.hypot(target.way[0].i - actor.i, target.way[0].j - actor.j) < 0.02) {
      // At the foot or top of a ladder on the way: up or down it, then on.
      const at = target.way.shift()!;
      if (at.climb) actor.climb(at.climb, ms);
    }
    const next = target.way[0];
    const goal = target.way[target.way.length - 1];
    di = next.i - actor.i;
    dj = next.j - actor.j;
    run = target.run;
    // A door on the way opens as the survivor comes up to it; one that will not is as far as they get.
    const door = actor.onLadder ? null : world.doorAhead(actor, next);
    if (door) {
      doorOpen = openDoor(door);
      if (!doorOpen) {
        think(door.state === 'locked' ? 'think.locked' : 'think.noWay');
        target = null;
        di = dj = 0;
      }
    }
    // A crab is walked right up to the spot just near enough, not within the usual reach of it.
    if (!target || actor.onLadder) {
      // Stopped at a door, or climbing.
    } else if (target.pick && !target.way.some((q) => q.climb) && Math.hypot(goal.i - actor.i, goal.j - actor.j) < ('crab' in target.pick || 'blanket' in target.pick ? 0.12 : REACH)) {
      arrive(target.pick);
      target = null;
      di = dj = 0;
    } else if (target.way.length === 1 && Math.hypot(di, dj) < 0.08) {
      target = null;
      di = dj = 0;
    }
  }
  const before = [actor.i, actor.j], climbed = actor.onLadder;
  // shortcut: slowness scales the step, so the walk cycle plays at full rate; add a speed to Actor if it reads as sliding.
  actor.update(world, paused || telling() ? 0 : dt * speedOf(game), di, dj, run, ms);
  // A way that stalls (something moved into it) is planned again from here, a few times; one that still cannot be
  // walked is given up rather than walked against forever (not while climbing, which ends straight up or down).
  if (target && before[0] === actor.i && before[1] === actor.j && !paused && !actor.rising && !climbed && !actor.onLadder && !doorOpen && (di || dj)) {
    const again = (target.replans ?? 0) < REPLANS ? findPath(world, actor, target.way[target.way.length - 1], passable) : [];
    target = again.length ? { ...target, way: again, replans: (target.replans ?? 0) + 1 } : null;
  }
  // Down a hole, the way out through it is taken.
  if (climbing && !actor.onLadder) {
    const go = climbing;
    climbing = null;
    downHole = true;
    go();
  }
  throughCave();
}

/** The island's life: animals fleeing fires, fish and sharks swimming, thrown things landing, crabs coming out on a windy day. */
function stir(dt: number, ms: number): void {
  if (!paused && !sleeping && !telling() && onIsland()) fleeFire(dt);
  swim(island.fish, island.floor, dt, fishRandom);
  cruise(sharks, island.floor, paused || sleeping ? 0 : dt, fishRandom);
  land(ms);
  // On a windy day the crabs walk up out of the sea from the morning on, one every so often; only the wind drives them up the beach.
  if (!paused && !sleeping && !telling() && kindNow() === 'windy' && crabsOut < CRAB_NIGHT && fishRandom() < dt / 8) {
    const c = spawnCrab(island, fishRandom);
    if (c) crabs.push(c);
    crabsOut++;
  }
  scuttle(crabs, island, paused ? 0 : dt, fishRandom, sleeping || !onIsland() ? null : actor);
}

/** The weather now and how dark the night is, set on the worlds; and the fire quest's lightning, when it is due. */
function skyNow(ms: number): { weather: Weather; night: number; flashNow: number; striking: boolean } {
  // Before the survivor is on the island (the menu, the editor, the fade in), a sunny sea, not the last game's weather.
  const weather = !present || editing || sleeping?.intro ? weatherAt('sunny', 'sunny', 0) : weatherAt(kindNow(), kindTomorrow(), time);
  const night = nightfall(time);
  island.setWeather(asSeen(weather, night));
  // No weather in the cave; another scene a way led to has the island's.
  if (inCave()) world.setWeather(CLEAR);
  else if (world !== island) world.setWeather(asSeen(weather, night));
  const flashNow = flashAt(ms, weather);
  // The fire quest's lightning, once the survivor is up and the morning's thought read: a bolt into the palm, its crown bursting.
  if (game.struck !== null) strikeNow = false;
  // The bolt comes as the survivor steps out of the hut, so they see it strike.
  const striking = strikeNow && present && !paused && !sleeping && !telling() && !sheltered(game, actor) && onIsland();
  if (striking) {
    strikeNow = false;
    strike();
  }
  return { weather, night, flashNow, striking };
}

/** Everything drawn in the scene the survivor is in, the survivor among it (`me`, null before there is one). */
function sceneThings(ms: number, striking: boolean): { things: Thing[]; me: Thing | null } {
  /** The plants' and props' wind frame, six a second. */
  const windFrame = Math.floor((ms / 1000) * 6) % FRAMES;
  const plants = world.plantThings(windFrame);
  // The scene draws only the standing palms, so the struck one's place among them.
  const struckAt = game.struck === null || !onIsland() ? -1 : islandScene.plants.indexOf(palms[game.struck]);
  if (striking && struckAt >= 0) {
    const palm = plants[struckAt];
    const foot = world.screenOf(palm.spot.i, palm.spot.j);
    const b = breakOf(palm);
    strikeFx = new Strike({ x: foot.x + b.dx, y: foot.y + b.dy }, foot.y, ms);
  }
  if (struckAt >= 0) plants.splice(struckAt, 1, ...stumpThings(plants[struckAt], ms));
  const campfires = onIsland() ? game.fires.map((f) => campfireThing(groundSpot(f), ms)) : [];
  const hutBuild = buildOf('hut');
  // A cave tried on its own as the island keeps its rock walls.
  if (!islandScene.cave) island.buildings = hutBuild ? [hutBuilding(hutBuild.stage)] : [];
  // The survivor shows as a silhouette where ground in front hides them.
  const me = present && !downHole ? { ...actor.thing(world, ms), silhouette: true } : null;
  let hutParts = onIsland() ? island.buildingThings(actor) : [];
  // Behind the hut, its walls come down to knee height and the roof off, so the survivor is seen.
  if (hutBuild && onIsland() && hides(hutParts, me)) {
    island.buildings = [hutBuilding(hutBuild.stage, true)];
    hutParts = island.buildingThings(actor);
  }
  for (const [it, t0] of opening) {
    it.open = Math.min(openFrames(it.item), 1 + Math.floor((ms - t0) / LID_MS));
    if (it.open >= openFrames(it.item)) opening.delete(it);
  }
  // The island's own things lie on the island: none of them show in the cave or in another scene a way led to.
  const scenery = [...plants, ...world.itemThings(), ...world.propThings(windFrame)];
  const things: Thing[] = inCave() ? [...scenery, ...caveThings(world, actor, ms), ...world.decorThings(ms), ...scene.people.map((p) => propThing(p, ms))]
    : !onIsland() ? [...scenery, ...world.decorThings(ms), ...scene.people.map((p) => propThing(p, ms))] : [
    ...(rocky ? [still(rocky.face, mouthThing)] : []),
    ...scenery,
    still(BLANKET, blanketThing), ...game.lying.map((l) => still(l, LYING[l.item])), ...(game.hat ? [still(game.hat, hatThing(game.who))] : []),
    ...thrown.map((t) => thrownThing(t, ms)), ...game.builds.filter((b) => b.kind === 'raft').map((b) => raftThing(b.stage, groundSpot(b))),
    ...campfires, ...crabs.map((c) => crabThing(world, c, ms)), ...sharks.map((s) => finThing(s, ms, island.water)),
  ];
  // The scene's own walls, those in front of the survivor dissolving as they walk.
  things.push(...world.wallThings(actor, ms));
  things.push(...hutParts, ...(me ? [me, ...actor.dropThings()] : []));
  return { things, me };
}

/** Composes the scene, lights it (the cave's lamps, or daylight, weather and lightning) and shows it, with sparks and bursts. */
function draw(ms: number, dt: number, begun: number, things: Thing[], me: Thing | null, fade: number, sky: ReturnType<typeof skyNow>): void {
  const { weather, night, flashNow, striking } = sky;
  const rect = view.rect();
  let t0 = part('things', begun);
  const image = world.compose(rect, things, undefined, false, ms);
  t0 = performance.now();
  // The particle systems of what is drawn (fires, wall torches, what is in hand): their sparks, and their halos in the dark.
  const emitters = emittersOf(things, world.ground);
  particles.emit(emitters, ms, paused ? 0 : dt);
  if (inDark()) lightByTile(image, caveTint(scene), fade, world.spots!, world.lightField(caveLamps(me, ms)));
  else {
    light(image, weatherLight(weather, night));
    // A flash lights the world as bright as day for a moment, at night too, then shows it stark.
    const flash = (striking ? 1 : flashNow) * (1 - fade);
    const tint = tintAt(time);
    light(image, { ...tint, amount: tint.amount * (1 - flash) }, fade, halos(emitters, rect, ms));
    lightning(image, flash);
  }
  t0 = part('light', t0);
  particles.draw(image, rect, ms);
  strikeFx?.draw(image, rect, ms);
  if (strikeFx?.done(ms)) strikeFx = null;
  for (const b of bursts) b.draw(image, rect, ms);
  bursts = bursts.filter((b) => !b.done(ms));
  view.show(image);
  part('show', t0);
  part('whole frame', begun);
  frameDone();
}

/** The page around the picture: the day and bars, the buttons for what can be done here, the night's veil, the thought bubble. */
function showPage(ms: number, fade: number, weather: Weather): void {
  const { phase } = phaseAt(time);
  status.draw(t('day', { n: game.day }), phase === 'day' ? 'sun' : phase === 'night' ? 'moon' : 'dusk', game.hunger, game.energy, LOW);
  const away = !!ended || !onIsland();
  setHidden(sleepButton, away || !onBlanket(actor));
  // Looks disabled while sleep is refused, but still takes a press, which says why not.
  setAttr(sleepButton, 'aria-disabled', String(!!sleepRefused(game, actor, weather)));
  for (const k of BUILD_KINDS) setHidden(buildButtons[k], away || !buildable(k));
  setHidden(sailButton, away || !canSail(game, actor, kindNow()));
  setStyle(veil, 'opacity', String(fade));
  // A new day's title; thunder waking the survivor in the same night gets none.
  if (fade >= 1 && veilDay !== game.day && !ended && !warp && !sleeping?.wakes) {
    veilDay = game.day;
    veil.replaceChildren(label(caps(t('day', { n: game.day })), C.moon, S * 2));
  }
  // The passing thought over the survivor's head.
  const foot = world.screenOf(actor.i, actor.j);
  const head = view.toScreen(foot.x, foot.y);
  follow(ms, head.x, head.y - 46 * view.zoom);
}
requestAnimationFrame(frame);

// `?cave`: a default survivor, straight into the cave with the lantern in hand, playing at once.
if (opts.cave && cave) {
  startNew(firstWho());
  hold('lantern');
  goInto(cave.world, cave.entry);
  started = true;
  setPaused(false);
}
