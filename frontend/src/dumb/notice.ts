import { store } from './store';

/** A short message in the toast corner, gone after a few seconds. */
export const notice = store('');

/** What Esc and a click outside say instead of closing over unsaved edits. */
export const UNSAVED = 'Unsaved changes: Ctrl+Enter saves, ✕ discards';

let timer = 0;

export function showNotice(message: string) {
  notice.set(message);
  clearTimeout(timer);
  timer = window.setTimeout(() => notice.set(''), 3000);
}
