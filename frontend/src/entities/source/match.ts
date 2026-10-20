import { api } from '@/api/client';
import type { Source, SourceChoice, SourceMatch } from '@/api/types';

/** The sources in BibTeX `text`, each with the existing sources it may be. */
export const matchBibtex = (text: string) => api<SourceMatch[]>('POST', '/api/sources/match', { text });

/** The existing sources a form's values may be; none while the values are invalid. */
export const matchSource = (source: Record<string, unknown>) => api<SourceMatch[]>('POST', '/api/sources/match', { source });

/** Each entry's source, existing or created; with `text`, that text with a relationship `label` to each. */
export const resolveSources = (entries: SourceChoice[], text?: string, label?: string) =>
  api<{ sources: Source[]; text?: string }>('POST', '/api/sources/resolve', { entries, text, label });
