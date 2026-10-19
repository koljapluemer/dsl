import { useEffect, useRef, useState } from 'react';
import { Shuffle } from 'lucide-react';
import type { ItemView } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { NotePanel } from '@/meta/note-panel/NotePanel';
import { pickNote } from './suggest';

const HOLD_MS = 500;

/** A random note carrying `tag`; hold the button for another. */
export function SuggestNote({ tag }: { tag: string }) {
  /** undefined while the first one loads */
  const [note, setNote] = useState<ItemView | null | undefined>(undefined);
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

  return (
    <div>
      {note === null && <p className="text-base-content/50">No more notes tagged {tag}</p>}
      {note && <NotePanel key={note.file} file={note.file} item={note} onDeleted={() => void draw([note.file])} />}
      <div className="flex gap-3 mt-4">
        <button className="btn btn-primary flex-1 select-none" disabled={!note}
                onPointerDown={startHold} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
                onContextMenu={(e) => e.preventDefault()}>
          <Shuffle size={20} />Hold for next
        </button>
      </div>
    </div>
  );
}
