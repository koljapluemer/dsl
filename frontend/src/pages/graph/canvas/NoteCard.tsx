import { EyeOff, GripVertical, Maximize2, Pencil, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';
import { MediaPreview } from './MediaPreview';
import { MediaModal } from './MediaModal';
import { NoteMarkdown } from './NoteMarkdown';
import { PinControl } from './PinControl';
import { mediaUrl } from '../media';
import { isVideoFilename } from '../media';
import type { GraphNodePayload } from '@/api/types';

function NoteCardInner({
  note,
  pinDepth,
  isAnchor,
  onDelete,
  onHide,
  onEdit,
  onPin,
  onUnpin,
  onChangeDepth,
}: {
  note: GraphNodePayload;
  pinDepth: number | null;
  isAnchor: boolean;
  onDelete: (filename: string, pinDepth: number | null) => Promise<void>;
  onHide: (filename: string, pinDepth: number | null) => Promise<void>;
  onEdit: (filename: string) => void;
  onPin: (filename: string) => void;
  onUnpin: (filename: string) => void;
  onChangeDepth: (filename: string, nextDepth: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const hasExtra = note.extraContent.trim().length > 0;

  // Deleting or hiding removes the card, so `busy` is only reset on failure.
  const run = async (action: typeof onDelete): Promise<void> => {
    setBusy(true);
    setError(null);

    try {
      await action(note.filename, pinDepth);
    } catch (actionError) {
      setError((actionError as Error).message);
      setBusy(false);
    }
  };

  return (
    <article
      className={[
        // React Flow's node wrapper sets `user-select: none` and a grab cursor;
        // undo both here so the card's text can be selected (drag is limited to
        // the handle below).
        'note-card cursor-auto select-text',
        ' border bg-base-100 px-5 py-4 text-left shadow-xl',
        pinDepth !== null ? 'border-primary' : 'border-base-300',
        isAnchor ? 'border-dashed' : '',
      ].join(' ')}
    >
      <div className="mb-3 flex min-h-6 items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/*
            The only drag surface for the node - React Flow's `dragHandle` on the
            note node points at this class (see GraphCanvas' buildView), so the
            rest of the card stays free for text selection and its buttons.
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
        </div>
        <div className="flex items-center gap-1">
          {note.image ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs rounded-full"
              onClick={(event) => {
                event.stopPropagation();
                setMediaModalOpen(true);
              }}
              title="Enlarge media"
            >
              <Maximize2 className="size-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-xs rounded-full"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(note.filename);
            }}
            title="Edit this note"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs rounded-full disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation();
              void run(onHide);
            }}
            disabled={busy}
            title="Hide from graph"
          >
            <EyeOff className="size-3.5" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs rounded-full hover:bg-error/10 hover:text-error disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation();
              void run(onDelete);
            }}
            disabled={busy}
            title="Delete this note"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {error ? <p className="mb-2 text-xs text-error">{error}</p> : null}

      {note.image ? (
        <MediaPreview src={mediaUrl(note.image)} kind={isVideoFilename(note.image) ? 'video' : 'image'} className="mb-3 h-auto w-full" />
      ) : null}

      {/*
        The note's full content: body, then the keyword lines worth reading and the
        data block, then the extra content a size down. Media is the preview above;
        relationships are the edges; tags and state lines are left out.
      */}
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

      {mediaModalOpen && note.image ? (
        <MediaModal filename={note.image} noteFilename={note.filename} onClose={() => setMediaModalOpen(false)} />
      ) : null}
    </article>
  );
}

// Memoized: every prop is either note data that keeps its identity while unchanged
// (see useNoteGraph's structural sharing) or a stable callback, so a card whose
// node merely moved skips re-rendering its markdown.
export const NoteCard = memo(NoteCardInner);
