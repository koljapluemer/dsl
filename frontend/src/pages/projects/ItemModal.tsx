import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, X } from 'lucide-react';
import type { Item } from '@/api/types';
import { Modal } from '@/dumb/Modal';
import { itemQuery } from '@/entities/item/queries';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { ItemTextEditor } from '@/features/item-edit/ItemTextEditor';
import { useAutosave } from '@/features/item-edit/useAutosave';
import { projectsQuery } from './projects';

/** The item `file` in an editor, or with `file` null a new one starting as `initial` (created by its first save). */
export function ItemModal({ file, initial, onClose }: { file: string | null; initial: string; onClose: () => void }) {
  // the file as it is now, not as cached: the editor keeps the text it starts with
  const { data, isFetchedAfterMount } = useQuery({ ...itemQuery(file ?? ''), enabled: !!file });
  const loaded = !file || (data && isFetchedAfterMount);
  if (!loaded) return <Modal onClose={onClose}><span className="loading loading-dots loading-sm" /></Modal>;
  return <Editor item={file ? data! : null} initial={initial} onClose={onClose} />;
}

function Editor({ item, initial, onClose }: { item: Item | null; initial: string; onClose: () => void }) {
  const qc = useQueryClient();
  const remove = useDeleteItem();
  const [current, setCurrent] = useState(item);
  const { change, save } = useAutosave({ file: item?.file ?? null, saved: item?.text ?? '', onSaved: setCurrent });

  async function close() {
    await save();
    await qc.invalidateQueries({ queryKey: projectsQuery.queryKey });
    onClose();
  }

  async function del() {
    await save();
    if (current && (await remove(current))) onClose();
  }

  return (
    <Modal wide onClose={close}>
      <div className="flex items-center gap-1 mb-3">
        <button className="btn btn-square" title="close" onClick={close}><X size={20} /></button>
        {current && <button className="btn btn-square btn-error btn-outline" title="delete" onClick={del}><Trash2 size={20} /></button>}
        {current && <span className="ml-auto font-mono text-xs text-base-content/50">{current.file}</span>}
      </div>
      <ItemTextEditor initial={item?.text ?? initial} onChange={change} onSave={save} />
    </Modal>
  );
}
