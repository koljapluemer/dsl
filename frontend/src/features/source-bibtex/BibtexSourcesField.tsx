import { BookPlus, X } from 'lucide-react';
import { NoteLine } from '@/entities/item/NoteLine';
import { authors, year } from '@/entities/source/format';
import type { StagedSource } from './useBibtexSources';

/** An icon button staging sources from the BibTeX in the clipboard. */
export function BibtexPicker({ onPick, className }: { onPick: () => void; className: string }) {
  return (
    <button type="button" className={className} onClick={onPick} title="add sources from BibTeX in the clipboard">
      <BookPlus size={14} />
    </button>
  );
}

/**
 * The staged sources: what was pasted, and what it becomes - a new source, or
 * one of the existing sources it may be (each inline, with why it may be it).
 * Nothing when empty.
 */
export function StagedSources({ rows, onChoice, onRemove }: {
  rows: StagedSource[];
  onChoice: (index: number, file: string | null) => void;
  onRemove: (index: number) => void;
}) {
  if (!rows.length) return null;
  return (
    <ul className="mb-2 space-y-2 text-sm">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium" title={r.source.title}>
              {r.source.title || r.source.key} <span className="font-normal text-base-content/60">{authors(r.source)} {year(r.source)}</span>
            </span>
            <button type="button" className="btn btn-ghost btn-xs btn-square" title="drop" onClick={() => onRemove(i)}><X size={14} /></button>
          </div>
          <div className="mt-1 space-y-1 pl-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" className="radio radio-xs" checked={r.choice === null} onChange={() => onChoice(i, null)} />
              <span className={r.candidates.length && r.choice === null ? 'text-warning' : ''}>new source</span>
            </label>
            {r.candidates.map((c) => (
              <label key={c.file} className="flex cursor-pointer items-center gap-2">
                <input type="radio" className="radio radio-xs" checked={r.choice === c.file} onChange={() => onChoice(i, c.file)} />
                <NoteLine item={c.item} className="min-w-0 flex-1" />
                <span className="shrink-0 text-xs text-base-content/60">{c.level}{c.reasons.length ? `: ${c.reasons.join(', ')}` : ''}</span>
              </label>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
