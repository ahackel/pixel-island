// The frame of the pixel-interface pages (icon editor, component overview): the same header as every tool page.
import { header, type HeaderOptions } from './components.ts';
import { TOOLS, toolHref } from '../shared/tools.ts';

export type PageId = 'icons' | 'ui';

/** The page's root with its header. Links come from `toolHref`; `/` is the game (or the start page) and F2 goes there too. */
export function uiPage(current: PageId, actions: Partial<HeaderOptions> = {}): HTMLElement {
  document.body.className = 'upage';
  if (import.meta.env.DEV) addEventListener('keydown', (e) => e.key === 'F2' && (location.href = '/'));
  const main = document.createElement('main');
  main.className = 'upage__main';
  document.body.append(header({ tools: TOOLS.map((x) => ({ ...x, href: toolHref(x.id) })), tool: current, ...actions }).bar, main);
  return main;
}
