import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Item } from '@/api/types';

/** Every tag; under `items`, so it's refetched after a write, delete or undo. */
export const tagsQuery = queryOptions({ queryKey: ['items', 'tags'], queryFn: () => api<string[]>('GET', '/api/tags') });

/** Every item tagged `tag`; under `items` too. */
export const taggedQuery = (tag: string) => queryOptions({
  queryKey: ['items', 'tagged', tag],
  queryFn: () => api<Item[]>('GET', `/api/tagged?${new URLSearchParams({ tag })}`),
});
