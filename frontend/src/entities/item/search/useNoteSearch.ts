import { useQuery } from '@tanstack/react-query';
import type { SearchResult, SemanticStatus } from '@/api/types';
import { useDebounced } from '@/dumb/useDebounced';
import { noteSearchQuery, type SearchOptions, type SearchState } from './search';

export type NoteSearch = {
  results: SearchResult[];
  /** every match across all pages */
  total: number;
  pageSize: number;
  loading: boolean;
  /** the embedding's status when the search ranks semantically */
  semantic: SemanticStatus | null;
};

const NONE: SearchResult[] = [];

/**
 * Search-as-you-type against the server's index. Without a query, the scope's
 * newest notes - or, with `browse` false, nothing.
 */
export function useNoteSearch(state: SearchState, { browse = true, enabled = true, ...options }: SearchOptions & { browse?: boolean; enabled?: boolean }): NoteSearch {
  const q = useDebounced(state.query.trim(), 150);
  const on = enabled && (browse || q !== '');
  const { data, isFetching } = useQuery({
    ...noteSearchQuery({ ...options, q, page: state.page, orphan: state.orphan, semantic: state.semantic }),
    enabled: on,
    // the ranking covers only what's embedded: retry while nothing is yet
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.semantic?.embedding && !d.results.length ? 2000 : false;
    },
  });
  if (!on) return { results: NONE, total: 0, pageSize: 1, loading: false, semantic: null };
  return { results: data?.results ?? NONE, total: data?.total ?? 0, pageSize: data?.pageSize ?? 1, loading: isFetching, semantic: data?.semantic ?? null };
}
