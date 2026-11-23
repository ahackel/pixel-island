// The props tool: one searchable library of everything that stands in the world (plants, objects,
// decorations, the crate, and what was painted or duplicated on this device), a stage showing the
// picked prop beside the survivor from all eight directions, and four tabs: Views, Shape, Features and
// Pixels. Any prop can be frozen into pixels and polished by hand; a catalogue prop is then locked,
// and scenes and games draw the painted version (docs/props.md).
import './style.css';
import { canSaveToProject, saveStores, storeTracker } from '../../shared/project.ts';
import { PROP_STORE } from '../../engine/world/prop.ts';
import { outfitLook } from '../../engine/character/character.ts';
import { AUTHORED } from '../../engine/core/poses.ts';
import { CHARACTER_ORIGIN as FEET, drawCharacter, SPRITE_H, SPRITE_W, type Sprite } from '../../engine/core/puppet.ts';
import { FRAMES, tryPlant } from '../../engine/flora/flora.ts';
import { FLORA_STORE, plantById } from '../../engine/flora/flora-catalog.ts';
import { cleanBuild, OBJECT_STORE, savedProps, type Build } from '../../engine/objects/object.ts';
import { gridsOf, toArt, type Grid } from '../../engine/core/stamp.ts';
import {
  blockRadius, changeKind, deleteKind, dirOfView, duplicateKind, FEATURES, generatedViews, importPropKind, isHidden, lockKind, newPainted, ownViews, propKind, propKinds,
  propKindFile, propPicture, reloadProps, setEditedPlant, setHidden, SOURCES, unlockKind, VIEW_COUNTS, viewOf, type Feature, type PropKind, type Source, type ViewCount,
} from '../../engine/world/prop.ts';
import { freeze } from '../../engine/core/stamp.ts';
import { buildPanel, type BuildTab } from '../objects/build-panel.ts';
import { pixelEditor } from '../paint/pixel-editor.ts';
import { download, pickFile, readStore, writeStore } from '../../shared/files.ts';
import { choice, filterToggles, library, pixelButton, toggle, turnView, viewTools, type Library, type Option as Pick, confirmDialog, workspace } from '../../ui/components.ts';
import { checkbox, h, history, nameTag, row, savePicture, section, segmented, snapButton, tabs, topBar, undoKeys, word, type IconName, rangeInput } from '../../shared/shell.ts';
import { currentLang } from '../../shared/lang.ts';
import { fitWhole, pictureCache, trimmed } from '../../shared/pixels.ts';
import { castShadow } from '../../engine/world/island.ts';
import { SHADOW } from '../../engine/core/palette.ts';

const L = (en: string, de: string) => (currentLang() === 'de' ? de : en);

// ------------------------------------------------------------------ words

const SOURCE_WORDS: Record<Source, [string, string]> = {
  painted: ['Painted', 'Gemalt'], grown: ['Grown', 'Gewachsen'], built: ['Built', 'Gebaut'], rigged: ['Rigged', 'Gelenkig'],
};
const FEATURE_WORDS: Record<Feature, [string, string, string, string]> = {
  wind: ['Wind', 'Wind', 'Sways in the wind. Painted props bend: their columns are pushed sideways by height.', 'Wiegt sich im Wind. Gemalte Requisiten biegen sich: ihre Spalten werden nach Höhe verschoben.'],
  loop: ['Loop', 'Schleife', 'Plays its frames over and over (a fountain, a screen). Painted props bob.', 'Spielt seine Bilder immer wieder (ein Brunnen, ein Bildschirm). Gemalte Requisiten wippen.'],
  glow: ['Glows', 'Leuchtet', 'Gives light at night; fire colours keep their brightness in the dark.', 'Gibt nachts Licht; Feuerfarben behalten im Dunkeln ihre Helligkeit.'],
  blocks: ['Blocks', 'Versperrt', 'Walkers go round it.', 'Wer läuft, geht drumherum.'],
  carry: ['Carry', 'Tragbar', 'Can be picked up and carried.', 'Kann aufgehoben und getragen werden.'],
};
const sourceWord = (s: Source) => L(...SOURCE_WORDS[s]);
const DIR_NAMES = ['0°', '45°', '90°', '135°', '180°', '225°', '270°', '315°'];

// ------------------------------------------------------------------ state

interface Prefs {
  id: string; tab: Tab; dir: number; source: Source | 'all'; feature: Feature | 'all';
  hidden: boolean; person: boolean; colliders: boolean; ground: string; playing: boolean; view: number; shape: BuildTab;
}
type Tab = 'views' | 'shape' | 'features' | 'pixels';
const PREFS_KEY = 'pixel-props-tool';
const GROUNDS = [['Sand', 'Sand', '#e9d9a0'], ['Grass', 'Gras', '#8fcf78'], ['Floor', 'Boden', '#d9d3c4'], ['Rock', 'Fels', '#aeaba3']] as const;
const prefs: Prefs = {
  id: propKinds()[0]?.id ?? '', tab: 'views', dir: 0, source: 'all', feature: 'all', hidden: false, person: true, colliders: false,
  ground: GROUNDS[0][2], playing: true, view: 0, shape: 'parts',
  ...readStore<Partial<Prefs>>(PREFS_KEY, {}),
};
if (!propKind(prefs.id)) prefs.id = propKinds()[0]?.id ?? '';
const savePrefs = () => writeStore(PREFS_KEY, prefs);
let message = '';
let selectedPart = 0;
const kind = (): PropKind => propKind(prefs.id) ?? propKinds()[0];

// ------------------------------------------------------------------ undo

/** What undo covers: the picked prop's editable fields. */
const editable = () => {
  const k = kind();
  return { id: k.id, name: k.name, features: k.features, views: k.views, mirror: k.mirror, flex: k.flex, art: k.art ?? null, build: k.build ?? null, recipe: k.recipe ?? null };
};
const undo = history(editable, (v) => {
  if (v.id !== prefs.id) return;
  const change: Parameters<typeof changeKind>[1] = { name: v.name, features: v.features, views: v.views, mirror: v.mirror, flex: v.flex };
  if (v.art) change.art = v.art;
  if (v.build) change.build = v.build;
  if (v.recipe) change.recipe = v.recipe;
  changeKind(v.id, change);
  grids = null;
  render();
});
function changed(change: Parameters<typeof changeKind>[1], note = ''): void {
  message = changeKind(prefs.id, change) ? note : L('Could not save: this browser refuses storage here.', 'Nicht gespeichert: Dieser Browser erlaubt hier keinen Speicher.');
  undo.commit();
  render();
}
function pickKind(id: string): void {
  prefs.id = id;
  prefs.view = 0;
  selectedPart = 0;
  grids = null;
  savePrefs();
  undo.reset();
  render();
}

// ------------------------------------------------------------------ pictures

const thumbs = pictureCache('thumb', 400);
let thumbVersion = 0;
function thumb(k: PropKind, box = 56): HTMLCanvasElement {
  const key = `${box}|${thumbVersion}|${k.id}|${k.art ? k.art.views.join('').length + JSON.stringify(k.art.views[0]).slice(0, 400) : ''}|${JSON.stringify(k.build ?? '')}|${k.views}|${k.mirror}`;
  return thumbs.of(key, () => {
    const p = propPicture(k, 0, 0, 0);
    if (!p) return h('canvas');
    return trimmed(p, p.w, p.h, box);
  });
}

const SURVIVOR = outfitLook('skinC', 'hairBlack', 'happy', 2, ['recipe-everyday-0', 'sprite-everyday-bottoms-0', 'sprite-hat-2']);
const survivorFrames = new Map<number, Sprite>();
function survivor(frame: number): Sprite {
  const clip = AUTHORED.idle;
  const i = frame % clip.frames.length;
  let s = survivorFrames.get(i);
  if (!s) survivorFrames.set(i, (s = drawCharacter(SURVIVOR, clip.frames[i], 0, { face: clip.faces?.[i] })));
  return s;
}

// ------------------------------------------------------------------ the stage

const hero = h('canvas', { class: 'stage__sprite props__hero' });
const STAGE_W = 144, STAGE_H = 120;
/** The prop on a patch of ground, with the survivor beside it for scale. */
function drawStage(frame: number): void {
  const k = kind();
  hero.width = STAGE_W;
  hero.height = STAGE_H;
  const ctx = hero.getContext('2d')!;
  const image = ctx.createImageData(STAGE_W, STAGE_H);
  const put = (x: number, y: number, hex: string) => {
    if (x < 0 || y < 0 || x >= STAGE_W || y >= STAGE_H) return;
    const o = (y * STAGE_W + x) * 4;
    const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
    const was = image.data[o + 3] ? 1 - a : 0;
    for (let c = 0; c < 3; c++) image.data[o + c] = Math.round(image.data[o + c] * was + parseInt(hex.slice(1 + c * 2, 3 + c * 2), 16) * (1 - was));
    image.data[o + 3] = Math.max(image.data[o + 3], Math.round(a * 255));
  };
  const cx = STAGE_W / 2 + 10, cy = STAGE_H - 26;
  // A diamond of ground three tiles across.
  for (let y = 0; y < STAGE_H; y++) for (let x = 0; x < STAGE_W; x++) {
    const u = (x - cx) / 48 + (y - cy) / 24, v = (y - cy) / 24 - (x - cx) / 48;
    if (Math.abs(u) <= 1 && Math.abs(v) <= 1) put(x, y, Math.abs(u) > 0.97 || Math.abs(v) > 0.97 ? '#00000022' : '#ffffff22');
  }
  const draw = (p: { get(x: number, y: number): string | null; w: number; h: number; foot: { x: number; y: number } }, fx: number, fy: number) => {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const hex = p.get(x, y);
      if (hex) put(fx - p.foot.x + x, fy - p.foot.y + y, hex);
    }
  };
  const back = [3, 4, 5].includes(prefs.dir);
  const s = survivor(frame);
  const man = { get: (x: number, y: number) => s.get(x, y), w: SPRITE_W, h: SPRITE_H, foot: FEET };
  const person = () => draw(man, cx - 40, cy - 4);
  const p = propPicture(k, prefs.dir, frame, prefs.playing ? 1 : 0);
  // Their shadows, cast from the sun, laid on the ground once where they overlap.
  const mask = new Uint8Array(STAGE_W * STAGE_H);
  if (p) castShadow(mask, STAGE_W, STAGE_H, p, p.w, p.h, cx - p.foot.x, cy - p.foot.y, p.foot);
  if (prefs.person) castShadow(mask, STAGE_W, STAGE_H, s, SPRITE_W, SPRITE_H, cx - 40 - FEET.x, cy - 4 - FEET.y, FEET);
  for (let q = 0; q < mask.length; q++) if (mask[q]) put(q % STAGE_W, Math.floor(q / STAGE_W), SHADOW);
  if (prefs.person && !back) person();
  if (p) draw(p, cx, cy);
  if (prefs.person && back) person();
  // The collider: the ground circle walkers keep out of (red), over everything so it shows through the prop.
  const r = blockRadius(k);
  if (prefs.colliders && r) {
    for (let y = 0; y < STAGE_H; y++) for (let x = 0; x < STAGE_W; x++) {
      const d = Math.hypot((x - cx) / 48 + (y - cy) / 24, (y - cy) / 24 - (x - cx) / 48);
      if (d <= r) put(x, y, d > r - 0.07 ? '#e0332ee6' : '#e0332e33');
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** Which of the prop's views the direction shows: its own, shared with one drawn before, or mirrored. */
function viewWord(): string {
  const k = kind();
  const { view, mirror } = viewOf(k.views, k.mirror, prefs.dir);
  const own = !mirror && [...Array(prefs.dir).keys()].every((d) => viewOf(k.views, k.mirror, d).view !== view || viewOf(k.views, k.mirror, d).mirror);
  return mirror ? L(`view ${view + 1}, mirrored`, `Ansicht ${view + 1}, gespiegelt`) : own ? L(`view ${view + 1}`, `Ansicht ${view + 1}`) : L(`shares view ${view + 1}`, `teilt Ansicht ${view + 1}`);
}

const FEATURE_ICON: Record<Feature, string> = { wind: 'storm', loop: 'reset', glow: 'sun', blocks: 'box', carry: 'hand' };
const SOURCE_ICON: Record<string, string> = { painted: 'pencil', grown: 'sprout', built: 'tool' };

// ------------------------------------------------------------------ the library

function matches(k: PropKind): boolean {
  if (!prefs.hidden && isHidden(k.id)) return false;
  if (prefs.source !== 'all' && k.source !== prefs.source) return false;
  return prefs.feature === 'all' || k.features.includes(prefs.feature);
}

/** The library's tiles: the kinds the source, feature and hidden filters let through; the search finds them by kind, tags and features too. */
const libraryItems = () => propKinds().filter(matches).map((k) => ({
  id: k.id, picture: thumb(k), words: `${k.name} · ${sourceWord(k.source)}`, mark: k.locked ? 'lock' : undefined,
  find: [k.source, ...k.tags, ...k.features, k.locked ? 'locked frozen' : ''].join(' '),
}));
let shelf: Library | undefined;
const renderLibrary = () => shelf?.redraw();
function chips(): HTMLElement {
  const flip = (change: () => void) => { change(); savePrefs(); render(); };
  const sources: Pick[] = SOURCES.map((id) => ({ id, icon: SOURCE_ICON[id], words: sourceWord(id) }));
  return h('div', { class: 'urow' },
    filterToggles(sources, () => prefs.source, (id) => flip(() => (prefs.source = id as typeof prefs.source))),
    ...FEATURES.map((f) => toggle(L(FEATURE_WORDS[f][0], FEATURE_WORDS[f][1]), { icon: FEATURE_ICON[f] }, prefs.feature === f, () => flip(() => (prefs.feature = prefs.feature === f ? 'all' : f)))),
    toggle(L('Hidden too', 'Auch verborgene'), { icon: 'eye' }, prefs.hidden, () => flip(() => (prefs.hidden = !prefs.hidden))));
}

// ------------------------------------------------------------------ the panel

let grids: Grid[] | null = null;
let gridsFor = '';
/** The picked prop's art as grids, kept while painting so strokes do not reparse it. */
function artGrids(k: PropKind): Grid[] {
  const key = `${k.id}|${k.art?.views.length}|${k.art?.w}|${k.art?.h}`;
  if (!grids || gridsFor !== key) {
    grids = k.art ? gridsOf(k.art) : [];
    gridsFor = key;
  }
  return grids;
}
/** The rule-drawn views a frozen prop came from, for the onion skin. */
function onionOf(k: PropKind): ((view: number) => Grid | null) | undefined {
  if (!k.art) return undefined;
  const source = k.locked ? { ...k, art: undefined } : k.from ? propKind(k.from) : undefined;
  if (!source || source.art) return undefined;
  const art = k.art;
  let made: Grid[] | null = null;
  return (view) => {
    if (!made) {
      // Drawn again at the same pivot and size as the art, so it lines up.
      const frozen = freeze(generatedViews({ ...source, views: k.views, mirror: k.mirror }), 0);
      made = gridsOf(frozen).map((g) => {
        const out: Grid = Array.from({ length: art.h }, () => Array(art.w).fill(null));
        g.forEach((row, y) => row.forEach((c, x) => {
          const tx = x - frozen.ox + art.ox, ty = y - frozen.oy + art.oy;
          if (c && tx >= 0 && ty >= 0 && tx < art.w && ty < art.h) out[ty][tx] = c;
        }));
        return out;
      });
    }
    return made[view] ?? null;
  };
}

function freezeButton(k: PropKind): HTMLElement {
  const label = k.builtin ? L('Freeze and lock', 'Einfrieren und sperren') : L('Freeze into pixels', 'In Pixel einfrieren');
  return h('div', { class: 'props__freeze' }, pixelButton(label, { icon: 'freeze' }, () => {
    lockKind(kind());
    grids = null;
    prefs.tab = 'pixels';
    message = k.builtin ? L(`${k.name} is frozen: scenes now draw its pixels.`, `${k.name} ist eingefroren: Szenen zeichnen jetzt seine Pixel.`) : L('Frozen into pixels.', 'In Pixel eingefroren.');
    undo.commit();
    render();
  }));
}

function panelFor(tab: Tab): (Node | string)[] {
  const k = kind();
  switch (tab) {
    case 'views': {
      const setCount = (n: ViewCount) => {
        if (k.art) {
          // Painted views follow: new ones start as a copy of the last, extra ones are dropped.
          const own = k.mirror && n > 1 ? n / 2 : n;
          const views = Array.from({ length: own }, (_, i) => k.art!.views[Math.min(i, k.art!.views.length - 1)]);
          changed({ views: n, art: { ...k.art, views } });
        } else changed({ views: n });
      };
      const setMirror = (on: boolean) => {
        if (k.art) {
          const own = on && k.views > 1 ? k.views / 2 : k.views;
          const views = Array.from({ length: own }, (_, i) => k.art!.views[Math.min(i, k.art!.views.length - 1)]);
          changed({ mirror: on, art: { ...k.art, views } });
        } else changed({ mirror: on });
      };
      return [section(L('Views', 'Ansichten'),
        row(L('How many', 'Wie viele'), segmented(L('Views', 'Ansichten'), VIEW_COUNTS.map((n) => ({ id: String(n), label: String(n) })), String(k.views), (v) => setCount(Number(v) as ViewCount))),
        row('', checkbox(L('Mirror: the far half shows the near half flipped', 'Spiegeln: die hintere Hälfte zeigt die vordere umgedreht'), k.mirror, setMirror)),
        h('p', { class: 'note' }, L(
          `Each of the eight directions shows one of ${k.views} view${k.views > 1 ? 's' : ''}. The tag under the picture says which, and whether it is mirrored or shares a view drawn before. ${ownViews(k)} picture${ownViews(k) > 1 ? 's are' : ' is'} drawn${k.art ? ' and painted' : ''}. Turn the picture to look from there.`,
          `Jede der acht Richtungen zeigt eine von ${k.views} Ansicht${k.views > 1 ? 'en' : ''}. Die Beschriftung unter dem Bild sagt welche, und ob sie gespiegelt ist oder eine vorher gezeichnete teilt. ${ownViews(k)} Bild${ownViews(k) > 1 ? 'er werden' : ' wird'} gezeichnet${k.art ? ' und gemalt' : ''}. Drehe das Bild, um von dort zu schauen.`)),
      )];
    }
    case 'shape':
      return shapePanel(k);
    case 'features':
      return [section(L('Features', 'Eigenschaften'),
        ...FEATURES.map((f) => h('div', { class: 'props__feature' },
          checkbox(L(FEATURE_WORDS[f][0], FEATURE_WORDS[f][1]), k.features.includes(f), (on) => changed({ features: on ? [...k.features, f] : k.features.filter((x) => x !== f) })),
          h('p', { class: 'note' }, L(FEATURE_WORDS[f][2], FEATURE_WORDS[f][3])))),
        k.art && k.features.includes('wind') ? flexSlider(k) : '',
        h('p', { class: 'note' }, L(
          'Features belong to the prop, not to where it came from: a painted bush can sway and a grown plant can stand still.',
          'Eigenschaften gehören zur Requisite, nicht zu ihrer Herkunft: ein gemalter Busch kann sich wiegen, eine gewachsene Pflanze still stehen.')),
      )];
    case 'pixels': {
      if (!k.art) {
        return [section(L('Pixels', 'Pixel'),
          h('p', { class: 'note' }, k.builtin
            ? L(`${k.name} is drawn by rule. Freezing draws its ${ownViews(k)} view${ownViews(k) > 1 ? 's' : ''} once and keeps the pixels to polish by hand. It stays locked: scenes and games draw your pixels until you unlock it.`,
              `${k.name} wird nach Regeln gezeichnet. Einfrieren zeichnet seine ${ownViews(k)} Ansicht${ownViews(k) > 1 ? 'en' : ''} einmal und behält die Pixel zum Nacharbeiten. Es bleibt gesperrt: Szenen und Spiele zeichnen deine Pixel, bis du es entsperrst.`)
            : L('Freezing turns this prop into pixels to polish by hand. Its recipe or parts are given up; duplicate it first to keep them.',
              'Einfrieren macht diese Requisite zu Pixeln zum Nacharbeiten. Rezept oder Teile gehen verloren; dupliziere sie vorher, um sie zu behalten.')),
          freezeButton(k))];
      }
      const art = k.art;
      const g = artGrids(k);
      prefs.view = Math.min(prefs.view, g.length - 1);
      const write = () => changeKind(k.id, { art: toArt(g, art.ox, art.oy) });
      const editor = pixelEditor({
        grids: g, view: prefs.view, pivot: { x: art.ox, y: art.oy }, onion: onionOf(k),
        viewNames: g.length > 1 ? g.map((_, i) => `${L('View', 'Ansicht')} ${i + 1} · ${DIR_NAMES[dirOfView(k.views, i)]}`) : undefined,
        pickView: (v) => { prefs.view = v; prefs.dir = dirOfView(k.views, v); savePrefs(); render(); },
        live: () => { write(); stageDirty = true; },
        done: () => { write(); undo.commit(); stageDirty = true; renderLibrary(); },
        resize: (next, pivot) => { grids = next; changeKind(k.id, { art: toArt(next, pivot.x, pivot.y) }); undo.commit(); render(); },
      });
      return [
        section(L('Pixels', 'Pixel'), editor.el),
        k.locked ? section(L('Locked', 'Gesperrt'),
          h('p', { class: 'note' }, L('Scenes and games draw these pixels instead of the rule. Unlocking goes back to the rule and loses the painting.', 'Szenen und Spiele zeichnen diese Pixel statt der Regel. Entsperren geht zur Regel zurück, die Malerei geht verloren.')),
          h('div', { class: 'toggles' },
            pixelButton(L('Unlock', 'Entsperren'), { icon: 'unlock' }, async () => {
              if (!(await confirmDialog(L('Unlock and lose the painted pixels?', 'Entsperren und die gemalten Pixel verlieren?')))) return;
              unlockKind(k.id);
              grids = null;
              message = L(`${k.name} is drawn by its rule again.`, `${k.name} wird wieder nach seiner Regel gezeichnet.`);
              undo.reset();
              render();
            }),
            pixelButton(L('Painted copy', 'Gemalte Kopie'), { icon: 'copy' }, () => {
              const id = duplicateKind(kind());
              message = L('A painted copy is in the library.', 'Eine gemalte Kopie ist in der Bibliothek.');
              pickKind(id);
            }))) : '',
      ];
    }
  }
}

function flexSlider(k: PropKind): HTMLElement {
  const input = rangeInput({ min: '0', max: '6', step: '0.5', 'aria-label': L('Bend', 'Biegung') });
  input.value = String(k.flex);
  const out = h('b', {}, `${k.flex} px`);
  input.addEventListener('input', () => { changeKind(k.id, { flex: Number(input.value) }); out.textContent = `${input.value} px`; });
  input.addEventListener('change', () => { undo.commit(); render(); });
  return row(L('Bend at the top', 'Biegung oben'), input, out);
}

/** Recipe text, kept as the flora tool keeps it. */
function pretty(v: unknown): string {
  return JSON.stringify(v, null, 1).replace(/\n\s+([\]}])/g, ' $1').replace(/\[\n\s+/g, '[').replace(/,\n\s+(?=[-\d"])/g, ', ');
}
function floraState(): { custom: Record<string, string> } & Record<string, unknown> {
  const s = readStore<any>(FLORA_STORE, null);
  return s && typeof s === 'object' ? { ...s, custom: s.custom && typeof s.custom === 'object' ? s.custom : {} } : { custom: {} };
}

function shapePanel(k: PropKind): (Node | string)[] {
  if (k.art) {
    return [section(L('Shape', 'Form'), h('p', { class: 'note' }, k.locked
      ? L('Frozen: its shape is its pixels now. Unlock it on the Pixels tab to go back to the rule.', 'Eingefroren: seine Form sind jetzt seine Pixel. Entsperre es im Reiter Pixel, um zur Regel zurückzukehren.')
      : L('A painted prop has no recipe or parts: its shape is its pixels.', 'Eine gemalte Requisite hat weder Rezept noch Teile: ihre Form sind ihre Pixel.')))];
  }
  if (k.source === 'grown') {
    const builtin = k.builtin;
    const state = floraState();
    const original = builtin ? plantById(k.id)?.raw : k.recipe;
    const text = builtin ? state.custom[k.id] ?? pretty(original) : pretty(k.recipe);
    const area = h('textarea', { class: 'props__recipe', spellcheck: 'false', 'aria-label': L('Recipe', 'Rezept') });
    area.value = text;
    const note = h('p', { class: 'note' });
    const apply = () => {
      let parsed: ReturnType<typeof tryPlant>;
      try { parsed = tryPlant(JSON.parse(area.value)); } catch (e) { note.textContent = L(`Not JSON: ${(e as Error).message}`, `Kein JSON: ${(e as Error).message}`); return; }
      if (!parsed.ok) { note.textContent = parsed.error; return; }
      note.textContent = parsed.compiled.repairs.length ? L(`Repaired: ${parsed.compiled.repairs.join('; ')}`, `Repariert: ${parsed.compiled.repairs.join('; ')}`) : L('Recipe works.', 'Rezept funktioniert.');
      if (builtin) {
        // Kept where the flora tool keeps it, so the scene editor and games use it too.
        const s = floraState();
        if (area.value.trim() === pretty(original).trim()) delete s.custom[k.id];
        else s.custom[k.id] = area.value;
        writeStore(FLORA_STORE, s);
        setEditedPlant(k.id, parsed.compiled.plant);
        stageDirty = true;
        thumbVersion++;
      } else {
        changeKind(k.id, { recipe: JSON.parse(area.value) });
        undo.commit();
        stageDirty = true;
      }
    };
    area.addEventListener('input', apply);
    area.addEventListener('change', () => renderLibrary());
    return [section(L('Recipe', 'Rezept'), area, note,
      builtin ? pixelButton(L('Back to the original', 'Zurück zum Original'), { icon: 'reset' }, () => { area.value = pretty(original); apply(); }) : '',
      h('p', { class: 'note' }, L('The flora recipe this plant grows from (docs/specs/spec-plant.md). Edits show at once.', 'Das Flora-Rezept, aus dem diese Pflanze wächst (docs/specs/spec-plant.md). Änderungen zeigen sich sofort.')))];
  }
  if (k.source === 'built' && k.build) {
    if (k.builtin) {
      return [section(L('Parts', 'Teile'), h('p', { class: 'note' }, L(
        'A preset of the engine. Duplicate it to change its size and parts; the copy is yours.',
        'Eine Vorlage der Engine. Dupliziere sie, um Größe und Teile zu ändern; die Kopie gehört dir.')),
        pixelButton(L('Duplicate to edit', 'Zum Bearbeiten duplizieren'), { icon: 'copy' }, () => pickKind(duplicateKind(k))))];
    }
    const build = structuredClone(k.build);
    const save = () => {
      if (k.id.startsWith('my-object:')) {
        // A thing kept in the object editor: changed there too.
        const roster = savedProps();
        const saved = roster.find((s) => `my-object:${s.id}` === k.id);
        if (saved) saved.prop = cleanBuild(build);
        writeStore(OBJECT_STORE.roster, roster);
        reloadProps();
      } else changeKind(k.id, { build: cleanBuild(build) as Build });
    };
    const subs: [BuildTab, string, string][] = [['size', 'Size', 'Größe'], ['parts', 'Parts', 'Teile'], ['points', 'Points', 'Punkte']];
    return [
      h('div', { class: 'props__subtabs' }, segmented(L('Shape', 'Form'), subs.map(([id, en, de]) => ({ id, label: L(en, de) })), prefs.shape, (v) => { prefs.shape = v; savePrefs(); render(); })),
      ...buildPanel(prefs.shape, {
        prop: build, selected: selectedPart,
        select: (i) => { selectedPart = i; },
        live: () => { save(); stageDirty = true; },
        changed: () => { save(); undo.commit(); render(); },
        render,
      }),
    ];
  }
  return [section(L('Shape', 'Form'), h('p', { class: 'note' }, L('Nothing to shape here.', 'Hier gibt es nichts zu formen.')))];
}

// ------------------------------------------------------------------ page

const root = document.getElementById('props')!;
const stage = h('div', { class: 'stage props__stage' });
const stageTag = h('span', { class: 'stage__tag' });
const tabSlot = h('div');
const panel = h('div', { class: 'uside__list', role: 'tabpanel' });
const barSlot = h('div', { style: 'display: contents' });
const views = viewTools();
// Arrows at its sides and a drag on it turn the prop an eighth at a time.
const arrows = turnView(stage, (step) => { prefs.dir = (prefs.dir + step + 8) % 8; savePrefs(); render(); });
const name = nameTag();
name.onRename((n) => {
  if (!n.trim() || n === kind().name) return;
  changed({ name: n.trim() });
});
let stageDirty = true;

const TABS: [Tab, string, string, IconName][] = [
  ['views', 'Views', 'Ansichten', 'turnRight'], ['shape', 'Shape', 'Form', 'shapes'], ['features', 'Features', 'Eigenschaften', 'sliders'], ['pixels', 'Pixels', 'Pixel', 'pencil'],
];

async function importFile(): Promise<void> {
  try {
    const id = importPropKind(await pickFile());
    message = L('Imported.', 'Importiert.');
    pickKind(id);
  } catch {
    message = L('That file is not a prop.', 'Diese Datei ist keine Requisite.');
    render();
  }
}

function renderBar(): void {
  const k = kind();
  const { bar, undo: u, redo: r, pops } = topBar({
    sidebar: true,
    tool: 'props',
    title: word('props'),
    name: name.el,
    about: [
      L('Everything that stands in the world, in one library: plants grown by rule, objects built from parts, decorations, and props painted on this device. Search by name, tag, source or feature.',
        'Alles, was in der Welt steht, in einer Bibliothek: nach Regeln gewachsene Pflanzen, aus Teilen gebaute Objekte, Dekorationen und auf diesem Gerät gemalte Requisiten. Suche nach Name, Schlagwort, Herkunft oder Eigenschaft.'),
      L('Freeze any prop to keep its pixels and polish them by hand. A frozen catalogue prop is locked: the scene editor and games draw the painted pixels instead of the rule, until it is unlocked.',
        'Friere jede Requisite ein, um ihre Pixel zu behalten und von Hand nachzuarbeiten. Eine eingefrorene Katalog-Requisite ist gesperrt: Szeneneditor und Spiele zeichnen die gemalten Pixel statt der Regel, bis sie entsperrt wird.'),
      L('Props are kept on this device (engine/world/prop.ts) and exported as JSON of type "pixel-prop".', 'Requisiten bleiben auf diesem Gerät (engine/world/prop.ts) und werden als JSON vom Typ „pixel-prop“ exportiert.'),
    ],
    actions: [
      { label: L('New painted prop', 'Neue gemalte Requisite'), icon: 'plus', run: () => pickKind(newPainted(L('Painted prop', 'Gemalte Requisite'))) },
      { label: L('Duplicate', 'Duplizieren'), icon: 'copy', run: () => pickKind(duplicateKind(k)) },
    ],
    more: [
      { label: k.art ? L('Already frozen', 'Schon eingefroren') : L('Freeze into pixels', 'In Pixel einfrieren'), icon: 'lock', disabled: !!k.art, run: () => { lockKind(k); grids = null; prefs.tab = 'pixels'; undo.commit(); render(); } },
      { label: L('Export', 'Exportieren'), icon: 'download', run: () => download(`${k.name}.json`, propKindFile(k)) },
      { label: L('Save to project', 'Im Projekt speichern'), icon: 'download', main: true, disabled: !canSaveToProject(), track: storeTracker([PROP_STORE, FLORA_STORE, OBJECT_STORE.roster]), run: () => void saveStores([PROP_STORE, FLORA_STORE, OBJECT_STORE.roster]).then((ok) => { message = ok ? L('Saved to the project (src/content/store); commit it to keep it.', 'Im Projekt gespeichert (src/content/store); committe es, um es zu behalten.') : L('Nothing saved: change something first, and run the local dev server.', 'Nichts gespeichert: ändere erst etwas und starte den lokalen Dev-Server.'); render(); }) },
      { label: L('Import', 'Importieren'), icon: 'upload', run: () => void importFile() },
      k.builtin
        ? { label: isHidden(k.id) ? L('Show in the library', 'In der Bibliothek zeigen') : L('Hide from the library', 'In der Bibliothek verbergen'), icon: 'close', run: () => { setHidden(k.id, !isHidden(k.id)); render(); } }
        : { label: L('Delete', 'Löschen'), icon: 'trash', danger: true, disabled: k.id.startsWith('my-object:'), run: async () => {
          if (!(await confirmDialog(L(`Delete "${k.name}" from this device?`, `„${k.name}“ von diesem Gerät löschen?`)))) return;
          deleteKind(k.id);
          message = L(`Deleted "${k.name}".`, `„${k.name}“ gelöscht.`);
          pickKind(propKinds()[0].id);
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
  const k = kind();
  stage.style.setProperty('--ground', prefs.ground);
  renderBar();
  name.set(k.name, L('Prop', 'Requisite'));
  stageTag.textContent = `${DIR_NAMES[prefs.dir]} · ${viewWord()} · ${sourceWord(k.source)}${k.locked ? ` · ${L('frozen', 'eingefroren')}` : ''}`;
  renderLibrary();
  views.replaceChildren(snapButton(() => savePicture(hero, kind().name)),
    toggle(L('Wind', 'Wind'), { icon: 'storm' }, prefs.playing, (on) => { prefs.playing = on; savePrefs(); stageDirty = true; }),
    toggle(L('Survivor', 'Gestrandeter'), { icon: 'person' }, prefs.person, (on) => { prefs.person = on; savePrefs(); stageDirty = true; }),
    toggle(L('Colliders', 'Kollision'), { icon: 'collider' }, prefs.colliders, (on) => { prefs.colliders = on; savePrefs(); stageDirty = true; }),
    choice(L('Ground', 'Boden'), GROUNDS.map(([en, de, color]) => ({ id: color as string, words: L(en, de), color })), () => prefs.ground, (c) => { prefs.ground = c; savePrefs(); stageDirty = true; render(); }, 'list'));
  tabSlot.replaceChildren(tabs(L('Sections', 'Bereiche'), TABS.map(([id, en, de, ic]) => ({ id, label: L(en, de), icon: ic })), prefs.tab, (id) => {
    prefs.tab = id;
    savePrefs();
    panel.scrollTop = 0;
    render();
  }));
  const scroll = panel.scrollTop;
  panel.replaceChildren(...panelFor(prefs.tab));
  panel.scrollTop = scroll;
  stageDirty = true;
}

function mount(): void {
  document.documentElement.lang = currentLang();
  document.title = L('Props', 'Requisiten');
  stage.replaceChildren(hero, stageTag, ...arrows, views);
  shelf = library({ key: 'pixel-props', label: word('search'), empty: word('nothing'), items: libraryItems, selected: () => prefs.id, pick: pickKind, filters: () => [chips()] });
  root.replaceChildren(h('div', { class: 'shell' }, barSlot, workspace({
    key: 'pixel-props', left: [shelf], centre: [stage], right: [tabSlot, panel], leftWidth: 280, rightWidth: 380,
  })));
}

undoKeys(undo.undo, undo.redo);
// Another page (the object editor, the flora tool) may have changed what the library shows.
window.addEventListener('focus', () => { reloadProps(); render(); });

mount();
render();

let lastFrame = -1;
const tick = (ms: number) => {
  const frame = prefs.playing ? Math.floor(ms / 125) % (FRAMES * 4) : 0;
  if (frame !== lastFrame || stageDirty) {
    lastFrame = frame;
    stageDirty = false;
    drawStage(frame);
    fitWhole(hero, Math.min(stage.clientWidth, stage.clientHeight) - 24);
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
document.body.dataset.ready = '1';
