import type { QueryClient } from '@tanstack/react-query';
import { api, enc } from '@/api/client';

/** The graph, searches and the other pages' lists show stale notes after a write. */
export const notesChanged = (qc: QueryClient) => Promise.all(['graph', 'items', 'search'].map((key) =>
  qc.invalidateQueries({ queryKey: [key], predicate: (q) => q.queryKey[1] !== 'pins' })));

/** A random note not in `exclude` (an orphan one with `orphan`); null when there's none. */
export const randomNote = (exclude: string[], orphan: boolean) =>
  api<{ filename: string | null }>('GET', `/api/graph/random?${new URLSearchParams({ exclude: exclude.join(','), ...(orphan ? { orphan: '1' } : {}) })}`);

/** Without `related` a freestanding note; else `related -> new`, or `new -> related` with `reverse`. */
export const createNote = (body: { body: string; related?: string; label?: string; reverse?: boolean }) =>
  api<{ filename: string; label?: string }>('POST', '/api/graph/notes', body);


/** Rejected when the text has errors: the note would drop out of the graph. */
export const updateNote = (file: string, text: string) => api<null>('PUT', `/api/graph/notes/${enc(file)}`, { text });

export const deleteNote = (file: string) => api<null>('DELETE', `/api/graph/notes/${enc(file)}`);

/** Tags the note so the graph leaves it out (see docs/hiding.md). */
export const hideNote = (file: string) => api<null>('POST', `/api/graph/notes/${enc(file)}/hide`);

/** Restores whatever `deleteNote`/`deleteRelation` removed or `hideNote` hid last. */
export const undoDelete = () => api<{ restored: boolean }>('POST', '/api/graph/undo');

export const connectNotes = (body: { source: string; target: string; label: string }) => api<{ label: string }>('POST', '/api/graph/relations', body);

export const updateRelationLabel = (body: { source: string; target: string; label: string; nextLabel: string }) =>
  api<null>('PATCH', '/api/graph/relations', body);

export const deleteRelation = (body: { source: string; target: string; label: string }) => api<null>('DELETE', '/api/graph/relations', body);
