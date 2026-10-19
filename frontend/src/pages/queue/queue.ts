import { queryOptions } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
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

/** Tags the item so the queue leaves it out (see docs/hiding.md). */
export const hideFromQueue = (file: string) => api<null>('POST', `/api/queue/hide/${enc(file)}`);
