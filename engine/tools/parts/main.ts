// The parts editor: every wardrobe item (hair, beards, hats, tops, bottoms, shoes, tools) as the
// stamps the puppet draws, painted over in the shared pixel editor and seen at once on a figure from
// all eight sides, with wear. Edits are kept on this device per item (engine/character/parts.ts) and
// worn everywhere here: the wardrobe, scenes and games read the catalogue with them laid over.
import '../props/style.css';
import { canSaveToProject, saveStores, storeTracker } from '../../shared/project.ts';
import { PARTS_STORE } from '../../engine/character/parts.ts';
import './style.css';
import { CATALOG, type Entry } from '../../engine/character/catalog.ts';
import { baseLook, DEFAULT_FACE, facesFor, wear } from '../../engine/character/base.ts';
import { copyItem, dropEdits, importPart, isEdited, layersOf, partFile, saveEdits, type Layer } from '../../engine/character/parts.ts';
import { WEAR_MAX, weathered } from '../../engine/character/wear.ts';
import { AUTHORED } from '../../engine/core/poses.ts';
import { CHARACTER_ORIGIN, drawCharacter, FACING_RING, SPRITE_H, SPRITE_W, SLOTS, type Facing, type Item, type Slot } from '../../engine/core/puppet.ts';
import { withSunShadow } from '../../engine/world/island.ts';
import { PALETTE, SKIN_KEYS, type PaletteKey } from '../../engine/core/palette.ts';
import { type Grid } from '../../engine/core/stamp.ts';
import { pixelEditor } from '../paint/pixel-editor.ts';
import { download, pickFile, readStore, writeStore } from '../../shared/files.ts';
import { box, choice, confirmDialog, filterToggles, library, pixelButton, turnView, viewTools, workspace, type Library } from '../../ui/components.ts';
import { h, history, row, savePicture, section, snapButton, topBar, undoKeys, word, rangeInput } from '../../shared/shell.ts';
import { currentLang } from '../../shared/lang.ts';
import { pictureCache, trimmed } from '../../shared/pixels.ts';

const L = (en: string, de: string) => (currentLang() === 'de' ? de : en);
const SLOT_ICON: Partial<Record<Slot, string>> = { top: 'clothes', hair: 'hair', tool: 'tool' };
const SLOT_WORDS: Record<Slot, [string, string]> = {
  hair: ['Hair', 'Haare'], beard: ['Beards', 'Bärte'], hat: ['Hats', 'Hüte'], top: ['Tops', 'Oberteile'], bottom: ['Bottoms', 'Hosen'], shoes: ['Shoes', 'Schuhe'], tool: ['Tools', 'Werkzeuge'],
};

// ------------------------------------------------------------------ state

interface Prefs { id: string; slot: Slot | 'all'; layer: string; facing: Facing; wear: number; skin: PaletteKey; hair: PaletteKey }
const PREFS_KEY = 'pixel-parts-tool';
const prefs: Prefs = { id: CATALOG[0].id, slot: 'all', layer: '', facing: 4, wear: 0, skin: 'skinC', hair: 'hairBrown', ...readStore<Partial<Prefs>>(PREFS_KEY, {}) };
if (!CATALOG.some((e) => e.id === prefs.id)) prefs.id = CATALOG[0].id;
const savePrefs = () => writeStore(PREFS_KEY, prefs);
const entry = (): Entry => CATALOG.find((e) => e.id === prefs.id)!;
const originalOf = (e: Entry) => e.original ?? e.item;
/** The item being painted: the entry's own, edited in place, and copied for drawing after every stroke. */
let working: Item = copyItem(entry().item);
let shown: Item = copyItem(working);
let message = '';

function store(): void {
  const e = entry();
  if (!saveEdits(e.id, originalOf(e), working)) message = L('Could not save: this browser refuses storage here.', 'Nicht gespeichert: Dieser Browser erlaubt hier keinen Speicher.');
  // The catalogue entry follows, so the rest of this page (and a wardrobe opened later) sees the edit.
  const edited = isEdited(e.id);
  if (edited && !e.original) e.original = e.item;
  e.item = edited ? copyItem(working) : originalOf(e);
  if (!edited) delete e.original;
}
const undo = history(() => ({ id: prefs.id, item: working }), (v) => {
  if (v.id !== prefs.id) return;
  working = v.item;
  store();
  shown = copyItem(working);
  render();
});
function pick(id: string): void {
  prefs.id = id;
  prefs.layer = '';
  working = copyItem(entry().item);
  shown = copyItem(working);
  savePrefs();
  undo.reset();
  render();
}

// ------------------------------------------------------------------ the figure

const lookWith = (item: Item) => ({ ...wear(baseLook(prefs.skin, prefs.hair), weathered(item, prefs.wear)), faces: facesFor(prefs.skin, DEFAULT_FACE, prefs.hair, 'happy') });
const big = h('canvas', { class: 'stage__sprite parts__big' });
/** The picked side, large. */
function drawFigures(): void {
  const look = lookWith(shown);
  const pose = AUTHORED.idle.frames[0];
  // With its shadow cast from the sun on flat ground, as far as the picture reaches.
  const s = withSunShadow(drawCharacter(look, pose, prefs.facing), SPRITE_W, SPRITE_H, CHARACTER_ORIGIN);
  big.width = SPRITE_W;
  big.height = SPRITE_H;
  const bctx = big.getContext('2d')!;
  const bi = bctx.createImageData(SPRITE_W, SPRITE_H);
  for (let y = 0; y < SPRITE_H; y++) for (let x = 0; x < SPRITE_W; x++) {
    const hex = s.get(x, y);
    if (!hex) continue;
    const o = (y * SPRITE_W + x) * 4;
    for (let c = 0; c < 3; c++) bi.data[o + c] = parseInt(hex.slice(1 + 2 * c, 3 + 2 * c), 16);
    bi.data[o + 3] = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255;
  }
  bctx.putImageData(bi, 0, 0);
  big.style.width = big.style.height = `${SPRITE_W * 6}px`;
}
/** Turns the figure to the next side round, to the layer that side shows where the item has one. */
function turnFigure(step: number): void {
  prefs.facing = FACING_RING[(FACING_RING.indexOf(prefs.facing) + step + 8) % 8];
  // The layer that side shows, where the item has one.
  const side = [5, 7].includes(prefs.facing) ? 'E' : [2, 3, 6].includes(prefs.facing) ? 'back' : 'front';
  const layers = layersOf(working);
  const want = side === 'E' ? layers.find((l) => l.key.endsWith('.E.head')) : layers.find((l) => l.key.endsWith(`.${side}`) && l.key.split('.')[0] === (prefs.layer.split('.')[0] || l.key.split('.')[0]));
  if (want) prefs.layer = want.key;
  savePrefs();
  render();
}

// ------------------------------------------------------------------ library

const thumbs = pictureCache('thumb', 300);
function thumb(e: Entry): HTMLCanvasElement {
  return thumbs.of(`${e.id}|${isEdited(e.id)}|${e.item === working ? JSON.stringify(working).length : ''}`, () => {
    const s = drawCharacter(lookWith(e.item), AUTHORED.idle.frames[0], 4);
    return trimmed(s, SPRITE_W, SPRITE_H, 52);
  });
}
/** The library's tiles: the items of the kind chosen; the search finds them by slot and "edited" too. */
const libraryItems = () => CATALOG.filter((e) => prefs.slot === 'all' || e.slot === prefs.slot).map((e) => ({
  id: e.id, picture: thumb(e), words: `${e.label} · ${L(...SLOT_WORDS[e.slot])}`, mark: isEdited(e.id) ? 'pencil' : undefined, find: `${e.slot} ${isEdited(e.id) ? 'edited' : ''}`,
}));
let shelf: Library | undefined;
const renderLibrary = () => shelf?.redraw();

// ------------------------------------------------------------------ panel

function layerPanel(): (Node | string)[] {
  const e = entry();
  const layers = layersOf(working);
  if (!layers.length) return [h('p', { class: 'note' }, L('This item has nothing to paint.', 'Dieses Teil hat nichts zum Malen.'))];
  const layer: Layer = layers.find((l) => l.key === prefs.layer) ?? layers[0];
  prefs.layer = layer.key;
  const g = layer.get(working)!;
  const original = layer.get(originalOf(e));
  const grids: Grid[] = [g];
  const editor = pixelEditor({
    grids, view: 0,
    onion: () => original,
    live: () => { layer.set(working, grids[0]); shown = copyItem(working); dirty = true; },
    done: () => { layer.set(working, grids[0]); store(); undo.commit(); shown = copyItem(working); dirty = true; renderLibrary(); },
    keys: e.colors,
  });
  return [
    section(L('Layer', 'Ebene'),
      choice(L('Layer', 'Ebene'), layers.map((l) => ({ id: l.key, words: L(l.what.en, l.what.de) })), () => layer.key, (k) => { prefs.layer = k; savePrefs(); render(); }, 'list'),
      h('p', { class: 'note' }, L(
        'The puppet draws these stamps on the moving body: the head ones turn with the head, the torso with the chest, a sleeve or trouser strip runs from the joint down. Tap a side of the figure to pick the layer it shows.',
        'Die Puppe zeichnet diese Stempel auf den bewegten Körper: Kopfstempel drehen mit dem Kopf, der Rumpf mit der Brust, ein Ärmel- oder Hosenstreifen läuft vom Gelenk nach unten. Tippe eine Seite der Figur an, um ihre Ebene zu wählen.'))),
    section(L('Pixels', 'Pixel'), editor.el),
    section(L('Original', 'Original'),
      h('p', { class: 'note' }, isEdited(e.id) ? L('Polished on this device. The onion skin shows what the rules made.', 'Auf diesem Gerät überarbeitet. Die Zwiebelhaut zeigt, was die Regeln gemacht haben.') : L('As the rules made it.', 'Wie die Regeln es gemacht haben.')),
      pixelButton(L('Back to the original', 'Zurück zum Original'), { icon: 'reset' }, async () => {
        if (!(await confirmDialog(L('Go back to the original and lose the painting?', 'Zum Original zurück und die Malerei verlieren?')))) return;
        dropEdits(e.id);
        working = copyItem(originalOf(e));
        store();
        shown = copyItem(working);
        undo.commit();
        render();
      })),
  ];
}

// ------------------------------------------------------------------ page

const root = document.getElementById('parts')!;
const stage = h('div', { class: 'stage props__stage' });
const stageTag = h('span', { class: 'stage__tag' });
const arrows = turnView(stage, turnFigure);
const under = h('div', { class: 'props__under' });
const panel = h('div', { class: 'uside__list' });
const barSlot = h('div', { style: 'display: contents' });
let dirty = true;

function renderBar(): void {
  const e = entry();
  const { bar, undo: u, redo: r, pops } = topBar({
    sidebar: true,
    tool: 'parts',
    title: word('parts'),
    about: [
      L('The wardrobe\'s parts as the pixels the puppet draws: hair, beards, hats, clothes, shoes and tools. Paint over any of them and see it on a figure from all eight sides, with wear.',
        'Die Teile der Garderobe als die Pixel, die die Puppe zeichnet: Haare, Bärte, Hüte, Kleidung, Schuhe und Werkzeuge. Übermale jedes davon und sieh es an einer Figur von allen acht Seiten, mit Abnutzung.'),
      L('Edits stay on this device and are worn everywhere here: in the wardrobe, scenes and games (engine/character/parts.ts). Export one to keep it with a game.',
        'Änderungen bleiben auf diesem Gerät und werden hier überall getragen: in der Garderobe, in Szenen und Spielen (engine/character/parts.ts). Exportiere eines, um es mit einem Spiel aufzubewahren.'),
    ],
    more: [
      { label: L('Export', 'Exportieren'), icon: 'download', disabled: !isEdited(e.id), run: () => download(`${e.label}.json`, partFile(e.id)) },
      { label: L('Save to project', 'Im Projekt speichern'), icon: 'download', main: true, disabled: !canSaveToProject(), track: storeTracker([PARTS_STORE]), run: () => void saveStores([PARTS_STORE]).then((ok) => { message = ok ? L('Saved to the project (src/content/store); commit it to keep it.', 'Im Projekt gespeichert (src/content/store); committe es, um es zu behalten.') : L('Nothing saved: change something first, and run the local dev server.', 'Nichts gespeichert: ändere erst etwas und starte den lokalen Dev-Server.'); render(); }) },
      { label: L('Import', 'Importieren'), icon: 'upload', run: () => void (async () => {
        try {
          const id = importPart(await pickFile());
          message = L('Imported; reload to see it everywhere.', 'Importiert; neu laden, um es überall zu sehen.');
          if (CATALOG.some((x) => x.id === id)) location.reload();
        } catch {
          message = L('That file is not a part.', 'Diese Datei ist kein Teil.');
          render();
        }
      })() },
    ],
    status: h('span', { class: 'bar__status', 'aria-live': 'polite' }, message),
    undo: undo.undo,
    redo: undo.redo,
    relabel: () => { mount(); render(); },
  });
  u!.disabled = !undo.canUndo();
  r!.disabled = !undo.canRedo();
  barSlot.replaceChildren(bar, ...pops);
}

function render(): void {
  renderBar();
  const e = entry();
  stageTag.textContent = `${e.label} · ${L(...SLOT_WORDS[e.slot])}`;
  renderLibrary();
  const wearInput = rangeInput({ min: '0', max: String(WEAR_MAX), step: '1', 'aria-label': L('Wear', 'Abnutzung') });
  wearInput.value = String(prefs.wear);
  wearInput.addEventListener('input', () => { prefs.wear = Number(wearInput.value); savePrefs(); dirty = true; });
  under.replaceChildren(
    row(L('Wear', 'Abnutzung'), wearInput),
    row(L('Skin', 'Haut'), choice(L('Skin', 'Haut'), SKIN_KEYS.map((k) => ({ id: k, color: PALETTE[k].base })), () => prefs.skin, (k) => { prefs.skin = k as PaletteKey; savePrefs(); thumbs.of('', () => h('canvas')); render(); }, 'colors', 44)));
  const scroll = panel.scrollTop;
  panel.replaceChildren(...layerPanel());
  panel.scrollTop = scroll;
  dirty = true;
}

function mount(): void {
  document.documentElement.lang = currentLang();
  document.title = L('Parts', 'Teile');
  stage.replaceChildren(big, stageTag, ...arrows, viewTools(snapButton(() => savePicture(big, entry().label))));
  const slots = () => SLOTS.map((id) => ({ id, icon: SLOT_ICON[id], words: L(...SLOT_WORDS[id]) }));
  shelf = library({
    key: 'pixel-parts', label: word('search'), empty: word('nothing'), items: libraryItems, selected: () => prefs.id, pick,
    filters: () => [filterToggles(slots(), () => prefs.slot, (id) => { prefs.slot = id as typeof prefs.slot; savePrefs(); render(); })],
  });
  root.replaceChildren(h('div', { class: 'shell' }, barSlot, workspace({
    key: 'pixel-parts', left: [shelf], centre: [stage, box(under)], right: [panel], leftWidth: 280, rightWidth: 380,
  })));
}

undoKeys(undo.undo, undo.redo);
mount();
render();
const tick = () => {
  if (dirty) {
    dirty = false;
    drawFigures();
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
document.body.dataset.ready = '1';
