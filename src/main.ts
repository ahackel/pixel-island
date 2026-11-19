// Pixel Island: days on the island, quest by quest. Tap to walk, pick up coconuts and eat them,
// watch the sun set, get tired, sleep, wake to what the sea brought: sticks and driftwood. Tie a stone
// to a stick for a spear, and spear the fish that swim near. On windy days crabs come out on the
// beach: speared, or grabbed by hand if lucky. A crate smashed gives rope and driftwood; a hut of
// driftwood keeps the rain and the storm off. Once lightning has burnt a palm, hold a stick to its fire
// for a torch, and with the torch light driftwood: a campfire. A vine makes an axe, which fells palms;
// logs, rope and the cloth make a raft, and setting sail ends the game.
import './style.css';
import { defaultState, lookOf, type State } from '@pixel/engine/character/character.ts';
import { characterEditor } from './character.ts';
import type { Mood } from '@pixel/engine/character/base.ts';
import type { Look } from '@pixel/engine/core/puppet.ts';
import { FRAMES } from '@pixel/engine/flora/flora.ts';
import { Actor } from '@pixel/engine/world/actor.ts';
import { along, GLOWING, light, mixTint, TINTS, type Lamp, type Tint } from '@pixel/engine/world/daylight.ts';
import { flashAt, lightning, overcast, type Weather } from '@pixel/engine/world/weather.ts';
import { kindFor, KINDS, weatherAt, type Forced } from './weather.ts';
import { footOf, type Picture } from '@pixel/engine/world/island.ts';
import { heightAt, levelAt, SEA_LEVEL, standingHeight, surfaceAt } from '@pixel/engine/world/terrain.ts';
import { World, type Thing } from '@pixel/engine/world/world.ts';
import type { PlacedItem } from '@pixel/engine/world/props.ts';
import { Viewport } from '@pixel/shared/viewport.ts';
import { findPath } from '@pixel/engine/world/path.ts';
import { spawnFish, swim } from '@pixel/engine/world/fish.ts';
import { crabAt, crabThing, scare, scuttle, spawnCrab, type Crab } from '@pixel/engine/world/crab.ts';
import { cruise, finThing, sharkNear, spawnSharks } from './shark.ts';
import { rng } from '@pixel/shared/random.ts';
import { COCONUT, DAY_S, FISH, drain, DUSK_S, faints, LOW, phaseAt, speedOf, SUNRISE_S, SUNSET_S, wake } from './clock.ts';
import { C, caps, hud, ICONS, PAINT, pixelButton, S, slot } from './ui.ts';
import { label, panel, pixelCanvas, rounded, speechBubble } from '@pixel/shared/pixel-ui.ts';
import { LINE_H, LINE_STEP, text, wrap } from '@pixel/shared/pixel-font.ts';
import { PALETTE, SHADOW } from '@pixel/engine/core/palette.ts';
import { firstIsland } from './island.ts';
import { BAG_ITEMS, BAG_SLOTS, clearGame, loadGame, saveGame, type BagItem, type Game } from './save.ts';
import { t, type Key } from './i18n.ts';
import { advance, next, QUESTS, stonesOut, type Goal, type Progress, type QuestIcon } from './quests.ts';
import { currentLang, LANGS, setLang } from '@pixel/shared/lang.ts';
import { cheatDrawer } from '@pixel/shared/cheats.ts';
import { CRAB_IN_BAG, FISH_IN_BAG, FISH_ITEMS, SPEAR_IN_BAG, STONE, stoneThing } from './fishing.ts';
import { BUILD_KINDS, BUILDS, finished, HUT_AT, lacking, LOOSE, recipeFor, takeFrom, type Build, type BuildKind, type Loose } from './crafts.ts';
import { AXE, AXE_IN_BAG, blanketThing, heldOf, CLOTH, CRATE_IN_BAG, DRIFT, driftThing, HAMMER, HAMMER_HELD, hatThing, hutBuilding, LEAF, LOG, PIECE_KINDS, RAFT_ICON, thing, raftThing, ROPE, VINE } from './things.ts';
import { breakOf, Burst, campfireThing, Sparks, STICK, Strike, stumpThings, torchAt, TORCH_COLORS, TORCH_ROWS, WOOD_COLORS, WOOD_ROWS, woodThing } from './fire.ts';

const params = new URLSearchParams(location.search);
/** Debug: `?speed=20` runs the game clock 20 times faster. */
const SPEED = Math.max(0.1, Number(params.get('speed')) || 1);
/** Debug: `?quest=5` plays a new game from the fifth quest, with what the ones before brought, and never saves, so the real save is kept. */
let TRYOUT = params.has('quest');
let START_QUEST = Math.min(QUESTS.length, Math.max(1, Math.floor(Number(params.get('quest'))) || 1)) - 1;
/** A new game from the menu is a real one: the first quest, saved, and the tryout's `?quest` gone from the address. */
function endTryout(): void {
  if (!TRYOUT) return;
  TRYOUT = false;
  START_QUEST = 0;
  params.delete('quest');
  // Flags like `cheats` keep their bare form, not `cheats=`.
  const rest = `${params}`.replace(/=(?=&|$)/g, '');
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''));
}
/** How near the survivor must come to pick something up, in metres. */
const REACH = 0.7;
const FADE = { out: 1200, hold: 1000, in: 1200 };
/** How many sticks, and pieces of driftwood, the sea leaves lying on the beach at most. */
const WOOD_LYING = 4;
const DRIFT_LYING = 3;
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

const scene = firstIsland();
const world = new World(scene);
world.pieceKinds = PIECE_KINDS;
const fishRandom = rng(Date.now());
world.fish = spawnFish(world.floor, FISH_COUNT, fishRandom);
/** The sharks out in the deep water: never caught, never gone, the reason there is no swimming away. */
const sharks = spawnSharks(world.floor, SHARK_COUNT, fishRandom);
/** Every palm, by the index the save uses; the scene keeps only the ones still standing. */
const palms = [...scene.plants];
/** The tall palms can be felled and draw lightning; the sapling is too small. */
const tall = (k: number) => palms[k].plant !== 'plant-palms-2';
/** Shows (and lets block the way) only the palms not cut down. */
const keepStanding = () => (scene.plants = palms.filter((_, k) => !game.felled.includes(k)));
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

/**
 * A spot `d` metres to the side on screen from `p`: lying, the body lies across the screen, and +i -j is screen
 * right. `side` -1 is left, 1 right.
 */
const sideways = (p: { i: number; j: number }, side: number, d: number) => ({ i: p.i + (side * d) / Math.SQRT2, j: p.j - (side * d) / Math.SQRT2 });
/** Half of head to feet, in metres: the lying sprite is some 26 pixels long, and a tile's 32 pixels across are 1.4 metres. */
const HALF_BODY = 0.6;
/** The side of the screen the head goes, lying here: on dry ground, the feet (if one side must be) toward the water. */
function headSide(p: { i: number; j: number }): -1 | 1 {
  // Near the body first, then a metre further out: with both ends dry, the head goes inland, the feet toward the sea.
  const score = (side: number) =>
    [HALF_BODY, 1.2].reduce((n, d, k) => n + (k ? 1 : 3) * ((dry(sideways(p, side, d)) ? 2 : 0) + (dry(sideways(p, -side, d)) ? 0 : 1)), 0);
  return score(1) > score(-1) ? 1 : -1;
}
/** Turns the survivor so that, lying down, the head is on the dry side (see `headSide`). */
function faceToLie(): void {
  // Facing 0 lies with the head to the left, 1 to the right (the engine mirrors facings 1, 2, 5 and 6).
  const right = headSide(actor) === 1;
  actor.facing = right ? 1 : 0;
  actor.lookAt(right ? 0 : 1, right ? 1 : 0);
}

function newGame(who = firstWho()): Game {
  // The survivor wakes washed ashore: on the beach nearest the island's middle with the sea beside it on screen, so
  // they lie along the water's edge, the feet toward the sea, all of them on the sand.
  const seaSide = (b: { i: number; j: number }) => [-1, 1].find((side) => !dry(sideways(b, side, 0.9)) && dry(sideways(b, -side, 0.9)));
  const far = (b: { i: number; j: number }) => Math.hypot(b.i - scene.spawn.i, b.j - scene.spawn.j);
  const shore = beach.filter((b) => seaSide(b) !== undefined).sort((a, b) => far(a) - far(b))[0] ?? scene.spawn;
  const side = seaSide(shore);
  let at = { ...shore };
  // Up the sand from the sea until head and feet are both on dry ground, with a little to spare.
  const ends = HALF_BODY + 0.4;
  if (side) for (let d = 0.05; d < 1.5 && !(dry(sideways(at, side, ends)) && dry(sideways(at, -side, ends))); d += 0.05) at = sideways(shore, -side, d);
  if (!dry(at)) at = { ...shore };
  // The hat came off in the sea and lies on the sand beyond their head.
  const hatAt = side ? sideways(at, -side, 2 * HALF_BODY) : spotNear(at, 0.6, 0.3);
  const hat = who.worn.hat && hatAt && dry(hatAt) ? hatAt : null;
  const quest: Progress = { quest: START_QUEST, count: 0, done: false };
  const g: Game = {
    day: 1, hunger: 0.5, energy: 1, bag: [], coconuts: [], wood: [], stones: [], items: [], struck: null, fires: [], lying: [], felled: [],
    builds: [], at, hat, who, quest, weather: kindFor(START_QUEST, 1),
  };
  // The island starts with two coconuts lying about.
  for (let n = 0; n < 2; n++) dropCoconuts(g);
  washWood(g);
  washWood(g);
  // What the quests so far brought (in a tryout, all those before the one it starts at); a strike before then has burnt its palm.
  for (let k = 0; k <= START_QUEST; k++) {
    bring(g, k);
    if (QUESTS[k].strike && k < START_QUEST) burnPalm(g, at);
  }
  return g;
}

/** What a quest brings as it starts: its wash-ups and stones (its lightning waits for the morning's thought to be read). */
function bring(g: Game, k: number): boolean {
  const q = QUESTS[k];
  for (let n = 0; n < (q.stones ?? 0); n++) layStone(g);
  return washUp(g, q.washUps ?? []);
}

/** How many stones there should always be on the island, once a quest has brought them. */
const STONES_OUT = 2;
/** The stones to be found: those lying about and those in the bag (the one in a spear or axe is used up). */
const stonesAbout = (g: Game) => g.stones.length + g.bag.filter((it) => it === 'stone').length;
/** A stone on the beach; the sea lays more each morning until there are STONES_OUT again. */
function layStone(g: Game): void {
  if (beach.length) g.stones.push(onBeach());
}

/** A coconut falls from a palm, near its foot, never more than three under one; a burnt palm has none left. */
function dropCoconuts(g: Game): void {
  const bearing = palms.filter((p, k) => k !== g.struck && !g.felled.includes(k) && g.coconuts.filter((c) => Math.hypot(c.i - p.i, c.j - p.j) < 1.8).length < 3);
  if (!bearing.length) return;
  const p = bearing[Math.floor(Math.random() * bearing.length)];
  for (let tries = 0; tries < 20; tries++) {
    const c = spotNear(p, 0.7, 0.6);
    if (c) return void g.coconuts.push(c);
  }
}

/** A random spot `r` to `r + span` metres from a point, if it is dry and clear of the palms' trunks. */
function spotNear(p: { i: number; j: number }, r: number, span: number): { i: number; j: number } | null {
  const a = Math.random() * Math.PI * 2;
  const d = r + Math.random() * span;
  const c = { i: p.i + Math.cos(a) * d, j: p.j + Math.sin(a) * d };
  return dry(c) && !palms.some((q) => Math.hypot(q.i - c.i, q.j - c.j) < 0.6) ? c : null;
}

const dry = (p: { i: number; j: number }) =>
  p.i >= 0 && p.j >= 0 && p.i < scene.w && p.j < scene.h && levelAt(world.map, Math.floor(p.i), Math.floor(p.j)) >= SEA_LEVEL;

const beach: { i: number; j: number }[] = [];
for (let j = 0; j < scene.h; j++) for (let i = 0; i < scene.w; i++) if (surfaceAt(world.map, i, j) === 'beach') beach.push({ i: i + 0.5, j: j + 0.5 });
/** Somewhere on the beach, anywhere in its tile. */
const onBeach = () => {
  // The shore runs through the beach tiles: only a spot whose ground is above the water, so what lies there is seen.
  let at = { i: 0, j: 0 };
  for (let n = 0; n < 50; n++) {
    const b = beach[Math.floor(Math.random() * beach.length)];
    at = { i: b.i - 0.3 + Math.random() * 0.6, j: b.j - 0.3 + Math.random() * 0.6 };
    if (heightAt(world.map, at.i, at.j) > SEA_LEVEL + 0.1) break;
  }
  return at;
};
/** What the sea brings: the items given. Whether anything came. */
function washUp(g: Game, items: string[]): boolean {
  if (!beach.length) return false;
  // A crate stands on the beach; the small things lie there to be picked up.
  for (const item of items) {
    if (isLoose(item)) g.lying.push({ item, ...onBeach() });
    else g.items.push({ item, ...onBeach() });
  }
  return items.length > 0;
}
const isLoose = (item: string): item is Loose => (LOOSE as readonly string[]).includes(item);
/** Each morning the sea leaves a stick or two and a piece of driftwood, dry by the time they are found. */
function washWood(g: Game): void {
  for (let n = 0; n < 2 && g.wood.length < WOOD_LYING && beach.length; n++) g.wood.push(onBeach());
  if (beach.length && g.lying.filter((l) => l.item === 'drift').length < DRIFT_LYING) g.lying.push({ item: 'drift', ...onBeach() });
}

const saved = params.has('new') || TRYOUT ? null : loadGame(scene.w, palms.length);
let game = saved ?? newGame();
/** Game seconds since the morning. Every load starts in the morning, since the game is saved on waking. */
let time = 0;
world.loose = game.items;
keepStanding();
const actor = new Actor(lookOf(game.who), game.at);
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

// A husked coconut: egg-shaped, a little lumpy, its point up to the right, a fibre streak along it.
const COCO_ROWS = ['..bbbb..', '.bBBbbbb', 'bBBbfbbd', 'bbbbbbdd', '.dbbbdd.', '..ddd...'];
const COCO_COLORS: Record<string, string> = { b: '#7a4a24', B: '#b07a44', f: '#93603a', d: '#4e2e16' };
const COCO: Picture = { get: (x, y) => COCO_COLORS[COCO_ROWS[y]?.[x]] ?? null };

function coconutThing(c: { i: number; j: number }): Thing {
  return { spot: { i: c.i, j: c.j, level: standingHeight(world.map, c.i, c.j) }, picture: COCO, w: 8, h: 6, foot: { x: 3, y: 5 } };
}

// ------------------------------------------------------------------ page

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => Object.assign(document.createElement(tag), { className: cls });
const app = document.getElementById('app')!;

type Pick = { crab: Crab } | { coconut: { i: number; j: number } } | { wood: { i: number; j: number } } | { stone: { i: number; j: number } } | { item: PlacedItem } | { stump: true }
  | { loose: Game['lying'][number] } | { palm: number } | { hat: true } | { blanket: true };
/** Where the survivor is going: waypoints round what is in the way, the last one the goal. */
let target: { way: { i: number; j: number }[]; run: boolean; pick?: Pick } | null = null;
function goTo(at: { i: number; j: number }, run: boolean, pick?: Pick): void {
  const way = findPath(world, actor, at);
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
const buildButtons = Object.fromEntries(BUILD_KINDS.map((k) => [k, pixelButton(t(`build.${k}`), { words: t(`build.${k}`) }, () => build(k))])) as Record<BuildKind, HTMLButtonElement>;
const sailButton = pixelButton(t('setSail'), { words: t('setSail') }, () => setSail());
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
const BAG_PICTURES = {
  coconut: { rows: COCO_ROWS, colors: COCO_COLORS }, wood: { rows: WOOD_ROWS, colors: WOOD_COLORS }, fire: { rows: TORCH_ROWS, colors: TORCH_COLORS },
  stone: STONE, spear: SPEAR_IN_BAG, fish: FISH_IN_BAG[0], wrasse: FISH_IN_BAG[1], snapper: FISH_IN_BAG[2], crab: CRAB_IN_BAG,
  leaf: LEAF, vine: VINE, axe: AXE_IN_BAG, rope: ROPE, cloth: CLOTH, log: LOG, hammer: HAMMER, crate: CRATE_IN_BAG, drift: DRIFT,
};
/** The quests' pictures in the corner. */
const QUEST_PICTURES: Record<QuestIcon, { rows: readonly string[]; colors: Record<string, string> }> = {
  coconut: BAG_PICTURES.coconut, moon: { rows: ICONS.moon, colors: PAINT }, fish: FISH_IN_BAG[0], crab: CRAB_IN_BAG, crate: CRATE_IN_BAG, hammer: HAMMER,
  storm: { rows: ICONS.storm, colors: PAINT }, fire: BAG_PICTURES.fire, axe: AXE_IN_BAG, raft: RAFT_ICON,
};
/** What is eaten from the bag, and how much it fills. */
const FOOD: Partial<Record<BagItem, { fills: number; label: Key; yum: Key }>> = {
  coconut: { fills: COCONUT, label: 'eat', yum: 'think.yum' },
  fish: { fills: FISH, label: 'eatFish', yum: 'think.yumFish' },
  wrasse: { fills: FISH, label: 'eatFish', yum: 'think.yumFish' },
  snapper: { fills: FISH, label: 'eatFish', yum: 'think.yumFish' },
  crab: { fills: FISH, label: 'eatCrab', yum: 'think.yumCrab' },
};
/** Bag things put down on the ground, in the bag's pictures. */
const LYING = { ...Object.fromEntries(BAG_ITEMS.map((k) => [k, thing(BAG_PICTURES[k])])), drift: driftThing } as Record<BagItem, ReturnType<typeof thing>>;
const bag = el('div', 'bag');
bag.setAttribute('aria-label', t('bag'));
function showBag(): void {
  bag.replaceChildren(...Array.from({ length: BAG_SLOTS }, (_, n) => {
    const item = game.bag[n];
    const b = el('button', 'pbtn');
    b.append(slot(item ? BAG_PICTURES[item] : null));
    // The first of the kind in hand is shown lifted.
    if (item && item === hand && game.bag.indexOf(item) === n) b.classList.add('held');
    if (item) b.addEventListener('pointerdown', (e) => { if (!paused && !sleeping) dragging = { n, x: e.clientX, y: e.clientY, ghost: null }; });
    if (item) {
      const words = t(FOOD[item]?.label ?? (item as Exclude<BagItem, 'coconut' | 'crab' | (typeof FISH_ITEMS)[number]>));
      b.setAttribute('aria-label', words);
      b.title = words;
      b.addEventListener('click', () => {
        if (paused || sleeping) return;
        if (FOOD[item]) return eat(n);
        hold(item === hand ? null : item);
      });
    } else b.disabled = true;
    return b;
  }));
}

/**
 * A bag slot being dragged. Dropped on another slot, the two are tied together if they make
 * something (with whatever else the recipe needs from the bag); dropped over the island, the
 * thing is put down at the survivor's feet. While dragging, the slots it goes with light up.
 */
let dragging: { n: number; x: number; y: number; ghost: HTMLElement | null } | null = null;
const slots = () => [...bag.children] as HTMLElement[];
/** The bag slot under a point, or -1. */
const slotAt = (x: number, y: number) => slots().findIndex((b) => { const r = b.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
/** What dragging slot `n` onto slot `m` makes, if anything. */
const recipeOnto = (n: number, m: number) => (m < 0 || m === n || !game.bag[m] ? null : recipeFor(game.bag[n], game.bag[m], game.bag));
/** Lights the slots the dragged thing goes with, and under the finger the other parts it would use. */
function markSlots(n: number | null, over = -1): void {
  const recipe = n === null ? null : recipeOnto(n, over);
  // The other parts: the first of each further thing the recipe needs, besides the two being tied.
  const parts = new Set<number>();
  if (recipe && n !== null) {
    const left = game.bag.map((it, k) => (k === n || k === over ? null : it));
    for (const need of takeOut(recipe.needs, [game.bag[n], game.bag[over]])) {
      const k = left.indexOf(need);
      if (k >= 0) { parts.add(k); left[k] = null; }
    }
  }
  slots().forEach((b, m) => {
    const fits = n !== null && !!recipeOnto(n, m);
    b.classList.toggle('fits', fits || parts.has(m));
    b.classList.toggle('dim', n !== null && m !== n && !fits && !parts.has(m));
  });
}
/** `needs` without one of each of `used`. */
function takeOut(needs: readonly BagItem[], used: BagItem[]): BagItem[] {
  const out = [...needs];
  for (const u of used) { const k = out.indexOf(u); if (k >= 0) out.splice(k, 1); }
  return out;
}
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  if (!dragging.ghost && Math.hypot(e.clientX - dragging.x, e.clientY - dragging.y) > 12) {
    dragging.ghost = el('div', 'ghost');
    dragging.ghost.append(slot(BAG_PICTURES[game.bag[dragging.n]]));
    app.append(dragging.ghost);
  }
  if (!dragging.ghost) return;
  dragging.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
  markSlots(dragging.n, slotAt(e.clientX, e.clientY));
});
const endDrag = (e: PointerEvent) => {
  const d = dragging;
  dragging = null;
  if (!d?.ghost) return;
  d.ghost.remove();
  markSlots(null);
  if (e.type !== 'pointerup' || paused || sleeping) return;
  const over = slotAt(e.clientX, e.clientY);
  if (over >= 0) {
    if (over === d.n) return;
    const recipe = recipeOnto(d.n, over);
    return recipe ? make(recipe) : game.bag[over] ? think('think.noMatch') : undefined;
  }
  const r = bag.getBoundingClientRect();
  const overBag = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 16 && e.clientY <= r.bottom;
  if (!overBag) putDown(d.n, view.toGround(e.clientX, e.clientY));
};
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

/** How far a thing from the bag is thrown at most, in metres, and how long it flies. */
const THROW = { far: 1, ms: 450 };
/** Things in the air, thrown from the bag: where from and to, and when. */
let thrown: { item: BagItem; from: { i: number; j: number }; to: { i: number; j: number }; start: number }[] = [];

/**
 * Throws a thing from the bag toward a ground-image point, at most THROW.far from the survivor and
 * never over a wall or into the sea (then shorter); it lands there to be picked up again. The torch is kept.
 */
function putDown(n: number, p: { x: number; y: number }): void {
  const item = game.bag[n];
  if (!item || item === 'fire' || paused || sleeping) return;
  // The point on the map under `p`, taken at the survivor's own ground level.
  const s = world.screenOf(actor.i, actor.j);
  const across = (p.x - s.x) / 16, down = (p.y - s.y) / 8;
  let di = (across + down) / 2, dj = (down - across) / 2;
  const d = Math.hypot(di, dj);
  if (d > THROW.far) (di *= THROW.far / d), (dj *= THROW.far / d);
  let to = { i: actor.i, j: actor.j };
  for (let k = 1; k >= 0.25; k -= 0.25) {
    const at = { i: actor.i + di * k, j: actor.j + dj * k };
    if (dry(at) && world.canWalk(actor, at)) { to = at; break; }
  }
  game.bag.splice(n, 1);
  const now = performance.now();
  thrown.push({ item, from: { i: actor.i, j: actor.j }, to, start: now });
  if (di || dj) actor.lookAt(di, dj);
  actor.emote('use', now);
  hold(hand && game.bag.includes(hand) ? hand : null);
}
/** Lands what has flown its time: on the ground with its kind. */
function land(ms: number): void {
  for (const t of thrown.filter((t) => ms - t.start >= THROW.ms)) {
    const at = t.to;
    if (t.item === 'wood') game.wood.push(at);
    else if (t.item === 'coconut') game.coconuts.push(at);
    else if (t.item === 'stone') game.stones.push(at);
    // Put down, the crate stands on the ground again, in the way like before.
    else if (t.item === 'crate') game.items.push({ item: 'crate', ...at });
    else game.lying.push({ item: t.item, ...at });
  }
  thrown = thrown.filter((t) => ms - t.start < THROW.ms);
}
/** A thing in flight: along the line from hand height up in an arc and down onto the ground. */
function thrownThing(t: (typeof thrown)[number], ms: number): Thing {
  const k = Math.min(1, (ms - t.start) / THROW.ms);
  const i = t.from.i + (t.to.i - t.from.i) * k, j = t.from.j + (t.to.j - t.from.j) * k;
  // In levels above the ground: from the hands (2) up over the throw and down to it.
  const up = 2 * (1 - k) + 6 * k * (1 - k);
  return LYING[t.item]({ i, j, level: standingHeight(world.map, i, j) + up });
}

/** Things tied together, one dragged onto another in the bag: a stick and a stone a spear, with a vine an axe. */
function make(recipe: ReturnType<typeof recipeFor> & {}): void {
  takeFrom(game.bag, recipe.needs);
  game.bag.push(recipe.makes);
  hold(recipe.makes);
  think(recipe.thought);
}

const bubble = el('div', 'bubble');
bubble.hidden = true;
/** When the passing thought shown over the survivor's head goes away by itself. */
let bubbleUntil = 0;
let bubbleShown = 0;
/** How long a thought takes to read: a moment, and more for each letter. */
const readMs = (words: string) => Math.min(12_000, Math.max(3000, 1500 + 70 * words.length));
/** A tap only puts a thought away once it has shown this long, so the tap that caused it does not. */
const TAP_AFTER = 700;
/** A passing thought ("Got one!"): a bubble over the survivor's head that goes when read, or at a tap. */
function think(key: string): void {
  const words = t(key);
  bubble.replaceChildren(speechBubble(caps(words), C, S));
  bubble.setAttribute('aria-label', words);
  bubble.hidden = false;
  bubbleShown = performance.now();
  bubbleUntil = bubbleShown + readMs(words);
  actor.talkUntil = bubbleShown + Math.min(readMs(words), 4000);
}
function unthink(): void {
  bubble.hidden = true;
  bubbleUntil = 0;
}
// Any tap puts a passing thought away (and still walks, picks up, ...), once it has been there a moment.
app.addEventListener('pointerdown', () => {
  if (!bubble.hidden && performance.now() - bubbleShown > TAP_AFTER && !paused) unthink();
}, { capture: true });

// Story thoughts (the morning's, the day plan's, waking to thunder): a box at the bottom with the survivor's face. The
// island dims and stands still until a tap; thoughts that come meanwhile wait their turn.
const dialog = el('div', 'dialog');
dialog.hidden = true;
const told: string[] = [];
let toldShown = 0;
/** Whether a story thought is up, which holds the game still. */
const telling = () => !dialog.hidden;
function tell(key: string): void {
  told.push(key);
  if (!telling()) showTold();
}
function showTold(): void {
  const key = told.shift();
  if (!key) return void (dialog.hidden = true);
  unthink();
  dialog.replaceChildren(storyBox(caps(t(key))));
  dialog.setAttribute('aria-label', t(key));
  dialog.hidden = false;
  toldShown = performance.now();
}
dialog.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (performance.now() - toldShown > TAP_AFTER) showTold();
});
/** Puts away the story thought shown and those waiting, and the passing one: the night (or the end) begins. */
function forget(): void {
  told.length = 0;
  dialog.hidden = true;
  unthink();
}
/** The face in the box: the survivor's head in the same three-quarter view always, cut from their picture. */
const FACE = 22;
function drawFace(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const me = actor.portrait();
  const ink = (px: number, py: number) => { const c = me.picture.get(px, py); return c && c !== SHADOW ? c : null; };
  // From the top of the hat or hair down, centred on what is drawn in those rows.
  let top = 0;
  while (top < me.h && ![...Array(me.w).keys()].some((px) => ink(px, top))) top++;
  const xs = [...Array(me.w).keys()].filter((px) => [...Array(FACE).keys()].some((fy) => ink(px, top + fy)));
  const x0 = Math.round((xs[0] + xs[xs.length - 1] + 1) / 2 - FACE / 2);
  for (let fy = 0; fy < FACE; fy++) for (let fx = 0; fx < FACE; fx++) {
    const c = ink(x0 + fx, top + fy - 1);
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.fillRect(x + fx, y + fy, 1, 1);
  }
}
/** The box: the face in a frame on the left, the words beside it; as wide as the screen allows. */
function storyBox(words: string): HTMLCanvasElement {
  const w = Math.min(200, Math.floor((window.innerWidth - 24) / S));
  const textX = 4 + FACE + 2 + 6;
  const lines = wrap(words, w - textX - 5);
  const h = Math.max(FACE + 2 + 8, (lines.length - 1) * LINE_STEP + LINE_H + 8);
  const { canvas, ctx } = pixelCanvas(w, h + 1, S);
  panel(ctx, 0, 0, w, h, C.paper, C.shadow);
  rounded(ctx, 4, 4, FACE + 2, FACE + 2, C.track);
  drawFace(ctx, 5, 5);
  const top = Math.floor((h - ((lines.length - 1) * LINE_STEP + 5)) / 2);
  lines.forEach((line, n) => text(ctx, line, textX, top + n * LINE_STEP, C.ink));
  return canvas;
}

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
const resting = () => game.quest.done && next(game.quest, false) === game.quest;
const questThought = () => (resting() && QUESTS[game.quest.quest + 1] ? 'quest.rest' : questNow().thought);
let questShown = '';
/** The quest's picture beside the bars, or the moon once it is done and the next waits for the morning. */
function showQuest(): void {
  const icon: QuestIcon = resting() && QUESTS[game.quest.quest + 1] ? 'moon' : questNow().icon;
  const words = t(questThought());
  if (questShown === icon + words) return;
  questShown = icon + words;
  questButton.replaceChildren(slot(QUEST_PICTURES[icon]));
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
/** Starts a quest: its weather sets in, what it brings is on the beach, its lightning waits to strike. Its thought, to tell. */
function startQuest(p: Progress): string {
  game.quest = p;
  game.weather = kindFor(p.quest, game.day);
  bring(game, p.quest);
  if (questNow().strike) strikeNow = true;
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
  if (!TRYOUT) clearGame();
  game = newGame(who);
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
  if (!TRYOUT) saveGame(game);
  hold(null);
}

// The menu, which is also the pause: the name, play on or start over, and before the first step the language.
const menuBox = el('div', 'menu');
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
  editor = characterEditor(game.who, (who) => {
    // Nothing more to press while it fades.
    editor!.inert = true;
    clearVeil();
    setPaused(false);
    forget();
    started = true;
    sleeping = { start: performance.now(), fainted: false, woken: false, wakes: false, intro: who };
  });
  menuBox.hidden = true;
  // Under the menu button and the veil, so it fades to black with everything else.
  buttons.before(editor);
}
/** A flag for each language, the one in use bright. */
function flags(): HTMLElement {
  const row = el('div', 'langs');
  row.append(...LANGS.map((l) => {
    const b = pixelButton(l.name, { icon: l.id }, () => {
      if (l.id === currentLang()) return;
      setLang(l.id);
      location.reload();
    });
    if (l.id !== currentLang()) b.classList.add('off');
    return b;
  }));
  return row;
}
/** The game's name, large; its shadow (style.css) falls as far as the buttons', not a large pixel. */
function titleLabel(words: string): HTMLCanvasElement {
  const c = label(words, C.paper, S * 3);
  c.className = 'title';
  return c;
}
function showMenu(): void {
  // Over the editor: back to it, or the settings; the editor is a new game already.
  // The editor steps aside meanwhile, so the two do not show through each other.
  if (editing) editor!.hidden = true;
  if (editing) return void menuBox.replaceChildren(
    titleLabel('PIXEL ISLAND'),
    // Once the survivor is made and the screen is fading to the island, play goes on.
    pixelButton(t('continue'), { words: t('continue') }, () => { menuBox.hidden = true; editor!.hidden = false; if (editor!.inert) setPaused(false); }),
    pixelButton(t('settings'), { words: t('settings') }, showSettings),
  );
  menuBox.replaceChildren(
    titleLabel('PIXEL ISLAND'),
    ...(present && !ended ? [pixelButton(t('continue'), { words: t('continue') }, play)] : []),
    // A new game starts over at the first menu, out at sea; the old one stays saved until a survivor is made.
    present
      ? pixelButton(t('newGame'), { words: t('newGame') }, () => { endTryout(); present = false; showMenu(); })
      : pixelButton(t('createCharacter'), { words: t('createCharacter') }, makeCharacter),
    pixelButton(t('settings'), { words: t('settings') }, showSettings),
  );
}
/** Settings, in place of the menu: the language for now. */
function showSettings(): void {
  menuBox.replaceChildren(
    label(caps(t('settings')), C.paper, S * 2),
    flags(),
    // The page is built in one language, so a change reloads it, back to the last save: the morning.
    ...(started ? [label(caps(t('settings.langLoses')), C.paper, S)] : []),
    pixelButton(t('back'), { words: t('back') }, showMenu),
  );
}

app.append(hudBox, buttons, actions, bag, bubble, dialog, veil, menuBox);
showBag();
showQuest();

// ?cheats: an orange button in the corner opens a drawer of buttons to get somewhere quickly while developing.
let fast = 1;
/** A weather the cheat forces, instead of the day's own. */
let weatherCheat: Forced | undefined;
if (params.has('cheats')) {
  const cheat = (words: string, on: () => void) => ({ words, on });
  // Under the menu, so it does not show over it.
  cheatDrawer(app, [
    cheat('FULL', () => Object.assign(game, { hunger: 1, energy: 1 })),
    cheat('HUNGRY', () => (game.hunger = LOW - 0.01)),
    cheat('TIRED', () => (game.energy = LOW - 0.01)),
    cheat('+COCO', () => {
      while (game.bag.length < BAG_SLOTS) game.bag.push('coconut');
      showBag();
    }),
    {
      words: 'GIVE',
      more: (['wood', 'stone', 'spear', 'leaf', 'vine', 'axe', 'rope', 'cloth', 'log', 'fire', 'hammer', 'drift'] as const).map((it) => cheat(it.toUpperCase(), () => {
        if (game.bag.length < BAG_SLOTS) game.bag.push(it);
        showBag();
      })),
    },
    cheat('SUNSET', () => (time = DAY_S - SUNSET_S)),
    cheat('NIGHT', () => (time = DAY_S + DUSK_S)),
    cheat('MORNING', () => sleep(false, true)),
    // The current quest done, as if its goal had happened as often as it needs.
    cheat('QUEST+', () => {
      for (let n = 0; n < (questNow().count ?? 1) && !game.quest.done; n++) reach(questNow().goal);
      think(questThought());
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
/** The sleep (or faint) under way: when the fade began, and whether it was a faint. */
/** `intro`: not a night but the start, with the survivor made in the editor washed up on the beach. */
/** `night`: woken in the night by the next quest starting (the storm), which says so. */
let sleeping: { start: number; fainted: boolean; woken: boolean; wakes: boolean; intro?: State; night?: boolean } | null = null;

/** Whether the press under way began on the survivor: then moving it walks nowhere. */
let onSelf = false;
function press(p: { x: number; y: number }, start: boolean): void {
  if (paused || sleeping || ended) return;
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
    // A crab: grabbed or speared if near enough, else walked up to, stopping just near enough.
    const crab = crabAt(world, crabs, p, 7);
    if (crab) {
      const reach = crabReach();
      if (Math.hypot(crab.i - actor.i, crab.j - actor.j) <= reach) return catchCrab(crab);
      const d = Math.hypot(actor.i - crab.i, actor.j - crab.j);
      return goTo({ i: crab.i + ((actor.i - crab.i) / d) * reach * 0.8, j: crab.j + ((actor.j - crab.j) / d) * reach * 0.8 }, false, { crab });
    }
    // With the spear in hand, a tap on a fish swimming near spears it.
    const fish = hand === 'spear' ? world.fishAt(p, 8) : null;
    if (fish) {
      if (Math.hypot(fish.i - actor.i, fish.j - actor.j) <= SPEAR_REACH) return spear(fish);
      think('think.missed');
    }
    // The burning stump comes first, over coconuts lying under it; it blocks the way like the palm did, so the goal is the near side of it.
    const stump = game.struck === null ? null : palms[game.struck];
    if (stump && near(p, stump, 10, 11)) return goTo(nearSide(stump), false, { stump: true });
    const c = game.coconuts.find((c) => near(p, c, 5, 2));
    if (c) return goTo(c, false, { coconut: c });
    const w = game.wood.find((w) => near(p, w, 5, 1));
    if (w) return goTo(w, false, { wood: w });
    const st = game.stones.find((s) => near(p, s, 5, 1));
    if (st) return goTo(st, false, { stone: st });
    if (game.hat && near(p, game.hat, 6, 2)) return goTo(game.hat, false, { hat: true });
    if (near(p, BLANKET, 15, 0)) return goTo(BLANKET, false, { blanket: true });
    // Driftwood is a big piece, the rest small.
    const lo = game.lying.find((l) => (l.item === 'drift' ? near(p, l, 12, 3) : near(p, l, 6, 2)));
    if (lo) return goTo(lo, false, { loose: lo });
    const it = game.items.find((it) => near(p, it, 9, 7));
    // A crate blocks the way, so the goal is the near side of it.
    if (it) return goTo(nearSide(it), false, { item: it });
    // A palm's trunk or crown: walked up to, for its leaves or, with the axe, to cut it down.
    const k = palms.findIndex((q, k) => k !== game.struck && !game.felled.includes(k) && (near(p, q, 6, 8) || near(p, q, 12, 26)));
    if (k >= 0) return goTo(nearSide(palms[k]), false, { palm: k });
  }
  if (target?.pick || onSelf) return;
  const tile = world.tileAt(p.x, p.y);
  if (!tile) return;
  const far = Math.hypot(tile.i + 0.5 - actor.i, tile.j + 0.5 - actor.j) > 4;
  goTo({ i: tile.i + 0.5, j: tile.j + 0.5 }, far && speedOf(game) === 1);
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
  if (!me || !parts.length || sheltered()) return false;
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

/** Half a metre short of something that blocks the way, on the survivor's side of it. */
function nearSide(at: { i: number; j: number }): { i: number; j: number } {
  const d = Math.hypot(actor.i - at.i, actor.j - at.j) || 1;
  return { i: at.i + ((actor.i - at.i) / d) * 0.5, j: at.j + ((actor.j - at.j) / d) * 0.5 };
}

/** Whether a ground pixel is within `r` pixels of a map point's picture, centred `up` pixels above its foot. */
function near(p: { x: number; y: number }, at: { i: number; j: number }, r: number, up: number): boolean {
  const s = world.screenOf(at.i, at.j);
  return Math.hypot(p.x - s.x, p.y - (s.y - up)) <= r;
}

function arrive(pick: Pick): void {
  if ('crab' in pick) {
    const c = pick.crab;
    if (crabs.includes(c) && Math.hypot(c.i - actor.i, c.j - actor.j) <= crabReach() + 0.2) return catchCrab(c);
    return think('think.missed');
  }
  // Once on the blanket, the sleep button shows, by day too: sleep then lasts till the next morning.
  if ('blanket' in pick) return;
  // The hat goes straight on the head, not into the bag.
  if ('hat' in pick) {
    game.hat = null;
    looks.clear();
    mood = null;
    feel();
    return think('think.hat');
  }
  // A stone or the hammer smashes the crate, the axe prises it open; with empty hands it goes into the bag.
  if ('item' in pick) {
    if (hand === 'stone' || hand === 'axe' || hand === 'hammer') return openCrate(pick.item, hand !== 'axe');
    if (hand) return think('think.crate');
    if (game.bag.length >= BAG_SLOTS) return think('think.full');
    game.items.splice(game.items.indexOf(pick.item), 1);
    game.bag.push('crate');
    showBag();
    return think('think.crateTaken');
  }
  if ('palm' in pick) {
    if (hand === 'axe') return tall(pick.palm) ? fell(pick.palm) : think('think.tooSmall');
    if (game.bag.length >= BAG_SLOTS) return think('think.full');
    game.bag.push('leaf');
    showBag();
    return think('think.leaf');
  }
  // A stick in hand held to the burning stump catches: a torch.
  if ('stump' in pick) {
    if (hand === 'fire') return think('think.haveFire');
    if (hand !== 'wood') return think('think.needStick');
    game.bag[game.bag.indexOf('wood')] = 'fire';
    hold('fire');
    return think('think.gotFire');
  }
  // The torch in hand lights driftwood where it lies: a campfire. Only one by the hut is one to sleep by.
  if ('loose' in pick && pick.loose.item === 'drift' && hand === 'fire') {
    game.lying = game.lying.filter((l) => l !== pick.loose);
    game.fires.push({ i: pick.loose.i, j: pick.loose.j });
    game.bag.splice(game.bag.indexOf('fire'), 1);
    hold(null);
    const atHut = byHut(pick.loose);
    think(!atHut && wantsFire() ? 'think.fireFar' : 'think.campfire');
    return atHut ? reach('campfire') : undefined;
  }
  if (game.bag.length >= BAG_SLOTS) return think('think.full');
  if ('loose' in pick) {
    game.lying = game.lying.filter((l) => l !== pick.loose);
    game.bag.push(pick.loose.item);
    showBag();
    // Only what the sea or the crate brought is new enough to think about.
    if (isLoose(pick.loose.item)) think(`think.${pick.loose.item}`);
    return;
  }
  if ('coconut' in pick) {
    game.coconuts = game.coconuts.filter((c) => c !== pick.coconut);
    game.bag.push('coconut');
    return showBag();
  }
  if ('stone' in pick) {
    game.stones = game.stones.filter((s) => s !== pick.stone);
    game.bag.push('stone');
    showBag();
    return think('think.stone');
  }
  game.wood = game.wood.filter((w) => w !== pick.wood);
  game.bag.push('wood');
  showBag();
  think(game.struck === null ? 'think.wood' : 'think.woodFire');
}

/** A thrust of the spear at a fish near enough: caught, into the bag, if there is room. */
function spear(fish: (typeof world.fish)[number]): void {
  target = null;
  actor.lookAt(fish.i - actor.i, fish.j - actor.j);
  actor.emote('use', performance.now());
  if (game.bag.length >= BAG_SLOTS) return think('think.full');
  world.fish.splice(world.fish.indexOf(fish), 1);
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
  if (game.bag.length >= BAG_SLOTS) return think('think.full');
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
function openCrate(crate: PlacedItem, smashed: boolean): void {
  actor.emote('use', performance.now());
  game.items.splice(game.items.indexOf(crate), 1);
  const beside = () => spotNear(crate, 0.4, 0.5) ?? { i: crate.i, j: crate.j };
  game.lying.push({ item: 'rope', ...beside() });
  // Smashed, its boards are driftwood to build with, and splinters fly.
  if (smashed) for (let n = 0; n < 2; n++) game.lying.push({ item: 'drift', ...beside() });
  const foot = world.screenOf(crate.i, crate.j);
  if (smashed) bursts.push(new Burst({ x: foot.x, y: foot.y - 6 }, foot.y, performance.now(), [PALETTE.wood.base, PALETTE.wood.shade, PALETTE.bark.shade, PALETTE.wood.light]));
  think(smashed ? 'think.smashed' : 'think.opened');
  reach('open');
}

/** The axe cuts a palm down: two logs where it stood, no more coconuts from it. Hard work. */
function fell(k: number): void {
  actor.emote('use', performance.now());
  game.felled.push(k);
  keepStanding();
  for (let n = 0, tries = 0; n < 2 && tries < 40; tries++) {
    const at = spotNear(palms[k], 0.3, 0.8);
    if (at) game.lying.push({ item: 'log', ...at }), n++, reach('log');
  }
  game.energy = Math.max(0, game.energy - 0.08);
  think('think.felled');
}

/** How near the hut's middle the survivor builds it, in metres: inside it or just outside its walls. */
const HUT_REACH = 2.2;
/** The hut (at its fixed place) or raft that could be built (or built further) right here with what is in the bag. */
function buildable(kind: BuildKind): Build | 'new' | null {
  const b = game.builds.find((b) => b.kind === kind);
  if (finished(b) || lacking(kind, b?.stage ?? 0, game.bag).length) return null;
  if (kind === 'hut') return Math.hypot(HUT_AT.i - actor.i, HUT_AT.j - actor.j) <= HUT_REACH ? b ?? 'new' : null;
  if (b) return Math.hypot(b.i - actor.i, b.j - actor.j) <= 1.5 ? b : null;
  const surface = surfaceAt(world.map, Math.floor(actor.i), Math.floor(actor.j));
  const fits = BUILDS[kind].on === 'beach' ? surface === 'beach' : dry(actor) && surface !== 'beach';
  const clear = !palms.some((q, k) => !game.felled.includes(k) && Math.hypot(q.i - actor.i, q.j - actor.j) < 1.2) && !game.builds.some((o) => Math.hypot(o.i - actor.i, o.j - actor.j) < 2);
  return fits && clear ? 'new' : null;
}
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
  if (kind === 'hut' && finished(game.builds.find((b) => b.kind === 'hut'))) reach('hut');
}
/** Where the survivor sleeps: the blanket, in the middle of where the hut goes. */
const BLANKET = HUT_AT;
const onBlanket = () => Math.hypot(actor.i - BLANKET.i, actor.j - BLANKET.j) < 0.5;
const hut = () => game.builds.find((b) => b.kind === 'hut' && finished(b));
/** Under the finished hut's roof: on one of its 2×2 cells. */
const sheltered = () => !!hut() && Math.abs(Math.floor(actor.i) + 0.5 - HUT_AT.i) < 1 && Math.abs(Math.floor(actor.j) + 0.5 - HUT_AT.j) < 1;
/** By a burning campfire (the stump is too wild a fire to sleep by). */
const byFire = () => game.fires.some((f) => Math.hypot(f.i - actor.i, f.j - actor.j) <= 2.5);
/** How near the hut a campfire counts as its own, in metres. */
const HUT_FIRE = 3;
const byHut = (at: { i: number; j: number }) => Math.hypot(at.i - HUT_AT.i, at.j - HUT_AT.j) <= HUT_FIRE;
/** The fire quest is under way: after that storm the survivor does not sleep again until a campfire burns by the hut. */
const wantsFire = () => questNow().goal === 'campfire' && !game.quest.done;
const fireByHut = () => game.fires.some(byHut);

/** How far a fire scares animals off, in metres: a fire burning on the ground, and a torch carried about. */
const FIRE_FEAR = 3.5;
const TORCH_FEAR = 1.6;
/** Every fire burning now, and how far each one frightens: the campfires, the palm lightning left alight, the torch in hand. */
function burning(): { i: number; j: number; fear: number }[] {
  return [
    ...game.fires.map((f) => ({ ...f, fear: FIRE_FEAR })),
    ...(game.struck === null ? [] : [{ i: palms[game.struck].i, j: palms[game.struck].j, fear: FIRE_FEAR }]),
    ...(hand === 'fire' && present ? [{ i: actor.i, j: actor.j, fear: TORCH_FEAR }] : []),
  ];
}
/** The fire nearest an animal, if one is near enough to frighten it. */
function fireNear(at: { i: number; j: number }, lit: readonly { i: number; j: number; fear: number }[]): { i: number; j: number } | null {
  let best: { i: number; j: number } | null = null;
  let bestD = Infinity;
  for (const f of lit) {
    const d = Math.hypot(f.i - at.i, f.j - at.j);
    if (d <= f.fear && d < bestD) [best, bestD] = [f, d];
  }
  return best;
}
/** How fast a frightened fish turns away, in radians a second. */
const FISH_TURN = 3;
/** No animal stays by a fire: a crab runs off sideways as it does from the survivor, a fish turns and swims away. */
function fleeFire(dt: number): void {
  const lit = burning();
  if (!lit.length) return;
  for (const c of crabs) {
    const f = fireNear(c, lit);
    if (f) scare(c, f);
  }
  for (const fish of world.fish) {
    const f = fireNear(fish, lit);
    if (!f) continue;
    // Round to the heading straight away from the fire, the short way about.
    const d = Math.atan2(fish.j - f.j, fish.i - f.i) - fish.a;
    fish.a += Math.max(-FISH_TURN * dt, Math.min(FISH_TURN * dt, Math.atan2(Math.sin(d), Math.cos(d))));
  }
}

/** The raft, finished, by the survivor, and the sea not stormy. */
function canSail(): boolean {
  const r = game.builds.find((b) => b.kind === 'raft');
  return finished(r) && Math.hypot(r!.i - actor.i, r!.j - actor.j) <= 1.5 && kindNow() !== 'storm';
}
const END_FADE = 2500;
function setSail(): void {
  if (!canSail() || paused || sleeping || ended) return;
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
  if (burnPalm(game, actor)) think('think.struck');
}
/** Burns the tall palm nearest `near` down to a burning stump, its crown's twigs dry wood round it. Whether there was one. */
function burnPalm(g: Game, near: { i: number; j: number }): boolean {
  let best = -1;
  let bestD = Infinity;
  palms.forEach((p, k) => {
    const d = Math.hypot(p.i - near.i, p.j - near.j);
    // A sapling is too small to draw lightning.
    if (tall(k) && !g.felled.includes(k) && d < bestD) [best, bestD] = [k, d];
  });
  if (best < 0) return false;
  g.struck = best;
  for (let n = 0, tries = 0; n < 3 && tries < 40; tries++) {
    const twig = spotNear(palms[best], 0.8, 0.9);
    if (twig) {
      g.wood.push(twig);
      n++;
    }
  }
  return true;
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
  const chosen = !fainted && !anywhere;
  if (chosen && !dry(actor)) return think('think.wet');
  // In the rain the survivor sleeps only under the hut's roof.
  if (chosen && weatherAt(kindNow(), kindTomorrow(), time).rain > 0.4 && !sheltered()) return think('think.rainSleep');
  // After the storm night the survivor lies awake until a campfire burns by the hut.
  if (chosen && wantsFire() && !fireByHut()) return think('think.needFire');
  // In a storm, sleep out of the hut and away from a fire is broken by thunder, and then does not come back.
  const wakes = chosen && kindNow() === 'storm' && !byFire() && !sheltered();
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
  const night = resting() && !!QUESTS[game.quest.quest + 1]?.night;
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
  if (!game.coconuts.length && !game.bag.includes('coconut')) dropCoconuts(game);
  washWood(game);
  world.fish.push(...spawnFish(world.floor, FISH_COUNT - world.fish.length, fishRandom));
  crabs = [];
  crabsOut = 0;
  // A done quest gives way to the next, which brings what it needs; else the morning's own thought.
  const after = next(game.quest, true);
  const thought = after !== game.quest ? startQuest(after) : morningThought();
  if (stonesOut(game.quest.quest)) for (let n = stonesAbout(game); n < STONES_OUT; n++) layStone(game);
  showQuest();
  if (!TRYOUT) saveGame(game);
  setTimeout(() => tell(thought), FADE.hold + FADE.in);
}

/** A morning with no new quest: what the weather is like, or on a fine day what the quest still wants. */
function morningThought(): string {
  const kind = kindNow();
  return kind === 'sunny' ? questThought() : `think.${kind}`;
}

/** The fire quest's lightning, waiting until the survivor is up, its thought read and the hut left behind. */
let strikeNow = false;

/** How dark the fade is now, and runs the morning at its darkest. */
function fadeAt(ms: number): number {
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
      centerOn(actor);
      faceToLie();
      actor.lieDown(ms, true, SLEEPS);
    }
    // The next quest wakes the survivor, deep in the night.
    else if (sleeping.night) {
      const thought = startQuest(next(game.quest, true));
      time = Math.max(time, DAY_S + DUSK_S + 60);
      // Half a night's sleep.
      game.energy = Math.max(game.energy, 0.6);
      setTimeout(() => tell(thought), FADE.hold + FADE.in);
    }
    // Thunder: awake again in the same night.
    else if (sleeping.wakes) {
      stormWoken = true;
      setTimeout(() => tell('think.thunder'), FADE.hold + FADE.in);
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
 * Where the torch burns in the survivor's picture, in ground pixels: the middle of its glowing pixels, so the light
 * sits on the flame itself however they stand, turn or hold it, and not on a spot guessed above their feet.
 */
function flameAt(me: Thing): { x: number; y: number } | null {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < me.h; y++) for (let x = 0; x < me.w; x++) {
    const c = me.picture.get(x, y);
    if (c && GLOWING.has(c)) (sx += x), (sy += y), n++;
  }
  if (!n) return null;
  const foot = footOf(world.ground, me.spot);
  return { x: foot.x + sx / n - me.foot.x, y: foot.y + sy / n - me.foot.y };
}
/** The fires as lamps lighting the dark round them, in the view's pixels: campfires, the burning stump, the torch in hand. */
function lamps(rect: { x: number; y: number }, me: Thing | null): Lamp[] {
  const lamp = (at: { i: number; j: number }, up: number, r: number): Lamp => {
    const p = world.screenOf(at.i, at.j);
    return { x: p.x - rect.x, y: p.y - up - rect.y, r };
  };
  // Every lamp sits on a flame: the torch's is found in the survivor's own picture.
  const torch = hand === 'fire' && me ? flameAt(me) : null;
  return [
    ...game.fires.map((f) => lamp(f, 5, 46)),
    ...(game.struck === null ? [] : [lamp(palms[game.struck], 14, 40)]),
    ...(torch ? [{ x: torch.x - rect.x, y: torch.y - rect.y, r: 28 }] : []),
  ];
}

/** How far into the night it is: 0 by day and at sunset, growing through dusk, 1 once it is dark. */
function nightfall(t: number): number {
  const { phase, k } = phaseAt(t);
  return phase === 'dusk' ? k : phase === 'night' ? 1 : 0;
}
/**
 * The weather the world is shown: by day as it is, but at night without its cloud, since the moon throws shadows
 * as hard as a sunny day's and a grey sky is nothing to see in the dark. Fog is left alone: it swallows shadows
 * whatever the hour.
 */
function asSeen(w: Weather, night: number): Weather {
  return night <= 0 || w.fog > 0 ? w : { ...w, cloud: w.cloud * (1 - night) };
}
/** Night fog: not the pale grey of a foggy morning but a dark blue bank, which this light over the whole picture makes of it. */
const FOG_NIGHT: Tint = { r: 34, g: 52, b: 118, amount: 0.62 };
/** The light the weather leaves: the engine's overcast grey, turning to a dark blue where fog lies at night. */
function weatherLight(w: Weather, night: number): Tint {
  const grey = overcast(w);
  return w.fog > 0 && night > 0 ? mixTint(grey, FOG_NIGHT, night * w.fog) : grey;
}

function tintAt(time: number): Tint {
  const { phase, k } = phaseAt(time);
  // Every morning the sun comes up: from dusk's purple through sunset's warmth to day.
  if (phase === 'day') return time < SUNRISE_S ? along([TINTS.dusk, TINTS.sunset, TINTS.day], time / SUNRISE_S) : TINTS.day;
  if (phase === 'sunset') return mixTint(TINTS.day, TINTS.sunset, k);
  if (phase === 'dusk') return along([TINTS.sunset, TINTS.dusk, TINTS.night], k);
  return TINTS.night;
}

/** Hints said once a game (and again after a reload): how to tie things together and how to drop them. */
const taught = new Set<Key>();
function teach(key: Key, when: boolean): void {
  if (when && bubble.hidden && !telling() && !taught.has(key)) {
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
const sparks = new Sparks();
let last = performance.now();
function frame(ms: number): void {
  const dt = Math.min(0.1, (ms - last) / 1000);
  last = ms;
  view.update(dt);
  keepInView();
  // Before the first survivor and while making one, only the menu or editor over the sea, and the menu button.
  for (const b of [hudBox, actions, bag]) b.hidden = !present || editing;
  // Sleep fades out and back in; setting sail fades out for good.
  const fade = ended ? Math.min(1, (ms - ended) / END_FADE) : fadeAt(ms);

  if (!paused && !sleeping && !ended && !telling()) {
    time += dt * SPEED * fast;
    Object.assign(game, drain(game, dt * SPEED * fast));
    warnOnce('think.hungry', game.hunger < LOW);
    warnOnce('think.tired', game.energy < LOW);
    warnOnce('think.shark', !dry(actor) && !!sharkNear(sharks, actor, SHARK_SEEN));
    teach('think.canTie', canTie());
    teach('think.canDrop', game.bag.length >= BAG_SLOTS);
    if (faints(game)) {
      think('think.faint');
      sleep(true);
    }
  }
  feel();
  // The torch's flame flickers with the stump's.
  if (hand === 'fire' && held !== torchAt(ms)) dress();

  let di = 0;
  let dj = 0;
  let run = false;
  if (target && !paused && !sleeping && !telling()) {
    if (target.way.length > 1 && Math.hypot(target.way[0].i - actor.i, target.way[0].j - actor.j) < 0.2) target.way.shift();
    const next = target.way[0];
    const goal = target.way[target.way.length - 1];
    di = next.i - actor.i;
    dj = next.j - actor.j;
    run = target.run;
    // A crab is walked right up to the spot just near enough, not within the usual reach of it.
    if (target.pick && Math.hypot(goal.i - actor.i, goal.j - actor.j) < ('crab' in target.pick || 'blanket' in target.pick ? 0.12 : REACH)) {
      arrive(target.pick);
      target = null;
      di = dj = 0;
    } else if (target.way.length === 1 && Math.hypot(di, dj) < 0.08) {
      target = null;
      di = dj = 0;
    }
  }
  const before = [actor.i, actor.j];
  // shortcut: slowness scales the step, so the walk cycle plays at full rate; add a speed to Actor if it reads as sliding.
  actor.update(world, paused || telling() ? 0 : dt * speedOf(game), di, dj, run, ms);
  // A target that cannot be reached is given up rather than walked against forever.
  if (target && before[0] === actor.i && before[1] === actor.j && !paused && !actor.rising) target = null;

  if (!paused && !sleeping && !telling()) fleeFire(dt);
  swim(world.fish, world.floor, dt, fishRandom);
  cruise(sharks, world.floor, paused || sleeping ? 0 : dt, fishRandom);
  land(ms);
  // On a windy day the crabs come out of the sand from the morning on, one every so often; only the wind drives them up the beach.
  if (!paused && !sleeping && !telling() && kindNow() === 'windy' && crabsOut < CRAB_NIGHT && fishRandom() < dt / 8) {
    const c = spawnCrab(world, fishRandom);
    if (c) crabs.push(c);
    crabsOut++;
  }
  scuttle(crabs, world, paused ? 0 : dt, fishRandom, sleeping ? null : actor);
  // Before the survivor is on the island (the menu, the editor, the fade in), a sunny sea, not the last game's weather.
  const weather = !present || editing || sleeping?.intro ? weatherAt('sunny', 'sunny', 0) : weatherAt(kindNow(), kindTomorrow(), time);
  const night = nightfall(time);
  world.setWeather(asSeen(weather, night));
  const flashNow = flashAt(ms, weather);
  // The fire quest's lightning, once the survivor is up and the morning's thought read: a bolt into the palm, its crown bursting.
  if (game.struck !== null) strikeNow = false;
  // The bolt comes as the survivor steps out of the hut, so they see it strike.
  const striking = strikeNow && present && !paused && !sleeping && !telling() && !sheltered();
  if (striking) {
    strikeNow = false;
    strike();
  }
  const plants = world.plantThings(Math.floor((ms / 1000) * 6) % FRAMES);
  // The scene draws only the standing palms, so the struck one's place among them.
  const struckAt = game.struck === null ? -1 : scene.plants.indexOf(palms[game.struck]);
  if (striking && struckAt >= 0) {
    const palm = plants[struckAt];
    const foot = world.screenOf(palm.spot.i, palm.spot.j);
    const b = breakOf(palm);
    strikeFx = new Strike({ x: foot.x + b.dx, y: foot.y + b.dy }, foot.y, ms);
  }
  if (struckAt >= 0) plants.splice(struckAt, 1, ...stumpThings(plants[struckAt], ms));
  const at = (p: { i: number; j: number }) => ({ i: p.i, j: p.j, level: standingHeight(world.map, p.i, p.j) });
  const hutBuild = game.builds.find((b) => b.kind === 'hut');
  world.buildings = hutBuild ? [hutBuilding(hutBuild.stage)] : [];
  const me = present ? actor.thing(world, ms) : null;
  let hutParts = world.buildingThings(actor);
  // Behind the hut, its walls come down to knee height and the roof off, so the survivor is seen.
  if (hutBuild && hides(hutParts, me)) {
    world.buildings = [hutBuilding(hutBuild.stage, true)];
    hutParts = world.buildingThings(actor);
  }
  const things: Thing[] = [
    ...plants, ...world.itemThings(), ...game.coconuts.map(coconutThing), ...game.wood.map((w) => woodThing(at(w))), ...game.stones.map((s) => stoneThing(at(s))),
    blanketThing(at(BLANKET)), ...game.lying.map((l) => LYING[l.item](at(l))), ...(game.hat ? [hatThing(game.who)(at(game.hat))] : []), ...thrown.map((t) => thrownThing(t, ms)), ...game.builds.filter((b) => b.kind === 'raft').map((b) => raftThing(b.stage, at(b))),
    ...game.fires.map((f) => campfireThing(at(f), ms)), ...crabs.map((c) => crabThing(world, c, ms)), ...sharks.map((s) => finThing(s, ms)),
  ];
  things.push(...hutParts, ...(me ? [me, ...actor.dropThings()] : []));
  const rect = view.rect();
  const image = world.compose(rect, things, undefined, false, ms);
  if (game.struck !== null || game.fires.length || hand === 'fire') sparks.spawn(image, rect, ms, paused ? 0 : dt);
  light(image, weatherLight(weather, night));
  // A flash lights the world as bright as day for a moment, at night too, then shows it stark.
  const flash = (striking ? 1 : flashNow) * (1 - fade);
  const tint = tintAt(time);
  light(image, { ...tint, amount: tint.amount * (1 - flash) }, fade, lamps(rect, me));
  lightning(image, flash);
  sparks.draw(image, rect, ms);
  strikeFx?.draw(image, rect, ms);
  if (strikeFx?.done(ms)) strikeFx = null;
  for (const b of bursts) b.draw(image, rect, ms);
  bursts = bursts.filter((b) => !b.done(ms));
  view.show(image);

  // The page around the picture.
  const { phase } = phaseAt(time);
  status.draw(t('day', { n: game.day }), phase === 'day' ? 'sun' : phase === 'night' ? 'moon' : 'dusk', game.hunger, game.energy, LOW);
  sleepButton.hidden = !!ended || !onBlanket();
  // In the rain the survivor sleeps only under the hut's roof.
  // Looks disabled but still takes a press, which says why not.
  sleepButton.setAttribute('aria-disabled', String(weather.rain > 0.4 && !sheltered()));
  for (const k of BUILD_KINDS) buildButtons[k].hidden = !!ended || !buildable(k);
  sailButton.hidden = !!ended || !canSail();
  veil.style.opacity = String(fade);
  // A new day's title; thunder waking the survivor in the same night gets none.
  if (fade >= 1 && veilDay !== game.day && !ended && !sleeping?.wakes) {
    veilDay = game.day;
    veil.replaceChildren(label(caps(t('day', { n: game.day })), C.moon, S * 2));
  }
  if (!bubble.hidden && ms > bubbleUntil) unthink();
  if (!bubble.hidden) {
    const foot = world.screenOf(actor.i, actor.j);
    const s = view.toScreen(foot.x, foot.y);
    // Centred over the survivor, but kept on the screen when they stand near its edge.
    const half = bubble.offsetWidth / 2;
    const x = Math.min(app.clientWidth - 8 - half, Math.max(8 + half, s.x));
    bubble.style.transform = `translate(${x}px, ${s.y - 46 * view.zoom}px) translate(-50%, -100%)`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
