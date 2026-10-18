/** The list's URL search: the query, whether it ranks semantically, and the page. */
export type NotesSearch = { q?: string; s?: boolean; page?: number };

export const validateNotesSearch = (s: Record<string, unknown>): NotesSearch => ({
  q: typeof s.q === 'string' && s.q ? s.q : undefined,
  s: s.s === true || s.s === 1 || s.s === '1' ? true : undefined,
  page: typeof s.page === 'number' && Number.isInteger(s.page) && s.page > 0 ? s.page : undefined,
});
