import { GripVertical } from 'lucide-react';
import { memo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notesChanged } from '@/entities/graph/mutations';
import { Media } from '@/entities/item/Media';
import { clearMedia } from '@/entities/item/mutations';
import { NotePanel } from '@/meta/note-panel/NotePanel';
import type { MediaAttachment } from '@/features/item-media/useMediaAttachment';
import { NoteMarkdown } from './NoteMarkdown';
import { PinControl } from './PinControl';
import { isVideoFilename, mediaUrl } from '@/entities/item/media';
import type { GraphNodePayload } from '@/api/types';

function NoteCardInner({
  note,
  pinDepth,
  isAnchor,
  editing,
  onDelete,
  onHide,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onPin,
  onUnpin,
  onChangeDepth,
}: {
  note: GraphNodePayload;
  pinDepth: number | null;
  isAnchor: boolean;
  editing: boolean;
  onDelete: (filename: string, pinDepth: number | null) => Promise<void>;
  onHide: (filename: string, pinDepth: number | null) => Promise<void>;
  onEdit: (filename: string) => void;
  /** Rejected when the text has errors: the note would drop out of the graph. */
  onSaveEdit: (filename: string, text: string, image: MediaAttachment, previousImage: string | null) => Promise<void>;
  onCancelEdit: () => void;
  onPin: (filename: string) => void;
  onUnpin: (filename: string) => void;
  onChangeDepth: (filename: string, nextDepth: number) => void;
}) {
  const qc = useQueryClient();
  const hasExtra = note.extraContent.trim().length > 0;

  const toolbar = (
    <>
      {/*
        The only drag surface for the node - React Flow's `dragHandle` on the
        note node points at this class (see buildView), so the rest of the card
        stays free for text selection and its buttons.
      */}
      <span
        className="note-drag-handle -ml-1 cursor-grab rounded p-0.5 text-base-content/30 transition-colors hover:text-base-content/60 active:cursor-grabbing"
        title="Drag to move"
      >
        <GripVertical className="size-4" />
      </span>
      <PinControl
        pinDepth={pinDepth}
        onPin={() => onPin(note.filename)}
        onUnpin={() => onUnpin(note.filename)}
        onChangeDepth={(next) => onChangeDepth(note.filename, next)}
      />
    </>
  );

  /*
    The note's full content: body, then the keyword lines worth reading and the
    data block, then the extra content a size down. Media is the preview above;
    relationships are the edges; tags and state lines are left out.
  */
  const view = (
    <>
      {note.image ? (
        <Media src={mediaUrl(note.image)} kind={isVideoFilename(note.image) ? 'video' : 'image'} path={note.image} fill className="mb-3"
               onDelete={async () => { await clearMedia(note.filename); await notesChanged(qc); }} />
      ) : null}

      {note.body.trim() ? <NoteMarkdown markdown={note.body} /> : <p className="text-sm italic text-base-content/50">Empty note</p>}

      {note.sectionLines.length > 0 || note.dataText !== null ? (
        <div className="mt-3 space-y-1 font-mono text-xs break-words whitespace-pre-wrap text-base-content/60">
          {note.sectionLines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          {note.dataText !== null ? <p>{note.dataText}</p> : null}
        </div>
      ) : null}

      {hasExtra ? (
        <div className="mt-3 border-t border-base-300 pt-3 text-base-content/80">
          <NoteMarkdown markdown={note.extraContent} small />
        </div>
      ) : null}
    </>
  );

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
      <NotePanel
        file={note.filename}
        showFile={false}
        view={view}
        toolbar={toolbar}
        editing={editing}
        onEditingChange={(next) => (next ? onEdit(note.filename) : onCancelEdit())}
        onAccept={(text, image) => onSaveEdit(note.filename, text, image, note.image)}
        hide={{ title: 'Hide from graph', run: () => onHide(note.filename, pinDepth) }}
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
