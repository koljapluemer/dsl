export type CanvasSearch = { open?: string };

export const validateCanvasSearch = (search: Record<string, unknown>): CanvasSearch => ({
  open: typeof search.open === 'string' && search.open ? search.open : undefined,
});
