// Pixel Island, milestone 1: one day on the island. Tap to walk, pick up coconuts and eat them,
// watch the sun set, get tired, sleep, wake to what the sea brought.
import './style.css';
import { defaultState, lookOf } from '@pixel/engine/character/character.ts';
import type { Mood } from '@pixel/engine/character/base.ts';
import { FRAMES } from '@pixel/engine/flora/flora.ts';
import { Actor } from '@pixel/engine/world/actor.ts';
import { along, light, mixTint, TINTS, type Tint } from '@pixel/engine/world/daylight.ts';
import { flashAt, overcast } from '@pixel/engine/world/weather.ts';
import { foggy, KINDS, kindOf, weatherAt, type Forced } from './weather.ts';
import type { Picture } from '@pixel/engine/world/island.ts';
import { levelAt, SEA_LEVEL, standingHeight, surfaceAt } from '@pixel/engine/world/terrain.ts';
import { World, type Thing } from '@pixel/engine/world/world.ts';
import type { PlacedItem } from '@pixel/engine/world/props.ts';
import { Viewport } from '@pixel/shared/viewport.ts';
import { findPath } from '@pixel/engine/world/path.ts';
import { spawnFish, swim } from '@pixel/engine/world/fish.ts';
import { rng } from '@pixel/shared/random.ts';
import { COCONUT, DAY_S, drain, DUSK_S, faints, LOW, phaseAt, speedOf, SUNSET_S, wake } from './clock.ts';
import { C, hud, pixelButton, S, slot } from './ui.ts';
import { label, speechBubble } from '@pixel/shared/pixel-ui.ts';
import { firstIsland } from './island.ts';
import { BAG_SLOTS, clearGame, loadGame, saveGame, type Game } from './save.ts';
import { t, type Key } from './i18n.ts';
import { currentLang, LANGS, setLang } from '@pixel/shared/lang.ts';
import { cheatDrawer } from '@pixel/shared/cheats.ts';

const params = new URLSearchParams(location.search);
/** Debug: `?speed=20` runs the game clock 20 times faster. */
const SPEED = Math.max(0.1, Number(params.get('speed')) || 1);
/** How near the survivor must come to pick something up, in metres. */
const REACH = 0.7;
const FADE = { out: 1200, hold: 1000, in: 1200 };

// ------------------------------------------------------------------ the world

const scene = firstIsland();
const world = new World(scene);
const fishRandom = rng(Date.now());
world.fish = spawnFish(world.floor, 7, fishRandom);
const palms = scene.plants;

function newGame(): Game {
  const g: Game = { day: 1, hunger: 0.8, energy: 1, bag: [], coconuts: [], items: [], at: { ...scene.spawn } };
  for (let n = 0; n < 2; n++) dropCoconuts(g);
  return g;
}

/** Each palm drops a coconut near its foot, up to three lying under it. */
function dropCoconuts(g: Game): void {
  for (const p of palms) {
    if (g.coconuts.filter((c) => Math.hypot(c.i - p.i, c.j - p.j) < 1.8).length >= 3) continue;
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.7 + Math.random() * 0.6;
      const c = { i: p.i + Math.cos(a) * r, j: p.j + Math.sin(a) * r };
      if (dry(c) && !palms.some((q) => Math.hypot(q.i - c.i, q.j - c.j) < 0.6)) {
        g.coconuts.push(c);
        break;
      }
    }
  }
}

const dry = (p: { i: number; j: number }) =>
  p.i >= 0 && p.j >= 0 && p.i < scene.w && p.j < scene.h && levelAt(world.map, Math.floor(p.i), Math.floor(p.j)) >= SEA_LEVEL;

/** What the sea brings in the morning: fixed things on fixed days. */
const WASH_UPS: Record<number, PlacedItem['item']> = { 2: 'crate' };
function washUp(g: Game, extra?: PlacedItem['item']): boolean {
  const item = extra ?? WASH_UPS[g.day];
  if (!item) return false;
  const beach: { i: number; j: number }[] = [];
  for (let j = 0; j < scene.h; j++) for (let i = 0; i < scene.w; i++) if (surfaceAt(world.map, i, j) === 'beach') beach.push({ i: i + 0.5, j: j + 0.5 });
  if (!beach.length) return false;
  g.items.push({ item, ...beach[Math.floor(Math.random() * beach.length)] });
  return true;
}

const saved = params.has('new') ? null : loadGame(scene.w);
let game = saved ?? newGame();
/** Game seconds since the morning. Every load starts in the morning, since the game is saved on waking. */
let time = 0;
world.loose = game.items;
const actor = new Actor(lookOf(defaultState()), game.at);
/** How happy the survivor is, 0 to 1: fed and rested. Their face shows it. */
const happiness = () => game.hunger * game.energy;
const moodOf = (h: number): Mood => (h >= 0.75 ? 'happy' : h >= 0.5 ? 'smile' : h >= 0.25 ? 'neutral' : 'sad');
let mood: Mood | null = null;
/** Draws the survivor with the face their happiness gives, when it changes. */
function feel(): void {
  const next = moodOf(happiness());
  if (next === mood) return;
  mood = next;
  actor.setLook(lookOf({ ...defaultState(), mood }));
}
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

type Pick = { coconut: { i: number; j: number } } | { item: PlacedItem };
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
buttons.append(
  pixelButton(t('zoomIn'), { icon: 'zoomIn' }, () => view.step(1)),
  pixelButton(t('zoomOut'), { icon: 'zoomOut' }, () => view.step(-1)),
  pixelButton(t('menu'), { icon: 'menu' }, () => setPaused(true)),
  sleepButton,
);

const bag = el('div', 'bag');
bag.setAttribute('aria-label', t('bag'));
function showBag(): void {
  bag.replaceChildren(...Array.from({ length: BAG_SLOTS }, (_, n) => {
    const item = game.bag[n];
    const b = el('button', 'pbtn');
    b.append(slot(item === 'coconut' ? { rows: COCO_ROWS, colors: COCO_COLORS } : null));
    if (item === 'coconut') {
      b.setAttribute('aria-label', t('eat'));
      b.title = t('eat');
      b.addEventListener('click', () => eat(n));
    } else b.disabled = true;
    return b;
  }));
}

const bubble = el('div', 'bubble');
bubble.hidden = true;
let bubbleUntil = 0;
function think(key: Key): void {
  bubble.replaceChildren(speechBubble(t(key), C, S));
  bubble.setAttribute('aria-label', t(key));
  bubble.hidden = false;
  bubbleUntil = performance.now() + 4000;
  actor.talkUntil = bubbleUntil;
}

const veil = el('div', 'veil');
const flash = el('div', 'flash');
let veilDay = 0;
function startNew(): void {
  clearGame();
  game = newGame();
  world.loose = game.items;
  Object.assign(actor, game.at);
  centerOn(actor);
  time = 0;
  saveGame(game);
  showBag();
}

// The menu, which is also the pause: the name, play on or start over, and before the first step the language.
const menuBox = el('div', 'menu');
/** Whether the player has played since the page loaded. */
let started = false;
function play(fresh: boolean): void {
  if (fresh) startNew();
  setPaused(false);
  if (fresh || (!started && game.day === 1)) think('think.first');
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
    ...(saved || started ? [pixelButton(t('continue'), { words: t('continue') }, () => play(false))] : []),
    pixelButton(t('newGame'), { words: t('newGame') }, () => play(true)),
    // The page is built in one language, so a change reloads it; offered only before playing, when that loses nothing.
    ...(started ? [] : [flags()]),
  );
}

app.append(hudBox, buttons, bag, bubble, flash, veil, menuBox);
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
    cheat('SUNSET', () => (time = DAY_S - SUNSET_S)),
    cheat('NIGHT', () => (time = DAY_S + DUSK_S)),
    cheat('MORNING', () => sleep(false, true)),
    cheat('X10', () => (fast = fast === 1 ? 10 : 1)),
    {
      words: 'WEATHER',
      more: [
        cheat('AUTO', () => (weatherCheat = undefined)),
        ...[...KINDS, 'fog' as const].map((k) => cheat(k.toUpperCase(), () => {
          weatherCheat = k;
          think(`think.${k === 'sunny' ? 'morning' : k}`);
        })),
      ],
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
let sleeping: { start: number; fainted: boolean; woken: boolean } | null = null;

function press(p: { x: number; y: number }, start: boolean): void {
  if (paused || sleeping) return;
  if (start) {
    const c = game.coconuts.find((c) => near(p, c, 5, 2));
    if (c) return goTo(c, false, { coconut: c });
    const it = game.items.find((it) => near(p, it, 9, 7));
    // A crate blocks the way, so the goal is the near side of it.
    if (it) {
      const d = Math.hypot(actor.i - it.i, actor.j - it.j) || 1;
      return goTo({ i: it.i + ((actor.i - it.i) / d) * 0.5, j: it.j + ((actor.j - it.j) / d) * 0.5 }, false, { item: it });
    }
  }
  if (target?.pick) return;
  const tile = world.tileAt(p.x, p.y);
  if (!tile) return;
  const far = Math.hypot(tile.i + 0.5 - actor.i, tile.j + 0.5 - actor.j) > 4;
  goTo({ i: tile.i + 0.5, j: tile.j + 0.5 }, far && speedOf(game) === 1);
}

/** Whether a ground pixel is within `r` pixels of a map point's picture, centred `up` pixels above its foot. */
function near(p: { x: number; y: number }, at: { i: number; j: number }, r: number, up: number): boolean {
  const s = world.screenOf(at.i, at.j);
  return Math.hypot(p.x - s.x, p.y - (s.y - up)) <= r;
}

function arrive(pick: Pick): void {
  if ('coconut' in pick) {
    if (game.bag.length >= BAG_SLOTS) return think('think.full');
    game.coconuts = game.coconuts.filter((c) => c !== pick.coconut);
    game.bag.push('coconut');
    showBag();
  } else think('think.crate');
}

function eat(slot: number): void {
  if (paused || sleeping) return;
  game.bag.splice(slot, 1);
  game.hunger = Math.min(1, game.hunger + COCONUT);
  showBag();
  think('think.yum');
}

function sleep(fainted: boolean, anywhere = false): void {
  if (sleeping) return;
  if (!fainted && !anywhere && !dry(actor)) return think('think.wet');
  target = null;
  bubble.hidden = true;
  sleeping = { start: performance.now(), fainted, woken: false };
}

/** The night is over: a new morning, rested, with what the palms dropped and the sea brought. Saved. */
function morning(fainted: boolean): void {
  Object.assign(game, wake(game, fainted));
  game.day++;
  time = 0;
  warned.clear();
  if (!dry(actor)) Object.assign(actor, world.nearestLand(actor.i, actor.j));
  game.at = { i: actor.i, j: actor.j };
  dropCoconuts(game);
  // Wind shakes more coconuts down; a storm leaves something on the beach.
  const kind = kindOf(game.day);
  if (kind === 'windy' || kind === 'storm') dropCoconuts(game);
  const washed = washUp(game) || (kindOf(game.day - 1) === 'storm' && washUp(game, 'crate'));
  saveGame(game);
  const mood: Key = foggy(game.day) ? 'think.fog' : kind === 'sunny' ? 'think.morning' : `think.${kind}`;
  setTimeout(() => think(washed ? 'think.washed' : mood), FADE.hold + FADE.in);
}

/** How dark the fade is now, and runs the morning at its darkest. */
function fadeAt(ms: number): number {
  if (!sleeping) return 0;
  const e = ms - sleeping.start;
  if (e < FADE.out) return e / FADE.out;
  if (!sleeping.woken) {
    sleeping.woken = true;
    morning(sleeping.fainted);
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

let last = performance.now();
function frame(ms: number): void {
  const dt = Math.min(0.1, (ms - last) / 1000);
  last = ms;
  view.update(dt);
  const fade = fadeAt(ms);

  if (!paused && !sleeping) {
    time += dt * SPEED * fast;
    Object.assign(game, drain(game, dt * SPEED * fast));
    warnOnce('think.hungry', game.hunger < LOW);
    warnOnce('think.tired', game.energy < LOW);
    if (faints(game)) {
      think('think.faint');
      sleep(true);
    }
  }
  feel();

  let di = 0;
  let dj = 0;
  let run = false;
  if (target && !paused && !sleeping) {
    if (target.way.length > 1 && Math.hypot(target.way[0].i - actor.i, target.way[0].j - actor.j) < 0.2) target.way.shift();
    const next = target.way[0];
    const goal = target.way[target.way.length - 1];
    di = next.i - actor.i;
    dj = next.j - actor.j;
    run = target.run;
    if (target.pick && Math.hypot(goal.i - actor.i, goal.j - actor.j) < REACH) {
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
  actor.update(world, paused ? 0 : dt * speedOf(game), di, dj, run, ms);
  // A target that cannot be reached is given up rather than walked against forever.
  if (target && before[0] === actor.i && before[1] === actor.j && !paused && !actor.rising) target = null;

  swim(world.fish, world.floor, dt, fishRandom);
  const weather = weatherAt(game.day, time, weatherCheat);
  world.setWeather(weather);
  const things: Thing[] = [...world.plantThings(Math.floor((ms / 1000) * 6) % FRAMES), ...world.itemThings(), ...game.coconuts.map(coconutThing), actor.thing(world, ms), ...actor.dropThings()];
  const image = world.compose(view.rect(), things, undefined, false, ms);
  light(image, overcast(weather));
  light(image, tintAt(time), fade);
  flash.style.opacity = String(0.7 * flashAt(ms, weather) * (1 - fade));
  warnOnce('think.rainStarts', weather.rain > 0.4 && kindOf(game.day) !== 'rain' && kindOf(game.day) !== 'storm' && !weatherCheat);
  view.show(image);

  // The page around the picture.
  const { phase } = phaseAt(time);
  status.draw(t('day', { n: game.day }), phase === 'day' ? 'sun' : phase === 'night' ? 'moon' : 'dusk', game.hunger, game.energy, LOW);
  sleepButton.hidden = phase === 'day';
  veil.style.opacity = String(fade);
  if (fade >= 1 && veilDay !== game.day) {
    veilDay = game.day;
    veil.replaceChildren(label(t('day', { n: game.day }), C.moon, S * 2));
  }
  if (!bubble.hidden && ms > bubbleUntil) bubble.hidden = true;
  if (!bubble.hidden) {
    const foot = world.screenOf(actor.i, actor.j);
    const s = view.toScreen(foot.x, foot.y);
    bubble.style.transform = `translate(${s.x}px, ${s.y - 46 * view.zoom}px) translate(-50%, -100%)`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
