import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { QueueDraw } from '@/api/types';
import { store } from '@/dumb/store';

/** Bumped to draw another batch; kept outside the page, so the batch stays while on other tabs. */
export const drawCount = store(0);

export const drawQuery = (n: number) => queryOptions({
  queryKey: ['queue', 'draw', n],
  queryFn: () => api<QueueDraw>('GET', '/api/queue'),
  staleTime: Infinity,
  gcTime: Infinity,
});

/** The tag the queue leaves a note out by (see docs/hiding.md); keep in line with views.QUEUE_HIDING. */
export const QUEUE_HIDE_TAG = 'no-q';
