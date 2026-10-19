import { useState } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Check, Trash2, X } from 'lucide-react';
import type { Item } from '@/api/types';
import { Modal } from '@/dumb/Modal';
import { itemQuery } from '@/entities/item/queries';
import { ItemForm, useItemForm } from './ItemForm';

type Props = {
  file: string | null;
  initial: string;
  refresh: QueryKey;
  onDelete: (item: Item) => Promise<boolean>;
  onClose: () => void;
};

/** Shared full item form used by page-specific modal editors. */
export function ItemModal({ file, ...rest }: Props) {
  const { data, isFetchedAfterMount } = useQuery({ ...itemQuery(file ?? ''), enabled: !!file });
  const loaded = !file || (data && isFetchedAfterMount);
  if (!loaded) return <Modal onClose={rest.onClose}><span className="loading loading-dots loading-sm" /></Modal>;
  return <Editor item={file ? data! : null} {...rest} />;
}

function Editor({ item, initial, refresh, onDelete, onClose }: Omit<Props, 'file'> & { item: Item | null }) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState(item);
  const form = useItemForm({ item, onSaved: setCurrent });

  async function close(keep = true) {
    if (keep) await form.save();
    await qc.invalidateQueries({ queryKey: refresh });
    onClose();
  }

  async function del() {
    await form.save();
    if (current && (await onDelete(current))) onClose();
  }

  return (
    <Modal wide dirty={form.dirty} onClose={() => void close(false)}>
      <div className="flex items-center gap-1 mb-3">
        <button className="btn btn-square btn-primary" title="save and close" onClick={() => close()}><Check size={20} /></button>
        <button className="btn btn-square" title="discard changes and close" onClick={() => close(false)}><X size={20} /></button>
        {current && <button className="btn btn-square btn-error btn-outline" title="delete" onClick={del}><Trash2 size={20} /></button>}
        {current && <span className="ml-auto font-mono text-xs text-base-content/50">{current.file}</span>}
      </div>
      <ItemForm controller={form} initial={current?.text ?? initial} saveOnBlur={false} onSubmit={() => void close()} />
    </Modal>
  );
}
