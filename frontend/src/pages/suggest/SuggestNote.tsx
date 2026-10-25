import { useEffect, useRef, useState } from 'react';
import { Shuffle } from 'lucide-react';
import type { Item } from '@/api/types';
import { showError } from '@/dumb/notice';
import { useHotkeys } from '@/dumb/keys';
import { useSessionState } from '@/dumb/useSessionState';
import { Note } from '@/meta/note/Note';
import { SimpleToggle } from '@/meta/note/SimpleToggle';
import { pickNote } from './suggest';

const HOLD_MS = 500;

/** A random note carrying `tag`, shown simply or in full, as toggled; hold the button for another. */
export function SuggestNote({ tag }: { tag: string }) {
  /** undefined while the first one loads */
  const [note, setNote] = useState<Item | null | undefined>(undefined);
  const [simple, setSimple] = useSessionState('suggest-simple', true, (v) => typeof v === 'boolean');
  const hold = useRef(0);

  async function draw(exclude: string[]) {
    try {
      setNote((await pickNote(tag, exclude)).item);
    } catch (e) { showError(e); }
  }

  // the first note, once; its state is set after the fetch, not during the effect
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks-js/set-state-in-effect
  useEffect(() => { void draw([]); return () => clearTimeout(hold.current); }, []);

  const startHold = () => {
    clearTimeout(hold.current);
    hold.current = window.setTimeout(() => draw(note ? [note.file] : []), HOLD_MS);
  };
  const cancelHold = () => clearTimeout(hold.current);
  // Shift+n, as deliberate as the hold
  useHotkeys({ N: () => void draw([note!.file]) }, !!note);

  return (
    <div>
      {note === null && <p className="text-base-content/50">No more notes tagged {tag}</p>}
      {note && (
        <Note key={note.file} file={note.file} item={note} render={simple ? 'simple' : 'full'} persist="suggest"
              onSaved={setNote} onDeleted={() => void draw([note.file])} />
      )}
      <div className="flex gap-2 mt-4">
        <button className="btn btn-primary flex-1 select-none" title="Shift+N" disabled={!note}
                onPointerDown={startHold} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
                onContextMenu={(e) => e.preventDefault()}>
          <Shuffle size={20} />Hold for next
        </button>
        <SimpleToggle simple={simple} onChange={setSimple} />
      </div>
    </div>
  );
}
