import { queryOptions } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
import type { QueueDraw } from '@/api/types';

/** a card crosses the stage in a random time between these, in seconds */
export const MIN_S = 12;
export const MAX_S = 25;
/** how often a card sets off, in ms */
export const SPAWN_MS = 2500;

/** A random batch of items containing `q` to float; `round` draws another one. */
export const floatQuery = (q: string, round: number) => queryOptions({
  queryKey: ['float', q, round],
  queryFn: () => api<QueueDraw>('GET', `/api/float?q=${enc(q)}`),
  staleTime: Infinity,
});

/** Tags the item so the float view leaves it out (see docs/hiding.md). */
export const hideFromFloat = (file: string) => api<null>('POST', `/api/float/hide/${enc(file)}`);
