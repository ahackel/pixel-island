// Small browser helpers shared by the editors: ids, what is kept on this device, saving text as a file, reading a picked file.

export const newId = () => Math.random().toString(36).slice(2, 10);

/** A value kept on this device as JSON, or the fallback when there is none or the browser has no storage here. */
export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Keeps a value on this device. False when the browser refuses storage, so the caller can say the save did not happen. */
export function writeStore(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** The named things a tool keeps in its My things: a list of `{ id, name, [field] }`, each value checked by `clean`. */
export function savedList<K extends string, T>(key: string, field: K, clean: (raw: unknown) => T): ({ id: string; name: string } & Record<K, T>)[] {
  const list = readStore<unknown>(key, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string')
    .map((s) => ({ id: s.id, name: s.name.slice(0, 40), [field]: clean(s[field]) }) as { id: string; name: string } & Record<K, T>);
}

/** Lets the browser save some text as a file. */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Asks for a file and gives its text. */
export function pickFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) file.text().then(resolve, reject);
    });
    input.click();
  });
}
