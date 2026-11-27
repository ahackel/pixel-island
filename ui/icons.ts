// The shared icon library: 9 by 9 pictures written as rows (see PAINT in theme.ts), drawn and edited in the icon editor
// (tools/icons). `icons.json` here is the engine's set; a game's `src/content/icons.json` adds to it and overrides by name.
import base from './icons.json';

const project: Record<string, string[]> = {};
try {
  for (const file of Object.values(import.meta.glob('/src/content/icons.json', { eager: true, import: 'default' }))) Object.assign(project, file);
} catch { /* plain Node has no import.meta.glob */ }

/** Every icon by name: the engine's, then the game's laid over. */
export const ICONS: Readonly<Record<string, readonly string[]>> = { ...base, ...project };
/** The names the engine itself ships; code can rely on these. */
export type Icon = keyof typeof base;

/** An icon's rows; the question-mark box for a name that is not there. */
export const iconRows = (name: string): readonly string[] => ICONS[name] ?? ICONS.missing;
