import type { SemanticStatus } from '@/api/types';
import { ModelDownload } from '@/features/model-download/ModelDownload';

type Props = {
  q: string;
  semantic: boolean;
  status: SemanticStatus | null;
  onQuery: (q: string) => void;
  onToggleSemantic: () => void;
  onModelInstalled: () => void;
};

/** The filter, the semantic toggle, and why semantic search isn't (fully) ranking. */
export function SearchBar({ q, semantic, status, onQuery, onToggleSemantic, onModelInstalled }: Props) {
  const note = !semantic || !status ? ''
    : status.missing_model ? `${status.missing_model} isn't installed, filtering by text.`
    : status.error ? `Semantic search unavailable, filtering by text: ${status.error}`
    : status.indexed < status.total ? `Ranking the ${status.indexed} of ${status.total} notes embedded so far.`
    : '';
  const missing = semantic ? status?.missing_model : null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <input className="input w-full" type="search" value={q} onChange={(e) => onQuery(e.target.value)}
               placeholder={semantic ? 'Semantic search' : 'Filter'} autoFocus />
        <label className="label shrink-0 text-sm">
          <input type="checkbox" className="toggle toggle-sm" checked={semantic} onChange={onToggleSemantic} />semantic
        </label>
      </div>
      {(note || missing) && (
        <p className="mt-2 text-sm text-base-content/50">{note}
          {missing && <ModelDownload kind="semantic" model={missing} onInstalled={onModelInstalled} />}
        </p>
      )}
    </div>
  );
}
