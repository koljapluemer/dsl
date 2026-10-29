import { queryOptions } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
import type { Item } from '@/api/types';
import type { WireNode } from './canvas-model';
import { whenSaved } from './canvas-save';

/**
 * The note's canvas as stored: its nodes, what's wrong with any that can't be
 * read (`problems`), or why its data block can't be (`dataError`); `rev`
 * identifies it for the next write.
 */
export type StoredCanvas = { nodes: WireNode[]; problems: string[]; rev: string; dataError: string | null };

/**
 * The canvas as loaded to work on: read once per opening (`generation`), after
 * any write of it still under way, and never refetched; the page's own state
 * is the canvas from then on (docs/canvas.md).
 */
export const canvasQuery = (file: string, generation: number) => queryOptions({
  queryKey: ['canvas', file, generation],
  queryFn: async () => {
    await whenSaved(file);
    return api<StoredCanvas>('GET', `/api/items/${enc(file)}/canvas`);
  },
  staleTime: Infinity,
  gcTime: 0,
});

/** Writes the nodes over the canvas last read or written as `rev`; a 409 when it changed since. */
export const putCanvas = (file: string, nodes: WireNode[], rev: string) =>
  api<{ rev: string }>('PUT', `/api/items/${enc(file)}/canvas`, { nodes, rev });

/** A new note with `text` as its body. */
export const createNoteFromText = (text: string) => api<Item>('POST', '/api/canvas/note', { text });
