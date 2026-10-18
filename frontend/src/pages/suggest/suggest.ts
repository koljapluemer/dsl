import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { SuggestPick } from '@/api/types';

/** Every hashtag in the notes' body or extra; under `items`, so it's refetched after a delete or undo. */
export const tagsQuery = queryOptions({ queryKey: ['items', 'suggest-tags'], queryFn: () => api<string[]>('GET', '/api/suggest/tags') });

/** A random note carrying `tag`, other than `exclude` unless it's the only one. */
export const pickNote = (tag: string, exclude: string[]) =>
  api<SuggestPick>('GET', `/api/suggest/random?${new URLSearchParams({ tag, exclude: exclude.join(',') })}`);
