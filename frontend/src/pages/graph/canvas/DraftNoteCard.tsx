import { useState } from 'react';
import type { MediaAttachment } from '@/features/item-media/useMediaAttachment';
import { NoteEditor } from '@/meta/note-panel/NoteEditor';

export interface DraftNoteCardProps {
  /** Whether to show the relation-label/reverse fields - false for a freestanding note with no related note. */
  showRelation: boolean;
  /** `body` is the new note's body. */
  onSave: (body: string, label: string, reverse: boolean, image: MediaAttachment) => Promise<void>;
  onCancel: () => void;
}

/** A new note on the canvas, in the shared note editor, related to the note it was dragged from unless freestanding. */
export function DraftNoteCard({ showRelation, onSave, onCancel }: DraftNoteCardProps) {
  const [label, setLabel] = useState('');
  const [reverse, setReverse] = useState(false);

  const relation = showRelation ? (
    <>
      <label className="mt-3 block text-xs text-base-content/70">
        <span className="mb-1 block text-base-content/50">Relation label</span>
        <input
          className="input input-sm w-full focus:border-primary/60"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="related"
        />
      </label>

      <label className="mt-2 flex items-center gap-2 text-xs text-base-content/70">
        <input type="checkbox" className="checkbox checkbox-xs" checked={reverse} onChange={(event) => setReverse(event.target.checked)} />
        Reverse direction
      </label>
    </>
  ) : undefined;

  return (
    <article className="note-card group-focus:ring-2 group-focus:ring-primary/40  border border-dashed border-primary/50 bg-base-100 px-5 py-4 text-left shadow-xl">
      <NoteEditor
        file={null}
        initial=""
        onAccept={(text, image) => onSave(text, label, reverse, image)}
        onDiscard={onCancel}
        extra={relation}
        extraDirty={label !== '' || reverse}
        header={(actions) => (
          <div className="mb-2 flex min-h-6 items-center gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">New note</span>
            <div className="ml-auto flex shrink-0 items-center gap-0.5">{actions}</div>
          </div>
        )}
      />
    </article>
  );
}
