// The language of every tool: one choice, kept on this device, and the helper the string tables share.

export type Lang = 'en' | 'de';
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
];

// The key is older than the other tools: the wardrobe was the first to have a language.
const STORAGE_KEY = 'castaway-wardrobe-lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.some((l) => l.id === saved)) return saved as Lang;
  } catch {
    // Without storage the browser's language decides.
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

let lang: Lang = initial();

export const currentLang = (): Lang => lang;

export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore: the choice then lasts for this visit only.
  }
}

/** Fills the `{name}` placeholders of a text from `values`. */
export const fill = (text: string, values: Record<string, string | number> = {}): string =>
  text.replace(/\{(\w+)\}/g, (whole, name) => String(values[name] ?? whole));
