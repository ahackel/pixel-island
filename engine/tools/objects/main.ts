// The object editor: pick a thing, then change its size, parts and colours, see it in all four
// camera turns, and keep a named list on the device. Points for the game sit behind Expert tools.
// Built on the shared editor shell, like the wardrobe.
import {
  COLOR_KEYS, cleanBuild, DEFAULT_BUILD, drawObject, framesOf, heightOf, isShadow, LOOP_RATE, ObjectSprite, OBJECT_H, OBJECT_STORE, OBJECT_W, propFile, readPropFile, savedProps, type ObjectFrame, type Build, type Turn,
} from '../../engine/objects/object.ts';
import { OBJECT_PRESETS } from '../../engine/objects/object-presets.ts';
import { buildPanel, type BuildContext } from './build-panel.ts';
import { download, newId, pickFile, readStore, writeStore } from '../../shared/files.ts';
import { type PaletteKey } from '../../engine/core/palette.ts';
import {
  checkbox, cheer, dragToTurn, h, history, NAMES, nameTag, pick, pickStart, row, savePicture, section, segmented, shuffled, snapButton, tabs, tabTools, topBar, undoKeys, word,
  type IconName,
} from '../../shared/shell.ts';
import { currentLang } from '../../shared/lang.ts';
import { fitWhole, paintSprite, pictureCache, trimmed, type Rect } from '../../shared/pixels.ts';

const L = (en: string, german: string) => (currentLang() === 'de' ? german : en);

// ------------------------------------------------------------------ state

const { draft: DRAFT_KEY, roster: ROSTER_KEY, current: CURRENT_KEY } = OBJECT_STORE;
interface Saved { id: string; name: string; prop: Build }

let prop = cleanBuild(readStore(DRAFT_KEY, OBJECT_PRESETS[0].prop));
let roster: Saved[] = savedProps();
let currentId: string | null = readStore<string | null>(CURRENT_KEY, null);
if (!roster.some((s) => s.id === currentId)) currentId = null;

const current = () => roster.find((s) => s.id === currentId);
// Opening the editor shows the object picked in My things, even if the draft moved on.
if (current()) prop = structuredClone(current()!.prop);
const EXPERT_KEY = 'pixel-objects-expert';
let expert = readStore<boolean>(EXPERT_KEY, false) === true;

type TabId = 'things' | 'size' | 'parts' | 'points';
const TABS: [TabId, string, string, IconName][] = [['things', 'Things', 'Dinge', 'armchair'], ['size', 'Size', 'Größe', 'box'], ['parts', 'Parts', 'Teile', 'shapes'], ['points', 'Points', 'Punkte', 'pin']];
let tab: TabId = 'things';
let turn: Turn = 0;
let selected = 0;
let paused = false;
let version = 0;
let crop: Rect = { x: 0, y: 0, w: OBJECT_W, h: OBJECT_H };
const GROUNDS = [['Floor', 'Boden', '#d9d3c4'], ['Grass', 'Gras', '#8fcf78'], ['Path', 'Weg', '#c9bfae']] as const;
let ground: string = GROUNDS[0][2];
let message = '';

// ------------------------------------------------------------------ drawing

/** A square around the object in every turn, so the view does not jump when turning. */
function cropFor(p: Build): Rect {
  let x0 = OBJECT_W, y0 = OBJECT_H, x1 = 0, y1 = 0;
  for (const at of [0, 1, 2, 3] as const) {
    const { sprite } = drawObject(p, at);
    for (let y = 0; y < OBJECT_H; y++) for (let x = 0; x < OBJECT_W; x++) {
      if (!sprite.get(x, y)) continue;
      x0 = Math.min(x0, x, OBJECT_W - 1 - x); x1 = Math.max(x1, x, OBJECT_W - 1 - x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const side = Math.max(24, x1 - x0 + 5, y1 - y0 + 5);
  return { x: Math.round(OBJECT_W / 2 - side / 2), y: Math.round((y0 + y1) / 2 - side / 2), w: side, h: side };
}

/** A small picture of an object, trimmed to what it paints. */
function thumbnail(p: Build, box = 60): HTMLCanvasElement {
  return thumbs.of(`${box}|${JSON.stringify(p)}`, () => trimmed(drawObject(p, 0).sprite, OBJECT_W, OBJECT_H, box, isShadow));
}
/** The panel is rebuilt on every change and shows the same presets and saved objects again: their pictures are drawn once. */
const thumbs = pictureCache('thumb');

// ------------------------------------------------------------------ saving

const undo = history(() => prop, (value) => {
  prop = value;
  persist();
  crop = cropFor(prop);
  render();
});

function storeRoster(note = ''): void {
  message = writeStore(ROSTER_KEY, roster) ? note : L('Could not save: this browser refuses storage here.', 'Nicht gespeichert: Dieser Browser erlaubt hier keinen Speicher.');
}

/** Keeps the draft and, if one is picked, its entry in My things. */
function persist(): void {
  version++;
  writeStore(DRAFT_KEY, prop);
  selected = Math.max(0, Math.min(selected, prop.parts.length - 1));
  const saved = current();
  if (saved) {
    saved.prop = structuredClone(prop);
    storeRoster();
  }
}

function changed(): void {
  undo.commit();
  message = '';
  persist();
  // The crop takes four drawings, so a slider drag keeps the old one until release.
  crop = cropFor(prop);
  render();
}
function setCurrent(id: string | null): void {
  currentId = id;
  writeStore(CURRENT_KEY, id);
}
function addThing(name: string, from: Build): void {
  const saved = { id: newId(), name: name.slice(0, 40), prop: structuredClone(from) };
  roster.push(saved);
  setCurrent(saved.id);
  storeRoster();
}
function load(next: Build, id: string | null): void {
  prop = structuredClone(next);
  selected = 0;
  setCurrent(id);
  undo.reset();
  persist();
  crop = cropFor(prop);
  render();
}
function renameThing(name: string): void {
  const saved = current();
  if (saved) {
    if (saved.name === name) return;
    saved.name = name.slice(0, 40);
    storeRoster();
  } else addThing(name, prop);
  render();
}
function remove(): void {
  const saved = current();
  if (!saved || !confirm(L(`Delete "${saved.name}" from this device?`, `„${saved.name}“ von diesem Gerät löschen?`))) return;
  roster = roster.filter((s) => s !== saved);
  setCurrent(null);
  storeRoster(L(`Deleted "${saved.name}".`, `„${saved.name}“ gelöscht.`));
  render();
}
async function importFile(): Promise<void> {
  let file: { name: string; prop: Build };
  try {
    file = readPropFile(await pickFile());
  } catch {
    message = L('That file is not an object.', 'Diese Datei ist kein Objekt.');
    return render();
  }
  addThing(file.name, file.prop);
  message = L(`Imported "${file.name}".`, `„${file.name}“ importiert.`);
  load(file.prop, currentId);
}

// ------------------------------------------------------------------ shuffle

/** New colours for every part; parts of one colour stay one colour. */
function recolour(p: Build): Build {
  const next = structuredClone(p);
  const map = new Map<PaletteKey, PaletteKey>();
  for (const part of next.parts) {
    if (!map.has(part.color)) map.set(part.color, pick(COLOR_KEYS));
    part.color = map.get(part.color)!;
  }
  return next;
}
/** A random thing: one of the presets in new colours. */
const roll = () => recolour(pick(OBJECT_PRESETS).prop);
function shuffle(only?: TabId): void {
  prop = only === 'parts' ? recolour(prop) : roll();
  changed();
  cheer(stage);
}

// ------------------------------------------------------------------ controls

const buildContext = (): BuildContext => ({
  prop, selected,
  select: (i) => { selected = i; },
  live: () => { version++; },
  changed, render,
});

function panelFor(id: TabId): HTMLElement[] {
  switch (id) {
    case 'things': {
      const grid = h('div', { class: 'grid' });
      for (const preset of OBJECT_PRESETS) {
        const card = h('button', { type: 'button', class: 'card', 'aria-pressed': String(JSON.stringify(preset.prop) === JSON.stringify(prop)) },
          h('span', { class: 'card__picture' }, thumbnail(preset.prop)),
          h('span', { class: 'card__label' }, preset.name),
        );
        card.addEventListener('click', () => {
          prop = structuredClone(preset.prop);
          selected = 0;
          changed();
        });
        grid.append(card);
      }
      return [section(L('Things', 'Dinge'), grid, h('p', { class: 'note' }, L(
        'The furniture, devices, fountain and cars of Animal Hospital, built from parts. Pick one, then change its size, parts and colours.',
        'Die Möbel, Geräte, der Brunnen und die Autos aus Animal Hospital, aus Teilen gebaut. Wähle eines und ändere Größe, Teile und Farben.')))];
    }
    default:
      return buildPanel(id, buildContext());
  }
}

// ------------------------------------------------------------------ page

const root = document.getElementById('objects')!;
const stage = h('div', { class: 'stage' });
const hero = h('canvas', { class: 'stage__sprite', style: 'cursor: crosshair' });
const stageTag = h('span', { class: 'stage__tag' });
const sideSlider = h('input', { type: 'range', class: 'slider', min: '0', max: '3', step: '1' });
const sideValue = h('b');
const previewRows = h('div', { class: 'sec__body' });
const tabSlot = h('div');
const panel = h('div', { class: 'library__body', role: 'tabpanel' });
panel.addEventListener('click', (e) => (e.target as Element).closest('.card, .swatch') && cheer(stage));
const barSlot = h('div', { style: 'display: contents' });
const name = nameTag();
name.onRename(renameThing);
const TURN_NAMES = ['0°', '90°', '180°', '270°'];
let sizeText = '';

function setTurn(next: Turn): void {
  turn = next;
  sideSlider.value = String(turn);
  sideSlider.setAttribute('aria-valuetext', TURN_NAMES[turn]);
  sideValue.textContent = TURN_NAMES[turn];
  stageTag.textContent = `${TURN_NAMES[turn]} · ${sizeText}`;
}

/** New: pick one of three rolled things, straight into My things. */
function newThing(): void {
  pickStart(() => shuffled(OBJECT_PRESETS).slice(0, 3).map((preset) => {
    const look = recolour(preset.prop);
    return {
      label: preset.name,
      picture: thumbnail(look, 150),
      choose: () => {
        addThing(preset.name, look);
        load(look, currentId);
        cheer(stage);
      },
    };
  }));
}

function renderBar(): void {
  const saved = current();
  const picker = h('select', { class: 'select bar__things', 'aria-label': L('My things', 'Meine Sachen') },
    h('option', { value: '' }, L('Not saved yet', 'Noch nicht gespeichert')), ...roster.map((s) => h('option', { value: s.id }, s.name)));
  picker.value = currentId ?? '';
  picker.addEventListener('change', () => {
    const chosen = roster.find((s) => s.id === picker.value);
    message = '';
    if (chosen) load(chosen.prop, chosen.id);
    else {
      setCurrent(null);
      render();
    }
  });
  const fileName = saved?.name ?? L('Object', 'Objekt');
  const { bar, undo: undoButton, redo: redoButton, pops } = topBar({
    tool: 'objects',
    title: word('objects'),
    about: [
      L('Build furniture, devices and cars from boxes, cylinders and balls on a tile footprint. Rules draw them in the island look, in all four camera turns. Made for Animal Hospital.',
        'Baue Möbel, Geräte und Autos aus Quadern, Zylindern und Kugeln auf einer Grundfläche aus Feldern. Regeln zeichnen sie im Insel-Stil, in allen vier Kameradrehungen. Gemacht für Animal Hospital.'),
      L('Every part is ray-cast in the 2:1 view with the master palette and the light of the plants: tops light, fronts in their colour, sides in shade. All four turns are drawn, so an object need not be symmetric.',
        'Jedes Teil wird in der 2:1-Ansicht mit der Hauptpalette und dem Licht der Pflanzen gezeichnet: Oberseiten hell, Fronten in ihrer Farbe, Seiten im Schatten. Alle vier Drehungen werden gezeichnet, ein Objekt muss also nicht symmetrisch sein.'),
      L('Files are JSON of type "pixel-object". The game draws them with drawObject() from engine/objects/object.ts, which also gives the points for every frame.',
        'Dateien sind JSON vom Typ „pixel-object“. Das Spiel zeichnet sie mit drawObject() aus engine/objects/object.ts, das für jedes Bild auch die Punkte liefert.'),
    ],
    things: picker,
    more: [
      { label: L('New object', 'Neues Objekt'), icon: 'plus', run: newThing },
      { label: saved ? L('Make a copy', 'Kopie machen') : L('Keep in My things', 'In Meine Sachen behalten'), icon: 'copy', run: () => {
        addThing(saved ? `${saved.name} 2` : pick(NAMES), prop);
        render();
      } },
      { label: L('Start over', 'Neu beginnen'), icon: 'reset', run: () => {
        prop = structuredClone(DEFAULT_BUILD);
        selected = 0;
        changed();
      } },
      { label: L('Export', 'Exportieren'), icon: 'download', run: () => download(`${fileName}.json`, propFile(fileName, prop)) },
      { label: L('Import', 'Importieren'), icon: 'upload', run: () => void importFile() },
      { label: expert ? L('Expert tools: on', 'Expertenwerkzeuge: an') : L('Expert tools: off', 'Expertenwerkzeuge: aus'), icon: 'sliders', run: () => {
        expert = !expert;
        writeStore(EXPERT_KEY, expert);
        if (!expert && tab === 'points') tab = 'things';
        render();
      } },
      { label: L('Delete', 'Löschen'), icon: 'trash', run: remove, danger: true, disabled: !saved },
    ],
    status: h('span', { class: 'bar__status', 'aria-live': 'polite' }, message || (saved ? L('Saved by itself', 'Speichert sich selbst') : '')),
    undo: undo.undo,
    redo: undo.redo,
    shuffle: () => shuffle(),
    relabel: () => {
      mount();
      render();
      shownVersion = -1;
    },
  });
  undoButton!.disabled = !undo.canUndo();
  redoButton!.disabled = !undo.canRedo();
  barSlot.replaceChildren(bar, ...pops);
}

function render(): void {
  stage.style.setProperty('--ground', ground);
  renderBar();
  setTurn(turn);
  name.set(current()?.name ?? '', L('Not saved yet', 'Noch nicht gespeichert'));
  const shownTabs = TABS.filter(([id]) => id !== 'points' || expert);
  // The die rolls a new thing, or new colours on the Parts tab; there is nothing to lock.
  const die = tab === 'things' || tab === 'parts' ? tabTools(() => shuffle(tab)) : [];
  tabSlot.replaceChildren(tabs(L('Sections', 'Bereiche'), shownTabs.map(([id, en, german, icon]) => ({ id, label: L(en, german), icon })), tab, (id) => {
    tab = id;
    panel.scrollTop = 0;
    render();
  }, new Set(), die));
  const scroll = panel.scrollTop;
  panel.replaceChildren(...panelFor(tab));
  panel.scrollTop = scroll;
  previewRows.replaceChildren(
    row(L('Turn', 'Drehung'), sideSlider, sideValue),
    row('', checkbox(word('animate'), !paused, (on) => {
      paused = !on;
    })),
    row(L('Ground', 'Boden'), segmented(L('Ground', 'Boden'), GROUNDS.map(([en, german, color]) => ({ id: color as string, label: L(en, german) })), ground, (color) => {
      ground = color;
      render();
    })),
  );
  shown = '';
}

/** Builds the page. Called again when the language changes, since every label is rebuilt. */
function mount(): void {
  document.documentElement.lang = currentLang();
  document.title = L('Object Editor', 'Objekt-Editor');
  sideSlider.setAttribute('aria-label', L('Turn', 'Drehung'));
  stage.replaceChildren(hero, stageTag, name.el, snapButton(() => savePicture(hero, current()?.name ?? L('Object', 'Objekt'))));
  const preview = h('details', { class: 'sec' }, h('summary', {}, word('preview')), previewRows);
  preview.open = true;
  root.replaceChildren(
    h('div', { class: 'shell' },
      barSlot,
      h('main', { class: 'shell__main' },
        h('section', { class: 'preview', 'aria-label': L('Preview', 'Vorschau') }, stage, preview),
        h('section', { class: 'library', 'aria-label': L('Object', 'Objekt') }, tabSlot, panel),
      ),
    ),
  );
}

// What the preview shows now; render() clears `shown` so marks follow the panel.
let shownVersion = -1;
let shown = '';
let ticks = 0;
let frameNow = 0;

// Tapping the picture picks the part under the pointer.
hero.addEventListener('click', (event) => {
  const box = hero.getBoundingClientRect();
  const x = Math.floor(((event.clientX - box.left) / box.width) * crop.w) + crop.x;
  const y = Math.floor(((event.clientY - box.top) / box.height) * crop.h) + crop.y;
  const i = drawObject(prop, turn, frameNow).partAt[y * OBJECT_W + x];
  if (i === undefined || i < 0) return;
  selected = i;
  tab = 'parts';
  render();
});

sideSlider.addEventListener('input', () => setTurn(Number(sideSlider.value) as Turn));
dragToTurn(stage, (step) => setTurn(((turn + step + 4) % 4) as Turn));
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.metaKey || event.ctrlKey) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setTurn(((turn + (event.key === 'ArrowRight' ? 1 : 3)) % 4) as Turn);
});
undoKeys(undo.undo, undo.redo);

mount();
crop = cropFor(prop);
render();

const frames = new Map<string, ObjectFrame>();
const frameOf = (at: Turn, frame: number) => {
  const key = `${at}|${frame}`;
  let hit = frames.get(key);
  if (!hit) frames.set(key, (hit = drawObject(prop, at, frame)));
  return hit;
};
const tick = (ms: number) => {
  if (shownVersion !== version) {
    shownVersion = version;
    frames.clear();
    sizeText = L(`${prop.w}×${prop.d} tiles, ${heightOf(prop)} px`, `${prop.w}×${prop.d} Felder, ${heightOf(prop)} px`);
    setTurn(turn);
  }
  if (!paused) ticks = ms;
  frameNow = Math.floor((ticks / 1000) * LOOP_RATE) % framesOf(prop);
  const key = `${version}|${turn}|${frameNow}|${tab}|${selected}|${stage.clientWidth}`;
  if (key !== shown) {
    shown = key;
    const { sprite, points, partAt } = frameOf(turn, frameNow);
    // Marks go on a copy, not on the cached frame.
    const marked = new ObjectSprite();
    sprite.pixels.forEach((c, i) => (marked.pixels[i] = c));
    if (tab === 'parts') {
      // The chosen part's outline in pink.
      for (let y = 1; y < OBJECT_H - 1; y++) for (let x = 1; x < OBJECT_W - 1; x++) {
        const at = y * OBJECT_W + x;
        if (partAt[at] === selected && [1, -1, OBJECT_W, -OBJECT_W].some((o) => partAt[at + o] !== selected)) marked.set(x, y, '#ff00ff');
      }
    }
    if (tab === 'points') for (const p of Object.values(points)) marked.set(p.x, p.y, p.visible ? '#ff00ff' : '#ff00ff66');
    paintSprite(hero, marked, crop);
    fitWhole(hero, Math.min(stage.clientWidth, stage.clientHeight) - 40);
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
document.body.dataset.ready = '1';
