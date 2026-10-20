import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Undo2 } from 'lucide-react';
import type { Item } from '@/api/types';
import { isSubmit } from '@/dumb/keys';
import { showNotice, UNSAVED } from '@/dumb/notice';
import { analyze } from '@/entities/item/dsl/analyze';
import { itemQuery } from '@/entities/item/queries';
import { useSchema } from '@/entities/item/schema';
import { ItemTextEditor } from '@/features/item-edit/ItemTextEditor';
import { MediaAttachmentField } from '@/features/item-media/MediaAttachmentField';
import { useMediaAttachment, type MediaAttachment } from '@/features/item-media/useMediaAttachment';

type Props = {
  /** the note edited, null for a new one */
  file: string | null;
  /** a new note's text */
  initial: string;
  /** writes text and attachment; rejects to stay in the editor, with the error shown */
  onAccept: (text: string, media: MediaAttachment, item: Item | null) => Promise<unknown>;
  onDiscard: () => void;
  /** the panel's header around the editor's own actions */
  header: (actions: ReactNode) => ReactNode;
  /** more fields below the text, accepting on Ctrl+Enter and discarding on Escape like it */
  extra?: ReactNode;
  /** whether those fields were edited */
  extraDirty?: boolean;
};

/**
 * A note's full text and attachment, nothing written until Accept (Mod-Enter,
 * Mod-s); Discard drops both. Escape discards only while nothing was edited.
 * Starts from the file as it is now, not as cached.
 */
export function NoteEditor({ file, ...rest }: Props) {
  const { data, isFetchedAfterMount, error } = useQuery({ ...itemQuery(file ?? ''), enabled: !!file });
  if (file && !(data && isFetchedAfterMount)) {
    return <>{rest.header(null)}{error ? <p className="text-sm text-error">{error.message}</p> : <span className="loading loading-dots loading-sm" />}</>;
  }
  return <LoadedEditor item={file ? data! : null} {...rest} />;
}

function LoadedEditor({ item, initial, onAccept, onDiscard, header, extra, extraDirty = false }: Omit<Props, 'file'> & { item: Item | null }) {
  const schema = useSchema();
  const [text, setText] = useState(item?.text ?? initial);
  const media = useMediaAttachment(item?.media ?? null);
  const dirty = extraDirty || text !== (item?.text ?? initial) || media.attachment?.status === 'new' || (media.attachment === null) !== !item?.media;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problems = useMemo(
    () => analyze(schema, text).problems.map((p) => ({ ...p, line: text.slice(0, p.from).split('\n').length })),
    [schema, text],
  );

  async function accept() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAccept(text, media.attachment, item);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const attach = (file: File) => void media.attachFile(file);
  const escape = () => (dirty ? showNotice(UNSAVED) : onDiscard());

  const actions = (
    <>
      <button type="button" className="btn btn-primary btn-xs btn-square" title="accept (Ctrl+Enter)" disabled={busy || !text.trim()} onClick={() => void accept()}>
        {busy ? <span className="loading loading-spinner loading-xs" /> : <Check size={14} />}
      </button>
      <button type="button" className="btn btn-ghost btn-xs btn-square" title="discard changes" onClick={onDiscard}><Undo2 size={14} /></button>
    </>
  );

  return (
    <>
      {header(actions)}
      {/* keys stay here: the graph's canvas and a modal would act on them too */}
      {/* data-unsaved: a modal around it then won't close on Escape or a click outside */}
      <div className="nodrag nowheel nopan cursor-auto select-text" data-unsaved={dirty || undefined} onKeyDown={(event) => event.stopPropagation()}>
        <MediaAttachmentField attachment={media.attachment} onAttach={attach} onRemove={() => media.setAttachment(null)} />
        {(error || media.error) && <p className="mb-2 text-sm text-error">{error ?? media.error}</p>}
        <ItemTextEditor initial={text} autofocus saveOnBlur={false} onChange={setText} onSave={() => void accept()} onEscape={escape} onPasteFile={attach} />
        {problems.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs">
            {problems.map((problem, index) => (
              <li key={index} className={problem.severity === 'warning' ? 'text-warning' : 'text-error'}>
                Line {problem.line}: {problem.message}
              </li>
            ))}
          </ul>
        )}
        {extra && (
          <div onKeyDown={(event) => {
            if (isSubmit(event)) { event.preventDefault(); void accept(); }
            else if (event.key === 'Escape') escape();
          }}>
            {extra}
          </div>
        )}
      </div>
    </>
  );
}
