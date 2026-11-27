// The menu, which is also the pause: the game's name, play on or start over (before the first survivor: make one),
// and the settings with the language. What the buttons do comes in through `MenuHooks`.
import { C, caps, pixelButton, S } from '@pixel/shared/game-ui.ts';
import { label } from '@pixel/shared/pixel-ui.ts';
import { currentLang, LANGS, setLang } from '@pixel/shared/lang.ts';
import { t } from './i18n.ts';

/** A pixel button that says its text (a text id). */
export const wordButton = (key: string, on: () => void) => pixelButton(t(key), { words: t(key) }, on);

export interface MenuHooks {
  /** Where the game stands: the character editor open, a survivor on the island, the game ended, played since the page loaded. */
  state(): { editing: boolean; present: boolean; ended: boolean; started: boolean };
  /** Play on. */
  play(): void;
  /** Back to the character editor, which is a new game already. */
  backToEditor(): void;
  /** Start over: back to the first menu, out at sea; the old game stays saved until a survivor is made. */
  newGame(): void;
  /** Make the first survivor in the character editor. */
  createCharacter(): void;
}

export function menuView(h: MenuHooks): { el: HTMLElement; show(): void } {
  const box = Object.assign(document.createElement('div'), { className: 'menu' });

  /** A flag for each language, the one in use bright. */
  function flags(): HTMLElement {
    const row = Object.assign(document.createElement('div'), { className: 'langs' });
    row.append(...LANGS.map((l) => {
      const b = pixelButton(l.name, { icon: l.id }, () => {
        if (l.id === currentLang()) return;
        setLang(l.id);
        location.reload();
      });
      if (l.id !== currentLang()) b.classList.add('off');
      return b;
    }));
    return row;
  }
  /** The game's name, large; its shadow (style.css) falls as far as the buttons', not a large pixel. */
  function titleLabel(words: string): HTMLCanvasElement {
    const c = label(words, C.paper, S * 3);
    c.className = 'title';
    return c;
  }
  function show(): void {
    const { editing, present, ended } = h.state();
    box.replaceChildren(
      titleLabel('PIXEL ISLAND'),
      ...(editing
        ? [wordButton('continue', h.backToEditor)]
        : [
          ...(present && !ended ? [wordButton('continue', h.play)] : []),
          present ? wordButton('newGame', h.newGame) : wordButton('createCharacter', h.createCharacter),
        ]),
      wordButton('settings', showSettings),
    );
  }
  /** Settings, in place of the menu: the language for now. */
  function showSettings(): void {
    box.replaceChildren(
      label(caps(t('settings')), C.paper, S * 2),
      flags(),
      // The page is built in one language, so a change reloads it, back to the last save: the morning.
      ...(h.state().started ? [label(caps(t('settings.langLoses')), C.paper, S)] : []),
      wordButton('back', show),
    );
  }
  return { el: box, show };
}
