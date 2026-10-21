import type { QueryClient } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
import type { Answered, Backlink, Item } from '@/api/types';

/** Updates `file`, or creates an item named after its text when `file` is null. */
export const saveItem = (file: string | null, text: string) =>
  file ? api<Item>('PUT', `/api/items/${enc(file)}`, { text }) : api<Item>('POST', '/api/items', { text });

/** Recreates a deleted item under its old name. */
export const restoreItem = ({ file, text }: Item) => api<Item>('POST', '/api/items', { file, text });

export const deleteItem = (file: string) => api<null>('DELETE', `/api/items/${enc(file)}`);

export async function attachMedia(file: string, media: Blob) {
  const res = await fetch(`/api/items/${enc(file)}/media`, { method: 'PUT', headers: { 'Content-Type': media.type }, body: media });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as Item;
}

export const clearMedia = (file: string) => api<Item>('DELETE', `/api/items/${enc(file)}/media`);

export const mediaPath = async (path: string) => (await api<{ path: string }>('GET', `/api/media-path?p=${enc(path)}`)).path;

/** Links the item to `target` (a file) or to a new item with `text`, under any `label` ('' for none). */
export const relateItem = (file: string, body: { label: string } & ({ target: string } | { text: string })) =>
  api<Answered>('POST', `/api/items/${enc(file)}/relate`, body);

/** Removes the item's first relationship with `label` ('' for none) to `target` (a name without .txt). */
export const detachItem = (file: string, rel: { label: string; target: string }) =>
  api<Item>('POST', `/api/items/${enc(file)}/detach`, { label: rel.label, target: rel.target });

/** Gives the item's first relationship with `label` ('' for none) to `target` (a name without .txt) the label `nextLabel`. */
export const relabelItem = (file: string, rel: { label: string; target: string; nextLabel: string }) =>
  api<Item>('POST', `/api/items/${enc(file)}/relabel`, rel);

/** Adds the tag to the item (`on`) or removes it. */
export const setTag = (file: string, tag: string, on: boolean) => api<Item>('PUT', `/api/items/${enc(file)}/tags`, { tag, on });

/** Links the note `source` (a file), or a new note with `text`, to `file` under any `label` ('' for none). */
export const addBacklink = (file: string, body: { label: string } & ({ source: string } | { text: string })) =>
  api<Backlink[]>('POST', `/api/items/${enc(file)}/backlinks`, body);

/**
 * Lists and searches show stale items after a write; with `refetch` false the
 * ones on screen keep what they show until they're shown again.
 */
export const itemsChanged = (qc: QueryClient, refetch = true) => Promise.all(['items', 'search'].map((key) =>
  qc.invalidateQueries({ queryKey: [key], refetchType: refetch ? 'active' : 'none' })));
