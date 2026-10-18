import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { NoteGraph, NoteSearchPage, PinSpec, RecentPage, SearchCriteria } from '@/api/types';

/** Results per page for every paginated note list (search, recent); as graph.PAGE_SIZE. */
export const NOTE_LIST_PAGE_SIZE = 40;

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

export const noteSearchQuery = ({ query, orphan }: SearchCriteria, page: number) => queryOptions({
  queryKey: ['graph', 'search', query, orphan, page],
  queryFn: () => api<NoteSearchPage>('GET', `/api/graph/search?${new URLSearchParams({ q: query, orphan, page: String(page) })}`),
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: true,
});

export const recentQuery = (page: number) => queryOptions({
  queryKey: ['graph', 'recent', page],
  queryFn: () => api<RecentPage>('GET', `/api/graph/recent?page=${page}`),
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: true,
});
