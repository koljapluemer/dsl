import { store } from './store';

/** The message in the toast corner, gone after a few seconds (an error's after more). */
export const notice = store<{ message: string; error: boolean } | null>(null);

/** What Esc and a click outside say instead of closing over unsaved edits. */
export const UNSAVED = 'Unsaved changes: Ctrl+Enter saves, the discard button drops them';

let timer = 0;

function show(message: string, error: boolean) {
  notice.set({ message, error });
  clearTimeout(timer);
  timer = window.setTimeout(() => notice.set(null), error ? 8000 : 3000);
}

export const showNotice = (message: string) => show(message, false);

/** Shows what went wrong: the error's message, else what was thrown. */
export const showError = (e: unknown) => show(e instanceof Error ? e.message : String(e), true);
