// The wall editor: the wall pieces buildings are made of (engine/world/building/walls.ts), shown on a
// small test ground with a hut, a ramp and a cliff, so a wall is seen over slopes and edges, in the
// light and with a roof on. A rule-drawn wall can be frozen into pixels and polished in the shared
// pixel editor; a frozen built-in wall is locked and the games build with the painted one.
import '../props/style.css';
import { canSaveToProject, saveStores, storeTracker } from '../../shared/project.ts';
import { WALL_STORE } from '../../engine/world/building/walls.ts';
import './style.css';
import { createScene } from '../../engine/world/scene.ts';
import { LEVEL_PX, setLevel } from '../../engine/world/terrain.ts';
import { World } from '../../engine/world/world.ts';
import { cellKey, edgeKey, emptyBuilding, type Axis, type Building, type PieceKind } from '../../engine/world/building/building.ts';
import { thatchRoof } from '../../engine/world/building/pieces/thatch-roof.ts';
import { freezeWall } from '../../engine/world/building/pieces/painted-wall.ts';
import {
  addWall, changeWall, deleteWall, edgeKindOf, lockWall, readWallFile, reloadWalls, unlockWall, wallById, wallFile, wallKinds, type WallKind,
} from '../../engine/world/building/walls.ts';
import { blankGrid, gridsOf, toArt, type Grid } from '../../engine/core/stamp.ts';
import { pixelEditor } from '../paint/pixel-editor.ts';
import { download, pickFile, readStore, writeStore } from '../../shared/files.ts';
import { h, history, nameTag, savePicture, snapButton, topBar, undoKeys, word } from '../../shared/shell.ts';
import { choice, library, numberField, pixelButton, toggle, viewTools, type Library, type Option, confirmDialog, workspace } from '../../ui/components.ts';
import { currentLang } from '../../shared/lang.ts';

const L = (en: string, de: string) => (currentLang() === 'de' ? de : en);

// ------------------------------------------------------------------ state

type Tab = 'rule' | 'pixels';
interface Prefs { id: string; tab: Tab; roof: boolean; height: number; zoom: number }
const PREFS_KEY = 'pixel-walls-tool';
const prefs: Prefs = { id: 'plank', tab: 'rule', roof: false, height: 4, zoom: 2, ...readStore<Partial<Prefs>>(PREFS_KEY, {}) };
if (!wallById(prefs.id)) prefs.id = 'plank';
const savePrefs = () => writeStore(PREFS_KEY, prefs);
const wall = (): WallKind => wallById(prefs.id) ?? wallKinds()[0];
let message = '';
let grids: Grid[] | null = null;

const undo = history(() => ({ id: prefs.id, w: wall() }), (v) => {
  if (v.id !== prefs.id) return;
  changeWall(v.id, { name: v.w.name, height: v.w.height, ...(v.w.art ? { art: v.w.art } : {}), ...(v.w.rule ? { rule: v.w.rule } : {}) });
  grids = null;
  render();
});
function changed(change: Parameters<typeof changeWall>[1], keepPanel = false): void {
  message = changeWall(prefs.id, change) ? '' : L('Could not save: this browser refuses storage here.', 'Nicht gespeichert: Dieser Browser erlaubt hier keinen Speicher.');
  undo.commit();
  benchDirty = true;
  if (keepPanel) renderBar(); else render();
}
function pick(id: string): void {
  prefs.id = id;
  grids = null;
  savePrefs();
  undo.reset();
  benchDirty = true;
  render();
}

// ------------------------------------------------------------------ the test ground

/** A small piece of land with what walls must cope with: flat ground, a ramp, a cliff and the shore. */
function benchWorld(): World {
  const scene = createScene('bench', 14, 12, false);
  const world = new World(scene, 0);
  for (let j = 0; j < 12; j++) for (let i = 0; i < 14; i++) {
    const edge = Math.min(i, j, 13 - i, 11 - j);
    let l = edge === 0 ? -2 : edge === 1 ? 0 : 1;
    if (edge >= 2 && i >= 8 && i <= 11 && j >= 2 && j <= 4) l = 4; // a plateau with cliffs round it
    if (edge >= 2 && j >= 7 && j <= 9 && i >= 8) l = 1 + (i - 8); // a ramp, a level a tile
    setLevel(world.map, i, j, l);
  }
  world.redraw();
  return world;
}
const world = benchWorld();

/** Where the bench puts walls: a hut with a door, a wall up the ramp, one along the cliff top and one at its foot. */
function benchBuilding(kind: string): Building {
  const b = emptyBuilding(prefs.height);
  const add = (axis: Axis, i: number, j: number) => b.edges.set(edgeKey({ axis, i, j }), { kind, edge: { axis, i, j } });
  for (let i = 3; i <= 5; i++) { add('H', i, 3); if (i !== 4) add('H', i, 6); }
  for (let j = 3; j <= 5; j++) { add('V', 3, j); add('V', 6, j); }
  for (let i = 8; i <= 11; i++) add('H', i, 7); // up the ramp
  for (let i = 8; i <= 11; i++) add('H', i, 2); // along the cliff top
  for (let j = 2; j <= 4; j++) add('V', 12, j); // at the cliff's side
  if (prefs.roof) for (let j = 3; j <= 5; j++) for (let i = 3; i <= 5; i++) b.cells.set(cellKey(i, j), { kind: 'thatch', i, j });
  return b;
}
let benchDirty = true;
const bench = h('canvas', { class: 'stage__sprite walls__bench' });
function drawBench(ms: number): void {
  const w = wall();
  world.pieceKinds = { [w.id]: edgeKindOf(w), thatch: thatchRoof({ rise: 3, eaves: 0.3, seed: 1 }) } as Record<string, PieceKind>;
  world.buildings = [benchBuilding(w.id)];
  // The middle of the ground, with room above for tall walls.
  const mid = world.screenOf(7, 6);
  const view = { x: Math.round(mid.x - 200), y: Math.round(mid.y - 150), w: 400, h: 250 };
  const image = world.compose(view, world.buildingThings(), undefined, false, ms);
  bench.width = image.width;
  bench.height = image.height;
  bench.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  bench.style.width = `${image.width * prefs.zoom}px`;
  bench.style.height = `${image.height * prefs.zoom}px`;
}

// ------------------------------------------------------------------ panels

const num = (icon: string, tip: string, value: number, min: number, max: number, set: (v: number) => void) =>
  numberField({ icon, tip }, value, set, { min, max, width: 24 });
const pb = (label: string, face: { icon: string; lit?: boolean; pressed?: boolean }, on: () => void) => pixelButton(label, face, on);

function freezeIt(): void {
  const w = wall();
  const art = freezeWall(edgeKindOf(w), w.height);
  lockWall(w.id, art);
  grids = null;
  prefs.tab = 'pixels';
  message = w.builtin ? L(`${w.name} is frozen: games build with the painted wall.`, `${w.name} ist eingefroren: Spiele bauen mit der gemalten Wand.`) : L('Frozen into pixels.', 'In Pixel eingefroren.');
  undo.commit();
  benchDirty = true;
  render();
}

function panelFor(tab: Tab): (Node | string)[] {
  const w = wall();
  const freezeLabel = w.builtin ? L('Freeze and lock', 'Einfrieren und sperren') : L('Freeze into pixels', 'In Pixel einfrieren');
  const freeze = pb(freezeLabel, { icon: 'freeze' }, freezeIt);
  if (tab === 'rule') {
    const height = num('height', L('Height (levels)', 'Höhe (Stufen)'), w.height, 1, 8, (v) => {
      if (w.builtin) { prefs.height = v; savePrefs(); benchDirty = true; } else changed({ height: v }, true);
    });
    if (w.art) return [height];
    // Only planks have options of their own; brick, stone and fences are drawn by rule as they are.
    const rule = w.rule!;
    if (rule.piece !== 'plank') return [h('div', { class: 'urow' }, height), h('div', { class: 'urow' }, ...(w.builtin ? [pb(L('Duplicate to edit', 'Zum Bearbeiten duplizieren'), { icon: 'copy' }, duplicate)] : []), freeze)];
    const o = rule.options;
    const set = (next: Partial<typeof o>) => {
      if (w.builtin) return;
      changed({ rule: { piece: 'plank', options: { ...o, ...next } } }, true);
    };
    const tops: Option[] = [{ id: 'slope', icon: 'slope', words: L('Slope', 'Schräg') }, { id: 'stepped', icon: 'steps', words: L('Stepped', 'Gestuft') }, { id: 'flat', icon: 'flat', words: L('Flat', 'Flach') }];
    return [
      h('div', { class: 'urow' }, height,
        ...(w.builtin ? [] : [
          num('wall', L('Overhang (px)', 'Überstand (px)'), o.overhang, 0, 6, (v) => set({ overhang: v })),
          num('grid', L('Pattern', 'Muster'), o.seed, 0, 99, (v) => set({ seed: v })),
          choice(L('Top', 'Oberkante'), tops, () => o.top, (v) => set({ top: v as typeof o.top }), 'buttons'),
        ])),
      h('div', { class: 'urow' }, ...(w.builtin ? [pb(L('Duplicate to edit', 'Zum Bearbeiten duplizieren'), { icon: 'copy' }, duplicate)] : []), freeze),
    ];
  }
  if (!w.art) return [freeze];
  const art = w.art;
  grids ??= gridsOf(art);
  const g = grids;
  const write = () => changeWall(w.id, { art: toArt(g, art.ox, art.oy) });
  // The foot of the wall, the two ends of its edge, and where the wall's height reaches.
  const guides = () => [
    { x0: 0, y0: art.oy, x1: art.w - 1, y1: art.oy, color: '#3a7bd5aa' },
    { x0: art.ox, y0: 0, x1: art.ox, y1: art.h - 1, color: '#3a7bd555' },
    { x0: art.ox + 15, y0: 0, x1: art.ox + 15, y1: art.h - 1, color: '#3a7bd555' },
    { x0: 0, y0: art.oy - w.height * LEVEL_PX, x1: art.w - 1, y1: art.oy - w.height * LEVEL_PX, color: '#e0332e66' },
  ];
  const onion = w.locked ? () => {
    const fresh = freezeWall(edgeKindOf({ ...w, art: undefined }), w.height);
    const out = blankGrid(art.w, art.h);
    gridsOf(fresh)[0].forEach((r, y) => r.forEach((c, x) => {
      const tx = x - fresh.ox + art.ox, ty = y - fresh.oy + art.oy;
      if (c && tx >= 0 && ty >= 0 && tx < art.w && ty < art.h) out[ty][tx] = c;
    }));
    return out;
  } : undefined;
  const editor = pixelEditor({
    grids: g, view: 0, pivot: { x: art.ox, y: art.oy }, guides, onion,
    live: () => { write(); benchDirty = true; },
    done: () => { write(); undo.commit(); benchDirty = true; },
    resize: (next, pivot) => { grids = next; changeWall(w.id, { art: toArt(next, pivot.x, pivot.y) }); undo.commit(); benchDirty = true; render(); },
    keys: ['driftwood', 'wood', 'bark', 'tan', 'stone', 'basalt', 'grey'],
  });
  return [
    editor.el,
    w.locked ? pb(L('Unlock', 'Entsperren'), { icon: 'unlock' }, async () => {
      if (!(await confirmDialog(L('Unlock and lose the painted pixels?', 'Entsperren und die gemalten Pixel verlieren?')))) return;
      unlockWall(w.id);
      grids = null;
      undo.reset();
      benchDirty = true;
      render();
    }) : '',
  ];
}

function duplicate(): void {
  const w = wall();
  pick(addWall({ name: `${w.name.replace(/ \(hut\)$/, '')} 2`, source: w.art ? 'painted' : 'rule', rule: w.rule && structuredClone(w.rule), art: w.art, height: w.builtin ? prefs.height : w.height }));
}

// ------------------------------------------------------------------ page

const root = document.getElementById('walls')!;
const stage = h('div', { class: 'stage props__stage walls__stage' });
const stageTag = h('span', { class: 'stage__tag' });
let shelf: Library;
const tabSlot = h('div');
const panel = h('div', { class: 'uside__list', role: 'tabpanel' });
const barSlot = h('div', { style: 'display: contents' });
const views = viewTools();
const name = nameTag();
name.onRename((n) => { if (n.trim() && !wall().builtin) changed({ name: n.trim() }); });

const TABS: Option[] = [{ id: 'rule', icon: 'wall', words: L('Wall', 'Wand') }, { id: 'pixels', icon: 'pencil', words: L('Pixels', 'Pixel') }];

function renderBar(): void {
  const w = wall();
  const { bar, undo: u, redo: r, pops } = topBar({
    sidebar: true,
    tool: 'walls',
    title: word('walls'),
    name: name.el,
    about: [
      L('The pieces buildings are made of: walls standing on the edges of map cells. Each is shown on a small test ground with a hut, a ramp and a cliff, with or without the thatch roof.',
        'Die Teile, aus denen Gebäude bestehen: Wände auf den Kanten der Kartenfelder. Jede wird auf einem kleinen Testgelände mit Hütte, Rampe und Klippe gezeigt, mit oder ohne Strohdach.'),
      L('Freeze a rule-drawn wall to keep its pixels and polish them by hand. A frozen built-in wall is locked: games build with the painted one (wallKind in engine/world/building/walls.ts).',
        'Friere eine regelgezeichnete Wand ein, um ihre Pixel zu behalten und von Hand nachzuarbeiten. Eine eingefrorene eingebaute Wand ist gesperrt: Spiele bauen mit der gemalten (wallKind in engine/world/building/walls.ts).'),
      L('In the Pixels tab, blue marks the foot and the two ends of the edge, red the wall\'s height.', 'Im Reiter Pixel markiert Blau den Fuß und die Enden der Kante, Rot die Höhe der Wand.'),
      L('Rock walls for caves are drawn by the cave code; they join this list once that code is in the engine.', 'Felswände für Höhlen zeichnet der Höhlen-Code; sie kommen in diese Liste, sobald dieser Code in der Engine ist.'),
    ],
    more: [
      { label: L('New painted wall', 'Neue gemalte Wand'), icon: 'plus', run: () => pick(addWall({ name: L('Painted wall', 'Gemalte Wand'), source: 'painted', art: toArt([blankGrid(24, 26)], 4, 22), height: 4 })) },
      { label: L('Duplicate', 'Duplizieren'), icon: 'copy', run: duplicate },
      { label: L('Export', 'Exportieren'), icon: 'download', run: () => download(`${w.name}.json`, wallFile(w)) },
      { label: L('Save to project', 'Im Projekt speichern'), icon: 'download', main: true, disabled: !canSaveToProject(), track: storeTracker([WALL_STORE]), run: () => void saveStores([WALL_STORE]).then((ok) => { message = ok ? L('Saved to the project (src/content/store); commit it to keep it.', 'Im Projekt gespeichert (src/content/store); committe es, um es zu behalten.') : L('Nothing saved: change something first, and run the local dev server.', 'Nichts gespeichert: ändere erst etwas und starte den lokalen Dev-Server.'); render(); }) },
      { label: L('Import', 'Importieren'), icon: 'upload', run: () => void (async () => {
        try {
          const read = readWallFile(await pickFile());
          pick(addWall({ name: read.name, source: read.source, rule: read.rule, art: read.art, height: read.height }));
        } catch {
          message = L('That file is not a wall.', 'Diese Datei ist keine Wand.');
          render();
        }
      })() },
      { label: L('Delete', 'Löschen'), icon: 'trash', danger: true, disabled: w.builtin, run: async () => {
        if (!(await confirmDialog(L(`Delete "${w.name}" from this device?`, `„${w.name}“ von diesem Gerät löschen?`)))) return;
        deleteWall(w.id);
        pick('plank');
      } },
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
  const w = wall();
  renderBar();
  name.set(w.name, L('Wall', 'Wand'));
  stageTag.textContent = `${w.art ? (w.locked ? L('frozen', 'eingefroren') : L('painted', 'gemalt')) : L('rule', 'Regel')} · ${w.builtin ? prefs.height : w.height} ${L('levels', 'Stufen')}`;
  shelf.redraw();
  const zoom = (by: number) => { prefs.zoom = Math.max(2, Math.min(4, prefs.zoom + by)); savePrefs(); benchDirty = true; };
  views.replaceChildren(snapButton(() => savePicture(bench, wall().name, 2)),
    pixelButton(L('Zoom in', 'Vergrößern'), { icon: 'zoomin' }, () => zoom(1)),
    pixelButton(L('Zoom out', 'Verkleinern'), { icon: 'zoomout' }, () => zoom(-1)),
    toggle(L('Thatch roof on the hut', 'Strohdach auf der Hütte'), { icon: 'roof' }, prefs.roof, (on) => { prefs.roof = on; savePrefs(); benchDirty = true; render(); }));
  tabSlot.replaceChildren(choice(L('Sections', 'Bereiche'), TABS, () => prefs.tab, (id) => { prefs.tab = id as Tab; savePrefs(); render(); }, 'buttons'));
  const scroll = panel.scrollTop;
  panel.replaceChildren(...panelFor(prefs.tab));
  panel.scrollTop = scroll;
  // A built-in wall is shown at the bench's height; one of this device at its own.
  if (!w.builtin) prefs.height = w.height;
  benchDirty = true;
}

function mount(): void {
  document.documentElement.lang = currentLang();
  document.title = L('Walls', 'Wände');
  stage.replaceChildren(h('div', { class: 'walls__scroll' }, bench), stageTag, views);
  shelf = library({
    key: 'pixel-walls', label: word('search'), empty: word('nothing'), selected: () => prefs.id, pick,
    items: () => wallKinds().map((k) => ({ id: k.id, icon: k.art ? 'pencil' : 'wall', words: k.name, mark: k.locked ? 'lock' : undefined, find: `${k.art ? 'painted' : 'rule'} ${k.locked ? 'locked frozen' : ''}` })),
  });
  root.replaceChildren(h('div', { class: 'shell' }, barSlot, workspace({
    key: 'pixel-walls', left: [shelf], centre: [stage], right: [tabSlot, panel], leftWidth: 280, rightWidth: 380,
  })));
}

undoKeys(undo.undo, undo.redo);
window.addEventListener('focus', () => { reloadWalls(); render(); });
mount();
render();
const tick = (ms: number) => {
  // The sea moves; redraw a few times a second, and at once after a change.
  if (benchDirty || Math.floor(ms / 250) !== Math.floor((ms - 16) / 250)) {
    benchDirty = false;
    drawBench(ms);
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
document.body.dataset.ready = '1';
