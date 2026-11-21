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
