import { X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { isSubmit } from '@/dumb/keys';
import { showNotice, UNSAVED } from '@/dumb/notice';
import { pastedMedia } from '@/entities/item/media';
import { MediaAttachmentPreview, MediaPicker } from '@/features/item-media/MediaAttachmentField';
import { useMediaAttachment, type MediaAttachment } from '@/features/item-media/useMediaAttachment';

export interface DraftNoteCardProps {
  /** Whether to show the relation-label/reverse fields - false for a freestanding note with no related note. */
  showRelation: boolean;
  /** `body` is the new note's body. */
  onSave: (body: string, label: string, reverse: boolean, image: MediaAttachment) => Promise<void>;
  onCancel: () => void;
}

/** A new note on the canvas, related to the note it was dragged from unless freestanding. */
export function DraftNoteCard({ showRelation, onSave, onCancel }: DraftNoteCardProps) {
  const [body, setBody] = useState('');
  const [label, setLabel] = useState('');
  const [reverse, setReverse] = useState(false);
  const { attachment: image, setAttachment: setImage, attachFile, error: attachmentError } = useMediaAttachment(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Deferred a frame: this card can mount mid-drag (dropping a connection onto
    // empty canvas), and React Flow's own pointerup/connection-end handling is
    // still settling focus at that point - focusing synchronously on mount loses
    // that race and the pane keeps focus instead of this textarea.
    const frame = requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const dirty = body !== '' || label !== '' || reverse || image !== null;

  /** Escape only leaves an unedited card; discarding edits is the ✕ button's. */
  const handleEscape = (): void => {
    if (dirty) showNotice(UNSAVED);
    else onCancel();
  };

  const handleFieldKey = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      handleEscape();
    } else if (isSubmit(event)) {
      event.preventDefault();
      void handleSave();
    }
  };

  const handlePaste = async (event: ReactClipboardEvent<HTMLTextAreaElement>): Promise<void> => {
    const file = pastedMedia(event.clipboardData);
    if (!file) {
      return;
    }

    event.preventDefault();
    await attachFile(file);
  };

  const handleSave = async (): Promise<void> => {
    if (!body.trim() || saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave(body, label, reverse, image);
    } catch (saveError) {
      setError((saveError as Error).message);
      setSaving(false);
    }
  };

  return (
    <article className="note-card group-focus:ring-2 group-focus:ring-primary/40  border border-dashed border-primary/50 bg-base-100 px-5 py-4 text-left shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">New note</span>
        <div className="flex items-center gap-1">
          {!image ? <MediaPicker compact onAttach={(file) => void attachFile(file)} /> : null}
          <button type="button" className="btn btn-ghost btn-xs rounded-full" onClick={onCancel} title="Discard">
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {image ? (
        <div className="nodrag mb-3">
          <MediaAttachmentPreview compact attachment={image} onRemove={() => setImage(null)} />
        </div>
      ) : null}

      <textarea
        ref={textareaRef}
        className="note-textarea textarea nodrag nowheel min-h-36 w-full resize-none text-sm leading-6 focus:border-primary/60"
        placeholder="Write the note… (paste an image or short video to attach it)"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onPaste={(event) => void handlePaste(event)}
        onKeyDown={handleFieldKey}
      />

      {showRelation ? (
        <>
          <label className="nodrag mt-3 block text-xs text-base-content/70">
            <span className="mb-1 block text-base-content/50">Relation label</span>
            <input
              className="input input-sm w-full focus:border-primary/60"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={handleFieldKey}
              placeholder="related"
            />
          </label>

          <label className="nodrag mt-2 flex items-center gap-2 text-xs text-base-content/70">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={reverse}
              onChange={(event) => setReverse(event.target.checked)}
              onKeyDown={handleFieldKey}
            />
            Reverse direction
          </label>
        </>
      ) : null}

      {error || attachmentError ? <p className="mt-2 text-xs text-error">{error ?? attachmentError}</p> : null}

      <div className="nodrag mt-3 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-xs rounded-full" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-xs rounded-full" disabled={!body.trim() || saving} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </article>
  );
}
