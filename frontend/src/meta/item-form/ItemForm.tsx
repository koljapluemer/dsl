import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Item } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { attachMedia, clearMedia, itemsChanged } from '@/entities/item/mutations';
import { itemQuery } from '@/entities/item/queries';
import { ItemTextEditor } from '@/features/item-edit/ItemTextEditor';
import { useAutosave } from '@/features/item-edit/useAutosave';
import { MediaAttachmentField } from '@/features/item-media/MediaAttachmentField';
import { useMediaAttachment, type MediaAttachment } from '@/features/item-media/useMediaAttachment';

type Options = {
  item: Item | null;
  onSaved?: (item: Item) => void;
  onError?: (error: unknown) => void;
};

/** Coordinates text creation/autosave with the attachment's second write. */
export function useItemForm({ item, onSaved, onError = showError }: Options) {
  const qc = useQueryClient();
  const [revision, setRevision] = useState(0);
  const savedMedia = useRef(item?.media ?? null);
  const committed = useRef<MediaAttachment>(item?.media ? { status: 'existing', filename: item.media } : null);
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const callbacks = useRef({ onSaved, onError });
  useEffect(() => { callbacks.current = { onSaved, onError }; });
  const media = useMediaAttachment(item?.media ?? null);
  const text = useAutosave({ file: item?.file ?? null, saved: item?.text ?? '', onSaved: (saved) => callbacks.current.onSaved?.(saved), onError });

  const adopt = useCallback((saved: Item) => {
    savedMedia.current = saved.media;
    text.reset(saved.file, saved.text);
    media.resetAttachment(saved.media);
    setRevision((value) => value + 1);
    qc.setQueryData(itemQuery(saved.file).queryKey, saved);
    void itemsChanged(qc, false);
    callbacks.current.onSaved?.(saved);
  }, [media, qc, text]);

  const save = useCallback((chosen: MediaAttachment = media.attachment) => {
    const operation = pending.current.then(async () => {
      const file = await text.save();
      if (!file) return null;
      try {
        let saved: Item | null = null;
        if (chosen?.status === 'new' && committed.current !== chosen) saved = await attachMedia(file, chosen.blob);
        else if (chosen === null && savedMedia.current !== null) saved = await clearMedia(file);
        if (saved) {
          committed.current = chosen;
          adopt(saved);
        }
        return file;
      } catch (error) {
        callbacks.current.onError(error);
        return null;
      }
    });
    pending.current = operation.then(() => undefined);
    return operation;
  }, [adopt, media.attachment, text]);

  const reset = useCallback((saved: Item | null) => {
    savedMedia.current = saved?.media ?? null;
    committed.current = saved?.media ? { status: 'existing', filename: saved.media } : null;
    text.reset(saved?.file ?? null, saved?.text ?? '');
    media.resetAttachment(saved?.media ?? null);
    setRevision((value) => value + 1);
  }, [media, text]);

  return { change: text.change, dirty: text.dirty, save, reset, media, revision };
}

export type ItemFormController = ReturnType<typeof useItemForm>;

export function ItemForm({ controller, initial, editorKey, autofocus = true, saveOnBlur = true, onSubmit }: {
  controller: ItemFormController;
  initial: string;
  editorKey?: number;
  autofocus?: boolean;
  saveOnBlur?: boolean;
  /** Mod-Enter in the editor */
  onSubmit?: () => void;
}) {
  const { media } = controller;
  const attach = async (file: File) => {
    const chosen = await media.attachFile(file);
    if (chosen) await controller.save(chosen);
  };
  const remove = () => {
    media.setAttachment(null);
    void controller.save(null);
  };
  return (
    <div>
      <MediaAttachmentField attachment={media.attachment} onAttach={(file) => void attach(file)} onRemove={remove} />
      {media.error && <p className="mb-2 text-sm text-error">{media.error}</p>}
      <ItemTextEditor key={`${editorKey ?? 0}:${controller.revision}`} initial={initial} autofocus={autofocus} saveOnBlur={saveOnBlur}
                      onChange={controller.change} onSave={controller.save} onSubmit={onSubmit} onPasteFile={(file) => void attach(file)} />
    </div>
  );
}
