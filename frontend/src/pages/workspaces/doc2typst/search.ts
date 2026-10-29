export type Doc2TypstSearch = { open?: string };

export const validateDoc2TypstSearch = (search: Record<string, unknown>): Doc2TypstSearch => ({
  open: typeof search.open === 'string' && search.open ? search.open : undefined,
});
