import { queryOptions } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
import type { Source, SourceItem } from '@/api/types';

/** Every source, the most recently edited first; under `items`, so writes and undo refetch it. */
export const sourcesQuery = queryOptions({ queryKey: ['items', 'sources'], queryFn: () => api<SourceItem[]>('GET', '/api/sources') });

/** The sources to offer first when citing in `note`'s Typst files: those it relates to, then those on its canvas. */
export const citeSourcesQuery = (note: string) => queryOptions({
  queryKey: ['items', 'cite-sources', note],
  queryFn: () => api<string[]>('GET', `/api/typst/cite-sources?note=${enc(note)}`),
});

/** Whether the source's key, title, date or a name (also as `Jane Doe` for `Doe, Jane`) contains `q`. */
export function matches(s: Source, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const names = [...((s.author ?? []) as string[]), ...((s.editor ?? []) as string[])];
  // also as written in text: `Jane Doe` for `Doe, Jane`
  const spoken = names.map((n) => n.split(',').map((p) => p.trim()).reverse().join(' '));
  return [s.key, s.title, s.date, ...names, ...spoken].some((x) => x !== undefined && String(x).toLowerCase().includes(needle));
}
