import { useState } from 'react';
import type { Item } from '@/api/types';
import { ItemTextEditor } from '@/features/item-edit/ItemTextEditor';
import { useAutosave } from '@/features/item-edit/useAutosave';

/** A task item's editor; its save errors show below it rather than at the top. */
export function TaskRow({ item }: { item: Item }) {
  const [problem, setProblem] = useState('');
  const { change, save } = useAutosave({
    file: item.file,
    saved: item.text,
    onSaved: () => setProblem(''),
    onError: (e) => setProblem(e instanceof Error ? e.message : String(e)),
  });
  return (
    <div className="mb-4">
      <ItemTextEditor initial={item.text} autofocus={false} onChange={change} onSave={save} />
      {problem && <p className="text-error text-sm mt-1">{problem}</p>}
    </div>
  );
}
