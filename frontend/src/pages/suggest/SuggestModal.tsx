import { useEffect, useRef, useState } from 'react';
import { Shuffle, Trash2 } from 'lucide-react';
import type { ItemView } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { Markdown } from '@/dumb/Markdown';
import { Modal } from '@/dumb/Modal';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { pickNote } from './suggest';

const HOLD_MS = 500;

/** A random note carrying `tag`; hold the button for another, or delete it (with undo). */
export function SuggestModal({ tag, onClose }: { tag: string; onClose: () => void }) {
  const remove = useDeleteItem();
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

  async function del() {
    if (note && (await remove(note))) void draw([note.file]);
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="font-medium mb-3">{tag}</h3>
      {note === null && <p className="text-base-content/50">No more notes tagged {tag}</p>}
      {note && (
        <div className="overview select-text">
          <Markdown source={note.body.trim() ? note.body : '_(empty note)_'} />
          <div className="divider" />
          <Markdown source={note.extra?.trim() ? note.extra : '_(no extra content)_'} />
        </div>
      )}
      <div className="flex gap-3 mt-4">
        <button className="btn btn-primary flex-1 select-none" disabled={!note}
                onPointerDown={startHold} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
                onContextMenu={(e) => e.preventDefault()}>
          <Shuffle size={20} />Hold for next
        </button>
        <button className="btn btn-outline" disabled={!note} onClick={del}><Trash2 size={20} />Delete</button>
      </div>
    </Modal>
  );
}
