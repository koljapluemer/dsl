import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Item } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { itemQuery } from '@/entities/item/queries';
import { itemsChanged, saveItem } from '@/entities/item/mutations';

type Options = {
  /** the item edited, null for a new one (created by the first save) */
  file: string | null;
  /** what the file holds */
  saved: string;
  onSaved?: (item: Item) => void;
  onError?: (e: unknown) => void;
};

/**
 * Saves of an item's text, one after the other so a create is never sent
 * twice; unchanged or blank text isn't sent. `save` resolves to the item's
 * file (null while there's none) once this and every earlier save is done.
 * `file` and `saved` are read once (see `reset`).
 */
export function useAutosave({ file, saved, onSaved, onError = showError }: Options) {
  const qc = useQueryClient();
  const state = useRef({ file, saved, text: saved, pending: Promise.resolve() });
  const callbacks = useRef({ onSaved, onError });
  useEffect(() => { callbacks.current = { onSaved, onError }; });
  const change = useCallback((text: string) => { state.current.text = text; }, []);

  const save = useCallback(() => {
    const s = state.current;
    s.pending = s.pending.then(async () => {
      const sent = s.text;
      if (!sent.trim() || sent === s.saved) return;
      try {
        const item = await saveItem(s.file, sent);
        s.file = item.file;
        s.saved = sent;
        qc.setQueryData(itemQuery(item.file).queryKey, item);
        itemsChanged(qc, false);
        callbacks.current.onSaved?.(item);
      } catch (e) { callbacks.current.onError(e); }
    });
    return s.pending.then(() => s.file);
  }, [qc]);

  /** Edits another item from now on (after the pending saves); `file` and `saved` are as for the hook. */
  const reset = useCallback((file: string | null, saved: string) => {
    const s = state.current;
    s.pending = s.pending.then(() => { Object.assign(s, { file, saved, text: saved }); });
  }, []);

  return { change, save, reset };
}
