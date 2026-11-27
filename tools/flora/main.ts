import './style.css';
import { box, filterToggles, tileGrid, library, section as pixelSection, choice, pixelButton, toast, toggle as pixelToggle, turnView, viewTools, workspace, type Library } from '../../ui/components.ts';
import { outfitLook } from '../../engine/character/character.ts';
import {
  CATEGORIES, colorChoices, drawPlant, FLORA_H, FLORA_ORIGIN, FLORA_W, FRAMES, grow, plantColors, Raster, recolorPlant, SIZE_MAX, SIZE_MIN, tryPlant, TURNS,
  type Category, type Grown, type Plant,
} from '../../engine/flora/flora.ts';
import { generateIsland, renderTerrain, type HeightMap, type TerrainImage } from '../../engine/world/terrain.ts';
import { castShadow, layShadow, middleOf, paintIsland, scatter, stamp, withSunShadow, type Scattered, type Spot, type Thing } from '../../engine/world/island.ts';
import { cleanSwap, FLORA, FLORA_CALLS, FLORA_REJECTED, FLORA_STORE, plantById, type PlantEntry } from '../../engine/flora/flora-catalog.ts';
import { PALETTE, type PaletteKey } from '../../engine/core/palette.ts';
import { AUTHORED } from '../../engine/core/poses.ts';
import { CHARACTER_ORIGIN as FEET, drawCharacter, SPRITE_H, SPRITE_W, type Sprite } from '../../engine/core/puppet.ts';
import { cheer, h, history, pick, row, savePicture, section, segmented, snapButton, tabs, tabTools, topBar, undoKeys, word, type IconName, rangeInput } from '../../shared/shell.ts';
import { currentLang } from '../../shared/lang.ts';
import { canSaveToProject, saveStores, storeTracker } from '../../shared/project.ts';
import { missingPlantNames, plantName, t, type Key } from './i18n.ts';

// ------------------------------------------------------------------ state

type Tab = 'all' | Category;
const TABS: Tab[] = ['all', ...CATEGORIES];
const WIND_ICON: Record<string, string> = { calm: 'sun', breeze: 'leaf', storm: 'storm' };
const WINDS = { calm: 0, breeze: 1, storm: 2.5 } as const;
type Wind = keyof typeof WINDS;
const GROUNDS = [
  { id: 'sand', color: '#e9d9a0', side: '#c9b077' },
  { id: 'grass', color: '#8fcf78', side: '#6c9f55' },
  { id: 'earth', color: '#b98f63', side: '#8d6a47' },
  { id: 'rock', color: '#aeaba3', side: '#86837c' },
] as const;
type Ground = (typeof GROUNDS)[number]['id'];
const DENSITY = { sparse: 12, medium: 24, dense: 40 } as const;
type Density = keyof typeof DENSITY;
const VARIANTS = 4;
/** Eighth turns, as plants are turned in the scene editor. */

interface State {
  selected: string;
  tab: Tab;
  seed: number;
  /** Eighth turns, 0 to 7. */
  turn: number;
  wind: Wind;
  /** 0 lush to 1 dried out. */
  dryness: number;
  /** Scales the plants: 1 is the size the recipe describes. */
  size: number;
  ground: Ground;
  person: boolean;
  density: Density;
  sceneSeed: number;
  /** Per plant: which of its own colours is replaced by which. */
  colors: Record<string, Partial<Record<PaletteKey, PaletteKey>>>;
  /** Per plant: the recipe as edited here, as text. */
  custom: Record<string, string>;
}

const STORAGE_KEY = FLORA_STORE;
function defaultState(): State {
  return {
    selected: FLORA.find((e) => e.category === 'palm')?.id ?? FLORA[0]?.id ?? '',
    tab: 'all', seed: 0, turn: 0, wind: 'breeze', dryness: 0, size: 1, ground: 'sand', person: true, density: 'medium', sceneSeed: 1,
    colors: {}, custom: {},
  };
}

function loadState(): State {
  const state = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<State> | null;
    if (!saved) return state;
    if (plantById(saved.selected)) state.selected = saved.selected!;
    if (TABS.includes(saved.tab as Tab)) state.tab = saved.tab!;
    if (Number.isInteger(saved.seed) && saved.seed! >= 0 && saved.seed! < VARIANTS) state.seed = saved.seed!;
    if (Number.isInteger(saved.turn) && saved.turn! >= 0 && saved.turn! < TURNS) state.turn = saved.turn!;
    if (saved.wind && saved.wind in WINDS) state.wind = saved.wind;
    if (typeof saved.dryness === 'number' && saved.dryness >= 0 && saved.dryness <= 1) state.dryness = saved.dryness;
    if (typeof saved.size === 'number' && saved.size >= SIZE_MIN && saved.size <= SIZE_MAX) state.size = saved.size;
    if (GROUNDS.some((g) => g.id === saved.ground)) state.ground = saved.ground!;
    if (typeof saved.person === 'boolean') state.person = saved.person;
    if (saved.density && saved.density in DENSITY) state.density = saved.density;
    if (Number.isInteger(saved.sceneSeed)) state.sceneSeed = saved.sceneSeed!;
    for (const [id, swap] of Object.entries(saved.colors ?? {})) {
      const clean = cleanSwap(swap);
      if (plantById(id) && Object.keys(clean).length) state.colors[id] = clean;
    }
    for (const [id, text] of Object.entries(saved.custom ?? {})) if (plantById(id) && typeof text === 'string') state.custom[id] = text;
  } catch {
    // Saved settings are a convenience; without storage the page starts from the defaults.
  }
  return state;
}

let state = loadState();
let version = 0;
function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private windows and embedded previews may refuse storage.
  }
}

// ------------------------------------------------------------------ plants

/** The recipe text shown in the editor: compact JSON, short lists kept on one line. */
function pretty(value: unknown, indent = ''): string {
  const flat = (v: unknown): string =>
    Array.isArray(v) ? `[${v.map(flat).join(', ')}]`
      : v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${flat(x)}`).join(', ')} }`
        : JSON.stringify(v);
  const one = flat(value);
  if (one.length + indent.length <= 92 || value === null || typeof value !== 'object') return one;
  const inner = indent + '  ';
  if (Array.isArray(value)) return `[\n${value.map((x) => inner + pretty(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(value).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${pretty(x, inner)}`).join(',\n')}\n${indent}}`;
}

interface Edited {
  text: string;
  plant: Plant | null;
  message: string;
  kind: 'ok' | 'warn' | 'error';
}
const edits = new Map<string, Edited>();

/** Reads an edited recipe. A broken one keeps the last plant that worked. */
function readRecipe(entry: PlantEntry, text: string): Edited {
  const known = edits.get(entry.id);
  if (known?.text === text) return known;
  let result: Edited;
  try {
    const parsed = tryPlant(JSON.parse(text));
    result = parsed.ok
      ? {
        text, plant: parsed.compiled.plant,
        message: parsed.compiled.repairs.length ? t('recipe.repaired', { list: parsed.compiled.repairs.join('; ') }) : t('recipe.ok'),
        kind: parsed.compiled.repairs.length ? 'warn' : 'ok',
      }
      : { text, plant: known?.plant ?? null, message: t('recipe.error', { error: parsed.error }), kind: 'error' };
  } catch (error) {
    result = { text, plant: known?.plant ?? null, message: t('recipe.json', { error: (error as Error).message }), kind: 'error' };
  }
  edits.set(entry.id, result);
  return result;
}

/** The plant as currently shown: the edited recipe if there is a working one, recoloured. */
function plantOf(entry: PlantEntry): Plant {
  const text = state.custom[entry.id];
  const base = text ? readRecipe(entry, text).plant ?? entry.plant : entry.plant;
  return recolorPlant(base, state.colors[entry.id] ?? {});
}

const grownCache = new Map<string, Grown>();
const rasterCache = new Map<string, Raster>();
const dryStep = (d: number) => Math.round(d * 20) / 20;
const sizeStep = (s: number) => Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(s * 20) / 20));

function grownOf(entry: PlantEntry, seed: number, dryness = state.dryness, size = state.size): { key: string; grown: Grown } {
  const key = `${entry.id}|${seed}|${state.turn}|${dryStep(dryness)}|${sizeStep(size)}|${JSON.stringify(state.colors[entry.id] ?? {})}|${state.custom[entry.id] ?? ''}`;
  let grown = grownCache.get(key);
  if (!grown) {
    if (grownCache.size > 400) grownCache.clear();
    grown = grow(plantOf(entry), { seed, dryness: dryStep(dryness), size: sizeStep(size), turn: (state.turn * 360) / TURNS });
    grownCache.set(key, grown);
  }
  return { key, grown };
}

/** One frame of a plant, on the canvas its size needs (see `canvasFor`). */
function rasterOf(entry: PlantEntry, seed: number, frame: number, wind: number, dryness = state.dryness, size = state.size): Raster {
  const { key, grown } = grownOf(entry, seed, dryness, size);
  const at = wind ? frame : 0;
  const full = `${key}|${wind}|${at}`;
  let raster = rasterCache.get(full);
  if (!raster) {
    if (rasterCache.size > 800) rasterCache.clear();
    raster = drawPlant(grown, { frame: at, wind });
    rasterCache.set(full, raster);
  }
  return raster;
}

// ------------------------------------------------------------------ the survivor, for scale

const SURVIVOR = outfitLook('skinC', 'hairBlack', 'happy', 2, ['recipe-everyday-0', 'sprite-everyday-bottoms-0', 'sprite-hat-2']);
const survivorFrames = new Map<number, Sprite>();
function survivorAt(ms: number): Sprite {
  const clip = AUTHORED.idle;
  const i = Math.floor((ms / 1000) * clip.rate) % clip.frames.length;
  let sprite = survivorFrames.get(i);
  if (!sprite) survivorFrames.set(i, (sprite = drawCharacter(SURVIVOR, clip.frames[i], 0, { face: clip.faces?.[i] })));
  return sprite;
}

// ------------------------------------------------------------------ painting

/** A picture of one plant, cropped to what it paints and fitted to a box. */
function thumb(raster: Raster, box: number): HTMLCanvasElement {
  // Cropped to the plant and its shadow, cast from the sun on flat ground.
  const { x0, y0, x1, y1 } = withSunShadow(raster, raster.w, raster.h, raster.origin).bounds;
  const w = Math.max(1, x1 - x0 + 1);
  const hgt = Math.max(1, y1 - y0 + 1);
  const canvas = h('canvas', { class: 'thumb', width: String(w), height: String(hgt) });
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(w, hgt);
  const mask = new Uint8Array(w * hgt);
  castShadow(mask, w, hgt, raster, raster.w, raster.h, -x0, -y0, raster.origin);
  layShadow(image, mask);
  stamp(image, raster, raster.w, raster.h, -x0, -y0);
  ctx.putImageData(image, 0, 0);
  // Whole-number enlargements where they fit; large plants are shown smaller than life.
  const scale = Math.min(4, box / Math.max(w, hgt));
  const fitted = scale >= 1 ? Math.floor(scale) : scale;
  canvas.style.width = `${Math.round(w * fitted)}px`;
  canvas.style.height = `${Math.round(hgt * fitted)}px`;
  return canvas;
}

// ------------------------------------------------------------------ interface

const EXPERT_KEY = 'island-flora-expert';
let expert = false;
try {
  expert = localStorage.getItem(EXPERT_KEY) === '1';
} catch {
  // Without storage expert tools start off.
}
/** The right panel: the plant shown (its colours, its recipe) or the island scene. */
type Panel = 'plant' | 'island';
let panelTab: Panel = 'plant';

const undo = history(() => state, (value) => {
  state = value;
  version++;
  saveState();
  editorFor = '';
  render();
});

function changed(): void {
  undo.commit();
  version++;
  saveState();
  render();
}

const selectedEntry = () => plantById(state.selected) ?? FLORA[0];

const root = document.getElementById('flora')!;
const SCENE_W = 16 * 32;
const SCENE_H = 318;
const stage = h('div', { class: 'stage' });
const preview = h('canvas', { class: 'flora-preview', width: String(FLORA_W), height: String(FLORA_H) });
const drySlider = rangeInput({ min: '0', max: '1', step: '0.05' });
const dryValue = h('b');
const sizeSlider = rangeInput({ min: String(SIZE_MIN), max: String(SIZE_MAX), step: '0.05' });
const sizeValue = h('b');
const views = viewTools();
const previewRows = h('div', { class: 'ufields' });
const tabSlot = h('div');
const panel = h('div', { class: 'uside__list', role: 'tabpanel' });
panel.addEventListener('click', (e) => (e.target as Element).closest('.utile, .ubar, .uslider') && cheer(stage));
const barSlot = h('div', { style: 'display: contents' });
const editor = h('div', { class: 'recipe' });
const sceneCanvas = h('canvas', { class: 'scene__canvas', width: String(SCENE_W), height: String(SCENE_H) });
const cardPictures = new Map<string, HTMLElement>();
let editorFor = '';

const TAB_ICONS: Record<Tab | 'island', IconName> = { all: 'grid', palm: 'palm', grass: 'grass', cactus: 'cactus', jungle: 'leaf', rock: 'rock', driftwood: 'driftwood', island: 'mountain' };
const dryName = (d: number) => t(`dry.${Math.round(d * 2)}` as Key);
const sizeName = (s: number) => `${Math.round(sizeStep(s) * 100)}%`;

/** The plants of the group picked. */
const pool = () => FLORA.filter((e) => state.tab === 'all' || e.category === state.tab);

/** The library's tiles: the plants of the group picked; the search finds them by group and "edited" too. */
function cards() {
  cardPictures.clear();
  return pool().map((entry) => {
    const picture = h('span', { class: 'card__picture' }, thumb(rasterOf(entry, 0, 0, 0, state.dryness, 1), 60));
    cardPictures.set(entry.id, picture);
    return { id: entry.id, picture, words: plantName(entry.id, entry.label), mark: state.custom[entry.id] ? 'pencil' : undefined, find: `${entry.category} ${t(`cat.${entry.category}` as Key)} ${state.custom[entry.id] ? 'edited' : ''}` };
  });
}
let shelf: Library | undefined;
/** Shows another group of plants in the library; the preview follows to its first plant unless the current one belongs to it. */
function pickGroup(id: Tab): void {
  state.tab = id;
  if (id !== 'all' && selectedEntry().category !== id) {
    state.selected = FLORA.find((e) => e.category === id)?.id ?? state.selected;
    state.seed = 0;
  }
  changed();
}

function colours(): HTMLElement[] {
  const entry = selectedEntry();
  return plantColors(entry.plant).map((from, i) => {
    // Only colours of the same kind: greens for leaves, woods for wood, stones for stone.
    const keys = colorChoices(from, entry.category).slice(1);
    const title = i === 0 ? t('color.main') : t('color.second');
    const current = state.colors[entry.id]?.[from] ?? null;
    const set = (key: string | null) => {
      const next = { ...state.colors[entry.id] };
      if (key) next[from] = key as PaletteKey;
      else delete next[from];
      state.colors[entry.id] = next;
      changed();
    };
    // The plant's own colour first (a cell with the reset icon), then the choices, all in one bar.
    return row(title, choice(title, [{ id: '', icon: 'reset' }, ...keys.map((key) => ({ id: key, color: PALETTE[key].base }))], () => current ?? '', (key) => set(key || null), 'colors', 62));
  });
}

function renderEditor(): void {
  const entry = selectedEntry();
  if (editorFor === entry.id && editor.childElementCount) return;
  editorFor = entry.id;
  const text = state.custom[entry.id] ?? pretty(entry.raw);
  const area = h('textarea', { class: 'recipe__text', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': t('recipe'), rows: '16' });
  area.value = text;
  const status = h('p', { class: 'recipe__status', role: 'status' });
  const show = (edited: Edited | null) => {
    status.textContent = edited ? edited.message : t('recipe.ok');
    status.dataset.kind = edited?.kind ?? 'ok';
  };
  show(state.custom[entry.id] ? readRecipe(entry, state.custom[entry.id]) : null);
  let timer = 0;
  area.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const value = area.value;
      if (value.trim() === pretty(entry.raw).trim()) delete state.custom[entry.id];
      else state.custom[entry.id] = value;
      const edited = state.custom[entry.id] ? readRecipe(entry, value) : null;
      show(edited);
      version++;
      saveState();
      // Only the pictures change, so typing is not interrupted.
      cardPictures.get(entry.id)?.replaceChildren(thumb(rasterOf(entry, 0, 0, 0, state.dryness, 1), 60));
    }, 250);
  });
  const copy = pixelButton(t('recipe.copy'), { icon: 'copy' }, async () => {
    try {
      await navigator.clipboard.writeText(area.value);
      toast(t('recipe.copied'));
    } catch {
      area.select();
    }
  });
  editor.replaceChildren(
    h('p', { class: 'note' }, t('recipe.note')),
    area,
    status,
    h('div', { class: 'urow' }, pixelButton(t('recipe.reset'), { icon: 'reset' }, () => {
      delete state.custom[entry.id];
      edits.delete(entry.id);
      editorFor = '';
      changed();
    }), copy),
  );
}

function variants(): HTMLElement {
  const entry = selectedEntry();
  const grid = tileGrid(Array.from({ length: VARIANTS }, (_, seed) => ({ id: String(seed), picture: thumb(rasterOf(entry, seed, 0, 0), 40), words: t('variant.n', { n: seed + 1 }) })), String(state.seed), (seed) => {
    state.seed = Number(seed);
    changed();
  });
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', t('variant'));
  return grid;
}

/** A random plant from the open group, in a random variant. */
function shuffle(): void {
  state.selected = pick(pool()).id;
  state.seed = Math.floor(Math.random() * VARIANTS);
  changed();
  cheer(stage);
}

function renderBar(): void {
  const status = h('span', { class: 'bar__status', 'aria-live': 'polite' });
  const total = FLORA.length + FLORA_REJECTED.length;
  const repaired = FLORA.filter((e) => e.repairs.length).length;
  const { bar, undo: undoButton, redo: redoButton, pops } = topBar({
    sidebar: true,
    tool: 'flora',
    title: word('flora'),
    about: [t('lede'), t('foot.items', {
      count: FLORA.length, calls: FLORA_CALLS, valid: FLORA.length - repaired, total,
      repaired: repaired ? t('foot.repaired', { n: repaired }) : '',
    }), t('foot.rules')],
    more: [
      { label: currentLang() === 'de' ? 'Im Projekt speichern' : 'Save to project', icon: 'download', main: true, disabled: !canSaveToProject(), track: storeTracker([FLORA_STORE]), run: () => void saveStores([FLORA_STORE]).then((ok) => {
        status.textContent = ok ? (currentLang() === 'de' ? 'Im Projekt gespeichert (src/content/store).' : 'Saved to the project (src/content/store).') : (currentLang() === 'de' ? 'Nichts gespeichert: ändere erst etwas.' : 'Nothing saved: change something first.');
      }) },
      { label: currentLang() === 'de' ? 'Neu beginnen' : 'Start over', icon: 'reset', run: () => {
        state = defaultState();
        panelTab = 'plant';
        editorFor = '';
        changed();
      } },
      { label: expert ? (currentLang() === 'de' ? 'Expertenwerkzeuge: an' : 'Expert tools: on') : (currentLang() === 'de' ? 'Expertenwerkzeuge: aus' : 'Expert tools: off'), icon: 'sliders', run: () => {
        expert = !expert;
        try {
          localStorage.setItem(EXPERT_KEY, expert ? '1' : '0');
        } catch {
          // The choice then lasts for this visit only.
        }
        editorFor = '';
        render();
      } },
    ],
    status,
    undo: undo.undo,
    redo: undo.redo,
    shuffle,
    relabel: () => {
      edits.clear();
      mount();
      render();
    },
  });
  undoButton!.disabled = !undo.canUndo();
  redoButton!.disabled = !undo.canRedo();
  barSlot.replaceChildren(bar, ...pops);
}

function render(): void {
  const ground = GROUNDS.find((g) => g.id === state.ground)!;
  stage.style.setProperty('--ground', ground.color);
  renderBar();
  shelf?.redraw();
  const list: Panel[] = ['plant', 'island'];
  // The die picks another plant from this group; the island tab rolls a new island.
  const die = tabTools(() => {
    if (panelTab === 'island') {
      state.sceneSeed++;
      changed();
    } else shuffle();
  });
  tabSlot.replaceChildren(tabs(t('sections'), list.map((id) => ({ id, label: id === 'island' ? t('scene') : t('tab.plant'), icon: id === 'island' ? TAB_ICONS.island : 'leaf' })), panelTab, (id) => {
    panelTab = id;
    panel.scrollTop = 0;
    changed();
  }, new Set(), die));

  const scroll = panel.scrollTop;
  if (panelTab === 'island') {
    panel.replaceChildren(section(t('scene'),
      h('div', { class: 'scene__frame' }, sceneCanvas),
      row(t('density'), segmented(t('density'), (Object.keys(DENSITY) as Density[]).map((d) => ({ id: d, label: t(`density.${d}` as Key) })), state.density, (d) => {
        state.density = d;
        changed();
      })),
      h('p', { class: 'note' }, t('scene.note')),
    ));
    requestAnimationFrame(fitScene);
  } else {
    const parts: Node[] = [section(currentLang() === 'de' ? 'Farben' : 'Colours', ...colours())];
    if (expert) {
      renderEditor();
      parts.push(section(t('recipe'), editor));
    }
    panel.replaceChildren(...parts);
  }
  panel.scrollTop = scroll;

  drySlider.value = String(state.dryness);
  drySlider.setAttribute('aria-valuetext', dryName(state.dryness));
  dryValue.textContent = dryName(state.dryness);
  sizeSlider.value = String(state.size);
  sizeSlider.setAttribute('aria-valuetext', sizeName(state.size));
  sizeValue.textContent = sizeName(state.size);
  previewRows.replaceChildren(
    row(t('variant'), variants()),
    row(t('size'), sizeSlider, sizeValue),
    row(t('dryness'), drySlider, dryValue),
  );
  views.replaceChildren(snapButton(() => savePicture(preview, plantName(selectedEntry().id, selectedEntry().label), 4)),
    choice(t('wind'), (Object.keys(WINDS) as Wind[]).map((w) => ({ id: w, icon: WIND_ICON[w], words: t(`wind.${w}` as Key) })), () => state.wind, (w) => { state.wind = w as Wind; changed(); }, 'list'),
    choice(t('ground'), GROUNDS.map((g) => ({ id: g.id, color: g.color, words: t(`ground.${g.id}` as Key) })), () => state.ground, (g) => { state.ground = g as Ground; changed(); }, 'list'),
    pixelToggle(t('person'), { icon: 'person' }, state.person, (on) => { state.person = on; changed(); }));
}

function mount(): void {
  document.documentElement.lang = currentLang();
  document.title = t('title');
  editorFor = '';
  drySlider.setAttribute('aria-label', t('dryness'));
  sizeSlider.setAttribute('aria-label', t('size'));
  stage.replaceChildren(preview, ...arrows, views);
  const previewSec = pixelSection({ icon: 'eye', tip: word('preview') }, [previewRows]);
  shelf = library({
    key: 'pixel-flora', label: word('search'), empty: word('nothing'), items: cards, selected: () => state.selected, pick: (id) => { state.selected = id; state.seed = 0; changed(); },
    filters: () => [filterToggles(CATEGORIES.map((id) => ({ id, icon: TAB_ICONS[id], words: t(`cat.${id}` as Key) })), () => state.tab, (id) => pickGroup(id as Tab))],
  });
  root.replaceChildren(h('div', { class: 'shell' }, barSlot, workspace({ key: 'pixel-flora', left: [shelf], centre: [stage, box(previewSec)], right: [tabSlot, panel], leftWidth: 260, rightWidth: 460 })));
}

drySlider.addEventListener('input', () => {
  state.dryness = Number(drySlider.value);
  drySlider.setAttribute('aria-valuetext', dryName(state.dryness));
  dryValue.textContent = dryName(state.dryness);
  version++;
});
drySlider.addEventListener('change', changed);
sizeSlider.addEventListener('input', () => {
  state.size = sizeStep(Number(sizeSlider.value));
  sizeSlider.setAttribute('aria-valuetext', sizeName(state.size));
  sizeValue.textContent = sizeName(state.size);
  version++;
});
sizeSlider.addEventListener('change', changed);
function setTurn(next: number): void {
  state.turn = ((next % TURNS) + TURNS) % TURNS;
  version++;
}
// Arrows at its sides and a drag on it turn the plant round.
const arrows = turnView(stage, (step) => {
  setTurn(state.turn + step);
  changed();
});
undoKeys(undo.undo, undo.redo);

// ------------------------------------------------------------------ the island scene

/** The island: a 16 by 16 metre height map, drawn on a canvas that just holds it. */
const ISLAND = { cells: 16 };
const SCENE = { w: SCENE_W, h: SCENE_H, origin: { x: ISLAND.cells * 16, y: 46 } };

let island: { seed: number; map: HeightMap; image: TerrainImage; person: Spot } | null = null;
function islandOf(seed: number): { map: HeightMap; image: TerrainImage; person: Spot } {
  if (island?.seed === seed) return island;
  const map = generateIsland(seed, ISLAND.cells, ISLAND.cells, { land: 0.85 });
  island = { seed, map, image: renderTerrain(map, SCENE), person: middleOf(map) };
  return island;
}

let layoutKey = '';
let placed: Scattered<PlantEntry>[] = [];

/** Where things stand: each on ground it belongs on, clear of the others and of the survivor. */
function layout(): Scattered<PlantEntry>[] {
  const group = pool();
  const key = `${state.sceneSeed}|${state.tab}|${state.density}|${group.length}`;
  if (key === layoutKey) return placed;
  layoutKey = key;
  const { map, person } = islandOf(state.sceneSeed);
  // Grass is common, so it is picked more often when every group is shown.
  const weighted = group.flatMap((e) => (state.tab === 'all' && e.category === 'grass' ? [e, e, e] : [e]));
  placed = scatter(map, weighted, DENSITY[state.density], state.sceneSeed, person);
  return placed;
}

function drawScene(ms: number, frame: number): void {
  const ctx = sceneCanvas.getContext('2d')!;
  const { map, image: ground, person } = islandOf(state.sceneSeed);
  const wind = WINDS[state.wind];
  const things: Thing[] = layout().map((p) => {
    const raster = rasterOf(p.item, p.seed, frame, wind, state.dryness, sizeStep(state.size * p.scale));
    return { spot: p, picture: raster, w: raster.w, h: raster.h, foot: raster.origin };
  });
  things.push({ spot: person, picture: survivorAt(ms), w: SPRITE_W, h: SPRITE_H, foot: FEET });
  const image = paintIsland(map, ground, things);
  ctx.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
}

/**
 * The part of the world the preview shows. It is drawn at twice the size while the plant fits the
 * standard canvas, and at its own size, showing twice as much, when the plant is grown too large
 * for that. Whole-number enlargement keeps the pixels square.
 */
const fitCache = new Map<string, boolean>();
function previewWindow(entry: PlantEntry): { w: number; h: number; origin: { x: number; y: number } } {
  const { key } = grownOf(entry, state.seed);
  let fits = fitCache.get(key);
  if (fits === undefined) {
    const calm = rasterOf(entry, state.seed, 0, 0);
    const { origin } = calm;
    // Room left for the plant to sway in a storm.
    const margin = 4;
    fits = true;
    for (let y = 0; y < calm.h && fits; y++) for (let x = 0; x < calm.w; x++) {
      if (!calm.get(x, y)) continue;
      const dx = x - origin.x;
      const dy = y - origin.y;
      if (Math.abs(dx) > FLORA_ORIGIN.x - margin || -dy > FLORA_ORIGIN.y - margin || dy >= FLORA_H - FLORA_ORIGIN.y) { fits = false; break; }
    }
    if (fitCache.size > 400) fitCache.clear();
    fitCache.set(key, fits);
  }
  return fits
    ? { w: FLORA_W, h: FLORA_H, origin: FLORA_ORIGIN }
    : { w: FLORA_W * 2, h: FLORA_H * 2, origin: { x: FLORA_W, y: FLORA_H * 2 - (FLORA_H - FLORA_ORIGIN.y) } };
}

function drawPreview(ms: number, frame: number): void {
  const entry = selectedEntry();
  const view = previewWindow(entry);
  if (preview.width !== view.w) {
    preview.width = view.w;
    preview.height = view.h;
  }
  const ctx = preview.getContext('2d')!;
  const image = ctx.createImageData(view.w, view.h);
  const raster = rasterOf(entry, state.seed, frame, WINDS[state.wind]);
  const { origin } = raster;
  const dx = view.origin.x - origin.x;
  const dy = view.origin.y - origin.y;
  // The survivor stands a little in front and to the left, and is never hidden by the plant.
  const person = { x: view.origin.x - 30 - FEET.x, y: view.origin.y + 4 - FEET.y };
  const mask = new Uint8Array(view.w * view.h);
  castShadow(mask, view.w, view.h, raster, raster.w, raster.h, dx, dy, origin);
  if (state.person) castShadow(mask, view.w, view.h, survivorAt(ms), SPRITE_W, SPRITE_H, person.x, person.y, FEET);
  layShadow(image, mask);
  stamp(image, raster, raster.w, raster.h, dx, dy);
  if (state.person) stamp(image, survivorAt(ms), SPRITE_W, SPRITE_H, person.x, person.y);
  ctx.putImageData(image, 0, 0);
}

function fitScene(): void {
  const width = sceneCanvas.parentElement?.clientWidth ?? SCENE.w;
  const scale = Math.max(1, Math.min(2, Math.floor(width / SCENE.w)));
  sceneCanvas.style.width = `${SCENE.w * scale}px`;
  // Narrower screens shrink it; the height follows so the pixels keep their shape.
  sceneCanvas.style.height = 'auto';
}

if (import.meta.env.DEV) {
  const missing = missingPlantNames(FLORA.map((e) => e.id));
  if (missing.length) console.error(`No German name for: ${missing.join(', ')}`);
  if (FLORA_REJECTED.length) console.error('Rejected plants:', FLORA_REJECTED);
}

mount();
render();
fitScene();
window.addEventListener('resize', fitScene);

let shown = '';
// Plants sway even with reduced motion: the wind is the point of the preview. "Calm" stops it.
const tick = (ms: number) => {
  const frame = state.wind === 'calm' ? 0 : Math.floor((ms / 1000) * 6) % FRAMES;
  const blink = Math.floor((ms / 1000) * AUTHORED.idle.rate) % AUTHORED.idle.frames.length;
  const key = `${version}|${frame}|${blink}|${state.sceneSeed}|${state.seed}|${state.selected}|${state.person}|${currentLang()}|${panelTab}`;
  if (key !== shown) {
    shown = key;
    drawPreview(ms, frame);
    if (panelTab === 'island') drawScene(ms, frame);
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
document.body.dataset.ready = '1';
