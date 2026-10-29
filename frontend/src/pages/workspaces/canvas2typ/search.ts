export type Canvas2TypSearch = { open?: string };

export const validateCanvas2TypSearch = (search: Record<string, unknown>): Canvas2TypSearch => ({
  open: typeof search.open === 'string' && search.open ? search.open : undefined,
});
