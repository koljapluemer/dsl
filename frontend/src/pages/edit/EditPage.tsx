import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import type { Item } from '@/api/types';
import { itemQuery } from '@/entities/item/queries';
import { ItemTextEditor } from '@/features/item-edit/ItemTextEditor';
import { useAutosave } from '@/features/item-edit/useAutosave';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { Relationships } from '@/features/item-relate/Relationships';
import { useGoBack } from './useGoBack';

/**
 * /new and /edit/$file. A new item moves to its /edit URL once saved, keeping
 * the editor; any other change of URL starts a fresh one.
 */
export function EditPage() {
  const { file } = useParams({ strict: false }) as { file?: string };
  const [created, setCreated] = useState<string | null>(null);
  const [shown, setShown] = useState({ file, session: 0 });
  if (file !== shown.file) setShown({ file, session: file && file === created ? shown.session : shown.session + 1 });

  return <Editor key={shown.session} file={file ?? null} onCreated={setCreated} />;
}

function Editor({ file, onCreated }: { file: string | null; onCreated: (file: string) => void }) {
  const [initialFile] = useState(file);
  // the file as it is now, not as cached: the editor keeps the text it starts with
  const { data, isFetchedAfterMount } = useQuery({ ...itemQuery(initialFile ?? ''), enabled: !!initialFile });
  if (initialFile && !(data && isFetchedAfterMount)) return null;
  return <LoadedEditor item={data ?? null} onCreated={onCreated} />;
}

function LoadedEditor({ item, onCreated }: { item: Item | null; onCreated: (file: string) => void }) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const remove = useDeleteItem();
  const [current, setCurrent] = useState(item);
  /** bumped to remount the editor when a relationship changed the text underneath it */
  const [editorKey, setEditorKey] = useState(0);
  const { change, save, reset } = useAutosave({
    file: item?.file ?? null,
    saved: item?.text ?? '',
    onSaved: (saved) => {
      if (!current) {
        onCreated(saved.file);
        void navigate({ to: '/edit/$file', params: { file: saved.file }, replace: true });
      }
      setCurrent(saved);
    },
  });

  function related(changed: Item) {
    reset(changed.file, changed.text);
    setCurrent(changed);
    setEditorKey((k) => k + 1);
  }

  async function del() {
    await save();
    if (current && (await remove(current))) void goBack();
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-4">
        <button className="btn btn-square" title="back" onClick={goBack}><ArrowLeft size={20} /></button>
        {current && <button className="btn btn-square btn-error btn-outline" title="delete" onClick={del}><Trash2 size={20} /></button>}
        {current && <span className="ml-auto font-mono text-xs text-base-content/50">{current.file}</span>}
      </div>
      <ItemTextEditor key={editorKey} initial={current?.text ?? ''} autofocus={editorKey === 0} onChange={change} onSave={save} />
      <div className="mt-6">
        <Relationships item={current} flush={save} onChanged={related} deleteItem={remove} />
      </div>
    </div>
  );
}
