import { useNavigate } from '@tanstack/react-router';
import { Trash2, Unlink } from 'lucide-react';

type Props = {
  /** 'out': this note → `file`; 'in': `file` → this note */
  direction: 'out' | 'in';
  label: string;
  /** the other note */
  file: string;
  /** its heading; null when there's no such note */
  heading: string | null | undefined;
  busy: boolean;
  onDetach: () => void;
  onDelete: () => void;
  compact?: boolean;
};

/** One relationship: its label and the other note, detachable and that note deletable. */
export function RelationRow({ direction, label, file, heading, busy, onDetach, onDelete, compact }: Props) {
  const navigate = useNavigate();
  const name = file.replace(/\.txt$/, '');
  const icon = compact ? 14 : 16;
  return (
    <div className={`flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className="ov-muted shrink-0">{direction === 'out' ? `${label ? label + ' ' : ''}→` : `←${label ? ' ' + label : ''}`}</span>
      {heading === null
        ? <span className="ov-missing" title={`no item ${file}`}>{name}</span>
        : <a className="link link-hover truncate" title={file} onClick={() => navigate({ to: '/edit/$file', params: { file } })}>{heading || name}</a>}
      <button className="btn btn-ghost btn-xs btn-square ml-auto" disabled={busy} title="detach (remove the relationship)" onClick={onDetach}>
        <Unlink size={icon} />
      </button>
      <button className="btn btn-ghost btn-xs btn-square" disabled={busy || heading === null} title={`delete ${file}`} onClick={onDelete}>
        <Trash2 size={icon} />
      </button>
    </div>
  );
}
