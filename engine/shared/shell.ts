// The editor shell shared by every tool: top bar with the tool switcher, popover menus, the
// Preview inspector parts (sections, rows, segmented bars, sliders) and undo history.
// A tool only declares its tabs, preview rows and what Shuffle does.
import './ui.css';
import { currentLang, LANGS, setLang, type Lang } from './lang.ts';

// ------------------------------------------------------------------ elements

export type Child = Node | string | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

export function button(attrs: Record<string, string>, onClick: () => void, ...children: Child[]): HTMLButtonElement {
  const b = h('button', { type: 'button', ...attrs }, ...children);
  b.addEventListener('click', onClick);
  return b;
}

// ------------------------------------------------------------------ icons
// Lucide outlines (ISC licence), each merged into one path; circles are written as two arcs.

const FACE = 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0 ';
const EYES = ' M9 9h.01 M15 9h.01';
export const ICONS = {
  chevron: 'M6 9l6 6 6-6',
  info: FACE + 'M12 16v-4 M12 8h.01',
  more: 'M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M18 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M4 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11',
  redo: 'M15 14l5-5-5-5 M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13',
  die: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M8 8h.01 M16 16h.01 M12 12h.01 M16 8h.01 M8 16h.01',
  plus: 'M5 12h14 M12 5v14',
  copy: 'M15 12v6 M12 15h6 M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
  pencil: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  reset: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  trash: 'M3 6h18 M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6 M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2 M10 11v6 M14 11v6',
  pause: 'M14 4h4v16h-4z M6 4h4v16H6z',
  play: 'M6 3l14 9-14 9z',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v10H5z',
  unlock: 'M7 11V7a5 5 0 0 1 9.9-1 M5 11h14v10H5z',
  camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z M12 10a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  close: 'M18 6L6 18 M6 6l12 12',
  palette: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z M13.5 6.5h.01 M17.5 10.5h.01 M6.5 12.5h.01 M8.5 7.5h.01',
  spots: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M7 10a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M13 8a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M12 15a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  ear: 'M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0 M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4',
  tail: 'M4 20c4 0 6-3 7-7s3-8 8-8 M19 5c1.5 1 1.5 3.5 0 4.5',
  sliders: 'M21 4h-7 M10 4H3 M21 12h-9 M8 12H3 M21 20h-5 M12 20H3 M14 2v4 M8 10v4 M16 18v4',
  raise: 'M18 9l-6-6-6 6 M12 3v14 M5 21h14',
  lower: 'M12 17V3 M6 11l6 6 6-6 M19 21H5',
  smooth: 'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
  level: 'M5 9h14 M5 15h14',
  brush: 'M14.622 17.897l-10.68-2.913 M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15',
  eraser: 'M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21 M5.082 11.09l8.828 8.828',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  shell: 'M12 21c-4.5 0-9-3-9-8 0-3 2-5.5 4-7l5 7 5-7c2 1.5 4 4 4 7 0 5-4.5 8-9 8z M12 13V6',
  zoomIn: 'M3 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M21 21l-4.35-4.35 M11 8v6 M8 11h6',
  zoomOut: 'M3 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M21 21l-4.35-4.35 M8 11h6',
  turnLeft: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5',
  turnRight: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8 M21 3v5h-5',
  person: 'M12 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4z M9 20l3-6 3 6 M6 9l6 2 6-2 M12 11v3',
  palm: 'M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4 M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3 M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35 M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14',
  grass: 'M12 22V11 M8 22c0-5-2-9-5-11 M16 22c0-5 2-9 5-11 M10 22c0-4-1-7-3-9 M14 22c0-4 1-7 3-9',
  cactus: 'M10 22V5a2 2 0 0 1 4 0v17 M14 13h2a2 2 0 0 0 2-2V8 M10 15H8a2 2 0 0 1-2-2v-3 M6 22h12',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12',
  rock: 'M3 18l3.5-8 5-4 6 3.5 3.5 8.5z M11.5 6l-1 5 7 -1.5',
  driftwood: 'M3 16l16-7 M7 14.2l-2.5-3 M13 11.6l1.5-3.6 M19 9l2.5 1.5',
  gauge: 'M12 14l4-4 M3.34 19a10 10 0 1 1 17.32 0',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  box: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.3 7l8.7 5 8.7-5 M12 22V12',
  shapes: 'M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z M3 14h7v7H3z M14 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
  pin: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0 M9 10a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  home: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8 M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  shirt: 'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z',
  paw: 'M11 2a2 2 0 1 0 0 4a2 2 0 1 0 0-4z M18 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4z M20 14a2 2 0 1 0 0 4a2 2 0 1 0 0-4z M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z',
  armchair: 'M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3 M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z M5 18v2 M19 18v2',
  sprout: 'M7 20h10 M10 20c5.5-2.5.8-6.4 3-10 M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z',
  pickaxe: 'M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912 M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393 M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z M19.686 8.314a12.501 12.501 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.319',
  door: 'M13 4h3a2 2 0 0 1 2 2v14 M2 20h3 M13 20h9 M10 12v.01 M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z',
  sun: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41',
  mountain: 'M8 3l4 8 5-5 5 15H2L8 3z',
  // Wardrobe tabs.
  body: 'M11 5a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M9 20l3-6 3 6 M6 8l6 2 6-2 M12 10v4',
  face: FACE + 'M8 14s1.5 2 4 2 4-2 4-2' + EYES,
  scissors: 'M3 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M8.12 8.12 12 12 M20 4 8.12 15.88 M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M14.8 14.8 20 20',
  beard: 'M5 8v4a7 7 0 0 0 14 0V8 M8 13c1.5-1 2.5-1 4 0 1.5-1 2.5-1 4 0',
  hat: 'M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5 M14 6a6 6 0 0 1 6 6v3 M4 15v-3a6 6 0 0 1 6-6 M3 15h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z',
  trousers: 'M6 3h12l1 18h-5l-2-11-2 11H5z',
  shoes: 'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z M16 17h4 M4 13h4',
  hammer: 'M15 12l-8.4 8.4a2.1 2.1 0 1 1-3-3L12 9 M17.6 15L22 10.6 M20.5 12.1l-1.6-1.6a2 2 0 0 1-.6-1.4V7.5l-2.6-2.6a6 6 0 0 0-4.2-1.8H9l.9.9a6 6 0 0 1 1.8 4.2V10l2 2h1.6a2 2 0 0 1 1.4.6l1.6 1.6',
  pointer: 'M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z',
  hand: 'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2 M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2 M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8 M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  // The pixel editor and the tools built on it.
  bucket: 'M19 11l-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11z M5 2l5 5 M2 13h15 M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4z',
  pipette: 'M2 22l1-1h3l9-9 M3 21v-3l9-9 M15 6l3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4z',
  line: 'M5 19L19 5 M3 21h4v-4H3z M17 7h4V3h-4z',
  mirror: 'M12 3v18 M8 7L3 12l5 5z M16 7l5 5-5 5z',
  flip: 'M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3 M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3 M12 20v2 M12 14v2 M12 8v2 M12 2v2',
  layers: 'M12 2l10 5-10 5L2 7z M2 17l10 5 10-5 M2 12l10 5 10-5',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M21 21l-4.3-4.3',
  wall: 'M3 4h18v16H3z M3 9h18 M3 14h18 M9 4v5 M15 9v5 M9 14v6',
  props: 'M3 21h18 M6 21V10l3-3 3 3v11 M14 21v-6h6v6 M9 7V4',
  // Moods, as faces.
  'mood.neutral': FACE + EYES + ' M8 15h8',
  'mood.smile': FACE + EYES + ' M8 14s1.5 2 4 2 4-2 4-2',
  'mood.happy': FACE + 'M8 10q1-1.5 2 0 M14 10q1-1.5 2 0 M8 14s1.5 2 4 2 4-2 4-2',
  'mood.laughing': FACE + EYES + ' M7 13h10a5 5 0 0 1-10 0z',
  'mood.sad': FACE + EYES + ' M16 16s-1.5-2-4-2-4 2-4 2',
  'mood.angry': FACE + 'M7.5 8l2.5 1 M14 9l2.5-1 M9 11h.01 M15 11h.01 M16 16s-1.5-2-4-2-4 2-4 2',
  'mood.surprised': FACE + EYES + ' M10.5 15.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  // Face parts, views and eye states for the shape editor.
  'part.eyes': 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  'part.brows': 'M3 10c2-3 5-3 7-1 M14 9c2-2 5-2 7 1 M7 15h.01 M17 15h.01',
  'part.mouth': 'M4 11h16 M4 11c1 5 4 7 8 7s7-2 8-7',
  'eye.round': 'M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M13 10h.01',
  'eye.small': 'M12 12h.01 M11 12h2 M12 11v2',
  'eye.sleepy': 'M5 11h14 M7 11a5 5 0 0 0 10 0',
  'eye.blink': 'M4 12c2 3 5 4 8 4s6-1 8-4',
  'eye.aside': 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M6 12h.01 M5.5 10.5a2 2 0 0 0 0 3',
  'brow.none': 'M3 10h7 M14 10h7 M4 20L20 4',
  'brow.thin': 'M3 11h7 M14 11h7',
  'brow.thick': 'M3 9h7v3H3z M14 9h7v3h-7z',
} as const;
export type IconName = keyof typeof ICONS;

const SVG = 'http://www.w3.org/2000/svg';
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

// ------------------------------------------------------------------ flags

const FLAGS: Record<Lang, string> = {
  en: '<clipPath id="flag-uk-t"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath><path d="M0 0h60v30H0z" fill="#012169"/><path d="M0 0l60 30M60 0L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30M60 0L0 30" clip-path="url(#flag-uk-t)" stroke="#c8102e" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#c8102e" stroke-width="6"/>',
  de: '<path d="M0 0h60v10H0z" fill="#000"/><path d="M0 10h60v10H0z" fill="#dd0000"/><path d="M0 20h60v10H0z" fill="#ffce00"/>',
};
/** A small flag for a language: the Union Jack for English, the German flag for German. */
export function flag(lang: Lang): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 60 30');
  svg.setAttribute('class', 'flag');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = FLAGS[lang];
  return svg;
}

// ------------------------------------------------------------------ shell words

const WORDS = {
  en: {
    tools: 'Tools', home: 'Home', wardrobe: 'Wardrobe', animals: 'Animals', objects: 'Objects', flora: 'Flora', scene: 'Scene', props: 'Props', walls: 'Walls', parts: 'Parts',
    animate: 'Animate', about: 'About this tool', more: 'More', undo: 'Undo', redo: 'Redo', shuffle: 'Shuffle all', language: 'Language', preview: 'Preview',
    name: 'Name', rollName: 'Roll a name', picture: 'Save a picture', rollTab: 'Shuffle this tab', lock: 'Keep this tab when shuffling all',
    pickStart: 'Pick a start', pickStartHint: 'You can change everything after.', close: 'Close', rollThree: 'Roll three new ones',
  },
  de: {
    tools: 'Werkzeuge', home: 'Start', wardrobe: 'Garderobe', animals: 'Tiere', objects: 'Objekte', flora: 'Flora', scene: 'Szene', props: 'Requisiten', walls: 'Wände', parts: 'Teile',
    animate: 'Bewegen', about: 'Über dieses Werkzeug', more: 'Mehr', undo: 'Rückgängig', redo: 'Wiederholen', shuffle: 'Alles würfeln', language: 'Sprache', preview: 'Vorschau',
    name: 'Name', rollName: 'Namen würfeln', picture: 'Bild speichern', rollTab: 'Diesen Reiter würfeln', lock: 'Beim Würfeln behalten',
    pickStart: 'Wähle einen Anfang', pickStartHint: 'Danach kannst du alles ändern.', close: 'Schließen', rollThree: 'Drei neue würfeln',
  },
} satisfies Record<Lang, Record<string, string>>;
export const word = (key: keyof typeof WORDS.en): string => WORDS[currentLang()][key];

export type ToolId = 'home' | 'wardrobe' | 'parts' | 'animals' | 'props' | 'objects' | 'flora' | 'walls' | 'scene';
const TOOLS: { id: ToolId; href: string; icon: IconName }[] = [
  { id: 'home', href: '../../', icon: 'home' },
  { id: 'wardrobe', href: '../wardrobe/', icon: 'shirt' },
  { id: 'parts', href: '../parts/', icon: 'scissors' },
  { id: 'animals', href: '../animals/', icon: 'paw' },
  { id: 'props', href: '../props/', icon: 'props' },
  { id: 'objects', href: '../objects/', icon: 'armchair' },
  { id: 'flora', href: '../flora/', icon: 'sprout' },
  { id: 'walls', href: '../walls/', icon: 'wall' },
  { id: 'scene', href: '../scene/', icon: 'mountain' },
];

// ------------------------------------------------------------------ popovers

/** Opens `pop` under `anchor` with the native popover: outside taps and Escape close it. */
export function attachPopover(anchor: HTMLElement, pop: HTMLElement): void {
  pop.popover = 'auto';
  pop.id ||= `pop-${Math.random().toString(36).slice(2)}`;
  anchor.setAttribute('aria-haspopup', 'true');
  anchor.setAttribute('aria-expanded', 'false');
  anchor.addEventListener('click', () => pop.togglePopover());
  pop.addEventListener('toggle', (event) => {
    const open = (event as ToggleEvent).newState === 'open';
    anchor.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${r.bottom + 6}px`;
    pop.style.left = `${Math.max(10, Math.min(r.left, window.innerWidth - pop.offsetWidth - 10))}px`;
  });
}

export interface MenuItem {
  label: string;
  icon: IconName;
  run: () => void;
  danger?: boolean;
  disabled?: boolean;
}
export function menu(label: string, items: MenuItem[]): HTMLElement {
  const pop = h('div', { class: 'pop', role: 'menu', 'aria-label': label });
  for (const item of items) {
    const b = button({ class: item.danger ? 'mi mi--danger' : 'mi', role: 'menuitem' }, () => {
      pop.hidePopover();
      item.run();
    }, icon(item.icon), item.label);
    b.disabled = !!item.disabled;
    pop.append(b);
  }
  return pop;
}

// ------------------------------------------------------------------ top bar

export interface TopBar {
  tool: ToolId;
  title: string;
  about: string[];
  /** The "My things" picker, if the tool keeps a list. */
  things?: Node;
  more: MenuItem[];
  status: HTMLElement;
  undo?: () => void;
  redo?: () => void;
  shuffle?: () => void;
  /** Tool-specific controls before the language switch, such as Edit / Play. */
  extra?: Node;
  /** Called after the language changed, to rebuild every label. */
  relabel: () => void;
}
export function topBar(o: TopBar): { bar: HTMLElement; undo: HTMLButtonElement | null; redo: HTMLButtonElement | null; pops: HTMLElement[] } {
  const me = TOOLS.find((x) => x.id === o.tool)!;
  const switcher = h('button', { type: 'button', class: 'switch', 'aria-label': `${o.title}, ${word('tools')}` },
    h('span', { class: 'switch__icon' }, icon(me.icon)), h('h1', {}, o.title), icon('chevron'));
  const tools = h('nav', { class: 'pop', 'aria-label': word('tools') },
    // Links are written from a tool's folder; the start page sits one level up.
    ...TOOLS.map((x) => h('a', { class: 'mi', href: o.tool === 'home' ? x.href.replace('../', './') : x.href, ...(x.id === o.tool ? { 'aria-current': 'page' } : {}) }, icon(x.icon), word(x.id))));
  attachPopover(switcher, tools);

  const info = h('button', { type: 'button', class: 'ib bar__info', 'aria-label': word('about'), title: word('about') }, icon('info'));
  const about = h('div', { class: 'pop pop--text', role: 'dialog', 'aria-label': word('about') }, ...o.about.map((p) => h('p', {}, p)));
  attachPopover(info, about);

  const moreButton = h('button', { type: 'button', class: 'ib bar__more', 'aria-label': word('more'), title: word('more') }, icon('more'));
  const more = menu(word('more'), o.more);
  attachPopover(moreButton, more);

  const undo = o.undo ? button({ class: 'ib', 'aria-label': word('undo'), title: word('undo') }, o.undo, icon('undo')) : null;
  const redo = o.redo ? button({ class: 'ib', 'aria-label': word('redo'), title: word('redo') }, o.redo, icon('redo')) : null;
  const me2 = LANGS.find((l) => l.id === currentLang())!;
  const langButton = h('button', { type: 'button', class: 'lang bar__langs', 'aria-label': `${word('language')}: ${me2.name}`, title: word('language') }, flag(me2.id), icon('chevron'));
  const langMenu = h('div', { class: 'pop', role: 'menu', 'aria-label': word('language') },
    ...LANGS.map((l) => button({ class: 'mi', role: 'menuitemradio', 'aria-checked': String(l.id === me2.id), lang: l.id }, () => {
      langMenu.hidePopover();
      if (l.id === currentLang()) return;
      setLang(l.id);
      o.relabel();
    }, flag(l.id), l.name)));
  attachPopover(langButton, langMenu);

  const bar = h('header', { class: 'bar' },
    switcher, info, h('span', { class: 'bar__sep' }), o.things, moreButton, o.status, h('span', { class: 'bar__break' }),
    h('span', { class: 'bar__spacer' }), undo, redo,
    o.shuffle && button({ class: 'btn', title: word('shuffle') }, o.shuffle, icon('die'), h('span', { class: 'btn__label' }, word('shuffle'))),
    o.extra, langButton,
  );
  return { bar, undo, redo, pops: [tools, about, more, langMenu] };
}

// ------------------------------------------------------------------ inspector parts

export interface Option<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
}
/** A pick-one row: one segmented bar on one line. Icon options show their label as a tooltip. */
export function segmented<T extends string>(label: string, options: Option<T>[], value: T, pick: (id: T) => void, className = 'seg'): HTMLElement {
  return h('div', { class: className, role: 'radiogroup', 'aria-label': label },
    ...options.map((o) => button({ role: 'radio', 'aria-checked': String(o.id === value), ...(o.icon ? { 'aria-label': o.label, title: o.label } : {}) }, () => pick(o.id), o.icon ? icon(o.icon) : o.label)));
}

/** A labelled inspector row. `value` is shown under the label, for sliders and icon rows. */
export function row(label: string, control: Node, value?: string | HTMLElement): HTMLElement {
  return h('div', { class: 'row' }, h('span', { class: 'row__label' }, label, value !== undefined && (typeof value === 'string' ? h('b', {}, value) : value)), control);
}

/** A collapsible section; it remembers being closed for this visit. */
const closed = new Set<string>();
export function section(title: string, ...children: Child[]): HTMLElement {
  const details = h('details', { class: 'sec' }, h('summary', {}, title), h('div', { class: 'sec__body' }, ...children));
  details.open = !closed.has(title);
  details.addEventListener('toggle', () => (details.open ? closed.delete(title) : closed.add(title)));
  return details;
}

/** A plain checkbox with its label, for on/off settings such as whether the preview moves. */
export function checkbox(label: string, checked: boolean, change: (on: boolean) => void): HTMLLabelElement {
  const input = h('input', { type: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => change(input.checked));
  return h('label', { class: 'check' }, input, label);
}

export function toggle(label: string, pressed: boolean, flip: () => void): HTMLButtonElement {
  return button({ class: 'toggle', 'aria-pressed': String(pressed) }, flip, label);
}

/** Icon tabs with the current tab's name on the right. */
export function tabs<T extends string>(label: string, list: Option<T>[], current: T, choose: (id: T) => void, locked: ReadonlySet<T> = new Set(), tools: Node[] = []): HTMLElement {
  const name = list.find((x) => x.id === current)?.label ?? '';
  return h('nav', { class: 'tabs', role: 'tablist', 'aria-label': label },
    ...list.map((x) => button({ class: locked.has(x.id) ? 'tab tab--locked' : 'tab', role: 'tab', 'aria-selected': String(x.id === current), 'aria-label': x.label, title: x.label }, () => choose(x.id), icon(x.icon ?? 'more'))),
    h('span', { class: 'tabs__name', 'aria-hidden': 'true' }, name), ...tools);
}

// ------------------------------------------------------------------ undo

export { history } from './history.ts';

/** Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z (or Ctrl+Y), outside text fields. */
export function undoKeys(undo: () => void, redo: () => void): void {
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'text') return;
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      (event.shiftKey ? redo : undo)();
    } else if (key === 'y') {
      event.preventDefault();
      redo();
    }
  });
}

/** A sideways swipe on the stage turns the subject one side per swipe. */
export function dragToTurn(el: HTMLElement, turn: (step: 1 | -1) => void): void {
  // Every 24 pixels dragged sideways turns one step, while the drag goes on.
  const STEP = 24;
  let x0: number | null = null;
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button, input, [contenteditable]')) return;
    x0 = e.clientX;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    while (Math.abs(e.clientX - x0) >= STEP) {
      const step = e.clientX > x0 ? 1 : -1;
      turn(step);
      x0 += step * STEP;
    }
  });
  const end = () => (x0 = null);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// ------------------------------------------------------------------ small joys

/** Friendly names that read the same in English and German. */
export const NAMES = ['Mara', 'Kai', 'Lou', 'Ben', 'Ida', 'Tom', 'Zoe', 'Finn', 'Nia', 'Ole', 'Ava', 'Jon', 'Rex', 'Pip', 'Luna', 'Momo', 'Bruno', 'Fips'];
export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
/** A copy of a list in a random order. */
export const shuffled = <T>(list: readonly T[]): T[] => [...list].sort(() => Math.random() - 0.5);

/** A short hop and a heart on the stage after a change. */
export function cheer(stage: HTMLElement): void {
  stage.classList.remove('stage--cheer');
  void stage.offsetWidth; // restart the animation
  stage.classList.add('stage--cheer');
}

/**
 * The name on the stage: type to rename, or roll a random one. `rename` gets the new name when
 * editing ends, so a half-typed name is not saved.
 */
export function nameTag(): { el: HTMLElement; set: (name: string, placeholder: string) => void; onRename: (fn: (name: string) => void) => void } {
  const input = h('input', { type: 'text', class: 'name__input', 'aria-label': word('name'), maxlength: '40', enterkeyhint: 'done' });
  let rename: (name: string) => void = () => {};
  const done = () => {
    const name = input.value.trim();
    if (name) rename(name);
  };
  input.addEventListener('change', done);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  const roll = button({ class: 'name__roll', 'aria-label': word('rollName'), title: word('rollName') }, () => {
    input.value = pick(NAMES.filter((n) => n !== input.value));
    done();
  }, icon('die'));
  return {
    el: h('div', { class: 'name' }, input, roll),
    set: (name, placeholder) => {
      if (document.activeElement !== input) input.value = name;
      input.placeholder = placeholder;
    },
    onRename: (fn) => (rename = fn),
  };
}

/** Saves a sprite canvas as a big PNG with whole-number pixels. */
export function savePicture(canvas: HTMLCanvasElement, name: string, scale = 8): void {
  const big = h('canvas', { width: String(canvas.width * scale), height: String(canvas.height * scale) });
  const ctx = big.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, big.width, big.height);
  big.toBlob((blob) => {
    if (!blob) return;
    const a = h('a', { href: URL.createObjectURL(blob), download: `${name}.png` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

export function snapButton(take: () => void): HTMLButtonElement {
  return button({ class: 'stage__button', 'aria-label': word('picture'), title: word('picture') }, take, icon('camera'));
}

/** Die and lock beside the tab name: shuffle only this tab, or keep it when shuffling all. */
export function tabTools(roll: () => void, locked = false, toggleLock?: () => void): Node[] {
  return [
    button({ class: 'ib', 'aria-label': word('rollTab'), title: word('rollTab') }, roll, icon('die')),
    toggleLock ? button({ class: 'ib', 'aria-pressed': String(locked), 'aria-label': word('lock'), title: word('lock') }, toggleLock, icon(locked ? 'lock' : 'unlock')) : null,
  ].filter((n): n is HTMLButtonElement => !!n);
}

export interface Start {
  label: string;
  picture: Node;
  choose: () => void;
}
/** New: three rolled starts to pick from instead of an empty figure. */
export function pickStart(roll: () => Start[]): void {
  const dialog = h('dialog', { class: 'start', 'aria-label': word('pickStart') });
  const cards = h('div', { class: 'start__cards' });
  const fill = () => cards.replaceChildren(...roll().map((s) => button({ class: 'card start__card' }, () => {
    dialog.close();
    s.choose();
  }, h('span', { class: 'card__picture' }, s.picture), h('span', { class: 'card__label' }, s.label))));
  fill();
  dialog.append(
    h('div', { class: 'start__head' }, h('h2', {}, word('pickStart')), h('p', {}, word('pickStartHint')),
      button({ class: 'ib', 'aria-label': word('close') }, () => dialog.close(), icon('close'))),
    cards,
    button({ class: 'btn start__again' }, fill, icon('die'), word('rollThree')),
  );
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
  document.body.append(dialog);
  dialog.showModal();
}
