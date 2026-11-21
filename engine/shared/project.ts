// Saving an editor's work into the project (the dev server writes the file; see engine/dev/content-plugin.ts).

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

/** Saves what editors keep on this device under these store keys into the project (`store/<key>.json`); a key with nothing kept yet is skipped. True when at least one was written and none failed. */
export async function saveStores(keys: string[]): Promise<boolean> {
  let wrote = false;
  for (const key of keys) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { /* no storage: nothing to save */ }
    if (raw === null) continue;
    if (!(await saveToProject(`store/${key}.json`, JSON.parse(raw)))) return false;
    wrote = true;
  }
  return wrote;
}
