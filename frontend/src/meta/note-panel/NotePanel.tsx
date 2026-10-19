import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { EyeOff, Pencil, Trash2, X } from 'lucide-react';
import type { Item } from '@/api/types';
import { Media } from '@/dumb/Media';
import { ItemOverview } from '@/entities/item/ItemOverview';
import { mediaUrl } from '@/entities/item/media';
import { attachMedia, clearMedia, itemsChanged, saveItem } from '@/entities/item/mutations';
import { itemQuery } from '@/entities/item/queries';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import type { MediaAttachment } from '@/features/item-media/useMediaAttachment';
import { Relationships } from '@/features/item-relate/Relationships';
import { NoteEditor } from './NoteEditor';

type Props = {
  /** the note, null for a new one (which starts in the editor); key the panel by it */
  file: string | null;
  /** a new note's text */
  initial?: string;
  /** the note as already loaded, so it isn't fetched to be shown */
  item?: Item;
  /** shown instead of the note as rendered here (the note isn't fetched then) */
  view?: ReactNode;
  /** more controls at the start of the header */
  toolbar?: ReactNode;
  /** the file name in the header */
  showFile?: boolean;
  /** whether the editor is open, when the caller keeps that */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** writes the edit instead of the items API; rejects to stay in the editor */
  onAccept?: (text: string, media: MediaAttachment, item: Item | null) => Promise<unknown>;
  onSaved?: (item: Item) => void;
  /** a close button */
  onClose?: () => void;
  /** a hide button */
  hide?: { title: string; run: () => Promise<unknown> };
  /** whether there's a delete button */
  deletable?: boolean;
  /** deletes instead of the items API (with its undo); resolves to whether it did */
  onDelete?: () => Promise<boolean>;
  onDeleted?: () => void;
  /** the relationships below the note, each detachable, and a field adding one */
  relationships?: boolean;
  /** a click on a relationship; by default the target opens in the editor page */
  onRef?: (file: string) => void;
  /** fills its box, the note scrolling inside */
  fill?: boolean;
  id?: string;
  className?: string;
};

/**
 * A note, rendered, and an editor for it behind Edit: what is written there is
 * kept on Accept or dropped on Discard. Hide, delete and close as asked for.
 */
export function NotePanel({
  file, initial = '', item: given, view, toolbar, showFile = true, editing: shownEditing, onEditingChange, onAccept, onSaved,
  onClose, hide, deletable = true, onDelete, onDeleted, relationships = false, onRef, fill = false, id, className = '',
}: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const remove = useDeleteItem();
  const fetching = !!file && !given && !view;
  const fetched = useQuery({ ...itemQuery(file ?? ''), enabled: fetching });
  /** the note as last written here */
  const [written, setWritten] = useState<{ item: Item; over: Item | undefined } | null>(null);
  // a note given since is newer
  const item = (fetching ? fetched.data : null) ?? (written && written.over === given ? written.item : given) ?? null;
  const adopt = (saved: Item) => {
    qc.setQueryData(itemQuery(saved.file).queryKey, saved);
    setWritten({ item: saved, over: given });
  };
  const [ownEditing, setOwnEditing] = useState(file === null);
  const editing = shownEditing ?? ownEditing;
  const setEditing = (next: boolean) => { setOwnEditing(next); onEditingChange?.(next); };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function accept(text: string, media: MediaAttachment, base: Item | null) {
    if (onAccept) {
      await onAccept(text, media, base);
    } else {
      let saved = !base || text !== base.text ? await saveItem(base?.file ?? null, text) : base;
      if (media?.status === 'new') saved = await attachMedia(saved.file, media.blob);
      else if (media === null && saved.media !== null && base?.media) saved = await clearMedia(saved.file);
      adopt(saved);
      void itemsChanged(qc);
      onSaved?.(saved);
    }
    setEditing(false);
  }

  function discard() {
    if (!item && !view) onClose?.();
    else setEditing(false);
  }

  async function del() {
    if (onDelete) { if (await onDelete()) onDeleted?.(); }
    else if (item && (await remove(item))) onDeleted?.();
  }

  const header = (actions: ReactNode) => (
    <div className="mb-2 flex min-h-6 items-center gap-1">
      {toolbar}
      {showFile && item && <span className="min-w-0 truncate font-mono text-xs text-base-content/50" title={item.file}>{item.file}</span>}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {actions}
        {onClose && <button type="button" className="btn btn-ghost btn-xs btn-square" title="close" onClick={onClose}><X size={14} /></button>}
      </div>
    </div>
  );

  const viewActions = (
    <>
      <button type="button" className="btn btn-ghost btn-xs btn-square" title="edit" onClick={() => setEditing(true)}><Pencil size={14} /></button>
      {hide && (
        <button type="button" className="btn btn-ghost btn-xs btn-square" title={hide.title} disabled={busy} onClick={() => void run(hide.run)}>
          <EyeOff size={14} />
        </button>
      )}
      {deletable && (item || onDelete) && (
        <button type="button" className="btn btn-ghost btn-xs btn-square hover:text-error" title="delete" disabled={busy} onClick={() => void run(del)}>
          <Trash2 size={14} />
        </button>
      )}
    </>
  );

  return (
    <div id={id} className={`${fill ? 'flex h-full min-h-0 flex-col' : ''} ${className}`}>
      {editing ? (
        <div className={fill ? 'min-h-0 flex-1 overflow-y-auto' : ''}>
          <NoteEditor file={item?.file ?? file} initial={initial} onAccept={accept} onDiscard={discard} header={header} />
        </div>
      ) : (
        <>
          {header(viewActions)}
          {error && <p className="mb-2 text-sm text-error">{error}</p>}
          <div className={fill ? 'min-h-0 flex-1 overflow-y-auto' : ''}>
            {view ?? (item ? (
              <div className="overview select-text">
                {item.media && <Media src={mediaUrl(item.media)} />}
                <ItemOverview item={item} onRef={onRef ?? ((target) => void navigate({ to: '/edit/$file', params: { file: target } }))} />
              </div>
            ) : fetched.error ? <p className="text-sm text-error">{fetched.error.message}</p> : <span className="loading loading-dots loading-sm" />)}
            {relationships && item && (
              <div className="mt-4">
                <Relationships item={item} flush={async () => item.file} onChanged={adopt} deleteItem={remove} onRef={onRef} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
