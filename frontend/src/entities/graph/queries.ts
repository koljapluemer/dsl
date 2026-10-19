import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { NoteGraph, PinSpec } from '@/api/types';

export const pinsQuery = queryOptions({ queryKey: ['graph', 'pins'], queryFn: () => api<PinSpec[]>('GET', '/api/graph/pins'), staleTime: Infinity });

/**
 * The graph for `pins` (which the server keeps for the next start). Refetched
 * when the window regains focus, so edits made elsewhere show up; structural
 * sharing keeps unchanged notes' identity across refetches.
 */
export const graphQuery = (pins: PinSpec[]) => queryOptions({
  queryKey: ['graph', 'graph', pins],
  queryFn: () => api<NoteGraph>('POST', '/api/graph', { pins }),
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: true,
});
