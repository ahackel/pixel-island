// The wardrobe: the character editor the island game opens before each new game (engine/character/editor.ts), with every
// row and a tab for how the preview shows the character, and around it the tools' bar: the characters kept on this
// device, undo, a random one, and the page where the eye and mouth shapes are drawn.
import { confirmDialog, library, pixelButton, sidePanel, type Library } from '../../ui/components.ts';
import { BROWS, EYE_COLORS, EYE_SHAPES, GLASSES_COLORS, HAIR_STYLES, HEAD_SHAPES, MOODS, NOSES } from '../../engine/character/base.ts';
import { canSaveToProject, saveStores, storeTracker } from '../../shared/project.ts';
import { ROSTER_KEY } from '../../engine/character/character.ts';
import { CATALOG, CLOTH_KEYS, entryById, type Entry } from '../../engine/character/catalog.ts';
import {
  characterFile, cleanState, defaultState, download, HAIR_COLORS, lookOf, newId, pickCharacter, pickedCharacter, pickFile, readCharacterFile, saveRoster, loadRoster,
  WORN_SLOTS, type Saved, type State, type WornSlot,
} from '../../engine/character/character.ts';
import { characterEditor, type Editor, type Tab } from '../../engine/character/editor.ts';
import { SKIN_KEYS } from '../../engine/core/palette.ts';
import { AUTHORED, STAND } from '../../engine/core/poses.ts';
import { BODY_WINDOW, BUILDS, drawCharacter, FACING_VIEWS, type Facing } from '../../engine/core/puppet.ts';
import { WEAR_MAX } from '../../engine/character/wear.ts';
import { cheer, h, history, NAMES, nameTag, pick, pickStart, shuffled, topBar, undoKeys, word } from '../../shared/shell.ts';
import { currentLang, LANGS } from '../../shared/lang.ts';
import { fitWhole, paintSprite, pictureCache, type Rect } from '../../shared/pixels.ts';
import { itemName, missingItemNames, t, type Key } from './i18n.ts';
import { shapeEditor } from './shapes.ts';
import './wardrobe.css';

// ------------------------------------------------------------------ state

const STORAGE_KEY = 'castaway-wardrobe';

function loadState(): State {
  try {
    return cleanState(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    // Saved looks are a convenience. Without storage the wardrobe starts from the default.
    return defaultState();
  }
}

function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore: private windows and embedded previews may refuse storage.
  }
}

let state = loadState();
/** The eye and mouth shape editor has a page of its own, at #shapes. */
let shapesPage = location.hash === '#shapes';
/** How the preview shows the character: what it does, the head turned (eighths, to its left), the eyes aside. */
let clipKey = 'idle';
let gaze = 0;
let eyesAside = false;
let version = 0;

// ------------------------------------------------------------------ pictures

const standing = (source: State) => drawCharacter(lookOf(source), STAND, 0);

/** A picture of the current character with one thing changed, cropped to a region (for the three to start from). */
function regionPicture(change: (draft: State) => void, crop: Rect, box: number): HTMLCanvasElement {
  const draft = structuredClone(state);
  change(draft);
  const canvas = h('canvas', { class: 'thumb', width: String(crop.w), height: String(crop.h) });
  paintSprite(canvas, standing(draft), crop);
  return fitWhole(canvas, box, 4);
}

// ------------------------------------------------------------------ interface

const root = document.getElementById('wardrobe')!;
const stage = h('div', { class: 'wardrobe' });
const barSlot = h('div', { style: 'display: contents' });
const name = nameTag();
name.onRename((value) => renameThing(value));
let message = '';
let editor: Editor | null = null;
// The shape editor's panel at the right, as wide as it is dragged; the character editor makes room for it (--shapes-w).
const shapes = sidePanel('right', 'pixel-wardrobe-shapes', 560);
shapes.panel.classList.add('wardrobe__shapes');
shapes.panel.setAttribute('aria-label', t('shapes'));
const shapesSlot = shapes.body;
new ResizeObserver(() => stage.style.setProperty('--shapes-w', `${shapes.panel.offsetWidth}px`)).observe(shapes.panel);
// My things at the left, as in every editor.
const shelfSide = sidePanel('left', 'pixel-wardrobe-left', 240);
let shelf: Library | undefined;

// My things: saved characters on this device, shared with the scene editor. The working character
// is kept on every change as before; while a saved one is picked, changes go straight into it.
let roster = loadRoster();
let currentId = pickedCharacter();
if (!roster.some((c) => c.id === currentId)) currentId = roster.length === 1 ? roster[0].id : null;
const current = () => roster.find((c) => c.id === currentId);
// Opening the wardrobe shows the character picked in My things, even if the draft moved on.
if (current()) state = cleanState(structuredClone(current()!.state));

function setCurrent(id: string | null): void {
  currentId = id;
  pickCharacter(id);
}

/** Stores the list; a refusal is shown in the bar, since it is the one thing that loses work. */
function storeRoster(note = ''): void {
  message = saveRoster(roster) ? note : t('saved.fail');
}

const undo = history(() => state, (value) => {
  state = value;
  persist();
  render();
});

/** Keeps the working character and, if one is picked, its entry in My things. */
function persist(): void {
  version++;
  saveState();
  const saved = current();
  if (saved) {
    saved.state = structuredClone(state);
    storeRoster(message === t('saved.fail') ? '' : message);
  }
}

function changed(): void {
  undo.commit();
  message = '';
  persist();
  render();
}

function addThing(name: string, from: State, note: string): void {
  const saved: Saved = { id: newId(), name, state: structuredClone(from) };
  roster.push(saved);
  setCurrent(saved.id);
  storeRoster(note);
}

function nextName(): string {
  const base = t('saved.default');
  for (let n = roster.length + 1; ; n++) {
    const name = t('saved.numbered', { name: base, n });
    if (!roster.some((c) => c.name === name)) return name;
  }
}

/** New: pick one of three rolled characters, straight into My things. */
function newThing(): void {
  pickStart(() => shuffled(NAMES).slice(0, 3).map((name) => {
    const look = roll();
    return {
      label: name,
      picture: regionPicture((d) => Object.assign(d, look), BODY_WINDOW, 120),
      choose: () => {
        state = look;
        addThing(name, look, '');
        undo.reset();
        persist();
        render();
        cheer(stage);
      },
    };
  }));
}

function copyThing(): void {
  const saved = current();
  addThing(saved ? t('saved.copyOf', { name: saved.name }) : nextName(), state, '');
  render();
}

/** Renames the picked character, or keeps this one in My things under that name. */
function renameThing(name: string): void {
  const saved = current();
  if (saved) {
    if (saved.name === name) return;
    saved.name = name.slice(0, 40);
    storeRoster('');
  } else addThing(name.slice(0, 40), state, '');
  render();
}

async function deleteThing(): Promise<void> {
  const saved = current();
  if (!saved || !(await confirmDialog(t('saved.confirmDelete', { name: saved.name })))) return;
  roster = roster.filter((c) => c !== saved);
  setCurrent(null);
  storeRoster('');
  render();
}

async function importThing(): Promise<void> {
  let saved: Saved;
  try {
    saved = readCharacterFile(await pickFile());
  } catch {
    message = t('saved.badFile');
    render();
    return;
  }
  roster.push(saved);
  setCurrent(saved.id);
  state = structuredClone(saved.state);
  undo.reset();
  persist();
  storeRoster(t('saved.imported', { name: saved.name }));
  render();
}

/** My things as tiles; while the character shown is not kept yet, it leads as a tile of its own. */
const thumbs = pictureCache('thumb');
const thumbOf = (source: State) => thumbs.of(JSON.stringify(source), () => {
  const canvas = h('canvas', { class: 'thumb', width: String(BODY_WINDOW.w), height: String(BODY_WINDOW.h) });
  paintSprite(canvas, standing(source), BODY_WINDOW);
  return fitWhole(canvas, 52, 4);
});
const shelfItems = () => [
  ...(current() ? [] : [{ id: '', picture: thumbOf(state), words: t('saved.none'), mark: 'pencil' }]),
  ...roster.map((c) => ({ id: c.id, picture: thumbOf(c.state), words: c.name })),
];
function pickThing(id: string): void {
  const saved = roster.find((c) => c.id === id);
  setCurrent(saved?.id ?? null);
  if (saved) state = structuredClone(saved.state);
  message = '';
  undo.reset();
  version++;
  saveState();
  render();
}

function renderBar(): void {
  const saved = current();
  const paintCount = CATALOG.filter((e) => e.format === 'paint').length;
  const { bar, undo: undoButton, redo: redoButton, pops } = topBar({
    sidebar: true,
    tool: 'wardrobe',
    title: word('wardrobe'),
    name: name.el,
    about: [t('lede'), t('foot.items', { count: CATALOG.length, paint: paintCount, recipe: CATALOG.length - paintCount }), t('foot.rules'), t('foot.base')],
    more: [
      { label: t('saved.new'), icon: 'plus', run: newThing },
      { label: saved ? t('saved.copy') : t('saved.keep'), icon: 'copy', run: copyThing },
      { label: t('reset'), icon: 'reset', run: () => { state = defaultState(); changed(); } },
      { label: t('saved.project'), icon: 'download', main: true, disabled: !canSaveToProject(), track: storeTracker([ROSTER_KEY]), run: () => void saveStores([ROSTER_KEY]).then((ok) => { message = t(ok ? 'saved.projectDone' : 'saved.projectNone'); render(); }) },
      { label: t('saved.export'), icon: 'download', run: () => download(`${saved?.name ?? t('saved.default')}.json`, characterFile({ id: '', name: saved?.name ?? t('saved.default'), state })) },
      { label: t('saved.import'), icon: 'upload', run: () => void importThing() },
      { label: t('saved.delete'), icon: 'trash', run: deleteThing, danger: true, disabled: !saved },
    ],
    status: h('span', { class: 'bar__status', 'aria-live': 'polite' }, message || (saved ? t('things.current') : '')),
    undo: undo.undo,
    redo: undo.redo,
    shuffle: () => shuffle(),
    extra: pixelButton(t('shapes'), { icon: 'face', flat: true, pressed: shapesPage }, () => openShapes(!shapesPage)),
    relabel: () => {
      mount();
      render();
    },
  });
  undoButton!.disabled = !undo.canUndo();
  redoButton!.disabled = !undo.canRedo();
  barSlot.replaceChildren(bar, ...pops);
}

/** The preview's own tab: not the character, but how it is shown, so it is not kept or undone. */
function previewTab(): Tab {
  const shown = (key: string) => ({ title: t(key as Key) });
  return { key: 'preview', icon: 'eye', title: t('preview'), rows: [
    { key: 'mood', ...shown('mood'), values: MOODS, get: (s) => s.mood, set: (s, v) => (s.mood = v as never), nameOf: (v) => t(`mood.${v}` as Key) },
    { key: 'action', ...shown('action'), values: Object.keys(AUTHORED), get: () => clipKey, set: (_, v) => (clipKey = v as string), nameOf: (v) => t(`clip.${v}` as Key) },
    { key: 'wear', ...shown('wear'), values: Array.from({ length: WEAR_MAX + 1 }, (_, n) => n), get: (s) => Math.round(s.wear), set: (s, v) => (s.wear = v as number), nameOf: (v) => t(`wear.${v}` as Key) },
    { key: 'gaze', ...shown('gaze'), values: [-1, 0, 1], get: () => gaze, set: (_, v) => (gaze = v as number), nameOf: (v) => t(`gaze.${v}` as Key) },
    { key: 'aside', ...shown('gaze.aside'), values: [false, true], get: () => eyesAside, set: (_, v) => (eyesAside = !!v) },
  ] };
}

/** A catalog piece's name, for pieces the game's texts do not name. Short: the box is as wide as the longest name. */
const pieceName = (id: string) => {
  const entry = entryById(id);
  const full = entry ? itemName(id, entry.label).replaceAll('\u00AD', '') : undefined;
  // shortcut: long names are cut at 14 letters; give every piece a short name to show them whole.
  return full && full.length > 14 ? `${full.slice(0, 13)}…` : full;
};

/** A whole new random look. Condition, mood and ground are kept, so one can shuffle through neat passengers or castaways. */
function roll(): State {
  const next = defaultState();
  next.skin = pick(SKIN_KEYS);
  next.build = pick(BUILDS).id;
  next.frame = pick(['m', 'f'] as const);
  next.wear = state.wear;
  next.mood = state.mood;
  next.face = {
    shape: pick(HEAD_SHAPES),
    eyes: pick(EYE_SHAPES), eyeColor: pick(EYE_COLORS), brows: pick(BROWS), nose: pick(NOSES),
    blush: Math.random() < 0.6, freckles: Math.random() < 0.25, glasses: Math.random() < 0.15, glassesColor: pick(GLASSES_COLORS), lashes: next.frame === 'f',
  };
  const hairs = [...HAIR_STYLES.map((s) => s.id), ...CATALOG.filter((e) => e.slot === 'hair').map((e) => e.id)];
  next.hair = Math.random() < 0.08 ? null : pick(hairs);
  next.hairColor = pick(HAIR_COLORS.slice(0, 6));
  const level = Math.round(next.wear);
  const shod = [0.95, 0.8, 0.5, 0.3][level];
  const bearded = next.frame === 'm' ? [0.15, 0.3, 0.5, 0.65][level] : 0;
  const chance: Record<WornSlot, number> = { top: 0.92, bottom: 0.92, shoes: shod, hat: 0.45, beard: bearded, tool: 0.5 };
  for (const slot of WORN_SLOTS) {
    // Nobody had a leaf skirt or a spear before the wreck.
    const options = CATALOG.filter((e) => e.slot === slot && (level > 0 || !e.island));
    const entry: Entry | null = options.length && Math.random() < chance[slot] ? pick(options) : null;
    next.worn[slot] = entry?.id ?? null;
    if (entry && slot !== 'beard' && entry.colors.length && Math.random() < 0.35) next.colors[slot] = { [entry.colors[0]]: pick(CLOTH_KEYS) };
  }
  next.ground = state.ground;
  return next;
}

function shuffle(): void {
  state = roll();
  changed();
}

/** Opens or leaves the shape editor's page; the browser's back button leaves it too. */
function openShapes(open: boolean): void {
  if (open === shapesPage) return;
  if (open) location.hash = 'shapes';
  else {
    window.history.pushState(null, '', location.pathname + location.search);
    syncShapes();
  }
}
function syncShapes(): void {
  shapesPage = location.hash === '#shapes';
  render();
}
window.addEventListener('hashchange', syncShapes);
window.addEventListener('popstate', syncShapes);

function shapesView(): void {
  const head = h('div', { class: 'shapes-head' },
    pixelButton(t('shapes.back'), { icon: 'left' }, () => openShapes(false)),
    h('h2', {}, t('shapes')));
  // From behind there is no face to edit.
  const seen = FACING_VIEWS[facing()];
  if (!seen.face) return void shapesSlot.replaceChildren(head, h('p', { class: 'note shapes__away' }, t('shapes.away')));
  shapesSlot.replaceChildren(head, shapeEditor({
    face: state.face, skin: state.skin, hair: state.hairColor, mood: state.mood, aside: eyesAside,
    live: () => version++,
    done: () => {
      version++;
      render();
    },
    // Face on edits the front view, left and right the side view.
    view: seen.face,
    mirror: seen.mirror,
  }));
}

function render(): void {
  renderBar();
  shelf?.redraw();
  const saved = current();
  name.set(saved?.name ?? '', t('saved.none'));
  stage.classList.toggle('wardrobe--shapes', shapesPage);
  if (shapesPage) shapesView();
  editor?.refresh();
}

/** The facing the preview shows, for the shape editor. */
const facing = (): Facing => editor?.facing() ?? 0;

/** Builds the page. Called again when the language changes, since every label is rebuilt. */
function mount(): void {
  document.documentElement.lang = currentLang();
  document.title = t('title');
  editor = characterEditor(state, {
    full: true,
    tabs: [previewTab()],
    state: () => state,
    changed,
    random: shuffle,
    preview: () => ({ clip: clipKey, look: gaze, aside: eyesAside, worn: true }),
    nameOf: (_, v) => (typeof v === 'string' ? pieceName(v) : undefined),
    // The shape editor edits the view the preview shows.
    turned: () => shapesPage && render(),
  });
  stage.replaceChildren(editor, shapes.panel);
  shelf = library({ key: 'pixel-wardrobe', label: word('search'), empty: word('nothing'), items: shelfItems, selected: () => currentId ?? '', pick: pickThing });
  shelfSide.body.replaceChildren(shelf);
  root.replaceChildren(h('div', { class: 'shell' }, barSlot, h('main', { class: 'shell__main wardrobe__main' }, shelfSide.panel, h('div', { class: 'wardrobe__room' }, stage))));
}

undoKeys(undo.undo, undo.redo);

if (import.meta.env.DEV) {
  // A new item without a translated name still works; this only points it out while developing.
  for (const l of LANGS) {
    const missing = missingItemNames(CATALOG.map((e) => e.id), l.id);
    if (missing.length) console.error(`No ${l.name} name for: ${missing.join(', ')}`);
  }
}

mount();
render();
document.body.dataset.ready = '1';
