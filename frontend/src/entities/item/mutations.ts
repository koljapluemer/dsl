import type { QueryClient } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
import type { Answered, Item } from '@/api/types';

/** Updates `file`, or creates an item named after its text when `file` is null. */
export const saveItem = (file: string | null, text: string) =>
  file ? api<Item>('PUT', `/api/items/${enc(file)}`, { text }) : api<Item>('POST', '/api/items', { text });

/** Recreates a deleted item under its old name. */
export const restoreItem = ({ file, text }: Item) => api<Item>('POST', '/api/items', { file, text });

export const deleteItem = (file: string) => api<null>('DELETE', `/api/items/${enc(file)}`);

/** Links the item to `target` (a file) or to a new item with `text`, under any `label` ('' for none). */
export const relateItem = (file: string, body: { label: string } & ({ target: string } | { text: string })) =>
  api<Answered>('POST', `/api/items/${enc(file)}/relate`, body);

/** Removes the item's first relationship with `label` ('' for none) to `target` (a name without .txt). */
export const detachItem = (file: string, rel: { label: string; target: string }) =>
  api<Item>('POST', `/api/items/${enc(file)}/detach`, { label: rel.label, target: rel.target });

/**
 * Lists and searches show stale items after a write; with `refetch` false the
 * ones on screen keep what they show until they're shown again.
 */
export const itemsChanged = (qc: QueryClient, refetch = true) => Promise.all(['items', 'search'].map((key) =>
  qc.invalidateQueries({ queryKey: [key], refetchType: refetch ? 'active' : 'none' })));
