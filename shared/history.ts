// Undo history for a tool. No DOM, so `node scripts/history-check.mjs` can test it.

/**
 * Undo for a tool's state, kept as JSON snapshots. Call `commit()` after every change; it records
 * only real differences, so a tool need not track what changed.
 */
export function history<T>(read: () => T, write: (value: T) => void, limit = 100) {
  let last = JSON.stringify(read());
  const back: string[] = [];
  const ahead: string[] = [];
  const go = (from: string[], to: string[]) => {
    const next = from.pop();
    if (next === undefined) return;
    to.push(last);
    last = next;
    write(JSON.parse(next));
  };
  return {
    commit(): void {
      const now = JSON.stringify(read());
      if (now === last) return;
      back.push(last);
      if (back.length > limit) back.shift();
      ahead.length = 0;
      last = now;
    },
    /** Forget the past, for example after switching to another saved thing. */
    reset(): void {
      last = JSON.stringify(read());
      back.length = ahead.length = 0;
    },
    undo: () => go(back, ahead),
    redo: () => go(ahead, back),
    canUndo: () => back.length > 0,
    canRedo: () => ahead.length > 0,
  };
}

