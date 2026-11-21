// A character as the wardrobe builds it, shared by the wardrobe and the scene editor: the
// choices a player makes, how they are checked when read back, how they turn into a look the
// puppet draws, and the list of characters saved on this device.
import {
  baseLook, beardFor, BROWS, DEFAULT_FACE, EYE_COLORS, EYE_SHAPES, facesFor, GLASSES_COLORS, viewsFor, HAIR_STYLES, HEAD_SHAPES, headFor, headItemFor, MOODS, NOSES, UNDERSHORTS, UNDERTOP, wear,
  type FaceOptions, type Mood,
} from './base.ts';
import { CATALOG, entryById, recolor, type Entry } from './catalog.ts';
import { HAIR_KEYS, PALETTE, SKIN_KEYS, type PaletteKey } from '../core/palette.ts';
import { BUILDS, type Item, type Look, type Slot } from '../core/puppet.ts';
import { newId } from '../../shared/files.ts';
import { BONE, boneHead, PELVIS, RIBS, skullFaces } from './skeleton.ts';
import { WEAR_MAX, weathered, type Wear } from './wear.ts';

export { download, newId, pickFile } from '../../shared/files.ts';


export type WornSlot = Exclude<Slot, 'hair'>;
export const WORN_SLOTS: WornSlot[] = ['top', 'bottom', 'shoes', 'hat', 'beard', 'tool'];

export interface State {
  skin: PaletteKey;
  build: string;
  frame: 'm' | 'f';
  /** How long on the island: 0 is neat, 3 is tattered, any value in between. It ages everything worn, and the hair. */
  wear: Wear;
  /** Decides the facial expression. The features under Face stay the same. */
  mood: Mood;
  face: FaceOptions;
  /** A built-in style id, a catalogue id, or null for bald. */
  hair: string | null;
  hairColor: PaletteKey;
  /** The beard's own colour, or null to match the hair. */
  beardColor: PaletteKey | null;
  worn: Record<WornSlot, string | null>;
  /** Per slot: which of the item's own colours is replaced by which palette colour. */
  colors: Partial<Record<WornSlot, Partial<Record<PaletteKey, PaletteKey>>>>;
  ground: string;
  /** A skeleton: bone for skin, a skull for a face (see skeleton.ts). The rest of the character is worn as ever. */
  skeleton?: boolean;
}

export const HAIR_COLORS: PaletteKey[] = [...HAIR_KEYS, 'white', 'pink', 'teal', 'purple'];
export const GROUNDS = [
  { id: 'sand', color: '#e9d9a0' },
  { id: 'grass', color: '#8fcf78' },
  { id: 'deck', color: '#c39a6b' },
  { id: 'shallows', color: '#7fd6d0' },
] as const;

const firstOf = (slot: Slot, match: RegExp) => CATALOG.find((e) => e.slot === slot && match.test(e.id))?.id ?? null;

export function defaultState(): State {
  return {
    skin: 'skinB',
    build: 'slim',
    frame: 'm',
    // The default is a survivor: ordinary clothes, some weeks on the island.
    wear: 2,
    mood: 'happy',
    face: { ...DEFAULT_FACE },
    hair: 'short',
    hairColor: 'hairBrown',
    beardColor: null,
    worn: {
      top: firstOf('top', /recipe-everyday-0/) ?? firstOf('top', /./),
      bottom: firstOf('bottom', /sprite-everyday-bottoms-0/) ?? firstOf('bottom', /./),
      shoes: null,
      hat: firstOf('hat', /sprite-hat-2/),
      beard: null,
      tool: firstOf('tool', /sprite-spear-0/),
    },
    colors: {},
    ground: 'sand',
  };
}

/** A skeleton to start from: bald, bare, with nothing in its hands. */
export const skeletonState = (): State => ({ ...defaultState(), skeleton: true, wear: 0, hair: null, worn: { top: null, bottom: null, shoes: null, hat: null, beard: null, tool: null } });

const hairExists = (id: unknown) => HAIR_STYLES.some((s) => s.id === id) || entryById(id as string)?.slot === 'hair';

/** A character from storage or a file, checked field by field; anything unknown keeps the default. */
export function cleanState(input: unknown): State {
  const state = defaultState();
  try {
    const saved = input as Partial<State> | null;
    if (!saved || typeof saved !== 'object') return state;
    if (saved.skin && SKIN_KEYS.includes(saved.skin)) state.skin = saved.skin;
    if (BUILDS.some((b) => b.id === saved.build)) state.build = saved.build!;
    if (saved.frame === 'm' || saved.frame === 'f') state.frame = saved.frame;
    if (typeof saved.wear === 'number' && saved.wear >= 0 && saved.wear <= WEAR_MAX) state.wear = saved.wear;
    if ((MOODS as readonly string[]).includes(saved.mood as string)) state.mood = saved.mood!;
    if (saved.hair === null || hairExists(saved.hair)) state.hair = saved.hair ?? null;
    if (saved.hairColor && saved.hairColor in PALETTE) state.hairColor = saved.hairColor;
    if (saved.beardColor && saved.beardColor in PALETTE) state.beardColor = saved.beardColor;
    const face = saved.face;
    if (face) {
      if ((HEAD_SHAPES as readonly string[]).includes(face.shape ?? '')) state.face.shape = face.shape;
      if ((EYE_SHAPES as readonly string[]).includes(face.eyes)) state.face.eyes = face.eyes;
      if (EYE_COLORS.includes(face.eyeColor)) state.face.eyeColor = face.eyeColor;
      if ((BROWS as readonly string[]).includes(face.brows)) state.face.brows = face.brows;
      if ((NOSES as readonly string[]).includes(face.nose ?? '')) state.face.nose = face.nose;
      for (const key of ['blush', 'freckles', 'glasses', 'lashes'] as const) state.face[key] = !!face[key];
      if (face.glassesColor && GLASSES_COLORS.includes(face.glassesColor)) state.face.glassesColor = face.glassesColor;
    }
    for (const slot of WORN_SLOTS) {
      const id = saved.worn?.[slot];
      if (id === null || entryById(id)?.slot === slot) state.worn[slot] = id ?? null;
      const swap = saved.colors?.[slot];
      const clean = Object.entries(swap ?? {}).filter(([from, to]) => from in PALETTE && to && to in PALETTE);
      if (clean.length) state.colors[slot] = Object.fromEntries(clean);
    }
    if (GROUNDS.some((g) => g.id === saved.ground)) state.ground = saved.ground!;
    if (saved.skeleton === true) state.skeleton = true;
  } catch {
    // A malformed field leaves the rest at the default.
  }
  return state;
}

// ------------------------------------------------------------------ look

/** Hair and beards are drawn in one colour: the hair colour, or the beard's own when it has one. */
const inHairColor = (entry: Entry, color: PaletteKey): Item =>
  entry.colors.length ? recolor(entry.item, { [entry.colors[0]]: color }) : entry.item;

function hairItem(source: State): Item | null {
  if (!source.hair) return null;
  const style = HAIR_STYLES.find((s) => s.id === source.hair);
  if (style) return style.make(source.hairColor);
  const entry = entryById(source.hair);
  return entry ? inHairColor(entry, source.hairColor) : null;
}

function wornItem(source: State, slot: WornSlot): Item | null {
  const entry = entryById(source.worn[slot]);
  if (!entry) return null;
  return slot === 'beard' ? inHairColor(entry, source.beardColor ?? source.hairColor) : recolor(entry.item, source.colors[slot] ?? {});
}

/** A character in a fixed outfit of catalogue items, for the pictures that show one for scale or for show. */
export function outfitLook(skin: PaletteKey, hair: PaletteKey, mood: Mood, condition: Wear, ids: string[]): Look {
  const items = ids.map((id) => entryById(id)?.item).filter((i): i is Item => !!i).map((i) => weathered(i, condition));
  const look = wear(baseLook(skin, hair), ...items);
  return { ...look, faces: facesFor(skin, DEFAULT_FACE, hair, mood), items: look.items.map((i) => weathered(i, condition)) };
}

/** `underwear` is off for the mannequin that item pictures are cut from. */
export function lookOf(source: State, underwear = true): Look {
  const bones = !!source.skeleton;
  if (bones) source = { ...source, skin: BONE };
  const items: Item[] = [];
  // Everything is drawn neat and aged here, by the one value the character carries.
  const hair = hairItem(source);
  if (hair) items.push(weathered(headItemFor(hair, source.skin, source.face.shape), source.wear));
  for (const slot of WORN_SLOTS) {
    const item = wornItem(source, slot);
    if (item) items.push(weathered(headItemFor(beardFor(item, source.skin, source.face.shape), source.skin, source.face.shape), source.wear));
  }
  // The body is never bare.
  if (bones) {
    // Bare bones: ribs and a pelvis where nothing is worn.
    if (!source.worn.top) items.push(RIBS);
    if (!source.worn.bottom) items.push(PELVIS);
  } else {
    if (underwear && !source.worn.bottom) items.push(UNDERSHORTS);
    if (underwear && !source.worn.top && source.frame === 'f') items.push(UNDERTOP);
  }
  const views = viewsFor(source.skin, source.face, source.hairColor, source.mood);
  return {
    skeleton: bones,
    skin: source.skin,
    build: BUILDS.find((b) => b.id === source.build),
    frame: source.frame,
    head: bones ? { front: boneHead(headFor(source.skin, source.face.shape).front), back: boneHead(headFor(source.skin, source.face.shape).back) } : headFor(source.skin, source.face.shape),
    faces: bones ? skullFaces(facesFor(source.skin, source.face, source.hairColor, source.mood), headFor(source.skin, source.face.shape).front) : facesFor(source.skin, source.face, source.hairColor, source.mood),
    ...(source.face.glasses ? { glasses: source.face.glassesColor ?? 'black' } : {}),
    views: bones ? Object.fromEntries(Object.entries(views).map(([k, v]) => [k, { head: boneHead(v.head), faces: skullFaces(v.faces, boneHead(v.head)) }])) : views,
    items,
  };
}


// ------------------------------------------------------------------ saved characters

export interface Saved { id: string; name: string; state: State }

const ROSTER_KEY = 'castaway-characters';
/** The wardrobe's working character from before characters had names. */
const DRAFT_KEY = 'castaway-wardrobe';
const FILE_TYPE = 'castaway-character';


const CURRENT_KEY = 'castaway-characters-current';
/** The id of the character picked in My things. Kept as plain text, not as JSON like the other tools' ids. */
export function pickedCharacter(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    // Without storage nothing is picked.
    return null;
  }
}
export function pickCharacter(id: string | null): void {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    // The pick then lasts for this visit only.
  }
}

/** Characters saved on this device. The first time, the wardrobe's working character becomes the first one. */
export function loadRoster(): Saved[] {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (raw === null) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (!draft) return [];
      // Stored right away, so every page sees the same id for it.
      const first = [{ id: newId(), name: 'Castaway', state: cleanState(JSON.parse(draft)) }];
      saveRoster(first);
      return first;
    }
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((c) => c && typeof c.name === 'string' && typeof c.id === 'string')
      .map((c) => ({ id: c.id, name: c.name.slice(0, 40), state: cleanState(c.state) }));
  } catch {
    return [];
  }
}

/** False when the browser refuses storage, so the caller can say the save did not happen. */
export function saveRoster(list: Saved[]): boolean {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const characterFile = (c: Saved) => JSON.stringify({ type: FILE_TYPE, version: 1, name: c.name, state: c.state }, null, 2);

/** Reads a character file; throws with a short reason when it is not one. */
export function readCharacterFile(text: string): Saved {
  const data = JSON.parse(text);
  if (data?.type !== FILE_TYPE || typeof data.name !== 'string') throw new Error('not a character file');
  return { id: newId(), name: data.name.slice(0, 40), state: cleanState(data.state) };
}
