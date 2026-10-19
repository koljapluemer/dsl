import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Item } from '@/api/types';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { ItemTextEditor } from '@/features/item-edit/ItemTextEditor';
import { useAutosave } from '@/features/item-edit/useAutosave';

/** An item's editor; its save errors show below it rather than at the top. An unreadable item shows why instead. */
export function TaskRow({ item }: { item: Item }) {
  const [problem, setProblem] = useState('');
  const [current, setCurrent] = useState(item);
  const remove = useDeleteItem();
  const { change, save } = useAutosave({
    file: item.file,
    saved: item.text,
    onSaved: (saved) => { setProblem(''); setCurrent(saved); },
    onError: (e) => setProblem(e instanceof Error ? e.message : String(e)),
  });

  async function del() {
    await save();
    await remove(current);
  }

  const unreadable = item.errors.find((e) => e.code === 'unreadable');
  if (unreadable) return <p className="text-error text-sm mb-4">{item.file}: {unreadable.detail}</p>;

  return (
    <div className="mb-4">
      <div className="relative group">
        <ItemTextEditor initial={item.text} autofocus={false} onChange={change} onSave={save} />
        <button className="btn btn-ghost btn-xs btn-square text-error absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100"
                title="delete" onClick={del}>
          <Trash2 size={14} />
        </button>
      </div>
      {problem && <p className="text-error text-sm mt-1">{problem}</p>}
    </div>
  );
}
