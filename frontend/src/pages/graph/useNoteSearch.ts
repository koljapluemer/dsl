import { useDeferredValue } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SearchCriteria, SearchResult } from '@/api/types';
import { noteSearchQuery } from '@/entities/graph/queries';

export interface UseNoteSearchOptions {
  /** Zero-based results page. @default 0 */
  page?: number;
}

export interface UseNoteSearchResult {
  results: SearchResult[];
  /** Every match across all pages. */
  total: number;
  loading: boolean;
}

const NONE: SearchResult[] = [];

/**
 * Search-as-you-type against the server's index, shared by every UI surface that
 * needs it (sidebar, pane right-click search, ...) so they stay in lockstep.
 * Refetched after every write (see notesChanged), so results don't go stale.
 */
export function useNoteSearch(criteria: SearchCriteria, { page = 0 }: UseNoteSearchOptions = {}): UseNoteSearchResult {
  const query = useDeferredValue(criteria.query).trim();
  const { data, isFetching } = useQuery({ ...noteSearchQuery({ query, orphan: criteria.orphan }, page), enabled: query !== '' });
  if (!query) return { results: NONE, total: 0, loading: false };
  return { results: data?.results ?? NONE, total: data?.total ?? 0, loading: isFetching };
}
