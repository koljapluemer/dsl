import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { NotePicker, type Pick } from './NotePicker';
import type { Direction } from './relationModel';

type Props = {
  /** files not to suggest */
  exclude: string[];
  busy: boolean;
  /** resolves to whether the relationship was added; the fields are cleared when it was */
  onAdd: (direction: Direction, label: string, how: Pick) => Promise<boolean>;
};

/** A direction (this note → the other, or back), a label (any, possibly empty) and the note to relate, existing or new. */
export function RelationAdder({ exclude, busy, onAdd }: Props) {
  const [direction, setDirection] = useState<Direction>('out');
  const [label, setLabel] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  async function pick(how: Pick) {
    const done = await onAdd(direction, label, how);
    if (done) setLabel('');
    return done;
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1 sm:flex-row">
      <div className="join w-full sm:w-56 sm:shrink-0">
        <button type="button" className="btn join-item btn-square" disabled={busy}
                title={direction === 'out' ? 'from this note (click: to it)' : 'to this note (click: from it)'}
                onClick={() => setDirection(direction === 'out' ? 'in' : 'out')}>
          {direction === 'out' ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
        </button>
        <input className="input join-item min-w-0 flex-1" value={label} disabled={busy} placeholder="label"
               onChange={(e) => setLabel(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); picker.current?.focus(); } }} />
      </div>
      <NotePicker exclude={exclude} busy={busy} onPick={pick} inputRef={picker} />
    </div>
  );
}
