// The frame of the pixel-interface pages (icon editor, component overview): a bar of icon buttons to the other pages.
import { pixelButton } from './components.ts';

const PAGES = [{ id: 'icons', icon: 'pencil', label: 'Icons' }, { id: 'ui', icon: 'grid', label: 'Interface' }] as const;
export type PageId = (typeof PAGES)[number]['id'];

/** The page's root with its bar. Links are written from a tool's folder; `/` is the game (or the start page) and F2 goes there too. */
export function uiPage(current: PageId): HTMLElement {
  document.body.className = 'upage';
  if (import.meta.env.DEV) addEventListener('keydown', (e) => e.key === 'F2' && (location.href = '/'));
  const bar = document.createElement('header');
  bar.className = 'urow';
  bar.append(pixelButton('Home', { icon: 'home' }, () => (location.href = '/')));
  for (const p of PAGES) bar.append(pixelButton(p.label, { icon: p.icon, lit: p.id === current }, () => p.id !== current && (location.href = `../${p.id}/`)));
  const main = document.createElement('main');
  main.className = 'upage__main';
  main.append(bar);
  document.body.append(main);
  return main;
}
