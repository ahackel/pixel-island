// The parts editor: every wardrobe item (hair, beards, hats, tops, bottoms, shoes, tools) as the
// stamps the puppet draws, painted over in the shared pixel editor and seen at once on a figure from
// all eight sides, with wear. Edits are kept on this device per item (engine/character/parts.ts) and
// worn everywhere here: the wardrobe, scenes and games read the catalogue with them laid over.
import '../props/style.css';
import './style.css';
import { CATALOG, type Entry } from '../../engine/character/catalog.ts';
import { baseLook, DEFAULT_FACE, facesFor, wear } from '../../engine/character/base.ts';
import { copyItem, dropEdits, importPart, isEdited, layersOf, partFile, saveEdits, type Layer } from '../../engine/character/parts.ts';
import { WEAR_MAX, weathered } from '../../engine/character/wear.ts';
import { AUTHORED } from '../../engine/core/poses.ts';
import { drawCharacter, FACING_RING, SPRITE_H, SPRITE_W, SLOTS, type Facing, type Item, type Slot } from '../../engine/core/puppet.ts';
import { SKIN_KEYS, type PaletteKey } from '../../engine/core/palette.ts';
import { type Grid } from '../../engine/core/stamp.ts';
import { pixelEditor } from '../paint/pixel-editor.ts';
import { download, pickFile, readStore, writeStore } from '../../shared/files.ts';
import { button, h, history, icon, row, savePicture, section, segmented, snapButton, topBar, undoKeys, word } from '../../shared/shell.ts';
import { currentLang } from '../../shared/lang.ts';
import { pictureCache, trimmed } from '../../shared/pixels.ts';

const L = (en: string, de: string) => (currentLang() === 'de' ? de : en);
const SLOT_WORDS: Record<Slot, [string, string]> = {
  hair: ['Hair', 'Haare'], beard: ['Beards', 'Bärte'], hat: ['Hats', 'Hüte'], top: ['Tops', 'Oberteile'], bottom: ['Bottoms', 'Hosen'], shoes: ['Shoes', 'Schuhe'], tool: ['Tools', 'Werkzeuge'],
};

// ------------------------------------------------------------------ state

interface Prefs { id: string; slot: Slot | 'all'; query: string; layer: string; facing: Facing; wear: number; skin: PaletteKey; hair: PaletteKey }
const PREFS_KEY = 'pixel-parts-tool';
const prefs: Prefs = { id: CATALOG[0].id, slot: 'all', query: '', layer: '', facing: 4, wear: 0, skin: 'skinC', hair: 'hairBrown', ...readStore<Partial<Prefs>>(PREFS_KEY, {}) };
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
const figures = h('canvas', { class: 'parts__figures' });
const big = h('canvas', { class: 'stage__sprite parts__big' });
/** All eight sides in a row, and the picked one large. */
function drawFigures(): void {
  const look = lookWith(shown);
  const pose = AUTHORED.idle.frames[0];
  const cell = 40;
  figures.width = cell * 8;
  figures.height = 56;
  const ctx = figures.getContext('2d')!;
  const image = ctx.createImageData(figures.width, figures.height);
  FACING_RING.forEach((facing, k) => {
    const s = drawCharacter(look, pose, facing);
    for (let y = 0; y < 56; y++) for (let x = 0; x < cell; x++) {
      const hex = s.get(x + (SPRITE_W - cell) / 2, y + 6);
      const o = (y * figures.width + k * cell + x) * 4;
      if (hex) { for (let c = 0; c < 3; c++) image.data[o + c] = parseInt(hex.slice(1 + 2 * c, 3 + 2 * c), 16); image.data[o + 3] = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255; }
      else if (facing === prefs.facing) { image.data[o] = 58; image.data[o + 1] = 123; image.data[o + 2] = 213; image.data[o + 3] = 30; }
    }
  });
  ctx.putImageData(image, 0, 0);
  const s = drawCharacter(look, pose, prefs.facing);
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
figures.addEventListener('click', (e) => {
  const r = figures.getBoundingClientRect();
  const k = Math.floor(((e.clientX - r.left) / r.width) * 8);
  prefs.facing = FACING_RING[Math.max(0, Math.min(7, k))];
  // The layer that side shows, where the item has one.
  const side = [5, 7].includes(prefs.facing) ? 'E' : [2, 3, 6].includes(prefs.facing) ? 'back' : 'front';
  const layers = layersOf(working);
  const want = side === 'E' ? layers.find((l) => l.key.endsWith('.E.head')) : layers.find((l) => l.key.endsWith(`.${side}`) && l.key.split('.')[0] === (prefs.layer.split('.')[0] || l.key.split('.')[0]));
  if (want) prefs.layer = want.key;
  savePrefs();
  render();
});

// ------------------------------------------------------------------ library

const thumbs = pictureCache('thumb', 300);
function thumb(e: Entry): HTMLCanvasElement {
  return thumbs.of(`${e.id}|${isEdited(e.id)}|${e.item === working ? JSON.stringify(working).length : ''}`, () => {
    const s = drawCharacter(lookWith(e.item), AUTHORED.idle.frames[0], 4);
    return trimmed(s, SPRITE_W, SPRITE_H, 52);
  });
}
const grid = h('div', { class: 'grid grid--small props__grid' });
const search = h('input', { type: 'search', class: 'props__search' });
search.addEventListener('input', () => { prefs.query = search.value; savePrefs(); renderLibrary(); });
function renderLibrary(): void {
  const q = prefs.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = CATALOG.filter((e) => (prefs.slot === 'all' || e.slot === prefs.slot) && q.every((w) => `${e.label} ${e.id} ${e.slot} ${isEdited(e.id) ? 'edited' : ''}`.toLowerCase().includes(w)));
  grid.replaceChildren(...list.map((e) => button({ class: 'card', 'aria-pressed': String(e.id === prefs.id), title: e.label }, () => pick(e.id),
    h('span', { class: 'card__picture' }, thumb(e)),
    h('span', { class: 'card__label' }, e.label),
    h('span', { class: 'props__badges' }, h('span', { class: 'props__badge' }, L(...SLOT_WORDS[e.slot])),
      isEdited(e.id) ? h('span', { class: 'props__badge props__badge--painted' }, L('polished', 'überarbeitet')) : null))));
}

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
      h('div', { class: 'seg seg--wrap', role: 'radiogroup', 'aria-label': L('Layer', 'Ebene') },
        ...layers.map((l) => button({ role: 'radio', 'aria-checked': String(l.key === layer.key) }, () => { prefs.layer = l.key; savePrefs(); render(); }, L(l.what.en, l.what.de)))),
      h('p', { class: 'note' }, L(
        'The puppet draws these stamps on the moving body: the head ones turn with the head, the torso with the chest, a sleeve or trouser strip runs from the joint down. Tap a side of the figure to pick the layer it shows.',
        'Die Puppe zeichnet diese Stempel auf den bewegten Körper: Kopfstempel drehen mit dem Kopf, der Rumpf mit der Brust, ein Ärmel- oder Hosenstreifen läuft vom Gelenk nach unten. Tippe eine Seite der Figur an, um ihre Ebene zu wählen.'))),
    section(L('Pixels', 'Pixel'), editor.el),
    section(L('Original', 'Original'),
      h('p', { class: 'note' }, isEdited(e.id) ? L('Polished on this device. The onion skin shows what the rules made.', 'Auf diesem Gerät überarbeitet. Die Zwiebelhaut zeigt, was die Regeln gemacht haben.') : L('As the rules made it.', 'Wie die Regeln es gemacht haben.')),
      button({ class: 'toggle' }, () => {
        if (!confirm(L('Go back to the original and lose the painting?', 'Zum Original zurück und die Malerei verlieren?'))) return;
        dropEdits(e.id);
        working = copyItem(originalOf(e));
        store();
        shown = copyItem(working);
        undo.commit();
        render();
      }, L('Back to the original', 'Zurück zum Original'))),
  ];
}

// ------------------------------------------------------------------ page

const root = document.getElementById('parts')!;
const stage = h('div', { class: 'stage props__stage' });
const stageTag = h('span', { class: 'stage__tag' });
const under = h('div', { class: 'props__under' });
const head = h('div', { class: 'props__libhead' });
const panel = h('div', { class: 'library__body' });
const barSlot = h('div', { style: 'display: contents' });
let dirty = true;

function renderBar(): void {
  const e = entry();
  const { bar, undo: u, redo: r, pops } = topBar({
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
  search.value = prefs.query;
  search.placeholder = L('Search parts', 'Teile suchen');
  search.setAttribute('aria-label', L('Search parts', 'Teile suchen'));
  const chip = (text: string, on: boolean, flip: () => void) => button({ class: 'toggle props__chip', 'aria-pressed': String(on) }, () => { flip(); savePrefs(); render(); }, text);
  head.replaceChildren(h('label', { class: 'props__searchrow' }, icon('search'), search), h('div', { class: 'props__chips' },
    chip(L('All', 'Alle'), prefs.slot === 'all', () => (prefs.slot = 'all')),
    ...SLOTS.map((s) => chip(L(...SLOT_WORDS[s]), prefs.slot === s, () => (prefs.slot = prefs.slot === s ? 'all' : s)))));
  renderLibrary();
  const wearInput = h('input', { type: 'range', class: 'slider', min: '0', max: String(WEAR_MAX), step: '1', 'aria-label': L('Wear', 'Abnutzung') });
  wearInput.value = String(prefs.wear);
  wearInput.addEventListener('input', () => { prefs.wear = Number(wearInput.value); savePrefs(); dirty = true; });
  under.replaceChildren(figures,
    row(L('Wear', 'Abnutzung'), wearInput),
    row(L('Skin', 'Haut'), segmented(L('Skin', 'Haut'), SKIN_KEYS.map((k, n) => ({ id: k, label: String(n + 1) })), prefs.skin, (k) => { prefs.skin = k; savePrefs(); thumbs.of('', () => h('canvas')); render(); })));
  const scroll = panel.scrollTop;
  panel.replaceChildren(...layerPanel());
  panel.scrollTop = scroll;
  dirty = true;
}

function mount(): void {
  document.documentElement.lang = currentLang();
  document.title = L('Parts', 'Teile');
  stage.replaceChildren(big, stageTag, snapButton(() => savePicture(big, entry().label)));
  root.replaceChildren(h('div', { class: 'shell' }, barSlot,
    h('main', { class: 'shell__main props__main' },
      h('section', { class: 'library props__library', 'aria-label': L('Parts', 'Teile') }, head, h('div', { class: 'library__body' }, grid)),
      h('section', { class: 'preview', 'aria-label': L('Preview', 'Vorschau') }, stage, under),
      h('section', { class: 'library', 'aria-label': L('Part', 'Teil') }, h('div'), panel))));
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
