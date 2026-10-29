/** The sources page's URL search: the filter, and the source open. */
export type SourcesSearch = { q?: string; open?: string };

export const validateSourcesSearch = (s: Record<string, unknown>): SourcesSearch => ({
  q: typeof s.q === 'string' && s.q ? s.q : undefined,
  open: typeof s.open === 'string' && s.open ? s.open : undefined,
});

/** A new source's text: the title typed, then the keyword and its fields (see sources.py). */
export const sourceText = (title: string) => `${title.trim()}\n\nsource\ndata\nentrytype: misc\n`;
