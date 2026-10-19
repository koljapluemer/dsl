import { useRef, useState } from 'react';
import { NotePicker, type Pick } from './NotePicker';

type Props = {
  /** files not to suggest */
  exclude: string[];
  busy: boolean;
  /** resolves to whether the relationship was added; the fields are cleared when it was */
  onAdd: (label: string, how: Pick) => Promise<boolean>;
  compact?: boolean;
};

/** A label (any, possibly empty) and the note to relate under it, existing or new. */
export function RelationAdder({ exclude, busy, onAdd, compact }: Props) {
  const [label, setLabel] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  async function pick(how: Pick) {
    const done = await onAdd(label, how);
    if (done) setLabel('');
    return done;
  }

  return (
    <div className="flex gap-1 mt-1 items-start">
      <input className={`input shrink-0 ${compact ? 'input-sm w-24' : 'w-48'}`} value={label} disabled={busy} placeholder="label"
             onChange={(e) => setLabel(e.target.value)}
             onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); picker.current?.focus(); } }} />
      <NotePicker exclude={exclude} busy={busy} onPick={pick} inputRef={picker} compact={compact} />
    </div>
  );
}
