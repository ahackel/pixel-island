// The particle editor: the particle systems assets carry (engine/world/particles.ts): the sparks a fire throws and the
// glow halo round it, a lantern's light. Each is shown at work on a flame or a torch, by day and at night (then with its
// halo), kept on this device and saved into the game's project (src/content/store/pixel-particles.json) for the game.
import '../props/style.css';
import './style.css';
import { canSaveToProject, saveStores, storeTracker } from '../../shared/project.ts';
import { readStore, writeStore } from '../../shared/files.ts';
import { currentLang } from '../../shared/lang.ts';
import { h, history, nameTag, savePicture, snapButton, topBar, undoKeys, word } from '../../shared/shell.ts';
import { choice, colorField, confirmDialog, field, fields, library, numberField, pixelButton, section, toggle, viewTools, workspace, type Library, type Option } from '../../ui/components.ts';
import { FIRE_KEYS, PALETTE, PALETTE_KEYS, type PaletteKey, type Tone } from '../../engine/core/palette.ts';
import {
  BUILT_IN, cleanSystem, deleteSystem, isBuiltIn, ParticlePreview, particleSystem, particleSystems, PARTICLE_STORE, reloadSystems, saveSystem,
  type Paint, type ParticleSystem, type PreviewOn,
} from '../../engine/world/particles.ts';

const L = (en: string, de: string) => (currentLang() === 'de' ? de : en);

// ------------------------------------------------------------------ state

interface Prefs { id: string; on: PreviewOn; night: boolean; zoom: number }
const PREFS_KEY = 'pixel-particles-tool';
const prefs: Prefs = { id: 'sparks', on: 'flame', night: true, zoom: 4, ...readStore<Partial<Prefs>>(PREFS_KEY, {}) };
if (!particleSystem(prefs.id)) prefs.id = particleSystems()[0].id;
const savePrefs = () => writeStore(PREFS_KEY, prefs);
const current = (): ParticleSystem => particleSystem(prefs.id) ?? particleSystems()[0];
let message = '';

const undo = history(() => current(), (v) => {
  if (v.id !== prefs.id) return;
  saveSystem(v);
  render();
});
/** Changes the system shown and keeps it; `keepPanel` while a number is dragged, so its field is not rebuilt under the finger. */
function change(edit: (s: ParticleSystem) => void, keepPanel = false): void {
  const next = structuredClone(current());
  edit(next);
  message = saveSystem(cleanSystem(next)!) ? '' : L('Could not save: this browser refuses storage here.', 'Nicht gespeichert: Dieser Browser erlaubt hier keinen Speicher.');
  undo.commit();
  if (keepPanel) renderBar(); else render();
}
function pick(id: string): void {
  prefs.id = id;
  savePrefs();
  undo.reset();
  render();
}
/** A new id from a name, unused so far: what assets name the system by. */
function freshId(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'particles';
  let id = base;
  for (let n = 2; particleSystem(id); n++) id = `${base}-${n}`;
  return id;
}
function add(from: ParticleSystem, name: string): void {
  const id = freshId(name);
  saveSystem({ ...structuredClone(from), id, name });
  pick(id);
}

// ------------------------------------------------------------------ the preview

const W = 96, H = 72;
const preview = new ParticlePreview(W, H);
const canvas = h('canvas', { class: 'stage__sprite particles__preview', width: String(W), height: String(H) });
const ctx = canvas.getContext('2d')!;
function draw(ms: number): void {
  const image = preview.frame(current(), ms, prefs);
  ctx.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0);
  canvas.style.width = `${W * prefs.zoom}px`;
  canvas.style.height = `${H * prefs.zoom}px`;
}

// ------------------------------------------------------------------ panels

/** A number of the system, set without rebuilding the panel. `step` is a power of two's fraction, so values stay exact. */
const num = (words: string, tip: string, value: number, min: number, max: number, set: (s: ParticleSystem, v: number) => void, step = 1, width = 30) =>
  numberField({ words, tip }, value, (v) => change((s) => set(s, v), true), { min, max, step, width });
const xy = (tip: string, v: { x: number; y: number }, min: number, max: number, set: (s: ParticleSystem, axis: 'x' | 'y', v: number) => void) =>
  h('span', { class: 'urow' }, num('X', `${tip} X`, v.x, min, max, (s, n) => set(s, 'x', n)), num('Y', `${tip} Y`, v.y, min, max, (s, n) => set(s, 'y', n)));

const hexOfPaint = (p: Paint) => PALETTE[p.key][p.tone];
const TONES: Tone[] = ['light', 'base', 'shade'];
const toned = (key: PaletteKey) => new Set(TONES.map((tone) => PALETTE[key][tone])).size > 1;
/**
 * Every colour of the palette as swatches, a colour's three tones side by side (four colours a row), the fire first; the
 * colours with one tone only come last, once each.
 */
const PAINTS: Paint[] = [...FIRE_KEYS, ...PALETTE_KEYS.filter((k) => !FIRE_KEYS.includes(k) && toned(k)), ...PALETTE_KEYS.filter((k) => !toned(k))]
  .flatMap((key: PaletteKey) => (toned(key) ? TONES : (['base'] as Tone[])).map((tone) => ({ key, tone })));
const paintId = (p: Paint) => `${p.key}.${p.tone}`;
const paintOf = (id: string): Paint => { const [key, tone] = id.split('.'); return { key: key as PaletteKey, tone: tone as Tone }; };
const PAINT_OPTIONS: Option[] = PAINTS.map((p) => ({ id: paintId(p), color: hexOfPaint(p), words: `${p.key} ${p.tone}` }));
const PAINT_COLUMNS = 3 * 4;
/** A field per colour the particles take at random; its popup changes it or (the eraser) takes it out. */
function colourFields(s: ParticleSystem): Node[] {
  const rub: Option = { id: '', icon: 'eraser', words: L('Take this colour out', 'Diese Farbe herausnehmen') };
  return [
    ...s.colors.map((c, i) => colorField(L(`Colour ${i + 1}`, `Farbe ${i + 1}`), [...PAINT_OPTIONS, rub], () => paintId(c),
      (id) => change((n) => { if (id) n.colors[i] = paintOf(id); else n.colors.splice(i, 1); }), PAINT_COLUMNS)),
    ...(s.colors.length < 16 ? [pixelButton(L('Add a colour', 'Farbe hinzufügen'), { icon: 'plus' }, () => change((n) => n.colors.push(n.colors[n.colors.length - 1] ?? PAINTS[1])))] : []),
  ];
}

function panel(): Node[] {
  const s = current();
  const halo = s.halo;
  return [
    section({ words: L('Throw', 'Werfen') }, [fields(
      field({ words: L('Per second', 'Pro Sekunde') }, num('N', L('How many a second', 'Wie viele pro Sekunde'), s.rate, 0, 200, (n, v) => (n.rate = v), 0.25)),
      field({ words: L('Life (ms)', 'Leben (ms)') }, h('span', { class: 'urow' },
        num('MIN', L('Shortest life', 'Kürzestes Leben'), s.life.min, 50, 10000, (n, v) => (n.life.min = v), 50, 40),
        num('MAX', L('Longest life', 'Längstes Leben'), s.life.max, 50, 10000, (n, v) => (n.life.max = v), 50, 40))),
    )]),
    section({ words: L('Start', 'Start') }, [fields(
      field({ words: L('Offset (px)', 'Versatz (px)') }, xy(L('Offset', 'Versatz'), s.offset, -64, 64, (n, a, v) => (n.offset[a] = v))),
      field({ words: L('Spread (px)', 'Streuung (px)') }, xy(L('Spread', 'Streuung'), s.spread, 0, 64, (n, a, v) => (n.spread[a] = v))),
    )]),
    section({ words: L('Move', 'Bewegung') }, [fields(
      field({ words: L('Speed (px/s)', 'Tempo (px/s)') }, xy(L('Speed', 'Tempo'), s.speed, -200, 200, (n, a, v) => (n.speed[a] = v))),
      field({ words: L('Jitter (px/s)', 'Zufall (px/s)') }, xy(L('Jitter', 'Zufall'), s.jitter, 0, 200, (n, a, v) => (n.jitter[a] = v))),
      field({ words: L('Gravity', 'Schwerkraft') }, num('G', L('Pull down, px/s²; negative rises', 'Zug nach unten, px/s²; negativ steigt'), s.gravity, -400, 400, (n, v) => (n.gravity = v))),
      field({ words: L('Sway', 'Schwanken') }, h('span', { class: 'urow' },
        num('PX', L('How far it sways', 'Wie weit es schwankt'), s.sway.amount, 0, 16, (n, v) => (n.sway.amount = v), 0.25),
        num(L('FAST', 'TEMPO'), L('How fast it sways', 'Wie schnell es schwankt'), s.sway.speed, 0, 40, (n, v) => (n.sway.speed = v)))),
    )]),
    section({ words: L('Colours', 'Farben') }, [h('div', { class: 'urow' }, ...colourFields(s))]),
    section({ words: L('Halo', 'Schein') }, [
      h('div', { class: 'urow' },
        toggle(L('Casts a halo of light', 'Wirft einen Lichtschein'), { icon: 'sun', words: L('Halo', 'Schein') }, !!halo, (on) => change((n) => (n.halo = on ? { r: 40, tiles: 3, amount: 1, flicker: true } : null))),
        ...(halo ? [toggle(L('Flickers like a flame', 'Flackert wie eine Flamme'), { icon: 'storm', words: L('Flicker', 'Flackern') }, halo.flicker, (on) => change((n) => (n.halo!.flicker = on)))] : [])),
      ...(halo ? [
        fields(
          field({ words: L('Reach (px)', 'Reichweite (px)') }, num('R', L('How far it lights in the open, in pixels', 'Wie weit es im Freien leuchtet, in Pixeln'), halo.r, 0, 200, (n, v) => (n.halo!.r = v))),
          field({ words: L('In caves (tiles)', 'In Höhlen (Felder)') }, h('span', { class: 'urow' },
            num('T', L('How far it lights in a cave, in tiles', 'Wie weit es in einer Höhle leuchtet, in Feldern'), halo.tiles, 0, 12, (n, v) => (n.halo!.tiles = v), 0.5),
            num('%', L('How strong its light is in a cave', 'Wie stark sein Licht in einer Höhle ist'), Math.round(halo.amount * 100), 0, 100, (n, v) => (n.halo!.amount = v / 100), 5))),
          field({ words: L('Colour', 'Farbe') }, colorField(L('The colour of its light', 'Die Farbe seines Lichts'),
            [...PAINT_OPTIONS, { id: '', icon: 'reset', words: L('A fire\'s orange', 'Feuerorange') }], () => (halo.color ? paintId(halo.color) : ''),
            (id) => change((n) => { if (id) n.halo!.color = paintOf(id); else delete n.halo!.color; }), PAINT_COLUMNS)),
        ),
      ] : []),
    ]),
  ];
}

// ------------------------------------------------------------------ page

const root = document.getElementById('particles')!;
const stage = h('div', { class: 'stage props__stage particles__stage' });
const stageTag = h('span', { class: 'stage__tag' });
let shelf: Library;
const side = h('div', { class: 'uside__list' });
const barSlot = h('div', { style: 'display: contents' });
const views = viewTools();
const name = nameTag();
name.onRename((n) => { if (n.trim()) change((s) => (s.name = n.trim())); });

const ON: Option[] = [
  { id: 'flame', icon: 'sparks', words: L('On a flame', 'Auf einer Flamme') },
  { id: 'torch', icon: 'tool', words: L('On a torch', 'Auf einer Fackel') },
  { id: 'none', icon: 'close', words: L('On nothing', 'Auf nichts') },
];

function renderBar(): void {
  const s = current();
  const builtIn = isBuiltIn(s.id);
  const kept = (readStore<{ id?: string }[]>(PARTICLE_STORE, []) ?? []).some((o) => o?.id === s.id);
  const { bar, undo: u, redo: r, pops } = topBar({
    sidebar: true,
    tool: 'particles',
    title: word('particles'),
    name: name.el,
    about: [
      L('Particle systems for assets: the sparks a fire throws and the glow halo round it, a lantern\'s light. An asset attaches one at a point of its picture by its id (a thing\'s `fx`, a tool item\'s `fx`).',
        'Partikelsysteme für Assets: die Funken eines Feuers und der Lichtschein darum, das Licht einer Laterne. Ein Asset hängt eines an einen Punkt seines Bildes, über seine Kennung (`fx` eines Dings oder Werkzeugs).'),
      L('The preview shows it on a flame or a torch, at that point. At night the halo lights the ground; in a cave the reach in tiles is used instead.',
        'Die Vorschau zeigt es auf einer Flamme oder Fackel, an diesem Punkt. Nachts erhellt der Schein den Boden; in einer Höhle gilt stattdessen die Reichweite in Feldern.'),
      L('Changes stay on this device until you save them to the project.', 'Änderungen bleiben auf diesem Gerät, bis du sie im Projekt speicherst.'),
    ],
    more: [
      { label: L('New system', 'Neues System'), icon: 'plus', run: () => add(BUILT_IN[0], L('Particles', 'Partikel')) },
      { label: L('Duplicate', 'Duplizieren'), icon: 'copy', run: () => add(s, `${s.name} 2`) },
      { label: L('Save to project', 'Im Projekt speichern'), icon: 'download', main: true, disabled: !canSaveToProject(), track: storeTracker([PARTICLE_STORE]), run: () => void saveStores([PARTICLE_STORE]).then((ok) => {
        message = ok ? L('Saved to the project (src/content/store); commit it to keep it.', 'Im Projekt gespeichert (src/content/store); committe es, um es zu behalten.') : L('Nothing saved: change something first, and run the local dev server.', 'Nichts gespeichert: ändere erst etwas und starte den lokalen Dev-Server.');
        render();
      }) },
      {
        label: builtIn ? L('Back to the engine\'s', 'Zurück zur Engine-Fassung') : L('Delete', 'Löschen'), icon: builtIn ? 'reset' : 'trash', danger: !builtIn, disabled: builtIn && !kept,
        run: async () => {
          if (!builtIn && !(await confirmDialog(L(`Delete "${s.name}" from this device? Assets that use "${s.id}" lose it.`, `„${s.name}“ von diesem Gerät löschen? Assets mit „${s.id}“ verlieren es.`)))) return;
          deleteSystem(s.id);
          pick(builtIn ? s.id : particleSystems()[0].id);
        },
      },
    ],
    status: h('span', { class: 'bar__status', 'aria-live': 'polite' }, message),
    undo: undo.undo,
    redo: undo.redo,
    relabel: () => { mount(); render(); },
  });
  u!.disabled = !undo.canUndo();
  r!.disabled = !undo.canRedo();
  barSlot.replaceChildren(bar, ...pops);
  stageTag.textContent = `${s.id} · ${s.rate}/s${s.halo ? ` · ${L('halo', 'Schein')} ${s.halo.r} px` : ''}`;
}

function render(): void {
  const s = current();
  renderBar();
  name.set(s.name, L('Particles', 'Partikel'));
  shelf.redraw();
  const zoom = (by: number) => { prefs.zoom = Math.max(2, Math.min(8, prefs.zoom + by)); savePrefs(); };
  views.replaceChildren(
    snapButton(() => savePicture(canvas, current().name, 4)),
    pixelButton(L('Zoom in', 'Vergrößern'), { icon: 'zoomin' }, () => zoom(1)),
    pixelButton(L('Zoom out', 'Verkleinern'), { icon: 'zoomout' }, () => zoom(-1)),
    toggle(L('Night: the halo lights the ground', 'Nacht: der Schein erhellt den Boden'), { icon: 'moon' }, prefs.night, (on) => { prefs.night = on; savePrefs(); }),
    choice(L('Shown on', 'Gezeigt auf'), ON, () => prefs.on, (id) => { prefs.on = id as PreviewOn; savePrefs(); }, 'list'),
  );
  const scroll = side.scrollTop;
  side.replaceChildren(...panel());
  side.scrollTop = scroll;
}

function mount(): void {
  document.documentElement.lang = currentLang();
  document.title = L('Particles', 'Partikel');
  stage.replaceChildren(canvas, stageTag, views);
  shelf = library({
    key: 'pixel-particles', label: word('search'), empty: word('nothing'),
    items: () => particleSystems().map((p) => ({ id: p.id, icon: p.halo && !p.rate ? 'sun' : 'sparks', words: p.name, find: isBuiltIn(p.id) ? 'engine' : '' })),
    selected: () => prefs.id, pick,
  });
  root.replaceChildren(h('div', { class: 'shell' }, barSlot, workspace({
    key: 'pixel-particles', left: [shelf], centre: [stage], right: [side], leftWidth: 240, rightWidth: 460,
  })));
}

undoKeys(undo.undo, undo.redo);
window.addEventListener('focus', () => { reloadSystems(); render(); });
mount();
render();
const tick = (ms: number) => {
  draw(ms);
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
document.body.dataset.ready = '1';
