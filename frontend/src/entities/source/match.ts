import { api } from '@/api/client';
import type { Item, Source, SourceChoice, SourceMatch, SourceMerge } from '@/api/types';

/** The sources in BibTeX `text`, each with the existing sources it may be. */
export const matchBibtex = (text: string) => api<SourceMatch[]>('POST', '/api/sources/match', { text });

/** Each entry's source (with its note), existing or created; with `text`, that text with a relationship `label` to each. */
export const resolveSources = (entries: SourceChoice[], text?: string, label?: string) =>
  api<{ sources: (Source & { item: Item })[]; text?: string }>('POST', '/api/sources/resolve', { entries, text, label });

/** Source `file`'s `text` (as edited) updated from the one entry in `bibtex`, the conflicting fields in `take` replaced; writes nothing. */
export const mergeBibtex = (file: string, text: string, bibtex: string, take: string[] = []) =>
  api<SourceMerge>('POST', '/api/sources/merge', { file, text, bibtex, take });
