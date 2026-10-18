import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { QueueDraw, QueueFilter } from '@/api/types';
import { store } from '@/dumb/store';

/** Bumped to draw another batch; kept outside the page, so the batch stays while on other tabs. */
export const drawCount = store(0);

export const drawQuery = (n: number) => queryOptions({
  queryKey: ['queue', 'draw', n],
  queryFn: () => api<QueueDraw>('GET', '/api/queue'),
  staleTime: Infinity,
  gcTime: Infinity,
});

export const filterQuery = queryOptions({ queryKey: ['queue', 'filter'], queryFn: () => api<QueueFilter>('GET', '/api/queue/filter') });

export const saveFilter = (hidden: { types: string[]; tags: string[] }) => api<QueueFilter>('PUT', '/api/queue/filter', hidden);
