/** The desk's URL search: the notes open on it. */
export type DeskSearch = { open?: string[] };

export const validateDeskSearch = (s: Record<string, unknown>): DeskSearch => {
  const open = Array.isArray(s.open) ? [...new Set(s.open.filter((f): f is string => typeof f === 'string' && !!f))] : [];
  return { open: open.length ? open : undefined };
};
