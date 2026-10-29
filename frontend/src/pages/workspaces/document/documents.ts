import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Item } from '@/api/types';

/** keep in line with views.DOCUMENT_TAG */
export const DOCUMENT_TAG = 'document';

/** Every note tagged `document`, the last edited first; under `items`, so writes refetch it. */
export const documentsQuery = queryOptions({
  queryKey: ['items', 'documents'],
  queryFn: () => api<Item[]>('GET', '/api/documents'),
});

/** A new document's text: what was typed, then the tag. */
export const documentText = (start: string) => `${start.trim()}\ntags ${DOCUMENT_TAG}\n`;
