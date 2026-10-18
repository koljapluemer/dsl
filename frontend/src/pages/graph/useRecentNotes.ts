import { useQuery } from '@tanstack/react-query';
import type { RecentNote } from '@/api/types';
import { recentQuery } from '@/entities/graph/queries';

export interface UseRecentNotesResult {
  results: RecentNote[];
  /** Every note, across all pages. */
  total: number;
  loading: boolean;
}

const NONE: RecentNote[] = [];

/** One page of the most recently modified notes; refetched after every write, so editing a note reorders the list. */
export function useRecentNotes(page: number): UseRecentNotesResult {
  const { data, isFetching } = useQuery(recentQuery(page));
  return { results: data?.results ?? NONE, total: data?.total ?? 0, loading: isFetching };
}
