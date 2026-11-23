// The animal editor: pick a species, then style its coat, markings, ears, tail and face from
// pictures. The body sliders that make new species live in the Shape tab, behind Expert tools.
// Built on the shared editor shell, like the wardrobe.
import { box, tileGrid, confirmDialog, library, section as pixelSection, choice, toggle as pixelToggle, turnView, viewTools, workspace, type Library } from '../../ui/components.ts';
import { canSaveToProject, saveStores, storeTracker } from '../../shared/project.ts';
import {
  ANCHORS, ANIMAL_H, ANIMAL_ORIGIN, ANIMAL_STORE, ANIMAL_W, AnimalSprite, animalFile, CLIP_IDS, CLIPS, COLOR_KEYS, cleanAnimal, DEFAULT_ANIMAL, drawAnimal, EARS, heightOf, HORNS,
  MARKS, NUMBERS, PLANS, readAnimalFile, ROLES, savedAnimals, sizeClassOf, TAILS,
  type Animal, type AnimalFrame, type ClipId, type Feature, type Mark, type NumberKey,
} from '../../engine/animals/animal.ts';
import { PRESETS } from '../../engine/animals/animal-presets.ts';
import { download, newId, pickFile, readStore, writeStore } from '../../shared/files.ts';
import { PALETTE, type PaletteKey } from '../../engine/core/palette.ts';
import { FACING_NAMES, turnFacing, type Facing } from '../../engine/core/puppet.ts';
import {
  cheer, h, history, NAMES, nameTag, pick, pickStart, row, savePicture, section, segmented, shuffled, snapButton, tabs, tabTools, toggle, topBar, undoKeys, word,
  type IconName, rangeInput } from '../../shared/shell.ts';
import { currentLang } from '../../shared/lang.ts';
import { fitWhole, paintSprite, pictureCache, trimmed, type Rect } from '../../shared/pixels.ts';
import { withSunShadow } from '../../engine/world/island.ts';
import { drawSymptom, SYMPTOMS } from './symptoms.ts';

// ------------------------------------------------------------------ words

const LABEL: Record<string, string> = {
  scale: 'Size', shaggy: 'Shaggy fur', length: 'Body length', girth: 'Body depth', width: 'Body width', tilt: 'Lean', legs: 'Leg length', legWidth: 'Leg thickness',
  arms: 'Arm length', hump: 'Hump', humpAt: 'Hump position', neck: 'Neck length', neckWidth: 'Neck thickness', neckAngle: 'Neck angle',
  head: 'Head', muzzle: 'Muzzle length', eye: 'Eye size', muzzleWidth: 'Muzzle width', snoutDown: 'Muzzle angle', earSize: 'Ear size', tailLength: 'Tail length',
  tailUp: 'Tail angle', tailCurl: 'Tail curl', hornSize: 'Horn size', trunk: 'Trunk',
  quad: 'Four legs', biped: 'Two legs', ape: 'Upright ape',
  none: 'None', tiny: 'Tiny', round: 'Round', pointed: 'Pointed', tall: 'Tall', lop: 'Lop', flap: 'Flaps',
  stub: 'Stub', thin: 'Thin', tuft: 'Tuft', bushy: 'Bushy', thick: 'Thick', plume: 'Plume',
  horns: 'Horns', nose: 'Nose horn', tusks: 'Tusks',
  blush: 'Blush', teeth: 'Teeth', spines: 'Spines', wings: 'Wings', beak: 'Beak',
  belly: 'Belly', chest: 'Chest', muzzleMark: 'Muzzle', face: 'Face', blaze: 'Blaze', hood: 'Head and neck', saddle: 'Back', stripe: 'Stripe',
  bands: 'Tabby bands', spots: 'Spots', patches: 'Patches', socks: 'Socks', tailTip: 'Tail tip',
  fur: 'Fur', second: 'Second', third: 'Third', noseColor: 'Nose', horn: 'Horn, beak, tusks',
};
const LABEL_DE: Record<string, string> = {
  scale: 'Größe', shaggy: 'Zotteliges Fell', length: 'Körperlänge', girth: 'Körperhöhe', width: 'Körperbreite', tilt: 'Neigung', legs: 'Beinlänge', legWidth: 'Beindicke',
  arms: 'Armlänge', hump: 'Höcker', humpAt: 'Höcker-Lage', neck: 'Halslänge', neckWidth: 'Halsdicke', neckAngle: 'Halswinkel',
  head: 'Kopf', muzzle: 'Schnauzenlänge', eye: 'Augengröße', muzzleWidth: 'Schnauzenbreite', snoutDown: 'Schnauzenwinkel', earSize: 'Ohrgröße', tailLength: 'Schwanzlänge',
  tailUp: 'Schwanzwinkel', tailCurl: 'Schwanzkringel', hornSize: 'Horngröße', trunk: 'Rüssel',
  quad: 'Vier Beine', biped: 'Zwei Beine', ape: 'Aufrechter Affe',
  none: 'Keine', tiny: 'Winzig', round: 'Rund', pointed: 'Spitz', tall: 'Lang', lop: 'Hängend', flap: 'Lappen',
  stub: 'Stummel', thin: 'Dünn', tuft: 'Quaste', bushy: 'Buschig', thick: 'Dick', plume: 'Federn',
  horns: 'Hörner', nose: 'Nasenhorn', tusks: 'Stoßzähne',
  blush: 'Rote Wangen', teeth: 'Zähne', spines: 'Stacheln', wings: 'Flügel', beak: 'Schnabel',
  belly: 'Bauch', chest: 'Brust', muzzleMark: 'Schnauze', face: 'Gesicht', blaze: 'Blesse', hood: 'Kopf und Hals', saddle: 'Rücken', stripe: 'Streifen',
  bands: 'Tigerstreifen', spots: 'Flecken', patches: 'Platten', socks: 'Socken', tailTip: 'Schwanzspitze',
  fur: 'Fell', second: 'Zweite', third: 'Dritte', noseColor: 'Nase', horn: 'Horn, Schnabel, Stoßzähne',
};
const de = () => currentLang() === 'de';
/** The text in the current language. */
const L = (en: string, german: string) => (de() ? german : en);
const label = (key: string) => (de() ? LABEL_DE[key] : undefined) ?? LABEL[key] ?? key;
const markLabel = (m: Mark) => label(m === 'muzzle' ? 'muzzleMark' : m);
const CLIP_DE: Record<ClipId, string> = { idle: 'Stehen', walk: 'Gehen', run: 'Rennen', sit: 'Sitzen', eat: 'Fressen', lie: 'Liegen' };
const roleLabel = (r: string) => label(r === 'nose' ? 'noseColor' : r);

// ------------------------------------------------------------------ state

const { draft: DRAFT_KEY, roster: ROSTER_KEY, current: CURRENT_KEY } = ANIMAL_STORE;
interface Saved { id: string; name: string; animal: Animal }

let animal = cleanAnimal(readStore(DRAFT_KEY, PRESETS[0].animal));
let roster: Saved[] = savedAnimals();
let currentId: string | null = readStore<string | null>(CURRENT_KEY, null);
if (!roster.some((s) => s.id === currentId)) currentId = null;

const current = () => roster.find((s) => s.id === currentId);
// Opening the editor shows the animal picked in My things, even if the draft moved on.
if (current()) animal = structuredClone(current()!.animal);

const EXPERT_KEY = 'pixel-animals-expert';
let expert = readStore<boolean>(EXPERT_KEY, false) === true;

type TabId = 'species' | 'coat' | 'marks' | 'ears' | 'tail' | 'face' | 'shape';
const TABS: [TabId, string, string, IconName][] = [
  ['species', 'Species', 'Tierart', 'paw'], ['coat', 'Coat', 'Fell', 'palette'], ['marks', 'Markings', 'Zeichnung', 'spots'],
  ['ears', 'Ears', 'Ohren', 'ear'], ['tail', 'Tail', 'Schwanz', 'tail'], ['face', 'Face', 'Gesicht', 'face'], ['shape', 'Shape', 'Form', 'sliders'],
];
let tab: TabId = 'species';
let facing: Facing = 0;
let clip: ClipId = 'idle';
let symptom = '';
let showPoints = false;
/** Clips play even with reduced motion: picking one is asking to see it move. Pause stops on the frame shown. */
let paused = false;
let version = 0;
let crop: Rect = { x: 0, y: 0, w: ANIMAL_W, h: ANIMAL_H };
const GROUNDS = [['Floor', 'Boden', '#d9d3c4'], ['Grass', 'Gras', '#8fcf78'], ['Sand', 'Sand', '#e9d9a0']] as const;
let ground: string = GROUNDS[0][2];
let message = '';

// ------------------------------------------------------------------ drawing

/** A square around everything the animal does, so the view does not jump between clips. */
function cropFor(a: Animal): Rect {
  let x0 = ANIMAL_W, y0 = ANIMAL_H, x1 = 0, y1 = 0;
  for (const id of CLIP_IDS) {
    for (const f of [0, Math.floor(CLIPS[id].frames / 2)]) {
      // The mirrored facings too: the sun casts their shadows another way.
      for (const at of [0, 1, 2, 3] as const) {
        // The animal and its shadow, cast from the sun; the crop stays centred, so as wide on each side.
        const b = withSunShadow(drawAnimal(a, id, f, at).sprite, ANIMAL_W, ANIMAL_H, ANIMAL_ORIGIN).bounds;
        x0 = Math.min(x0, b.x0, ANIMAL_W - 1 - b.x1); x1 = Math.max(x1, b.x1, ANIMAL_W - 1 - b.x0);
        y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1);
      }
    }
  }
  const side = Math.max(24, x1 - x0 + 5, y1 - y0 + 5);
  return { x: Math.round(ANIMAL_W / 2 - side / 2), y: Math.round((y0 + y1) / 2 - side / 2), w: side, h: side };
}

/** A small standing picture of an animal, trimmed to what it paints. */
function thumbnail(a: Animal, box = 60): HTMLCanvasElement {
  return thumbs.of(`${box}|${JSON.stringify(a)}`, () => trimmed(withSunShadow(drawAnimal(a, 'idle', 0, 0).sprite, ANIMAL_W, ANIMAL_H, ANIMAL_ORIGIN), ANIMAL_W, ANIMAL_H, box));
}
/** The panel is rebuilt on every change and shows the same presets and saved animals again: their pictures are drawn once. */
const thumbs = pictureCache('thumb');

// ------------------------------------------------------------------ saving

const undo = history(() => animal, (value) => {
  animal = value;
  persist();
  crop = cropFor(animal);
  render();
});

function storeRoster(note = ''): void {
  message = writeStore(ROSTER_KEY, roster) ? note : L('Could not save: this browser refuses storage here.', 'Nicht gespeichert: Dieser Browser erlaubt hier keinen Speicher.');
}

/** Keeps the draft and, if one is picked, its entry in My things. */
function persist(): void {
  version++;
  writeStore(DRAFT_KEY, animal);
  const saved = current();
  if (saved) {
    saved.animal = structuredClone(animal);
    storeRoster();
  }
}

function changed(): void {
  undo.commit();
  message = '';
  persist();
  // The crop takes two dozen drawings, so a slider drag keeps the old one until release.
  crop = cropFor(animal);
  render();
}
function setCurrent(id: string | null): void {
  currentId = id;
  writeStore(CURRENT_KEY, id);
}
function addThing(name: string, from: Animal): void {
  const saved = { id: newId(), name: name.slice(0, 40), animal: structuredClone(from) };
  roster.push(saved);
  setCurrent(saved.id);
  storeRoster();
}
function load(next: Animal, id: string | null): void {
  animal = structuredClone(next);
  setCurrent(id);
  undo.reset();
  persist();
  crop = cropFor(animal);
  render();
}
function renameThing(name: string): void {
  const saved = current();
  if (saved) {
    if (saved.name === name) return;
    saved.name = name.slice(0, 40);
    storeRoster();
  } else addThing(name, animal);
  render();
}
async function remove(): Promise<void> {
  const saved = current();
  if (!saved || !(await confirmDialog(L(`Delete "${saved.name}" from this device?`, `„${saved.name}“ von diesem Gerät löschen?`)))) return;
  roster = roster.filter((s) => s !== saved);
  setCurrent(null);
  storeRoster(L(`Deleted "${saved.name}".`, `„${saved.name}“ gelöscht.`));
  render();
}
async function importFile(): Promise<void> {
  let file: { name: string; animal: Animal };
  try {
    file = readAnimalFile(await pickFile());
  } catch {
    message = L('That file is not an animal.', 'Diese Datei ist kein Tier.');
    return render();
  }
  addThing(file.name, file.animal);
  message = L(`Imported "${file.name}".`, `„${file.name}“ importiert.`);
  load(file.animal, currentId);
}

// ------------------------------------------------------------------ shuffle

const some = <T>(list: readonly T[], most: number): T[] => shuffled(list).slice(0, Math.floor(Math.random() * (most + 1)));

/** A random coat for a body: fur, second and third colour from the palette, nose kept. */
function rollCoat(into: Animal): void {
  into.colors = { ...into.colors, fur: pick(COLOR_KEYS), second: pick(COLOR_KEYS), third: pick(COLOR_KEYS) };
}

/** What each tab owns, so a tab can be shuffled alone or kept when shuffling all. Shape owns the rest. */
const OWN: Record<Exclude<TabId, 'species' | 'shape'>, (keyof Animal)[]> = {
  coat: ['colors', 'fur'],
  marks: ['marks'],
  ears: ['ears', 'earColor', 'earSize'],
  tail: ['tail', 'tailLength', 'tailUp', 'tailCurl'],
  face: ['features', 'horns', 'hornSize'],
};
const FACE_FEATURES: Feature[] = ['blush', 'teeth', 'beak'];
function takeTab(into: Animal, from: Animal, id: TabId): void {
  if (id === 'species' || id === 'shape') {
    const keep = structuredClone(into);
    Object.assign(into, structuredClone(from));
    for (const keys of Object.values(OWN)) for (const k of keys) (into as unknown as Record<string, unknown>)[k] = keep[k];
    // Spines and wings belong to the body; blush, teeth and beak to the face.
    into.features = [...keep.features.filter((f) => FACE_FEATURES.includes(f)), ...from.features.filter((f) => !FACE_FEATURES.includes(f))];
    return;
  }
  for (const k of OWN[id]) (into as unknown as Record<string, unknown>)[k] = structuredClone(from[k]);
  if (id === 'face') into.features = [...from.features.filter((f) => FACE_FEATURES.includes(f)), ...into.features.filter((f) => !FACE_FEATURES.includes(f))];
}

/** A random animal: a species with a fresh coat and markings. */
function roll(): Animal {
  const next = structuredClone(pick(PRESETS).animal);
  rollCoat(next);
  next.marks = some(MARKS, 2);
  return next;
}
/** One tab rolled on its own, with choices that stay recognisable. */
function rollTab(id: TabId): Animal {
  const next = structuredClone(animal);
  if (id === 'species' || id === 'shape') takeTab(next, pick(PRESETS).animal, id);
  else if (id === 'coat') rollCoat(next);
  else if (id === 'marks') next.marks = some(MARKS, 3);
  else if (id === 'ears') Object.assign(next, { ears: pick(EARS.filter((e) => e !== 'none')), earColor: pick(ROLES.slice(0, 3)) });
  else if (id === 'tail') next.tail = pick(TAILS);
  else next.features = [...next.features.filter((f) => !FACE_FEATURES.includes(f)), ...some(FACE_FEATURES, 2)];
  return next;
}

const locked = new Set<TabId>();
function shuffle(only?: TabId): void {
  if (only) animal = rollTab(only);
  else {
    const next = roll();
    for (const id of locked) takeTab(next, animal, id);
    animal = next;
  }
  changed();
  cheer(stage);
}

// ------------------------------------------------------------------ controls

/** Picture cards: each shows the current animal with that one choice made. */
function cards<V>(values: readonly V[], text: (v: V) => string, chosen: (v: V) => boolean, apply: (a: Animal, v: V) => void): HTMLElement {
  const tiles = values.map((v, i) => {
    const look = structuredClone(animal);
    apply(look, v);
    return { id: String(i), picture: thumbnail(look), words: text(v) };
  });
  return tileGrid(tiles, String(values.findIndex(chosen)), (id) => { apply(animal, values[Number(id)]); changed(); });
}

/** A slider. The preview follows while dragging; the panel is rebuilt only on release, so the drag is not interrupted. */
function slider(key: NumberKey): HTMLElement {
  const range = NUMBERS[key];
  const text = label(key === 'fur' ? 'shaggy' : key);
  const input = rangeInput({ min: String(range.min), max: String(range.max), step: String(range.step), 'aria-label': text });
  input.value = String(animal[key]);
  const value = h('b', {}, String(animal[key]));
  input.addEventListener('input', () => {
    animal[key] = Number(input.value);
    value.textContent = input.value;
    // Only the preview follows a drag; the crop and the panel wait for the release.
    version++;
  });
  input.addEventListener('change', () => changed());
  return row(text, input, value);
}

function featureToggles(values: readonly Feature[]): HTMLElement {
  const current = animal.features;
  return h('div', { class: 'toggles' }, ...values.map((value) => toggle(label(value), current.includes(value), () => {
    animal.features = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    changed();
  })));
}

function swatches(title: string, selected: PaletteKey, choose: (key: PaletteKey) => void): HTMLElement {
  return row(title, choice(title, COLOR_KEYS.map((key) => ({ id: key, color: PALETTE[key].base })), () => selected, (key) => choose(key as PaletteKey), 'colors', 60));
}

function panelFor(id: TabId): HTMLElement[] {
  const sliders = (group: string) => (Object.keys(NUMBERS) as NumberKey[]).filter((k) => NUMBERS[k].group === group).map(slider);
  switch (id) {
    case 'species': {
      const grid = tileGrid(PRESETS.map((p, i) => ({ id: String(i), picture: thumbnail(p.animal), words: p.name })), String(PRESETS.findIndex((p) => JSON.stringify(p.animal) === JSON.stringify(animal))),
        (id) => { animal = structuredClone(PRESETS[Number(id)].animal); changed(); });
      return [section(L('Species', 'Tierart'), grid, h('p', { class: 'note' }, L('The 21 animals of Lop Hop, redrawn by rule. Pick one, then style it in the other tabs.', 'Die 21 Tiere aus Lop Hop, nach Regeln neu gezeichnet. Wähle eines und gestalte es in den anderen Reitern.')))];
    }
    case 'coat':
      return [
        section(L('Colours', 'Farben'), ...ROLES.map((role) => swatches(roleLabel(role), animal.colors[role], (key) => {
          animal.colors[role] = key;
          changed();
        }))),
        section(L('Fur', 'Fell'), slider('fur')),
      ];
    case 'marks':
      return [
        section(L('Markings', 'Zeichnung'), cards(MARKS, markLabel, (m) => animal.marks.includes(m), (a, m) => {
          a.marks = a.marks.includes(m) ? a.marks.filter((x) => x !== m) : [...a.marks, m];
        })),
        h('p', { class: 'note' }, L('Tap several to combine them. Marks use the second and third colour of the coat.', 'Tippe mehrere an, um sie zu mischen. Die Zeichnung nutzt die zweite und dritte Fellfarbe.')),
      ];
    case 'ears':
      return [
        section(L('Ears', 'Ohren'), cards(EARS, label, (e) => animal.ears === e, (a, e) => (a.ears = e))),
        section(L('Ear colour', 'Ohrfarbe'), segmented(L('Ear colour', 'Ohrfarbe'), ROLES.map((r) => ({ id: r, label: roleLabel(r) })), animal.earColor, (r) => {
          animal.earColor = r;
          changed();
        })),
      ];
    case 'tail':
      return [section(L('Tail', 'Schwanz'), cards(TAILS, label, (t) => animal.tail === t, (a, t) => (a.tail = t)))];
    case 'face':
      return [
        section(L('Face', 'Gesicht'), featureToggles(FACE_FEATURES)),
        section(L('Horns and tusks', 'Hörner und Stoßzähne'), cards(HORNS, label, (x) => animal.horns === x, (a, x) => {
          a.horns = x;
          // A horn needs a size to show; keep the one chosen, or start with a small one.
          if (x !== 'none' && a.hornSize === 0) a.hornSize = 2;
        })),
      ];
    case 'shape':
      return [
        section(L('Body plan', 'Körperbau'), segmented(L('Body plan', 'Körperbau'), PLANS.map((p) => ({ id: p, label: label(p) })), animal.plan, (p) => {
          animal.plan = p;
          changed();
        }), featureToggles(['spines', 'wings']), h('div', { class: 'toggles' }, toggle(L('Hops when running', 'Hoppelt beim Rennen'), animal.hops, () => {
          animal.hops = !animal.hops;
          changed();
        }), toggle(L('Can be carried', 'Kann getragen werden'), animal.pickable, () => {
          animal.pickable = !animal.pickable;
          changed();
        }))),
        section(L('Body', 'Körper'), ...sliders('body')),
        section(L('Head', 'Kopf'), ...sliders('head')),
        section(L('Ears and tail', 'Ohren und Schwanz'), ...sliders('ears')),
        section(L('Extras', 'Extras'), ...sliders('extras')),
        h('p', { class: 'note' }, L('Expert tools: these sizes make new species. Everything else is styling.', 'Expertenwerkzeuge: Diese Maße machen neue Tierarten. Alles andere ist Gestaltung.')),
      ];
  }
}

// ------------------------------------------------------------------ page

const root = document.getElementById('animals')!;
const stage = h('div', { class: 'stage' });
const hero = h('canvas', { class: 'stage__sprite' });
const stageTag = h('span', { class: 'stage__tag' });
const previewRows = h('div', { class: 'ufields' });
const tabSlot = h('div');
const panel = h('div', { class: 'uside__list', role: 'tabpanel' });
panel.addEventListener('click', (e) => (e.target as Element).closest('button') && cheer(stage));
const barSlot = h('div', { style: 'display: contents' });
const name = nameTag();
name.onRename(renameThing);
const views = viewTools();
const FACING_DE = ['vorne rechts', 'vorne links', 'hinten links', 'hinten rechts', 'vorne', 'links', 'hinten', 'rechts'];
const facingName = (at: Facing) => L(FACING_NAMES[at], FACING_DE[at]);
let sizeText = '';
// Arrows at its sides and a drag on it turn the animal round, an eighth of a turn at a time.
const arrows = turnView(stage, (step) => setFacing(turnFacing(facing, step)));

function setFacing(next: Facing): void {
  facing = next;
  stageTag.textContent = `${facingName(facing)} · ${sizeText}`;
}


// ------------------------------------------------------------------ the library: My things

let shelf: Library | undefined;
/** My things as tiles; while the one shown is not kept yet, it leads as a tile of its own. */
const shelfItems = () => [
  ...(current() ? [] : [{ id: '', picture: thumbnail(animal), words: L('Not saved yet', 'Noch nicht gespeichert'), mark: 'pencil' }]),
  ...roster.map((s) => ({ id: s.id, picture: thumbnail(s.animal), words: s.name })),
];
function pickThing(id: string): void {
  const chosen = roster.find((s) => s.id === id);
  message = '';
  if (chosen) load(chosen.animal, chosen.id);
  else {
    setCurrent(null);
    render();
  }
}

function renderBar(): void {
  const saved = current();
  const fileName = saved?.name ?? L('Animal', 'Tier');
  const { bar, undo: undoButton, redo: redoButton, pops } = topBar({
    sidebar: true,
    tool: 'animals',
    title: word('animals'),
    name: name.el,
    about: [
      L('Pick a species, then style its coat, markings, ears, tail and face. Rules draw it in the island look, in eight facings and six actions. Made for Animal Hospital.',
        'Wähle eine Tierart und gestalte Fell, Zeichnung, Ohren, Schwanz und Gesicht. Regeln zeichnen es im Insel-Stil, in acht Blickrichtungen und sechs Aktionen. Gemacht für Animal Hospital.'),
      L('Every part is a rounded mass, posed in 3D and drawn in the 2:1 view with the master palette and the light of the plants. Facings 1 and 2 are mirror images.',
        'Jedes Teil ist eine runde Masse, in 3D gestellt und in der 2:1-Ansicht mit der Hauptpalette und dem Licht der Pflanzen gezeichnet. Die Richtungen 1 und 2 sind Spiegelbilder.'),
      L(`Files are JSON of type "pixel-animal". The game draws them with drawAnimal() from engine/animals/animal.ts, which also gives the anchor points ${ANCHORS.join(', ')} for every frame.`,
        `Dateien sind JSON vom Typ „pixel-animal“. Das Spiel zeichnet sie mit drawAnimal() aus engine/animals/animal.ts, das für jedes Bild auch die Ankerpunkte ${ANCHORS.join(', ')} liefert.`),
    ],
    more: [
      { label: L('New animal', 'Neues Tier'), icon: 'plus', run: newThing },
      { label: saved ? L('Make a copy', 'Kopie machen') : L('Keep in My things', 'In Meine Sachen behalten'), icon: 'copy', run: () => {
        addThing(saved ? `${saved.name} 2` : pick(NAMES), animal);
        render();
      } },
      { label: L('Start over', 'Neu beginnen'), icon: 'reset', run: () => {
        animal = structuredClone(DEFAULT_ANIMAL);
        changed();
      } },
      { label: L('Export', 'Exportieren'), icon: 'download', run: () => download(`${fileName}.json`, animalFile(fileName, animal)) },
      { label: L('Save to project', 'Im Projekt speichern'), icon: 'download', main: true, disabled: !canSaveToProject(), track: storeTracker([ANIMAL_STORE.roster]), run: () => void saveStores([ANIMAL_STORE.roster]).then((ok) => { message = ok ? L('Saved to the project (src/content/store); commit it to keep it.', 'Im Projekt gespeichert (src/content/store); committe es, um es zu behalten.') : L('Nothing saved: change something first, and run the local dev server.', 'Nichts gespeichert: ändere erst etwas und starte den lokalen Dev-Server.'); render(); }) },
      { label: L('Import', 'Importieren'), icon: 'upload', run: () => void importFile() },
      { label: expert ? L('Expert tools: on', 'Expertenwerkzeuge: an') : L('Expert tools: off', 'Expertenwerkzeuge: aus'), icon: 'sliders', run: () => {
        expert = !expert;
        writeStore(EXPERT_KEY, expert);
        if (!expert && tab === 'shape') tab = 'species';
        if (!expert) showPoints = false;
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
      shown = '';
      shownVersion = -1;
    },
  });
  undoButton!.disabled = !undo.canUndo();
  redoButton!.disabled = !undo.canRedo();
  barSlot.replaceChildren(bar, ...pops);
}

/** New: pick one of three rolled animals, straight into My things. */
function newThing(): void {
  pickStart(() => shuffled(NAMES).slice(0, 3).map((n) => {
    const look = roll();
    return {
      label: n,
      picture: thumbnail(look, 150),
      choose: () => {
        addThing(n, look);
        load(look, currentId);
        cheer(stage);
      },
    };
  }));
}

function render(): void {
  stage.style.setProperty('--ground', ground);
  renderBar();
  shelf?.redraw();
  setFacing(facing);
  name.set(current()?.name ?? '', L('Not saved yet', 'Noch nicht gespeichert'));
  const shownTabs = TABS.filter(([id]) => id !== 'shape' || expert);
  tabSlot.replaceChildren(tabs(L('Style', 'Gestalten'), shownTabs.map(([id, en, german, icon]) => ({ id, label: L(en, german), icon })), tab, (id) => {
    tab = id;
    panel.scrollTop = 0;
    render();
  }, locked, tabTools(() => shuffle(tab), locked.has(tab), () => {
    if (!locked.delete(tab)) locked.add(tab);
    render();
  })));
  const scroll = panel.scrollTop;
  panel.replaceChildren(...panelFor(tab));
  panel.scrollTop = scroll;

  views.replaceChildren(snapButton(() => savePicture(hero, current()?.name ?? L('Animal', 'Tier'))),
    // Unticked holds the frame shown.
    pixelToggle(word('animate'), { icon: 'play' }, !paused, (on) => { paused = !on; }),
    choice(L('Ground', 'Boden'), GROUNDS.map(([en, german, color]) => ({ id: color as string, words: L(en, german), color })), () => ground, (color) => { ground = color; render(); }, 'list'),
    ...(expert ? [pixelToggle(L('Show anchor points', 'Ankerpunkte zeigen'), { icon: 'pin' }, showPoints, (on) => { showPoints = on; render(); })] : []));
  const symptoms = choice('Symptom', [{ id: '', words: L('None', 'Keins') }, ...Object.keys(SYMPTOMS).map((s) => ({ id: s, words: s }))], () => symptom, (id) => { symptom = id; }, 'list');
  const actions = CLIP_IDS.map((id) => ({ id: id as string, label: id === 'run' && animal.hops ? L('Hop', 'Hoppeln') : L(CLIPS[id].name, CLIP_DE[id]) }));
  previewRows.replaceChildren(
    row(L('Action', 'Aktion'), segmented(L('Action', 'Aktion'), actions, clip, (id) => {
      clip = id as ClipId;
      paused = false;
      render();
    })),
    row('Symptom', symptoms),
  );
}

/** Builds the page. Called again when the language changes, since every label is rebuilt. */
function mount(): void {
  document.documentElement.lang = currentLang();
  document.title = L('Animal Editor', 'Tier-Editor');
  stage.replaceChildren(hero, stageTag, ...arrows, views);
  const preview = pixelSection({ icon: 'eye', tip: word('preview') }, [previewRows]);
  shelf = library({ key: 'pixel-animals', label: word('search'), empty: word('nothing'), items: shelfItems, selected: () => currentId ?? '', pick: pickThing });
  root.replaceChildren(h('div', { class: 'shell' }, barSlot, workspace({ key: 'pixel-animals', left: [shelf], centre: [stage, box(preview)], right: [tabSlot, panel], leftWidth: 240, rightWidth: 460 })));
}

undoKeys(undo.undo, undo.redo);

mount();
crop = cropFor(animal);
render();

let shownVersion = -1;
let shown = '';
let ticks = 0;
const frames = new Map<string, AnimalFrame>();
const frameOf = (at: Facing, frame: number) => {
  const key = `${clip}|${at}|${frame}`;
  let hit = frames.get(key);
  if (!hit) frames.set(key, (hit = drawAnimal(animal, clip, frame, at)));
  return hit;
};
const tick = (ms: number) => {
  if (shownVersion !== version) {
    shownVersion = version;
    frames.clear();
    const height = heightOf(animal);
    const size = sizeClassOf(height);
    const sizeName = L(size.id, { small: 'klein', medium: 'mittel', large: 'groß', huge: 'riesig' }[size.id]);
    sizeText = `${height} px, ${sizeName}`;
    setFacing(facing);
  }
  if (!paused) ticks = ms;
  const frame = Math.floor((ticks / 1000) * CLIPS[clip].rate) % CLIPS[clip].frames;
  const key = `${version}|${clip}|${facing}|${frame}|${symptom}|${showPoints}|${symptom ? Math.floor(ms / 100) : 0}|${stage.clientWidth}`;
  if (key !== shown) {
    shown = key;
    const cached = frameOf(facing, frame);
    const { anchors } = cached;
    let { sprite } = cached;
    if (symptom || showPoints) {
      // Symptoms and points are drawn on a copy, not on the cached frame.
      sprite = new AnimalSprite();
      cached.sprite.pixels.forEach((c, i) => (sprite.pixels[i] = c));
    }
    if (symptom) drawSymptom(sprite, symptom, anchors, facing, ms / 1000);
    if (showPoints) for (const n of ANCHORS) sprite.set(anchors[n].x, anchors[n].y, anchors[n].visible ? '#ff00ff' : '#ff00ff66');
    // Its shadow cast from the sun, from the frame itself, not the marks on the copy.
    paintSprite(hero, withSunShadow(cached.sprite, ANIMAL_W, ANIMAL_H, ANIMAL_ORIGIN, false, sprite), crop);
    // As large as the stage allows, in whole-number steps.
    fitWhole(hero, Math.min(stage.clientWidth, stage.clientHeight) - 40);
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
document.body.dataset.ready = '1';
