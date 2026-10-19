/** The notes page's URL search: the query, whether it ranks semantically, the results' page, and the notes open. */
export type NotesSearch = { q?: string; s?: boolean; page?: number; open?: string[] };

export const validateNotesSearch = (s: Record<string, unknown>): NotesSearch => {
  const open = Array.isArray(s.open) ? [...new Set(s.open.filter((f): f is string => typeof f === 'string' && !!f))] : [];
  return {
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    s: s.s === true || s.s === 1 || s.s === '1' ? true : undefined,
    page: typeof s.page === 'number' && Number.isInteger(s.page) && s.page > 0 ? s.page : undefined,
    open: open.length ? open : undefined,
  };
};
