import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Item } from '@/api/types';
import { kindOf } from '@/entities/item/files/files';

/** Every note naming a Typst file, the last edited first; under `items`, so writes refetch it. */
export const typstNotesQuery = queryOptions({
  queryKey: ['items', 'typst-notes'],
  queryFn: () => api<Item[]>('GET', '/api/typst/notes'),
});

/** The Typst files the note names, in order. */
export const typstFiles = (item: { files: string[] }) => item.files.filter((f) => kindOf(f).name === 'typst');
