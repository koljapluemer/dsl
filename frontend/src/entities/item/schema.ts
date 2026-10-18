import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Schema } from '@/api/types';

export const schemaQuery = queryOptions({ queryKey: ['schema'], queryFn: () => api<Schema>('GET', '/api/schema'), staleTime: Infinity });

/** The keyword schema; loaded before the app renders. */
export const useSchema = () => useSuspenseQuery(schemaQuery).data;
