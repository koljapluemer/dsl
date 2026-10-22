import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Portfolio } from '@/api/types';

/**
 * The note tagged `portfolio` and its template, created by the server when
 * missing (repeating it changes nothing); under `items`, so writes refetch it.
 */
export const portfolioQuery = queryOptions({
  queryKey: ['items', 'portfolio'],
  queryFn: () => api<Portfolio>('POST', '/api/portfolio'),
});

export const PREVIEW_URL = '/api/portfolio/preview';
