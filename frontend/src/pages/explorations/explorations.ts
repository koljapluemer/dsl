import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Item } from '@/api/types';

/** keep in line with views.EXPLORATION_TAG */
const EXPLORATION_TAG = 'exploration';

/** Every note tagged `exploration`, the last edited first; under `items`, so writes refetch it. */
export const explorationsQuery = queryOptions({
  queryKey: ['items', 'explorations'],
  queryFn: () => api<Item[]>('GET', '/api/explorations'),
});

/** A new exploration's text: what was typed, then the tag. */
export const explorationText = (start: string) => `${start.trim()}\ntags ${EXPLORATION_TAG}\n`;

/** The explorations page's URL search: the exploration open. */
export type ExplorationsSearch = { open?: string };

export const validateExplorationsSearch = (s: Record<string, unknown>): ExplorationsSearch => ({
  open: typeof s.open === 'string' && s.open ? s.open : undefined,
});
