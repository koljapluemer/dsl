export type Canvas2DocSearch = { open?: string };

export const validateCanvas2DocSearch = (search: Record<string, unknown>): Canvas2DocSearch => ({
  open: typeof search.open === 'string' && search.open ? search.open : undefined,
});
