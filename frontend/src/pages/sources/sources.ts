import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Source, SourceItem } from '@/api/types';

/** Every source, the most recently edited first; under `items`, so writes and undo refetch it. */
export const sourcesQuery = queryOptions({ queryKey: ['items', 'sources'], queryFn: () => api<SourceItem[]>('GET', '/api/sources') });

/** The sources page's URL search: the filter, and the source open. */
export type SourcesSearch = { q?: string; open?: string };

export const validateSourcesSearch = (s: Record<string, unknown>): SourcesSearch => ({
  q: typeof s.q === 'string' && s.q ? s.q : undefined,
  open: typeof s.open === 'string' && s.open ? s.open : undefined,
});

/** A new source's text: the title typed, then the keyword and its fields (see sources.py). */
export const sourceText = (title: string) => `${title.trim()}\n\nsource\ndata\nentrytype: misc\n`;

export function matches(s: Source, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const names = [...((s.author ?? []) as string[]), ...((s.editor ?? []) as string[])];
  // also as written in text: `Jane Doe` for `Doe, Jane`
  const spoken = names.map((n) => n.split(',').map((p) => p.trim()).reverse().join(' '));
  return [s.key, s.title, s.date, ...names, ...spoken].some((x) => x !== undefined && String(x).toLowerCase().includes(needle));
}
