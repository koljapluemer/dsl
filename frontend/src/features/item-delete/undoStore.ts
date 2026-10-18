import type { Item } from '@/api/types';
import { store } from '@/dumb/store';

/** The item deleted last, while it can still be restored. */
export const lastDeleted = store<Item | null>(null);

let timer = 0;

export function offerUndo(item: Item) {
  lastDeleted.set(item);
  clearTimeout(timer);
  timer = window.setTimeout(() => lastDeleted.set(null), 20000);
}

export function dropUndo() {
  clearTimeout(timer);
  lastDeleted.set(null);
}
