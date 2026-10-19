import { useState } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Check, Trash2, X } from 'lucide-react';
import type { Item } from '@/api/types';
import { Modal } from '@/dumb/Modal';
import { itemQuery } from '@/entities/item/queries';
import { ItemTextEditor } from './ItemTextEditor';
import { useAutosave } from './useAutosave';

/**
 * The item `file` in an editor, or with `file` null a new one starting as `initial` (created by its first save).
 * Saved on Mod-s and on closing, except by discard, which drops the changes since the last save;
 * closing then refreshes the queries under `refresh`, the page's view of its items.
 * Delete hands the item to `onDelete` (a page's `useDeleteItem()`) and closes once that says it's gone.
 */
export function ItemModal({ file, ...rest }: Props) {
  // the file as it is now, not as cached: the editor keeps the text it starts with
  const { data, isFetchedAfterMount } = useQuery({ ...itemQuery(file ?? ''), enabled: !!file });
  const loaded = !file || (data && isFetchedAfterMount);
  if (!loaded) return <Modal onClose={rest.onClose}><span className="loading loading-dots loading-sm" /></Modal>;
  return <Editor item={file ? data! : null} {...rest} />;
}

type Props = {
  file: string | null;
  initial: string;
  refresh: QueryKey;
  onDelete: (item: Item) => Promise<boolean>;
  onClose: () => void;
};

function Editor({ item, initial, refresh, onDelete, onClose }: Omit<Props, 'file'> & { item: Item | null }) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState(item);
  const { change, save } = useAutosave({ file: item?.file ?? null, saved: item?.text ?? '', onSaved: setCurrent });

  async function close(keep = true) {
    if (keep) await save();
    await qc.invalidateQueries({ queryKey: refresh });
    onClose();
  }

  async function del() {
    await save();
    if (current && (await onDelete(current))) onClose();
  }

  return (
    <Modal wide onClose={() => close()}>
      <div className="flex items-center gap-1 mb-3">
        <button className="btn btn-square btn-primary" title="save and close" onClick={() => close()}><Check size={20} /></button>
        <button className="btn btn-square" title="discard changes and close" onClick={() => close(false)}><X size={20} /></button>
        {current && <button className="btn btn-square btn-error btn-outline" title="delete" onClick={del}><Trash2 size={20} /></button>}
        {current && <span className="ml-auto font-mono text-xs text-base-content/50">{current.file}</span>}
      </div>
      <ItemTextEditor initial={item?.text ?? initial} saveOnBlur={false} onChange={change} onSave={save} />
    </Modal>
  );
}
