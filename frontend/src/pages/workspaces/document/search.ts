export type DocumentSearch = { open?: string };

export const validateDocumentSearch = (search: Record<string, unknown>): DocumentSearch => ({
  open: typeof search.open === 'string' && search.open ? search.open : undefined,
});
