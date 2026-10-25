import type { QueryClient } from '@tanstack/react-query';
import { store } from '@/dumb/store';

/**
 * The notes deleted here and not written since. Their views stop showing
 * them, and the queries of their own (backlinksQuery) are inactive from the
 * moment they're marked: the refetches after the delete then leave them be
 * instead of finding them missing, whether or not their views have unmounted
 * by then.
 */
export const deletedItems = store<ReadonlySet<string>>(new Set());

export const isDeleted = (file: string) => deletedItems.get().has(file);

/** Marks the note deleted and drops what was being fetched of it. */
export async function markDeleted(qc: QueryClient, file: string) {
  deletedItems.set(new Set(deletedItems.get()).add(file));
  await qc.cancelQueries({ queryKey: ['items', 'backlinks', file] });
}

/** The note is there again: restored, or a new one under its name. */
export function markWritten(file: string) {
  if (!isDeleted(file)) return;
  const next = new Set(deletedItems.get());
  next.delete(file);
  deletedItems.set(next);
}
