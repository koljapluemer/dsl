import { BookPlus, X } from 'lucide-react';
import { authors, year } from '@/entities/source/format';
import type { StagedSource } from './useBibtexSources';

/** Adds sources from the BibTeX in the clipboard; compact is icon-only. */
export function BibtexPicker({ onPick, compact = false }: { onPick: () => void; compact?: boolean }) {
  return (
    <button type="button" className={compact ? 'btn btn-ghost btn-xs rounded-full' : 'btn btn-sm'} onClick={onPick}
            title="Add sources from BibTeX in the clipboard">
      <BookPlus className={compact ? 'size-3.5' : 'size-4'} />{compact ? null : 'BibTeX'}
    </button>
  );
}

const DropButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="btn btn-ghost btn-xs btn-square" title="Drop" onClick={onClick}><X size={14} /></button>
);

/**
 * The staged sources, one line each: what was pasted, and the existing source
 * it is or "new". A new one despite candidates is marked. Nothing when empty.
 */
export function StagedSources({ rows, onChoice, onRemove, compact = false }: {
  rows: StagedSource[];
  onChoice: (index: number, file: string | null) => void;
  onRemove: (index: number) => void;
  compact?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <ul className={`mb-2 space-y-1 ${compact ? 'text-xs' : 'text-sm'}`}>
      {rows.map((r, i) => (
        <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 flex-1 truncate" title={r.source.title}>
            {r.source.title || r.source.key} <span className="text-base-content/60">{authors(r.source)} {year(r.source)}</span>
          </span>
          {r.candidates.length ? (
            <span className={`flex items-center gap-1 ${compact ? 'w-full' : 'w-full sm:w-80'}`}>
              <select className={`select select-xs min-w-0 flex-1 ${r.choice ? '' : 'select-warning'}`}
                      value={r.choice ?? ''} onChange={(e) => onChoice(i, e.target.value || null)}>
                <option value="">new source</option>
                {r.candidates.map((c) => (
                  <option key={c.file} value={c.file}>{c.key} — {c.title}{c.reasons.length ? ` (${c.reasons.join(', ')})` : ''}</option>
                ))}
              </select>
              <DropButton onClick={() => onRemove(i)} />
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="badge badge-xs badge-ghost">new</span>
              <DropButton onClick={() => onRemove(i)} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
