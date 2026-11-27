import './style.css';
import { ANIMAL_H, ANIMAL_ORIGIN, ANIMAL_STORE, ANIMAL_W, CLIPS, drawAnimal, savedAnimals, type AnimalSprite, type ClipId } from '../engine/animals/animal.ts';
import { loadRoster, lookOf, outfitLook, pickCharacter } from '../engine/character/character.ts';
import { writeStore } from '../shared/files.ts';
import { presetById } from '../engine/animals/animal-presets.ts';
import { drawObject, LOOP_FRAMES, LOOP_RATE, OBJECT_H, OBJECT_ORIGIN, OBJECT_STORE, OBJECT_W, savedProps, type ObjectSprite, type Turn } from '../engine/objects/object.ts';
import { objectPresetById } from '../engine/objects/object-presets.ts';
import { drawPlant, FRAMES, grow, type Raster } from '../engine/flora/flora.ts';
import { FLORA } from '../engine/flora/flora-catalog.ts';
import { middleOf, paintIsland, scatter, stamp, type Pixels, type Thing } from '../engine/world/island.ts';
import { AUTHORED, type Clip } from '../engine/core/poses.ts';
import { CHARACTER_ORIGIN, drawCharacter, SPRITE_H, SPRITE_W, type Facing, type Look, type Sprite } from '../engine/core/puppet.ts';
import { generateIsland, renderTerrain } from '../engine/world/terrain.ts';
import { h, topBar, word, type ToolId } from '../shared/shell.ts';
import { currentLang } from '../shared/lang.ts';
import { trimmed } from '../shared/pixels.ts';
import { propKind, propPicture } from '../engine/world/prop.ts';
import { createHeightMap } from '../engine/world/terrain.ts';
import { BuildingView, edgeKey, emptyBuilding } from '../engine/world/building/building.ts';
import { edgeKindOf, wallKinds } from '../engine/world/building/walls.ts';
import { BUILT_IN, ParticlePreview, particleSystem } from '../engine/world/particles.ts';

// The start page of the published site: what the tools are, each with a small live picture
// drawn by the same code as the tool itself.

const en = {
  'title': 'Pixel Art',
  'lede': 'Tools for a small pixel-art game about surviving on an island. A language model writes the content as short descriptions; rules draw everything in one style, with variants, animation and wear. People only review and touch up.',
  'tools': 'Tools',
  'wardrobe.short': 'Dress up a castaway.',
  'animals.short': 'Make your own animal.',
  'objects.short': 'Build furniture and cars.',
  'flora.short': 'Grow palms and cacti.',
  'scene.short': 'Shape an island.',
  'props.short': 'Find any prop, freeze it, polish its pixels.',
  'walls.short': 'Walls for huts, painted over by hand.',
  'particles.short': 'Sparks and the glow round a fire.',
  'parts.short': 'Touch up hats, hair and clothes.',
  'things': 'My things',
  'things.note': 'Pick up where you left off.',
  'things.none': 'Things you make show up here.',
  'note': 'All tools are in English and German and keep your changes in this browser.',
  'pause': 'Pause',
  'play': 'Play',
};
type Key = keyof typeof en;
const de: Record<Key, string> = {
  'title': 'Pixel Art',
  'lede': 'Werkzeuge für ein kleines Pixel-Art-Spiel über das Überleben auf einer Insel. Ein Sprachmodell schreibt die Inhalte als kurze Beschreibungen; Regeln zeichnen alles in einem Stil, mit Varianten, Animation und Abnutzung. Menschen prüfen nur noch und bessern nach.',
  'tools': 'Werkzeuge',
  'wardrobe.short': 'Zieh eine Figur an.',
  'animals.short': 'Mach dein eigenes Tier.',
  'objects.short': 'Baue Möbel und Autos.',
  'flora.short': 'Lass Palmen wachsen.',
  'scene.short': 'Forme eine Insel.',
  'props.short': 'Finde jede Requisite, friere sie ein, poliere ihre Pixel.',
  'walls.short': 'Wände für Hütten, von Hand übermalt.',
  'particles.short': 'Funken und der Schein eines Feuers.',
  'parts.short': 'Bessere Hüte, Haare und Kleidung nach.',
  'things': 'Meine Sachen',
  'things.note': 'Mach weiter, wo du warst.',
  'things.none': 'Was du machst, erscheint hier.',
  'note': 'Alle Werkzeuge gibt es auf Deutsch und Englisch; deine Änderungen bleiben in diesem Browser gespeichert.',
  'pause': 'Anhalten',
  'play': 'Abspielen',
};
const t = (key: Key) => (currentLang() === 'de' ? de : en)[key];


// ------------------------------------------------------------------ the castaways

/** Three castaways at three stages of their stay, each doing something. */
const CAST: { look: Look; clip: Clip; facing: Facing; x: number }[] = [
  { look: outfitLook('skinA', 'hairRed', 'smile', 0, ['recipe-hair-tied-0', 'recipe-tops-0', 'recipe-shorts-0', 'recipe-footwear-5']), clip: AUTHORED.wave, facing: 0, x: 0 },
  { look: outfitLook('skinC', 'hairBlack', 'happy', 2, ['recipe-everyday-0', 'sprite-everyday-bottoms-0', 'sprite-hat-2']), clip: AUTHORED.walk, facing: 0, x: 40 },
  { look: outfitLook('skinD', 'hairBlack', 'neutral', 3, ['sprite-beard-0', 'recipe-shirt-1', 'recipe-bottoms-4', 'recipe-spear-0']), clip: AUTHORED.idle, facing: 1, x: 80 },
];
const CAST_SIZE = { w: 144, h: 60 };
const castFrames = new Map<string, Sprite>();
function castAt(ms: number): Pixels {
  const image: Pixels = { data: new Uint8ClampedArray(CAST_SIZE.w * CAST_SIZE.h * 4), width: CAST_SIZE.w, height: CAST_SIZE.h };
  CAST.forEach((c, n) => {
    const i = Math.floor((ms / 1000) * c.clip.rate) % c.clip.frames.length;
    const key = `${n}|${i}`;
    let sprite = castFrames.get(key);
    if (!sprite) castFrames.set(key, (sprite = drawCharacter(c.look, c.clip.frames[i], c.facing, { face: c.clip.faces?.[i], swing: c.clip.swing })));
    stamp(image, sprite, SPRITE_W, SPRITE_H, c.x, 0);
  });
  return image;
}

// ------------------------------------------------------------------ the animals

/** Four of the animal presets on the move. `x` is where each stands on the ground row. */
const HERD: { id: string; clip: ClipId; facing: Facing; x: number }[] = [
  { id: 'rabbit', clip: 'run', facing: 0, x: 22 },
  { id: 'fox', clip: 'walk', facing: 0, x: 52 },
  { id: 'pig', clip: 'idle', facing: 1, x: 86 },
  { id: 'elephant', clip: 'walk', facing: 1, x: 136 },
];
const HERD_SIZE = { w: 168, h: 60, ground: 54 };
const herdFrames = new Map<string, AnimalSprite>();
function herdAt(ms: number): Pixels {
  const image: Pixels = { data: new Uint8ClampedArray(HERD_SIZE.w * HERD_SIZE.h * 4), width: HERD_SIZE.w, height: HERD_SIZE.h };
  for (const c of HERD) {
    const clip = CLIPS[c.clip];
    const i = Math.floor((ms / 1000) * clip.rate) % clip.frames;
    const key = `${c.id}|${i}`;
    let sprite = herdFrames.get(key);
    if (!sprite) herdFrames.set(key, (sprite = drawAnimal(presetById(c.id)!.animal, c.clip, i, c.facing).sprite));
    stamp(image, sprite, ANIMAL_W, ANIMAL_H, c.x - ANIMAL_ORIGIN.x, HERD_SIZE.ground - ANIMAL_ORIGIN.y);
  }
  return image;
}

// ------------------------------------------------------------------ the objects

/** A few of the object presets in a row, the fountain running. */
const SET: { id: string; turn: Turn; x: number }[] = [
  { id: 'car', turn: 1, x: 26 },
  { id: 'fountain', turn: 0, x: 76 },
  { id: 'examTable', turn: 0, x: 124 },
  { id: 'plant', turn: 0, x: 152 },
];
const SET_SIZE = { w: 172, h: 60, ground: 50 };
const setFrames = new Map<string, ObjectSprite>();
function setAt(ms: number): Pixels {
  const image: Pixels = { data: new Uint8ClampedArray(SET_SIZE.w * SET_SIZE.h * 4), width: SET_SIZE.w, height: SET_SIZE.h };
  const i = Math.floor((ms / 1000) * LOOP_RATE) % LOOP_FRAMES;
  for (const c of SET) {
    const key = `${c.id}|${i}`;
    let sprite = setFrames.get(key);
    if (!sprite) setFrames.set(key, (sprite = drawObject(objectPresetById(c.id)!.prop, c.turn, i).sprite));
    stamp(image, sprite, OBJECT_W, OBJECT_H, c.x - OBJECT_ORIGIN.x, SET_SIZE.ground - OBJECT_ORIGIN.y);
  }
  return image;
}

// ------------------------------------------------------------------ a small island

const islander = outfitLook('skinB', 'hairBrown', 'happy', 1, ['recipe-everyday-1', 'recipe-shorts-1', 'recipe-footwear-6']);

/** A small island with plants and one person on it, doing `clip`. One for the flora card, one for the scene editor's. */
function smallIsland(seed: number, clip: Clip, facing: Facing) {
  const cells = 7;
  const map = generateIsland(seed, cells, cells, { land: 1.15, peak: 4 });
  const ground = renderTerrain(map, { w: cells * 32, h: cells * 16 + 104, origin: { x: cells * 16, y: 94 } });
  const person = middleOf(map);
  const pool = FLORA.filter((e) => e.category !== 'cactus');
  const plants = scatter(map, pool.flatMap((e) => (e.category === 'grass' || e.category === 'palm' ? [e, e, e] : [e])), 9, seed, person).map((p) => ({
    spot: p,
    grown: grow(p.item.plant, { seed: p.seed, size: p.scale }),
    frames: [] as Raster[],
  }));
  const sprites = new Map<number, Sprite>();
  return {
    ground,
    at(ms: number, frame: number): Pixels {
      const things: Thing[] = plants.map((p) => {
        const raster = (p.frames[frame] ??= drawPlant(p.grown, { frame, wind: 1 }));
        return { spot: p.spot, picture: raster, w: raster.w, h: raster.h, foot: raster.origin };
      });
      const i = Math.floor((ms / 1000) * clip.rate) % clip.frames.length;
      let sprite = sprites.get(i);
      if (!sprite) sprites.set(i, (sprite = drawCharacter(islander, clip.frames[i], facing, { face: clip.faces?.[i] })));
      things.push({ spot: person, picture: sprite, w: SPRITE_W, h: SPRITE_H, foot: CHARACTER_ORIGIN });
      return paintIsland(map, ground, things);
    },
  };
}
const floraIsle = smallIsland(4, AUTHORED.idle, 0);

// ------------------------------------------------------------------ props, walls and parts

/** Pictures standing in a row on one ground line. */
function row(pictures: { get(x: number, y: number): string | null; w: number; h: number; foot: { x: number; y: number } }[], xs: number[], size: { w: number; h: number; ground: number }): Pixels {
  const image: Pixels = { data: new Uint8ClampedArray(size.w * size.h * 4), width: size.w, height: size.h };
  pictures.forEach((p, k) => stamp(image, p, p.w, p.h, xs[k] - p.foot.x, size.ground - p.foot.y));
  return image;
}
const PROP_ROW = ['plant-palms-1', 'object:crate', 'decor:starfish-orange', 'object:fountain'];
const PROPS_SIZE = { w: 172, h: 70, ground: 62 };
function propsAt(frame: number): Pixels {
  const kinds = PROP_ROW.map((id) => propKind(id)).filter((k) => !!k);
  const pictures = kinds.map((k, n) => propPicture(k!, n % 2 ? 1 : 0, frame, 1)).filter((p) => !!p);
  return row(pictures as NonNullable<ReturnType<typeof propPicture>>[], [30, 82, 112, 142], PROPS_SIZE);
}
/** A little hut of the first wall, standing on nothing: the card's sand is the ground. */
function wallsPicture(): Pixels {
  const map = createHeightMap(8, 8, 1);
  const site = { map, ground: renderTerrain(map) };
  const wall = wallKinds()[0];
  const b = emptyBuilding(wall.height);
  const add = (axis: 'H' | 'V', i: number, j: number) => b.edges.set(edgeKey({ axis, i, j }), { kind: 'w', edge: { axis, i, j } });
  add('H', 3, 3); add('H', 4, 3); add('H', 3, 5);
  for (let j = 3; j <= 4; j++) { add('V', 3, j); add('V', 5, j); }
  const parts = new BuildingView({ w: edgeKindOf(wall) }, site).parts(b).sort((p, q) => p.key - q.key);
  const x0 = Math.min(...parts.map((p) => p.x)), y0 = Math.min(...parts.map((p) => p.y));
  const w = Math.max(...parts.map((p) => p.x + p.w)) - x0, h = Math.max(...parts.map((p) => p.y + p.h)) - y0;
  const image: Pixels = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  for (const p of parts) for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const k = (y * p.w + x) * 4;
    if (!p.rgba[k + 3]) continue;
    const o = ((p.y - y0 + y) * w + p.x - x0 + x) * 4;
    for (let c = 0; c < 4; c++) image.data[o + c] = p.rgba[k + c];
  }
  return image;
}
const PARTS_SIZE = { w: 172, h: 60, ground: 54 };
const PARTS_CAST = [
  outfitLook('skinD', 'hairBlack', 'happy', 0, ['recipe-everyday-hats-1']),
  outfitLook('skinA', 'hairRed', 'smile', 0, ['sprite-bandana-0', 'recipe-tops-0']),
  outfitLook('skinC', 'hairBlond', 'happy', 0, ['sprite-hat-2', 'recipe-everyday-0']),
];
function partsPicture(): Pixels {
  const sprites = PARTS_CAST.map((look, n) => drawCharacter(look, AUTHORED.idle.frames[0], ([4, 0, 1] as Facing[])[n]));
  return row(sprites.map((s) => ({ get: (x: number, y: number) => s.get(x, y), w: SPRITE_W, h: SPRITE_H, foot: CHARACTER_ORIGIN })), [46, 86, 126], PARTS_SIZE);
}
const sceneIsle = smallIsland(11, AUTHORED.wave, 1);

// ------------------------------------------------------------------ page

const castCanvas = h('canvas', { class: 'tool__canvas', width: String(CAST_SIZE.w), height: String(CAST_SIZE.h) });
const herdCanvas = h('canvas', { class: 'tool__canvas', width: String(HERD_SIZE.w), height: String(HERD_SIZE.h) });
const setCanvas = h('canvas', { class: 'tool__canvas', width: String(SET_SIZE.w), height: String(SET_SIZE.h) });
const islandCanvas = h('canvas', { class: 'tool__canvas', width: String(floraIsle.ground.w), height: String(floraIsle.ground.h) });
const sceneCanvas = h('canvas', { class: 'tool__canvas', width: String(sceneIsle.ground.w), height: String(sceneIsle.ground.h) });
const propsCanvas = h('canvas', { class: 'tool__canvas', width: String(PROPS_SIZE.w), height: String(PROPS_SIZE.h) });
const wallsImage = wallsPicture();
const wallsCanvas = h('canvas', { class: 'tool__canvas', width: String(wallsImage.width), height: String(wallsImage.height) });
const partsCanvas = h('canvas', { class: 'tool__canvas', width: String(PARTS_SIZE.w), height: String(PARTS_SIZE.h) });
/** Sparks off a flame at night, the halo lighting the ground: a game's campfire if it has one, else the engine's sparks. */
const sparksPreview = new ParticlePreview(64, 48);
const sparksCanvas = h('canvas', { class: 'tool__canvas', width: '64', height: '48' });
const sparksAt = (ms: number) => sparksPreview.frame(particleSystem('campfire') ?? BUILT_IN[0], ms, { on: 'flame', night: true });

function paint(canvas: HTMLCanvasElement, image: Pixels): void {
  canvas.getContext('2d')!.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
}

let paused = false;

function card(tool: ToolId, href: string, picture: HTMLElement, kind: string): HTMLElement {
  return h('a', { class: 'tile', href },
    h('span', { class: `tile__picture tile__picture--${kind}` }, picture),
    h('span', { class: 'tile__cap' },
      h('span', {}, h('b', {}, word(tool)), h('span', {}, t(`${tool}.short` as Key))),
      h('span', { class: 'tile__go', 'aria-hidden': 'true' }, '→'),
    ),
  );
}

// ------------------------------------------------------------------ my things

/** Something made in a tool. `pick` makes it the one the tool opens on. */
interface Made { name: string; tool: ToolId; href: string; pick: () => void; picture: HTMLCanvasElement }
/** The size of a thing's picture on its card, and how many things are shown. */
const THING_BOX = 72;
const SHOWN = 12;
/** The newest few from every tool, newest last in each list, shown newest first. */
function madeThings(): Made[] {
  // At most twelve are shown, so no list needs more than its newest twelve drawn.
  const people: Made[] = loadRoster().slice(-SHOWN).map((c) => {
    const sprite = drawCharacter(lookOf(c.state), AUTHORED.idle.frames[0], 0);
    return { name: c.name, tool: 'wardrobe', href: './tools/wardrobe/', pick: () => pickCharacter(c.id), picture: trimmed(sprite, SPRITE_W, SPRITE_H, THING_BOX) };
  });
  const animals: Made[] = savedAnimals().slice(-SHOWN).map((s) => {
    const { sprite } = drawAnimal(s.animal, 'idle', 0, 0);
    return { name: s.name, tool: 'animals', href: './tools/animals/', pick: () => writeStore(ANIMAL_STORE.current, s.id), picture: trimmed(sprite, ANIMAL_W, ANIMAL_H, THING_BOX) };
  });
  const objects: Made[] = savedProps().slice(-SHOWN).map((s) => {
    const { sprite } = drawObject(s.prop, 0);
    return { name: s.name, tool: 'objects', href: './tools/objects/', pick: () => writeStore(OBJECT_STORE.current, s.id), picture: trimmed(sprite, OBJECT_W, OBJECT_H, THING_BOX) };
  });
  const out: Made[] = [];
  for (let i = 1; out.length < SHOWN && i <= Math.max(people.length, animals.length, objects.length); i++) {
    for (const l of [people, animals, objects]) if (l.length >= i) out.push(l[l.length - i]);
  }
  return out.slice(0, SHOWN);
}
let made: Made[] | null = null;

function thingsRow(): HTMLElement {
  made ??= madeThings();
  if (!made.length) return h('p', { class: 'note' }, t('things.none'));
  return h('div', { class: 'things' }, ...made.map((m) => {
    const a = h('a', { class: 'card', href: m.href },
      h('span', { class: 'card__picture' }, m.picture),
      h('span', { class: 'card__label' }, m.name),
      h('span', { class: 'card__label', style: 'font-weight: 500; opacity: .7' }, word(m.tool)));
    // Opening it picks it in its tool.
    a.addEventListener('click', m.pick);
    return a;
  }));
}

function mount(): void {
  document.documentElement.lang = currentLang();
  document.title = t('title');
  const { bar, pops } = topBar({
    tool: 'home',
    title: t('title'),
    about: [t('lede'), t('note')],
    // The pictures move even with reduced motion (they show what the tools animate); this stops them.
    more: [{ label: t(paused ? 'play' : 'pause'), icon: 'pause', run: () => {
      paused = !paused;
      mount();
    } }],
    status: h('span', { class: 'bar__status' }),
    relabel: mount,
  });
  document.getElementById('home')!.replaceChildren(
    h('div', { class: 'shell' },
      bar, ...pops,
      h('main', { class: 'home' },
        h('section', { class: 'tiles', 'aria-label': t('tools') },
          card('wardrobe', './tools/wardrobe/', castCanvas, 'cast'),
          card('parts', './tools/parts/', partsCanvas, 'cast'),
          card('animals', './tools/animals/', herdCanvas, 'cast'),
          card('props', './tools/props/', propsCanvas, 'cast'),
          card('objects', './tools/objects/', setCanvas, 'cast'),
          card('flora', './tools/flora/', islandCanvas, 'island'),
          card('walls', './tools/walls/', wallsCanvas, 'cast'),
          card('particles', './tools/particles/', sparksCanvas, 'cast'),
          card('scene', './tools/scene/', sceneCanvas, 'island'),
        ),
        h('section', { class: 'mine', 'aria-label': t('things') },
          h('div', { class: 'mine__head' }, h('h2', {}, t('things')), h('p', {}, t('things.note'))),
          thingsRow(),
        ),
      ),
    ),
  );
  fit();
}

/** Whole-number enlargement that fits the card, so the pixels stay square. */
function fit(): void {
  for (const canvas of [castCanvas, herdCanvas, setCanvas, islandCanvas, sceneCanvas, sparksCanvas]) {
    const box = canvas.parentElement;
    if (!box) continue;
    const room = box.clientWidth - 16;
    const scale = Math.max(1, Math.min(3, Math.floor(room / canvas.width)));
    canvas.style.width = `${canvas.width * scale}px`;
    canvas.style.height = `${canvas.height * scale}px`;
  }
}

mount();
window.addEventListener('resize', fit);

let shown = '';
let time = 0;
const tick = (ms: number) => {
  if (!paused) time = ms;
  // Sparks move every frame.
  if (!paused) paint(sparksCanvas, sparksAt(time));
  const frame = Math.floor((time / 1000) * 6) % FRAMES;
  const key = `${frame}|${Math.floor((time / 1000) * 10)}`;
  if (key !== shown) {
    shown = key;
    paint(castCanvas, castAt(time));
    paint(herdCanvas, herdAt(time));
    paint(setCanvas, setAt(time));
    paint(islandCanvas, floraIsle.at(time, frame));
    paint(sceneCanvas, sceneIsle.at(time, frame));
    paint(propsCanvas, propsAt(frame));
  }
  requestAnimationFrame(tick);
};
paint(wallsCanvas, wallsImage);
paint(partsCanvas, partsPicture());
requestAnimationFrame(tick);
document.body.dataset.ready = '1';
