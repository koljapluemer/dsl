import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2, Unlink } from 'lucide-react';
import { draftItem } from '@/entities/item/draftItem';
import { NoteLine } from '@/entities/item/NoteLine';
import { itemQuery } from '@/entities/item/queries';
import { stem, type Row } from './relationModel';

type Props = {
  row: Row;
  /** detach, delete and relabel; never for an inline reference */
  editable: boolean;
  busy: boolean;
  onDetach: () => void;
  onDelete: () => void;
  onRelabel: (next: string) => void;
  /** a click on the other note */
  onOpen: (file: string) => void;
};

/**
 * One relationship in two lines: its direction and label (→ from this note,
 * ← to it; dashed ⇢ ⇠ for inline references), editable by a click, after the
 * detach and delete buttons; then the other note, inline.
 */
export function RelationRow({ row, editable, busy, onDetach, onDelete, onRelabel, onOpen }: Props) {
  const [label, setLabel] = useState<string | null>(null);
  const canEdit = editable && !row.inline;
  const out = row.direction === 'out';
  const caption = <>{row.inline ? (out ? '⇢' : '⇠') : (out ? '→' : '←')}{row.label && <span className="ml-1">{row.label}</span>}</>;
  const commit = () => {
    if (label !== null && label.trim() !== row.label) onRelabel(label);
    setLabel(null);
  };

  return (
    <div className="min-w-0">
      <div className="flex min-h-6 items-center gap-0.5 text-xs text-base-content/60 [font-variant-caps:all-small-caps] tracking-wide">
        {canEdit && <>
          <button type="button" className="btn btn-ghost btn-xs btn-square" disabled={busy} title="detach" onClick={onDetach}><Unlink size={14} /></button>
          <button type="button" className="btn btn-ghost btn-xs btn-square hover:text-error" disabled={busy || row.heading === null} title="delete the other note"
                  onClick={onDelete}><Trash2 size={14} /></button>
        </>}
        {label !== null ? (
          <input className="input input-xs w-48 [font-variant-caps:normal]" autoFocus value={label} placeholder="label"
                 onChange={(e) => setLabel(e.target.value)} onBlur={commit}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') { e.preventDefault(); commit(); }
                   else if (e.key === 'Escape') { e.stopPropagation(); setLabel(null); }
                 }} />
        ) : canEdit ? (
          <button type="button" className="cursor-text rounded px-1 hover:bg-base-200" disabled={busy} title="relabel" onClick={() => setLabel(row.label)}>{caption}</button>
        ) : <span className="px-1">{caption}</span>}
      </div>
      <Other row={row} onOpen={onOpen} />
    </div>
  );
}

/** The note at the relationship's other end. */
function Other({ row, onOpen }: { row: Row; onOpen: (file: string) => void }) {
  const missing = row.heading === null;
  const { data } = useQuery({ ...itemQuery(row.file ?? ''), enabled: !!row.file && !missing });
  if (row.file === null) return <NoteLine item={draftItem(row.text ?? '')} className="pl-1 text-sm" />;
  if (missing) return <span className="ov-missing pl-1 text-sm" title="no such note">{stem(row.file)}</span>;
  if (!data) return <span className="ov-muted pl-1 text-sm">{row.heading || stem(row.file)}</span>;
  return <NoteLine item={data} onClick={() => onOpen(row.file!)} onRef={onOpen} className="pl-1 text-sm" />;
}
