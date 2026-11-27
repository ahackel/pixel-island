// Saving an editor's work into the project (the dev server writes the file; see engine/dev/content-plugin.ts).
import { projectStore } from './files.ts';

/** Whether saving into the project can work here: only the local dev server has the endpoint. */
export const canSaveToProject = (): boolean => import.meta.env.DEV;

/** Saves `data` as `<name>.json` in the game's content folder. Resolves to whether the dev server wrote it. */
export async function saveToProject(name: string, data: unknown): Promise<boolean> {
  if (!canSaveToProject()) return false;
  try {
    const response = await fetch(`/__save/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Removes `<name>.json` from the game's content folder (one saved under a name it no longer has). Resolves to whether it is gone. */
export async function removeFromProject(name: string): Promise<boolean> {
  if (!canSaveToProject()) return false;
  try {
    const response = await fetch(`/__save/${name}`, { method: 'DELETE' });
    return response.ok;
  } catch {
    return false;
  }
}

/** Saves what editors keep on this device under these store keys into the project (`store/<key>.json`); a key with nothing kept yet is skipped. True when at least one was written and none failed. */
export async function saveStores(keys: string[]): Promise<boolean> {
  let wrote = false;
  for (const key of keys) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { /* no storage: nothing to save */ }
    if (raw === null) continue;
    if (!(await saveToProject(`store/${key}.json`, JSON.parse(raw)))) return false;
    saved.set(key, canon(raw));
    wrote = true;
  }
  return wrote;
}

const canon = (raw: string) => JSON.stringify(JSON.parse(raw));
/** What the project holds for a store key as far as this page knows: what was saved since it opened (else its file). */
const saved = new Map<string, string>();
const parsed = new Map<string, { raw: string; canon: string }>();
/** Whether what an editor keeps on this device under these store keys differs from the project: the editor has unsaved changes. */
export function unsaved(keys: string[]): boolean {
  return keys.some((key) => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { /* none */ }
    if (raw === null) return false;
    if (parsed.get(key)?.raw !== raw) parsed.set(key, { raw, canon: canon(raw) });
    return parsed.get(key)!.canon !== (saved.get(key) ?? JSON.stringify(projectStore(key)));
  });
}
/** Tracking for a header's save button: whether the stores have unsaved changes, and a way to save them. */
export const storeTracker = (keys: string[]) => ({ unsaved: () => unsaved(keys), saveNow: () => saveStores(keys) });
