// Pixel Island, milestone 1: one day on the island. Tap to walk, pick up coconuts and eat them,
// watch the sun set, get tired, sleep, wake to what the sea brought. Pick up driftwood; once a storm
// has burnt a palm, hold a stick to its fire for a torch, and with the torch light dry wood: a campfire.
// Tie a stone to a stick for a spear, and spear the fish that swim near. On windy nights crabs come
// out on the beach: speared, or grabbed by hand if lucky. A hut keeps the rain off; a storm night
// needs a campfire. A vine makes an axe, which opens the crate and fells palms; logs, rope and the
// cloth make a raft, and setting sail ends the game.
import './style.css';
import { defaultState, lookOf } from '@pixel/engine/character/character.ts';
import type { Mood } from '@pixel/engine/character/base.ts';
import type { Look } from '@pixel/engine/core/puppet.ts';
import { FRAMES } from '@pixel/engine/flora/flora.ts';
import { Actor } from '@pixel/engine/world/actor.ts';
import { along, light, mixTint, TINTS, type Tint } from '@pixel/engine/world/daylight.ts';
import { flashAt, lightning, overcast } from '@pixel/engine/world/weather.ts';
import { KINDS, kindOf, weatherAt, type Forced } from './weather.ts';
import type { Picture } from '@pixel/engine/world/island.ts';
import { levelAt, SEA_LEVEL, standingHeight, surfaceAt } from '@pixel/engine/world/terrain.ts';
import { World, type Thing } from '@pixel/engine/world/world.ts';
import type { PlacedItem } from '@pixel/engine/world/props.ts';
import { Viewport } from '@pixel/shared/viewport.ts';
import { findPath } from '@pixel/engine/world/path.ts';
import { spawnFish, swim } from '@pixel/engine/world/fish.ts';
import { crabAt, crabThing, scare, scuttle, spawnCrab, type Crab } from '@pixel/engine/world/crab.ts';
import { rng } from '@pixel/shared/random.ts';
import { COCONUT, DAY_S, FISH, drain, DUSK_S, faints, LOW, phaseAt, speedOf, SUNSET_S, wake } from './clock.ts';
import { C, caps, hud, pixelButton, S, slot } from './ui.ts';
import { label, panel, pixelCanvas, rounded, speechBubble } from '@pixel/shared/pixel-ui.ts';
import { LINE_H, LINE_STEP, text, wrap } from '@pixel/shared/pixel-font.ts';
import { SHADOW } from '@pixel/engine/core/palette.ts';
import { firstIsland } from './island.ts';
import { BAG_ITEMS, BAG_SLOTS, clearGame, loadGame, saveGame, type BagItem, type Game } from './save.ts';
import { t, type Key } from './i18n.ts';
import { dayPlan, type DayEvent } from './days.ts';
import { currentLang, LANGS, setLang } from '@pixel/shared/lang.ts';
import { cheatDrawer } from '@pixel/shared/cheats.ts';
import { CRAB_IN_BAG, FISH_IN_BAG, FISH_ITEMS, SPEAR_IN_BAG, STONE, stoneThing } from './fishing.ts';
import { BUILD_KINDS, BUILDS, finished, HUT_AT, lacking, LOOSE, recipeFor, takeFrom, type Build, type BuildKind, type Loose } from './crafts.ts';
import { AXE, AXE_IN_BAG, CLOTH, hutBuilding, LEAF, LOG, PIECE_KINDS, thing, raftThing, ROPE, VINE } from './things.ts';
import { breakOf, campfireThing, Sparks, STICK, Strike, stumpThings, torchAt, TORCH_COLORS, TORCH_ROWS, WOOD_COLORS, WOOD_ROWS, woodThing } from './fire.ts';

const params = new URLSearchParams(location.search);
/** Debug: `?speed=20` runs the game clock 20 times faster. */
const SPEED = Math.max(0.1, Number(params.get('speed')) || 1);
/** Debug, from the day editor: `?day=5` plays a new game from day 5 and never saves, so the real save is kept. */
const TRYOUT = params.has('day');
const START_DAY = Math.min(999, Math.max(1, Math.floor(Number(params.get('day'))) || 1));
/** How near the survivor must come to pick something up, in metres. */
const REACH = 0.7;
const FADE = { out: 1200, hold: 1000, in: 1200 };
/** How many pieces of driftwood the sea leaves lying on the beach at most. */
const WOOD_LYING = 4;
/** How many fish swim round the island; the ones caught are back by the next morning. */
const FISH_COUNT = 7;
/** How near a fish must swim to be speared, in metres. */
const SPEAR_REACH = 1.8;
/** How many crabs come out each night; how near one must be to grab it by hand, and how often that works. */
const CRAB_NIGHT = 5;
const GRAB_REACH = 1.4;
const GRAB_LUCK = 0.25;

// ------------------------------------------------------------------ the world

const scene = firstIsland();
const world = new World(scene);
world.pieceKinds = PIECE_KINDS;
const fishRandom = rng(Date.now());
world.fish = spawnFish(world.floor, FISH_COUNT, fishRandom);
/** Every palm, by the index the save uses; the scene keeps only the ones still standing. */
const palms = [...scene.plants];
/** The tall palms can be felled and draw lightning; the sapling is too small. */
const tall = (k: number) => palms[k].plant !== 'plant-palms-2';
/** Shows (and lets block the way) only the palms not cut down. */
const keepStanding = () => (scene.plants = palms.filter((_, k) => !game.felled.includes(k)));
/** The crabs out tonight, and how many have come out so far; all gone by morning. */
let crabs: Crab[] = [];
let crabsOut = 0;
/** When the survivor set sail, which ends the game. */
let ended: number | null = null;

function newGame(): Game {
  const g: Game = { day: START_DAY, hunger: 0.8, energy: 1, bag: [], coconuts: [], wood: [], stones: [], items: [], struck: null, fires: [], lying: [], felled: [], builds: [], at: { ...scene.spawn } };
  // The island starts with two coconuts lying about, unless the day's plan says otherwise.
  for (let n = 0; n < (dayPlan(g.day).coconuts ?? 2); n++) dropCoconuts(g);
  washWood(g);
  for (let n = 0; n < 3; n++) layStone(g);
  washUp(g);
  return g;
}

/** A stone on the beach; one more each morning while there is none lying about or in the bag. */
function layStone(g: Game): void {
  if (beach.length) g.stones.push(onBeach());
}

/** One coconut a day falls from a palm, near its foot, never more than three under one; a burnt palm has none left. */
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
  const b = beach[Math.floor(Math.random() * beach.length)];
  return { i: b.i - 0.3 + Math.random() * 0.6, j: b.j - 0.3 + Math.random() * 0.6 };
};
/** What the sea brings: the day's planned wash-ups (days.json), or the items given. Whether anything came. */
function washUp(g: Game, items: string[] = dayPlan(g.day).washUps ?? []): boolean {
  if (!beach.length) return false;
  // A crate stands on the beach; the small things lie there to be picked up.
  for (const item of items) {
    if (isLoose(item)) g.lying.push({ item, ...onBeach() });
    else g.items.push({ item, ...onBeach() });
  }
  return items.length > 0;
}
const isLoose = (item: string): item is Loose => (LOOSE as readonly string[]).includes(item);
/** Each morning the sea leaves a piece or two of driftwood (or as planned), dry by the time it is found. */
function washWood(g: Game): void {
  for (let n = 0; n < (dayPlan(g.day).wood ?? 2) && g.wood.length < WOOD_LYING && beach.length; n++) g.wood.push(onBeach());
}

const saved = params.has('new') || TRYOUT ? null : loadGame(scene.w, palms.length);
let game = saved ?? newGame();
/** Game seconds since the morning. Every load starts in the morning, since the game is saved on waking. */
let time = 0;
world.loose = game.items;
keepStanding();
const actor = new Actor(lookOf(defaultState()), game.at);
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
/** The survivor's look: their face, and in hand what they took out of the bag: a stick, a torch or the spear. */
function dress(): void {
  held = hand === 'wood' ? STICK : hand === 'fire' ? torchAt(performance.now()) : hand === 'spear' ? SPEAR : hand === 'axe' ? AXE : null;
  const m = mood ?? 'happy';
  // Kept per face and held thing, so the torch's flicker goes back to looks the actor has drawn already.
  let byMood = looks.get(held);
  if (!byMood) looks.set(held, (byMood = new Map()));
  let look = byMood.get(m);
  if (!look) {
    look = lookOf({ ...defaultState(), mood: m });
    look.items = [...look.items.filter((it) => it.slot !== 'tool'), ...(held ? [held] : [])];
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
app.addEventListener('pointerdown', () => actor.rouse(performance.now()), { capture: true });

type Pick = { crab: Crab } | { coconut: { i: number; j: number } } | { wood: { i: number; j: number } } | { stone: { i: number; j: number } } | { item: PlacedItem } | { stump: true }
  | { loose: Game['lying'][number] } | { palm: number };
/** Where the survivor is going: waypoints round what is in the way, the last one the goal. */
let target: { way: { i: number; j: number }[]; run: boolean; pick?: Pick } | null = null;
function goTo(at: { i: number; j: number }, run: boolean, pick?: Pick): void {
  const way = findPath(world, actor, at);
  target = way.length ? { way, run, pick } : null;
}

const view = new Viewport({ zoom: 4, min: 2, max: 6, press: (p, start) => press(p, start) });
app.append(view.el);

const status = hud({ hunger: t('hunger'), energy: t('energy') });
const hudBox = el('div', 'hud');
hudBox.append(status.canvas);

const buttons = el('div', 'buttons');
const sleepButton = pixelButton(t('sleep'), { icon: 'moon', words: t('sleep'), dark: true }, () => sleep(false));
const buildButtons = Object.fromEntries(BUILD_KINDS.map((k) => [k, pixelButton(t(`build.${k}`), { words: t(`build.${k}`) }, () => build(k))])) as Record<BuildKind, HTMLButtonElement>;
const sailButton = pixelButton(t('setSail'), { words: t('setSail') }, () => setSail());
// The view's buttons top right; what the survivor can do now (sleep, build, set sail) above the bag, where long words
// have room and never run into the day and bars.
buttons.append(
  pixelButton(t('zoomIn'), { icon: 'zoomIn' }, () => view.step(1)),
  pixelButton(t('zoomOut'), { icon: 'zoomOut' }, () => view.step(-1)),
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
  leaf: LEAF, vine: VINE, axe: AXE_IN_BAG, rope: ROPE, cloth: CLOTH, log: LOG,
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
const LYING = Object.fromEntries(BAG_ITEMS.map((k) => [k, thing(BAG_PICTURES[k])])) as Record<BagItem, ReturnType<typeof thing>>;
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
  if (!overBag) putDown(d.n);
};
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

/** Puts a thing from the bag down at the survivor's feet, where it can be picked up again; the torch is kept. */
function putDown(n: number): void {
  const item = game.bag[n];
  if (!item || item === 'fire' || paused || sleeping) return;
  game.bag.splice(n, 1);
  const at = { i: actor.i, j: actor.j };
  if (item === 'wood') game.wood.push(at);
  else if (item === 'coconut') game.coconuts.push(at);
  else if (item === 'stone') game.stones.push(at);
  else game.lying.push({ item, ...at });
  actor.emote('use', performance.now());
  hold(hand && game.bag.includes(hand) ? hand : null);
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
/** The face in the box: the survivor's head as drawn now, cut from their picture. */
const FACE = 22;
function drawFace(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const me = actor.thing(world, performance.now());
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
let veilDay = 0;
function startNew(): void {
  if (!TRYOUT) clearGame();
  game = newGame();
  world.loose = game.items;
  Object.assign(actor, game.at);
  keepStanding();
  centerOn(actor);
  time = 0;
  done.clear();
  stormWoken = false;
  ended = null;
  if (!TRYOUT) saveGame(game);
  hold(null);
}

// The menu, which is also the pause: the name, play on or start over, and before the first step the language.
const menuBox = el('div', 'menu');
/** Whether the player has played since the page loaded. */
let started = false;
function play(fresh: boolean): void {
  if (fresh) startNew();
  setPaused(false);
  if (fresh || (!started && game.day === 1)) tell(morningThought(game.items.length > 0));
  started = true;
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
function showMenu(): void {
  menuBox.replaceChildren(
    label('PIXEL ISLAND', C.paper, S * 3),
    ...((saved || started) && !ended ? [pixelButton(t('continue'), { words: t('continue') }, () => play(false))] : []),
    pixelButton(t('newGame'), { words: t('newGame') }, () => play(true)),
    // The page is built in one language, so a change reloads it; offered only before playing, when that loses nothing.
    ...(started ? [] : [flags()]),
  );
}

app.append(hudBox, buttons, actions, bag, bubble, dialog, veil, menuBox);
showBag();

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
      more: (['wood', 'stone', 'spear', 'leaf', 'vine', 'axe', 'rope', 'cloth', 'log', 'fire'] as const).map((it) => cheat(it.toUpperCase(), () => {
        if (game.bag.length < BAG_SLOTS) game.bag.push(it);
        showBag();
      })),
    },
    cheat('SUNSET', () => (time = DAY_S - SUNSET_S)),
    cheat('NIGHT', () => (time = DAY_S + DUSK_S)),
    cheat('MORNING', () => sleep(false, true)),
    cheat('X10', () => (fast = fast === 1 ? 10 : 1)),
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

/** The sleep (or faint) under way: when it began, and whether it was a faint. */
let sleeping: { start: number; fainted: boolean; woken: boolean; wakes: boolean } | null = null;

function press(p: { x: number; y: number }, start: boolean): void {
  if (paused || sleeping || ended) return;
  if (start) {
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
    const lo = game.lying.find((l) => near(p, l, 6, 2));
    if (lo) return goTo(lo, false, { loose: lo });
    const it = game.items.find((it) => near(p, it, 9, 7));
    // A crate blocks the way, so the goal is the near side of it.
    if (it) return goTo(nearSide(it), false, { item: it });
    // A palm's trunk or crown: walked up to, for its leaves or, with the axe, to cut it down.
    const k = palms.findIndex((q, k) => k !== game.struck && !game.felled.includes(k) && (near(p, q, 6, 8) || near(p, q, 12, 26)));
    if (k >= 0) return goTo(nearSide(palms[k]), false, { palm: k });
  }
  if (target?.pick) return;
  const tile = world.tileAt(p.x, p.y);
  if (!tile) return;
  const far = Math.hypot(tile.i + 0.5 - actor.i, tile.j + 0.5 - actor.j) > 4;
  goTo({ i: tile.i + 0.5, j: tile.j + 0.5 }, far && speedOf(game) === 1);
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
  if ('item' in pick) return hand === 'axe' ? openCrate(pick.item) : think('think.crate');
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
  // The torch in hand lights dry wood where it lies: a campfire.
  if ('wood' in pick && hand === 'fire') {
    game.wood = game.wood.filter((w) => w !== pick.wood);
    game.fires.push(pick.wood);
    game.bag.splice(game.bag.indexOf('fire'), 1);
    hold(null);
    return think('think.campfire');
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
}

/** The axe prises the crate open: rope and cloth from the ship, laid beside it. */
function openCrate(crate: PlacedItem): void {
  actor.emote('use', performance.now());
  game.items.splice(game.items.indexOf(crate), 1);
  for (const item of ['rope', 'cloth'] as const) game.lying.push({ item, ...(spotNear(crate, 0.4, 0.5) ?? { i: crate.i, j: crate.j }) });
  think('think.opened');
}

/** The axe cuts a palm down: two logs where it stood, no more coconuts from it. Hard work. */
function fell(k: number): void {
  actor.emote('use', performance.now());
  game.felled.push(k);
  keepStanding();
  for (let n = 0, tries = 0; n < 2 && tries < 40; tries++) {
    const at = spotNear(palms[k], 0.3, 0.8);
    if (at) game.lying.push({ item: 'log', ...at }), n++;
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
}
const hut = () => game.builds.find((b) => b.kind === 'hut' && finished(b));
/** Under the finished hut's roof: on one of its 2×2 cells. */
const sheltered = () => !!hut() && Math.abs(Math.floor(actor.i) + 0.5 - HUT_AT.i) < 1 && Math.abs(Math.floor(actor.j) + 0.5 - HUT_AT.j) < 1;
/** By a burning campfire (the stump is too wild a fire to sleep by). */
const byFire = () => game.fires.some((f) => Math.hypot(f.i - actor.i, f.j - actor.j) <= 2.5);
/** The day's weather, or the one the cheat forces. */
const kindNow = () => weatherCheat ?? kindOf(game.day);

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
  setTimeout(() => setPaused(true), END_FADE + 3500);
}

/** The first storm's lightning burns down the tall palm nearest the survivor, so they see it. */
function strike(): void {
  let best = -1;
  let bestD = Infinity;
  palms.forEach((p, k) => {
    const d = Math.hypot(p.i - actor.i, p.j - actor.j);
    // A sapling is too small to draw lightning.
    if (tall(k) && !game.felled.includes(k) && d < bestD) [best, bestD] = [k, d];
  });
  if (best < 0) return;
  game.struck = best;
  // The crown's twigs fall round the stump, dry wood to pick up and light.
  for (let n = 0, tries = 0; n < 3 && tries < 40; tries++) {
    const twig = spotNear(palms[best], 0.8, 0.9);
    if (twig) {
      game.wood.push(twig);
      n++;
    }
  }
  think('think.struck');
}

function eat(slot: number): void {
  if (paused || sleeping) return;
  const food = FOOD[game.bag[slot]]!;
  game.bag.splice(slot, 1);
  game.hunger = Math.min(1, game.hunger + food.fills);
  showBag();
  think(food.yum);
}

/** Whether the storm has woken the survivor tonight; then only a fire lets them sleep again. */
let stormWoken = false;
function sleep(fainted: boolean, anywhere = false): void {
  if (sleeping || ended) return;
  const chosen = !fainted && !anywhere;
  if (chosen && !dry(actor)) return think('think.wet');
  // In the rain the survivor sleeps only under the hut's roof.
  if (chosen && weatherAt(game.day, time, weatherCheat).rain > 0.4 && !sheltered()) return think('think.rainSleep');
  // In a storm, sleep without a fire is broken by thunder, and then does not come back.
  const wakes = chosen && kindNow() === 'storm' && !byFire();
  if (wakes && stormWoken) return think('think.scared');
  target = null;
  forget();
  sleeping = { start: performance.now(), fainted, woken: false, wakes };
}

/** The night is over: a new morning, rested, with what the palms dropped and the sea brought. Saved. */
function morning(fainted: boolean): void {
  Object.assign(game, wake(game, fainted));
  stormWoken = false;
  game.day++;
  time = 0;
  warned.clear();
  if (!dry(actor)) Object.assign(actor, world.nearestLand(actor.i, actor.j));
  game.at = { i: actor.i, j: actor.j };
  dropCoconuts(game);
  washWood(game);
  if (!game.stones.length && !game.bag.includes('stone')) layStone(game);
  world.fish.push(...spawnFish(world.floor, FISH_COUNT - world.fish.length, fishRandom));
  crabs = [];
  crabsOut = 0;
  done.clear();
  // A storm leaves something on the beach.
  const washed = washUp(game) || (kindOf(game.day - 1) === 'storm' && washUp(game, ['crate']));
  if (!TRYOUT) saveGame(game);
  const after = FADE.hold + FADE.in;
  setTimeout(() => {
    tell(morningThought(washed));
  }, after);
}

/** The morning's thought: the day's planned one, else what washed up, else the weather. */
function morningThought(washed: boolean): string {
  const kind = kindOf(game.day);
  return dayPlan(game.day).thought ?? (washed ? 'think.washed' : kind === 'sunny' ? 'think.morning' : `think.${kind}`);
}

/** The day's planned events (days.json) that have happened, by index; none yet each morning. */
const done = new Set<number>();
/** A planned lightning strike, waiting for the next frame to draw it. */
let strikeNow = false;
function happen(e: DayEvent): void {
  if (e.do === 'thought') tell(e.text);
  else if (e.do === 'washUp') washUp(game, [e.item]) && think('think.washed');
  else strikeNow = true;
}

/** How dark the fade is now, and runs the morning at its darkest. */
function fadeAt(ms: number): number {
  if (!sleeping) return 0;
  const e = ms - sleeping.start;
  if (e < FADE.out) return e / FADE.out;
  if (!sleeping.woken) {
    sleeping.woken = true;
    // Thunder: awake again in the same night, and the lightning strikes soon after.
    if (sleeping.wakes) {
      stormWoken = true;
      setTimeout(() => tell('think.thunder'), FADE.hold + FADE.in);
      setTimeout(() => (strikeNow = true), FADE.hold + FADE.in + 2500);
    } else morning(sleeping.fainted);
  }
  if (e < FADE.out + FADE.hold) return 1;
  if (e < FADE.out + FADE.hold + FADE.in) return 1 - (e - FADE.out - FADE.hold) / FADE.in;
  sleeping = null;
  return 0;
}

function tintAt(time: number): Tint {
  const { phase, k } = phaseAt(time);
  if (phase === 'day') return TINTS.day;
  if (phase === 'sunset') return mixTint(TINTS.day, TINTS.sunset, k);
  if (phase === 'dusk') return along([TINTS.sunset, TINTS.dusk, TINTS.night], k);
  return TINTS.night;
}

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

/** The lightning strike being drawn, for the few seconds its bolt and burst last. */
let strikeFx: Strike | null = null;
const sparks = new Sparks();
let last = performance.now();
function frame(ms: number): void {
  const dt = Math.min(0.1, (ms - last) / 1000);
  last = ms;
  view.update(dt);
  // Sleep fades out and back in; setting sail fades out for good.
  const fade = ended ? Math.min(1, (ms - ended) / END_FADE) : fadeAt(ms);

  if (!paused && !sleeping && !ended && !telling()) {
    time += dt * SPEED * fast;
    Object.assign(game, drain(game, dt * SPEED * fast));
    warnOnce('think.hungry', game.hunger < LOW);
    warnOnce('think.tired', game.energy < LOW);
    dayPlan(game.day).events?.forEach((e, n) => {
      if (time >= e.at * 60 && !done.has(n)) done.add(n), happen(e);
    });
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
    if (target.pick && Math.hypot(goal.i - actor.i, goal.j - actor.j) < ('crab' in target.pick ? 0.12 : REACH)) {
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

  swim(world.fish, world.floor, dt, fishRandom);
  // After sunset the crabs come out of the sand, one every few seconds.
  // Only the wind drives them up the beach.
  if (!paused && !sleeping && kindNow() === 'windy' && (phaseAt(time).phase === 'dusk' || phaseAt(time).phase === 'night') && crabsOut < CRAB_NIGHT && fishRandom() < dt / 3) {
    const c = spawnCrab(world, fishRandom);
    if (c) crabs.push(c);
    crabsOut++;
  }
  scuttle(crabs, world, paused ? 0 : dt, fishRandom, sleeping ? null : actor);
  const weather = weatherAt(game.day, time, weatherCheat);
  world.setWeather(weather);
  // The storm's first bright flash is the one that strikes: a bolt into the palm, its crown bursting.
  const flashNow = flashAt(ms, weather);
  // A planned strike (days.json) comes in any weather, with a flash of its own.
  const planned = strikeNow;
  strikeNow = false;
  const striking = game.struck === null && !paused && !sleeping && (planned || (stormWoken && weather.storm > 0.9 && flashNow >= 1));
  if (striking) strike();
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
  const things: Thing[] = [
    ...plants, ...world.itemThings(), ...game.coconuts.map(coconutThing), ...game.wood.map((w) => woodThing(at(w))), ...game.stones.map((s) => stoneThing(at(s))),
    ...game.lying.map((l) => LYING[l.item](at(l))), ...game.builds.filter((b) => b.kind === 'raft').map((b) => raftThing(b.stage, at(b))), ...world.buildingThings(actor),
    ...game.fires.map((f) => campfireThing(at(f), ms)), ...crabs.map((c) => crabThing(world, c, ms)), actor.thing(world, ms), ...actor.dropThings(),
  ];
  const rect = view.rect();
  const image = world.compose(rect, things, undefined, false, ms);
  if (game.struck !== null || game.fires.length || hand === 'fire') sparks.spawn(image, rect, ms, paused ? 0 : dt);
  light(image, overcast(weather));
  // A flash lights the world as bright as day for a moment, at night too, then shows it stark.
  const flash = (striking ? 1 : flashNow) * (1 - fade);
  const tint = tintAt(time);
  light(image, { ...tint, amount: tint.amount * (1 - flash) }, fade);
  lightning(image, flash);
  sparks.draw(image, rect, ms);
  strikeFx?.draw(image, rect, ms);
  if (strikeFx?.done(ms)) strikeFx = null;
  warnOnce('think.rainStarts', weather.rain > 0.4 && kindOf(game.day) !== 'rain' && kindOf(game.day) !== 'storm' && !weatherCheat);
  view.show(image);

  // The page around the picture.
  const { phase } = phaseAt(time);
  status.draw(t('day', { n: game.day }), phase === 'day' ? 'sun' : phase === 'night' ? 'moon' : 'dusk', game.hunger, game.energy, LOW);
  sleepButton.hidden = phase === 'day' || !!ended;
  for (const k of BUILD_KINDS) buildButtons[k].hidden = !!ended || !buildable(k);
  sailButton.hidden = !!ended || !canSail();
  veil.style.opacity = String(fade);
  if (fade >= 1 && veilDay !== game.day && !ended) {
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
