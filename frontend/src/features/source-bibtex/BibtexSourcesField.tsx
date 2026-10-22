import { BookPlus, X } from 'lucide-react';
import type { SourceConflict } from '@/api/types';
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

const shown = (value: SourceConflict['current']) => (Array.isArray(value) ? value.join('; ') : String(value));

/**
 * The fields the source and the BibTeX have differently, each to keep or take
 * from the BibTeX (`take`). Nothing when there are none.
 */
export function BibtexConflicts({ conflicts, take, onTake, onApply, onCancel }: {
  conflicts: SourceConflict[];
  take: string[];
  onTake: (field: string, take: boolean) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  if (!conflicts.length) return null;
  return (
    <div className="mb-2 space-y-2 text-sm">
      <ul className="space-y-2">
        {conflicts.map((c) => (
          <li key={c.field}>
            <div className="font-medium">{c.field}</div>
            <div className="mt-1 space-y-1 pl-2">
              {[false, true].map((incoming) => (
                <label key={String(incoming)} className="flex cursor-pointer items-start gap-2">
                  <input type="radio" className="radio radio-xs mt-0.5" checked={take.includes(c.field) === incoming}
                         onChange={() => onTake(c.field, incoming)} />
                  <span className="min-w-0 break-words">
                    <span className="text-base-content/60">{incoming ? 'BibTeX' : 'current'}:</span> {shown(incoming ? c.incoming : c.current)}
                  </span>
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <button type="button" className="btn btn-primary btn-sm" onClick={onApply}>Apply</button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
