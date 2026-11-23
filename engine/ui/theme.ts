// The look every pixel interface shares: colours, the icon palette and how many screen pixels one interface pixel takes.

/** How many screen pixels one interface pixel takes: big enough to tap on an iPad, which the games are made for. */
export const S = 4;

/** `paper` is a button's own colour; `panel` the slightly darker ground panels, popups and the header lay them on, so buttons stand out. */
export const C = {
  ink: '#2b1d12', paper: '#f6ecd2', panel: '#e9dcb9', empty: '#f6ecd28c', shadow: '#00000040', track: '#e2d3ae', hunger: '#e0862e', energy: '#4f9ad6', low: '#d9412b',
  lit: '#e8862a', night: '#2f3b6e', moon: '#f3eccf', white: '#ffffff',
};

/** What each character of an icon's rows paints; '.' is nothing. */
export const PAINT: Record<string, string> = {
  x: C.ink, r: '#d9412b', b: '#2f3b6e', g: '#cfe6f2', h: '#8a5a2b', y: '#f6c94a', o: '#e8862a', w: '#4f9ad6', m: '#f6e6a6', s: '#d8c27a', t: '#ffffff',
  l: '#c9c9c9', d: '#6b6b6b', e: '#a9d98a', f: '#3f7a3a', n: '#8a2a1e',
};
