/** a model download, as the server reports it */
type Pull = { status: string; completed: number; total: number; error: string | null };

/** A model download's state for display; empty when there is none or it's done. */
export function pullProgress(p: Pull | null | undefined): string {
  if (!p || (p.status === 'success' && !p.error)) return '';
  if (p.error) return `download failed: ${p.error}`;
  return p.total ? `${p.status} · ${Math.floor((100 * p.completed) / p.total)}%` : p.status;
}
