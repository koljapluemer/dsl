import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { NoteSearchPage, OrphanFilter, SearchScope } from '@/api/types';

/** What is searched for; any change but the page's starts back on the first page (see `withQuery`). */
export type SearchState = { query: string; page: number; orphan: OrphanFilter; semantic: boolean };

export const EMPTY_SEARCH: SearchState = { query: '', page: 0, orphan: 'any', semantic: false };

export const withQuery = (state: SearchState, query: string): SearchState => ({ ...state, query, page: 0 });

/** How a search looks: over which notes, with regexes or not (a slash is then part of a word), how many per page. */
export type SearchOptions = { scope?: SearchScope; regex?: boolean; exclude?: string[]; limit?: number };

type Params = SearchOptions & { q: string; page: number; orphan: OrphanFilter; semantic: boolean };

const paramsOf = ({ q, page, orphan, semantic, scope = 'all', regex = true, exclude = [], limit }: Params) => new URLSearchParams({
  q, scope, orphan, page: String(page), regex: regex ? '1' : '0', ...(semantic ? { semantic: '1' } : {}),
  ...(exclude.length ? { exclude: exclude.join(',') } : {}), ...(limit ? { limit: String(limit) } : {}),
});

/** Under `search`, so every write refetches it (see itemsChanged). */
export const noteSearchQuery = (p: Params) => queryOptions({
  queryKey: ['search', 'notes', p],
  queryFn: () => api<NoteSearchPage>('GET', `/api/search?${paramsOf(p)}`),
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: true,
});

/** The first `cap` matches' files, in the search's order, and how many there are. */
export const searchFilenames = (q: string, { scope = 'all', orphan = 'any' }: { scope?: SearchScope; orphan?: OrphanFilter }, cap: number) =>
  api<{ filenames: string[]; total: number }>('GET', `/api/search/filenames?${new URLSearchParams({ q, scope, orphan, cap: String(cap) })}`);
