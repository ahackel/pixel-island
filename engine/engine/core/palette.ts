/**
 * The master palette. Every colour an item may use is an entry here. Each entry is a base colour
 * from which a darker and a lighter tone are derived by one rule: shadows turn cooler,
 * highlights turn warmer. Deriving the ramps keeps every material shaded
 * the same way, which is a large part of what makes separate items look like one set.
 */
const BASES = {
  skinA: '#f7d2ab',
  skinB: '#eab98d',
  skinC: '#cc9063',
  skinD: '#9d6644',
  skinE: '#6e452d',
  hairBlack: '#3a3340',
  hairBrown: '#7a4a31',
  hairBlond: '#e3b85a',
  hairRed: '#c4562f',
  hairGrey: '#a9a9b6',
  white: '#f4f0e4',
  // Bare bone: a skeleton's skin.
  bone: '#d8ceae',
  cream: '#e9dcb6',
  red: '#d4463f',
  orange: '#e98b3a',
  yellow: '#f2c744',
  leaf: '#62ad4f',
  green: '#2f9068',
  teal: '#3fb5b1',
  blue: '#4183d3',
  navy: '#34457a',
  purple: '#8c5cc1',
  pink: '#ea7ca7',
  brown: '#8d5c3d',
  tan: '#caa16b',
  straw: '#e8d07a',
  wood: '#9c6c49',
  grey: '#8f959e',
  steel: '#bac3cd',
  black: '#3a3a45',
  // Plant colours. They follow the same ramp rule, so foliage is shaded like everything else.
  jungle: '#2e7a4a',
  lime: '#a5c94a',
  moss: '#8a8f3e',
  sage: '#78a585',
  bark: '#7d5f4c',
  // Rock and beach colours, for stones and driftwood.
  stone: '#a39c90',
  basalt: '#5f5961',
  sandstone: '#d4a272',
  driftwood: '#bfae98',
  // Animal colours: the pig's and the ostrich's light pink skin.
  piglet: '#efb4ae',
  // Fire: a flame's orange, its yellow and its white-hot heart, for torches. Games may let them glow (daylight.ts GLOWING).
  flame: '#f0742a',
  flare: '#ffd23f',
  blaze: '#fff4c2',
} as const;

/** Colours with one fixed meaning, used by faces. They do not get derived tones. */
const FIXED = {
  ink: '#2c1e26',
  mouth: '#8f3a41',
  tooth: '#ffffff',
  blush: '#ef8f8a',
} as const;

/**
 * Colours with their three tones set by hand rather than by the ramp: for things painted already lit for the dark, as
 * the old isometric games did, with faces near black and the surfaces turned up to the light bright and cool.
 */
const LIT = {
  cave: { base: '#4a4f6a', shade: '#23253a', light: '#a7b6dc' },
} as const;
/** The colours lit for the dark: rocks in them are drawn back-lit (see flora's `growRock`). */
export const LIT_KEYS: ReadonlySet<string> = new Set(Object.keys(LIT));

export type PaletteKey = keyof typeof BASES | keyof typeof FIXED | keyof typeof LIT;

/** The ground shadow colour of everything drawn, laid over the ground once wherever any shadow falls. */
export const SHADOW = '#2a1c3a38';
export type Tone = 'base' | 'shade' | 'light';

const rgbOf = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexFrom = (rgb: number[]): string => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a: number[], b: number[], t: number): number[] => a.map((v, i) => v + (b[i] - v) * t);

// Shadows are the base darkened and pulled a little towards plum; highlights are the base
// lightened and pulled towards a warm cream. The same two moves for every material.
const SHADOW_TINT = rgbOf('#74405f');
const LIGHT_TINT = rgbOf('#fff2c2');

function ramp(hex: string): Record<Tone, string> {
  const base = rgbOf(hex);
  return {
    base: hex,
    shade: hexFrom(mix(base.map((v) => v * 0.84), SHADOW_TINT, 0.13)),
    light: hexFrom(mix(base.map((v) => v + (255 - v) * 0.3), LIGHT_TINT, 0.25)),
  };
}

// Hair catches the light more softly than cloth: a highlight closer to its base.
const HAIR_LIGHT = 0.5;
export const PALETTE = Object.fromEntries([
  ...Object.entries(BASES).map(([key, hex]) => {
    const r = ramp(hex);
    return [key, key.startsWith('hair') ? { ...r, light: hexFrom(mix(rgbOf(hex), rgbOf(r.light), HAIR_LIGHT)) } : r];
  }),
  ...Object.entries(FIXED).map(([key, hex]) => [key, { base: hex, shade: hex, light: hex }]),
  ...Object.entries(LIT),
]) as Record<PaletteKey, Record<Tone, string>>;

export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[];
/** The face colours with one fixed meaning, and every other colour: the ones things can be painted in. */
export const FIXED_KEYS = Object.keys(FIXED) as PaletteKey[];
export const PAINT_KEYS = PALETTE_KEYS.filter((k) => !FIXED_KEYS.includes(k));
export const SKIN_KEYS: PaletteKey[] = ['skinA', 'skinB', 'skinC', 'skinD', 'skinE'];
export const HAIR_KEYS: PaletteKey[] = ['hairBlack', 'hairBrown', 'hairBlond', 'hairRed', 'hairGrey'];
/** Colours meant for animals only. They are left out of the clothing colour choices. */
export const ANIMAL_KEYS: PaletteKey[] = ['piglet'];
/** Colours meant for plants, rocks and driftwood. They are left out of the clothing colour choices too. */
export const PLANT_KEYS: PaletteKey[] = ['jungle', 'lime', 'moss', 'sage', 'bark', 'stone', 'basalt', 'sandstone', 'driftwood'];
/** Colours of fire. Left out of the clothing colour choices as well. */
export const FIRE_KEYS: PaletteKey[] = ['flame', 'flare', 'blaze'];

/** One pixel of paint: a palette entry in one of its tones. */
export interface Cell {
  key: PaletteKey;
  shade: boolean;
  light?: boolean;
  /** Drawn see-through over what is already there, at this strength from 0 to 1: stubble. */
  mix?: number;
  /** Warmed a little towards the blush colour: ears and nose. */
  flush?: boolean;
}

/** How far ears and the nose are warmed towards the blush colour. */
const FLUSH = 0.3;

const flushed = new Map<string, string>();
export const hexOf = (cell: Cell): string => {
  const hex = PALETTE[cell.key][cell.shade ? 'shade' : cell.light ? 'light' : 'base'];
  if (!cell.flush) return hex;
  let out = flushed.get(hex);
  if (!out) flushed.set(hex, (out = hexFrom(mix(rgbOf(hex), rgbOf(PALETTE.blush.base), FLUSH))));
  return out;
};

const lighter = new Map<string, string>(Object.values(PALETTE).flatMap((r) => (r.light !== r.base ? [[r.light, r.base] as const] : [])));
const darkerCache = new Map<string, string>();
/** The next tone down a colour's ramp: a highlight becomes its base, a base its shade, a shade darker still. */
export function darker(hex: string): string {
  let out = darkerCache.get(hex);
  if (!out) darkerCache.set(hex, (out = lighter.get(hex) ?? ramp(hex).shade));
  return out;
}
