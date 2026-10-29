import { EyeOff, Focus, GripVertical } from 'lucide-react';
import { memo } from 'react';
import type { GraphNodePayload } from '@/api/types';
import type { MediaDraft } from '@/features/item-media/useMediaAttachments';
import { Note } from '@/meta/note/Note';
import { PinControl } from './PinControl';

const MODES = ['view', 'edit'] as const;

function NoteCardInner({
  note,
  pinDepth,
  othersPinned,
  isAnchor,
  editing,
  onDelete,
  onHide,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onPin,
  onUnpin,
  onUnpinOthers,
  onChangeDepth,
}: {
  note: GraphNodePayload;
  pinDepth: number | null;
  othersPinned: boolean;
  isAnchor: boolean;
  editing: boolean;
  onDelete: (filename: string, pinDepth: number | null) => Promise<void>;
  onHide: (filename: string, pinDepth: number | null) => Promise<void>;
  onEdit: (filename: string) => void;
  /** Rejected when the text has errors: the note would drop out of the graph. */
  onSaveEdit: (filename: string, text: string, media: MediaDraft) => Promise<void>;
  onCancelEdit: () => void;
  onPin: (filename: string) => void;
  onUnpin: (filename: string) => void;
  onUnpinOthers: (filename: string) => void;
  onChangeDepth: (filename: string, nextDepth: number) => void;
}) {
  return (
    <article
      className={[
        // React Flow's node wrapper sets `user-select: none` and a grab cursor;
        // undo both here so the card's text can be selected (drag is limited to
        // the handle).
        'note-card cursor-auto select-text',
        ' border bg-base-100 px-5 py-4 text-left shadow-xl',
        pinDepth !== null ? 'border-primary' : 'border-base-300',
        isAnchor || editing ? 'border-dashed' : '',
      ].join(' ')}
    >
      {/* the note component, viewed or edited (one card at a time, as the graph's interaction has it); relationships are the edges */}
      <Note
        file={note.filename}
        item={note.item}
        modes={MODES}
        mode={editing ? 'edit' : 'view'}
        onModeChange={(next) => (next === 'edit' ? onEdit(note.filename) : onCancelEdit())}
        relationships={false}
        compactViz
        save={(text, media) => onSaveEdit(note.filename, text, media)}
        onEscape={onCancelEdit}
        extraTools={[
          {
            key: 'grip',
            // The only drag surface for the node - React Flow's `dragHandle` on the
            // note node points at this class (see buildView), so the rest of the card
            // stays free for text selection and its buttons.
            node: (
              <span className="note-drag-handle -ml-1 cursor-grab rounded p-0.5 text-base-content/30 transition-colors hover:text-base-content/60 active:cursor-grabbing"
                    title="Drag to move">
                <GripVertical className="size-4" />
              </span>
            ),
          },
          {
            key: 'pin',
            node: (
              <PinControl pinDepth={pinDepth} onPin={() => onPin(note.filename)} onUnpin={() => onUnpin(note.filename)}
                          onChangeDepth={(next) => onChangeDepth(note.filename, next)} />
            ),
          },
          ...(pinDepth !== null && othersPinned
            ? [{ key: 'unpinOthers', title: 'Unpin everything else', icon: <Focus size={14} />, onClick: () => onUnpinOthers(note.filename) }]
            : []),
          { key: 'hide', title: 'hide from the graph', icon: <EyeOff size={14} />, onClick: () => void onHide(note.filename, pinDepth) },
        ]}
        onDelete={async () => {
          await onDelete(note.filename, pinDepth);
          return true;
        }}
      />
    </article>
  );
}

// Memoized: every prop is either note data that keeps its identity while unchanged
// (see useNoteGraph's structural sharing) or a stable callback, so a card whose
// node merely moved skips re-rendering its markdown.
export const NoteCard = memo(NoteCardInner);
