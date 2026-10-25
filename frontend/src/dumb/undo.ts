import { showError } from './notice';
import { store } from './store';

/** The last undoable change, while it can still be undone. */
export const pendingUndo = store<{ message: string; perform: () => Promise<unknown> } | null>(null);

let timer = 0;

/** Shows the undo toast for `message`; a later offer replaces it. */
export function offerUndo(message: string, perform: () => Promise<unknown>) {
  pendingUndo.set({ message, perform });
  clearTimeout(timer);
  timer = window.setTimeout(() => pendingUndo.set(null), 20000);
}

export function dropUndo() {
  clearTimeout(timer);
  pendingUndo.set(null);
}

/** Undoes the pending change, if any. */
export async function performUndo() {
  const pending = pendingUndo.get();
  if (!pending) return;
  try {
    await pending.perform();
    dropUndo();
  } catch (e) { showError(e); }
}
