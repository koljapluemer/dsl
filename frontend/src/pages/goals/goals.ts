import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Item } from '@/api/types';

/** Every note tagged `goal` (views.GOAL_TAG) without an attached image, by heading; under `items`, so writes refetch it. */
export const goalsQuery = queryOptions({
  queryKey: ['items', 'goals'],
  queryFn: () => api<Item[]>('GET', '/api/goals'),
});
