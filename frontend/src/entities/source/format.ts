import type { SourceFields as Fields } from '@/api/types';

/** The family part of a name: before its first comma, or all of a name without one. */
export const family = (name: string) => name.split(',')[0].trim();

/** The first author's (or editor's) family name, `et al.` when there are more. */
export function authors(s: Fields) {
  const names = (s.author ?? s.editor ?? []) as string[];
  return names.length ? family(names[0]) + (names.length > 1 ? ' et al.' : '') : '';
}

export const year = (s: Fields) => String(s.date ?? '').slice(0, 4);
