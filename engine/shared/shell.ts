// The editor shell shared by every tool: top bar with the tool switcher, popover menus, the
// Preview inspector parts (sections, rows, segmented bars, sliders) and undo history.
// A tool only declares its tabs, preview rows and what Shuffle does.
import './ui.css';
import { currentLang, LANGS, setLang, type Lang } from './lang.ts';
import { choice, field, header, sidebarButton, slider as pixelSlider, textField, section as pixelSection, toggle as pixelToggle, pixelButton, type Option as Pick } from '../ui/components.ts';
import { TOOLS, toolHref, type ToolId } from './tools.ts';
import { textWidth } from './pixel-font.ts';

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

// ------------------------------------------------------------------ shell words

const WORDS = {
  en: {
    tools: 'Tools', saveAsk: 'Save your changes to the project before leaving?', save: 'Save', dontSave: "Don't save", cancel: 'Cancel', sidebar: 'Side panel', inspector: 'Inspector', home: 'Home', wardrobe: 'Wardrobe', animals: 'Animals', objects: 'Objects', flora: 'Flora', scene: 'Scene', props: 'Props', walls: 'Walls', particles: 'Particles', parts: 'Parts',
    icons: 'Icons', ui: 'Interface', animate: 'Animate', about: 'About this tool', more: 'More', undo: 'Undo', redo: 'Redo', shuffle: 'Shuffle all', language: 'Language', preview: 'Preview',
    name: 'Name', rollName: 'Roll a name', picture: 'Save a picture', rollTab: 'Shuffle this tab', lock: 'Keep this tab when shuffling all',
    pickStart: 'Pick a start', pickStartHint: 'You can change everything after.', close: 'Close', rollThree: 'Roll three new ones', search: 'Search', nothing: 'Nothing matches',
  },
  de: {
    tools: 'Werkzeuge', saveAsk: 'Änderungen vor dem Verlassen im Projekt speichern?', save: 'Speichern', dontSave: 'Nicht speichern', cancel: 'Abbrechen', sidebar: 'Seitenleiste', inspector: 'Inspektor', home: 'Start', wardrobe: 'Garderobe', animals: 'Tiere', objects: 'Objekte', flora: 'Flora', scene: 'Szene', props: 'Requisiten', walls: 'Wände', particles: 'Partikel', parts: 'Teile',
    icons: 'Symbole', ui: 'Oberfläche', animate: 'Bewegen', about: 'Über dieses Werkzeug', more: 'Mehr', undo: 'Rückgängig', redo: 'Wiederholen', shuffle: 'Alles würfeln', language: 'Sprache', preview: 'Vorschau',
    name: 'Name', rollName: 'Namen würfeln', picture: 'Bild speichern', rollTab: 'Diesen Reiter würfeln', lock: 'Beim Würfeln behalten',
    pickStart: 'Wähle einen Anfang', pickStartHint: 'Danach kannst du alles ändern.', close: 'Schließen', rollThree: 'Drei neue würfeln', search: 'Suchen', nothing: 'Nichts passt',
  },
} satisfies Record<Lang, Record<string, string>>;
export const word = (key: keyof typeof WORDS.en): string => WORDS[currentLang()][key];

export { type ToolId } from './tools.ts';

// ------------------------------------------------------------------ menu items

export interface MenuItem {
  label: string;
  icon: IconName;
  run: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** A main action (save): a button in the bar instead of an item in the menu. */
  main?: boolean;
  /** For a main action: whether there is anything to save (greys the button) and a way to save, asked about on leaving. */
  track?: { unsaved: () => boolean; saveNow: () => Promise<boolean> };
}

// ------------------------------------------------------------------ top bar

export interface TopBar {
  tool: ToolId;
  title: string;
  about: string[];
  /** The name of the thing being edited, a text field right after the page's icon. */
  name?: Node;
  /** Whether the tool has a left panel: adds the button that shows or hides it. */
  sidebar?: boolean;
  /** Whether the tool has a right panel (the inspector): adds the button that shows or hides it. */
  inspector?: boolean;
  /** The "My things" picker, if the tool keeps a list. */
  things?: Node;
  more: MenuItem[];
  /** Buttons for actions on the whole thing (new, duplicate), in their own group of the bar. */
  actions?: MenuItem[];
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
  // F2 goes to where the dev server starts: the game when a game serves the tools, else the start page.
  if (import.meta.env.DEV) addEventListener('keydown', (e) => e.key === 'F2' && (location.href = '/'));
  const tools = TOOLS.map((x) => ({ ...x, name: word(x.id as keyof typeof WORDS.en), href: toolHref(x.id) }));
  const { bar, undo, redo } = header({
    tools, tool: o.tool, about: o.about, name: o.name, sidebar: o.sidebar ? sidebarButton(word('sidebar')) : undefined, inspector: o.inspector ? sidebarButton(word('inspector'), 'right') : undefined, status: o.status, things: o.things, undo: o.undo, redo: o.redo, shuffle: o.shuffle, extra: o.extra,
    more: o.more.filter((m) => !m.main).map((m) => ({ icon: m.icon, label: m.label, on: m.run, danger: m.danger, disabled: m.disabled })),
    actions: o.actions?.map((m) => ({ icon: m.icon, label: m.label, on: m.run, disabled: m.disabled })),
    save: o.more.filter((m) => m.main).map((m) => ({ label: m.label, on: m.run, disabled: m.disabled, ...m.track }))[0],
    languages: { current: currentLang(), ids: LANGS.map((l) => l.id), pick: (id) => { setLang(id as Lang); o.relabel(); } },
    labels: { about: word('about'), more: word('more'), undo: word('undo'), redo: word('redo'), shuffle: word('shuffle'), language: word('language'), tools: word('tools'), saveAsk: word('saveAsk'), save: word('save'), dontSave: word('dontSave'), cancel: word('cancel') },
  });
  return { bar, undo, redo, pops: [] };
}

// ------------------------------------------------------------------ inspector parts

export interface Option<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
}

/** The pixel icon of the library for an old shell icon name; none: the words are shown instead. */
const PIXEL_ICON: Partial<Record<string, string>> = {
  shirt: 'clothes', body: 'body', face: 'face', scissors: 'scissors', paw: 'paw', props: 'tool', armchair: 'chair', sprout: 'sprout',
  wall: 'wall', mountain: 'mountain', grid: 'grid', home: 'home', pencil: 'pencil', eye: 'eye', sun: 'sun', moon: 'moon', lock: 'lock', unlock: 'unlock',
  turnRight: 'redo', turnLeft: 'undo', shapes: 'shapes', sliders: 'sliders', palette: 'palette', spots: 'spots', ear: 'ear', tail: 'tail', box: 'box', pin: 'pin',
  palm: 'palm', grass: 'grass', cactus: 'cactus', leaf: 'leaf', rock: 'rock', driftwood: 'driftwood', camera: 'camera', die: 'dice', plus: 'plus', trash: 'trash',
  eraser: 'eraser', line: 'line', male: 'male', female: 'female',
};
/** A label shortened for pixel text (it is hard to read at length): up to a colon or bracket, else its first two words. The full label stays the tooltip. */
const brief = (label: string): string => {
  const head = label.split(/[:(]/)[0].trim();
  return head.length <= 14 ? head : head.split(/\s+/).slice(0, 2).join(' ');
};
const asPick = <T extends string>(o: Option<T>): Pick => ({ id: o.id, icon: o.icon && PIXEL_ICON[o.icon], words: brief(o.label) });

/** A pick-one row: the pixel `choice` with all options in a row. Options without a pixel icon show their words. */
export function segmented<T extends string>(label: string, options: Option<T>[], value: T, pick: (id: T) => void, _className = 'seg'): HTMLElement {
  let current: string = value;
  return choice(label, options.map(asPick), () => current, (id) => { current = id; pick(id as T); }, 'buttons');
}

/** A labelled inspector row: its name, then the control; the value (if any) after the control. */
export function row(label: string, control: Node, value?: string | HTMLElement): HTMLElement {
  const shown = value === undefined ? control : h('span', { class: 'urow' }, control, typeof value === 'string' ? h('b', {}, value) : value);
  return field({ words: brief(label), tip: label }, shown);
}

/** A foldable section of the pixel kit; it remembers being closed for this visit. Consecutive rows line up in one grid. */
const closed = new Set<string>();
export function section(title: string, ...children: Child[]): HTMLElement {
  const nodes: Node[] = [];
  let grid: HTMLElement | null = null;
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (typeof c !== 'string' && c instanceof HTMLElement && c.classList.contains('note')) continue; // pixel pages say little: notes live in the about popup
    const node = typeof c === 'string' ? document.createTextNode(c) : c;
    if (node instanceof HTMLElement && node.classList.contains('ufield')) {
      if (!grid) { grid = h('div', { class: 'ufields' }); nodes.push(grid); }
      grid.append(node);
    } else { grid = null; nodes.push(node); }
  }
  return pixelSection({ words: brief(title), tip: title }, nodes, !closed.has(title), (open) => (open ? closed.delete(title) : closed.add(title)));
}

/**
 * A drop-in for `<input type="range">` (give it the same attributes: min, max, step, value, aria-label) drawn as the pixel
 * slider. Its `value` is a string like the input's, and it fires `input` while dragged and `change` on release.
 */
export function rangeInput(attrs: Record<string, string>): HTMLElement & { value: string } {
  const min = Number(attrs.min ?? 0), max = Number(attrs.max ?? 100), step = Number(attrs.step ?? 1);
  let current = Number(attrs.value ?? min);
  const wrap = h('span', { class: 'urange' }) as HTMLElement & { value: string };
  const build = () => wrap.replaceChildren(pixelSlider(attrs['aria-label'] ?? '', (current - min) / (max - min || 1), (n) => {
    const next = Number((Math.round((min + n * (max - min) - min) / step) * step + min).toFixed(6));
    if (next === current) return;
    current = next;
    wrap.dispatchEvent(new Event('input'));
  }, 40, undefined, () => wrap.dispatchEvent(new Event('change'))));
  Object.defineProperty(wrap, 'value', { get: () => String(current), set: (v: string) => { if (Number(v) === current) return; current = Number(v); build(); } });
  build();
  return wrap;
}

/** An on/off setting: a button lit while on. */
export function checkbox(label: string, checked: boolean, change: (on: boolean) => void): HTMLElement {
  return pixelToggle(label, { words: brief(label) }, checked, change);
}

export function toggle(label: string, pressed: boolean, flip: () => void): HTMLButtonElement {
  return pixelButton(label, { words: brief(label), pressed }, flip);
}

/** Tabs: the pixel `choice` of icon buttons (words where the library has no icon yet), then the tab's tools. */
export function tabs<T extends string>(label: string, list: Option<T>[], current: T, choose: (id: T) => void, _locked: ReadonlySet<T> = new Set(), tools: Node[] = []): HTMLElement {
  const wrap = h('div', { class: 'urow' }, segmented(label, list, current, choose), ...tools);
  return wrap;
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
 * The name of the thing being edited, in the top bar: type to rename. `rename` gets the new name when
 * editing ends, so a half-typed name is not saved.
 */
export function nameTag(): { el: HTMLElement; set: (name: string, placeholder: string) => void; onRename: (fn: (name: string) => void) => void } {
  const el = h('div', { class: 'name' });
  let rename: (name: string) => void = () => {};
  return {
    el,
    // A pixel text field; redrawn on every set, so typing in it is not interrupted by a render only when it has focus.
    set: (name, placeholder) => {
      if (el.contains(document.activeElement)) return;
      el.replaceChildren(textField(word('name'), name, () => {}, {
        placeholder, width: Math.min(120, Math.max(30, textWidth((name || placeholder).toUpperCase()) + 8)), flat: true,
        done: (v) => { if (v.trim()) rename(v.trim()); },
      }));
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
  return pixelButton(word('picture'), { icon: 'camera' }, take);
}

/** Die and lock beside the tab name: shuffle only this tab, or keep it when shuffling all. */
export function tabTools(roll: () => void, locked = false, toggleLock?: () => void): Node[] {
  return [
    pixelButton(word('rollTab'), { icon: 'dice' }, roll),
    toggleLock ? pixelButton(word('lock'), { icon: locked ? 'lock' : 'unlock', pressed: locked }, toggleLock) : null,
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
