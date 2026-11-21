// The look of the sea: colours and motion.
// The world reads `ocean` every frame.

export interface Ocean {
  /** Water from the shore out to deep sea; the shallow end mixes with the sand floor. */
  shore: string;
  shallow: string;
  middle: string;
  open: string;
  deep: string;
  /** The colour the water turns towards at the top of the view, and how far. */
  far: string;
  gradient: number;
  /** Wave lines on the coast. */
  wave: string;
  waveReach: number; // levels deep where crests rise
  wavePeriod: number; // seconds from rising to breaking
  waves: number; // crests on the way in at once
  /** Wavelets on the open sea, in the wave colour: they fade in and out. */
  rippleOpacity: number; // how much a wavelet covers the water under it
  ripples: number; // share of places with a wavelet
  rippleLength: number; // longest wavelet crest, pixels
  drift: number; // pixels a second down the screen
  glints: number; // share of places that blink
}

/** The sea as tuned in the scene editor; it is fixed now, so it is no longer kept per device. */
export const ocean: Ocean = {
  shore: '#b4fdec',
  shallow: '#74ddd3',
  middle: '#58b7d4',
  open: '#2f6599',
  deep: '#316392',
  far: '#87cdfa',
  gradient: 0.5,
  wave: '#ffffff',
  waveReach: 1.4,
  wavePeriod: 4.8,
  waves: 2,
  rippleOpacity: 0.55,
  ripples: 0.3,
  rippleLength: 7,
  drift: 2.5,
  glints: 0.05,
};

export type OceanColor = { [K in keyof Ocean]: Ocean[K] extends string ? K : never }[keyof Ocean];
/** The colours that are baked into the ground picture; changing one means redrawing it. */
export const WATER_COLORS: OceanColor[] = ['shore', 'shallow', 'middle', 'open', 'deep'];

export const rgb = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
