import { useEffect, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { OrphanFilter, SearchResult } from '@/api/types';
import { store } from '@/dumb/store';
import type { SearchState } from './search/search';

/**
 * The note sidebar's URL search, on every page: its query, whether it ranks
 * semantically, the orphan filter, the results' page, and the notes open in it,
 * the last opened first. Prefixed, so pages keep `q`, `open`, … for themselves.
 */
export type SidebarSearch = { sq?: string; ss?: boolean; sorphan?: Exclude<OrphanFilter, 'any'>; spage?: number; sopen?: string[] };

/** kept across navigations (the root route's `retainSearchParams`) */
export const SIDEBAR_KEYS = ['sq', 'ss', 'sorphan', 'spage', 'sopen'] as const satisfies readonly (keyof SidebarSearch)[];

export const validateSidebarSearch = (s: Record<string, unknown>): SidebarSearch => {
  const open = Array.isArray(s.sopen) ? [...new Set(s.sopen.filter((f): f is string => typeof f === 'string' && !!f))] : [];
  return {
    sq: typeof s.sq === 'string' && s.sq ? s.sq : undefined,
    ss: s.ss === true || s.ss === 1 || s.ss === '1' ? true : undefined,
    sorphan: s.sorphan === 'orphan' || s.sorphan === 'connected' ? s.sorphan : undefined,
    spage: typeof s.spage === 'number' && Number.isInteger(s.spage) && s.spage > 0 ? s.spage : undefined,
    sopen: open.length ? open : undefined,
  };
};

/** `file` first among the open notes, once. */
export const withOpened = (open: readonly string[] | undefined, file: string) => [file, ...(open ?? []).filter((f) => f !== file)];

/** The URL's search as given to `navigate` (the router types it per route, the sidebar's is on every one). */
type Update = (prev: SidebarSearch) => SidebarSearch;
const asSearch = (update: Update) => update as never;

/** Whether the sidebar shows where it's a drawer (a narrow screen); opening a note shows it. */
export const sidebarShown = store(false);

/** Opens a note in the sidebar, on top of the others there, on whatever page this is. */
export function useOpenNote() {
  const navigate = useNavigate();
  return (file: string) => {
    sidebarShown.set(true);
    void navigate({ to: '.', search: asSearch((prev) => ({ ...prev, sopen: withOpened(prev.sopen, file) })) });
  };
}

/** The sidebar's search and open notes, and their setters. */
export function useSidebarSearch() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as SidebarSearch;
  const state: SearchState = { query: search.sq ?? '', page: search.spage ?? 0, orphan: search.sorphan ?? 'any', semantic: !!search.ss };
  return {
    state,
    open: search.sopen ?? [],
    setState: (next: SearchState) => void navigate({
      to: '.', replace: true,
      search: asSearch((prev) => ({
        ...prev, sq: next.query || undefined, ss: next.semantic || undefined, spage: next.page || undefined,
        sorphan: next.orphan === 'any' ? undefined : next.orphan,
      })),
    }),
    setOpen: (files: string[]) => void navigate({ to: '.', search: asSearch((prev) => ({ ...prev, sopen: files.length ? files : undefined })) }),
  };
}

/**
 * A page's own way to open a found note (pin it, open it in its pane): with
 * one (or more), the sidebar's results offer it beside opening them in the sidebar,
 * instead of opening there on a click. `applies`: for which results; `marked`: those to set apart.
 */
export type SidebarAction = {
  icon: ReactNode;
  title: string;
  run: (file: string) => void;
  applies?: (result: SearchResult) => boolean;
  marked?: { has: (file: string) => boolean };
};

export const sidebarActions = store<readonly SidebarAction[]>([]);

/** Offers `action` (or several) in the sidebar while the page is mounted. */
export function useSidebarAction(action: SidebarAction | readonly SidebarAction[]) {
  useEffect(() => { sidebarActions.set(Array.isArray(action) ? action : [action as SidebarAction]); });
  useEffect(() => () => sidebarActions.set([]), []);
}
