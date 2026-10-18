import { queryOptions } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
import type { Source, SourceList, SourceSchema } from '@/api/types';

/** Every source; under `items`, so writes and undo refetch it. */
export const sourcesQuery = queryOptions({ queryKey: ['items', 'sources'], queryFn: () => api<SourceList>('GET', '/api/sources') });

export const sourceSchemaQuery = queryOptions({
  queryKey: ['source-schema'],
  queryFn: () => api<SourceSchema>('GET', '/api/sources/schema'),
  staleTime: Infinity,
});

/** The list's URL search: the filter. */
export type SourcesSearch = { q?: string };

export const validateSourcesSearch = (s: Record<string, unknown>): SourcesSearch => ({
  q: typeof s.q === 'string' && s.q ? s.q : undefined,
});

/** A source as the form edits it: every value a string, names and lists with one trailing blank row. */
export type SourceForm = { key: string; entrytype: string; title: string; extra: string } & Record<string, string | string[]>;

/** Updates the source in `file`, or creates one when `file` is null. */
export const saveSource = (file: string | null, form: SourceForm) =>
  file ? api<Source>('PUT', `/api/sources/${enc(file)}`, form) : api<Source>('POST', '/api/sources', form);

/** Creates the sources in BibTeX `text`. */
export const importBibtex = (text: string) => api<Source[]>('POST', '/api/sources/import', { text });

export const isList = (schema: SourceSchema, field: string) => ['name', 'list'].includes(schema.fields[field].type);

export const blankValue = (schema: SourceSchema, field: string) => (isList(schema, field) ? [''] : '');

export const EMPTY_FORM: SourceForm = { key: '', entrytype: 'misc', title: '', extra: '' };

export function toForm(source: Source, schema: SourceSchema): SourceForm {
  const form: SourceForm = { key: source.key, entrytype: source.entrytype, title: source.title, extra: source.extra ?? '' };
  for (const f of Object.keys(schema.fields)) {
    const v = source[f];
    if (v === undefined) continue;
    form[f] = Array.isArray(v) ? [...v, ''] : String(v);
  }
  return form;
}

export const hasValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v.some((x) => x.trim()) : !!v?.trim());

/** The family part of a name: before its first comma, or all of a name without one. */
const family = (name: string) => name.split(',')[0].trim();

/** The first author's (or editor's) family name, `et al.` when there are more. */
export function authors(s: Source) {
  const names = (s.author ?? s.editor ?? []) as string[];
  return names.length ? family(names[0]) + (names.length > 1 ? ' et al.' : '') : '';
}

export const year = (s: Source) => String(s.date ?? '').slice(0, 4);

export function matches(s: Source, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const names = [...((s.author ?? []) as string[]), ...((s.editor ?? []) as string[])];
  // also as written in text: `Jane Doe` for `Doe, Jane`
  const spoken = names.map((n) => n.split(',').map((p) => p.trim()).reverse().join(' '));
  return [s.key, s.title, s.date, ...names, ...spoken].some((x) => x !== undefined && String(x).toLowerCase().includes(needle));
}
