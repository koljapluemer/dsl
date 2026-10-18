import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Ban, Pencil, SkipForward } from 'lucide-react';
import type { Item } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { ItemOverview } from '@/entities/item/ItemOverview';
import { ItemTextEditor } from '@/features/item-edit/ItemTextEditor';
import { useAutosave } from '@/features/item-edit/useAutosave';
import { ModelDownload } from '@/features/model-download/ModelDownload';
import { QuestionAnswer } from './QuestionAnswer';
import { disable, fetchNote, nextNote, pickQuery } from './questions';

/** A random loosely-linked note and the questions picked for it. */
export function QuestionsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [note, setNote] = useState<{ item: Item | null; total: number } | null>(null);
  const item = note?.item ?? null;
  const [editing, setEditing] = useState(false);
  /** bumped to remount the editor when the note changed underneath it */
  const [editorKey, setEditorKey] = useState(0);
  /** skipped this session, so Skip doesn't bring them right back */
  const skipped = useRef<string[]>([]);
  const shownFile = useRef<string | null>(null);

  const { change, save, reset } = useAutosave({
    file: null,
    saved: '',
    onSaved: async (saved) => {
      const fresh = await fetchNote(saved.file);
      if (shownFile.current === saved.file) setNote((n) => n && { ...n, item: fresh });
    },
  });

  function show(i: Item | null, total?: number) {
    shownFile.current = i?.file ?? null;
    reset(i?.file ?? null, i?.text ?? '');
    setNote((n) => ({ item: i, total: total ?? n?.total ?? 0 }));
    setEditorKey((k) => k + 1);
  }

  async function next() {
    try {
      const res = await nextNote([...skipped.current, ...(shownFile.current ? [shownFile.current] : [])]);
      setEditing(false);
      show(res.item, res.total);
    } catch (e) { showError(e); }
  }

  // the first note, once; its state is set after the fetch, not during the effect
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { next(); }, []);

  const pick = useQuery({ ...pickQuery(item?.file ?? ''), enabled: !!item });
  const picked = pick.isFetching ? null : pick.data;
  const pickNote = !picked ? ''
    : picked.missing_model ? `${picked.missing_model} isn't installed, asking the first ones.`
    : picked.reason ? `LLM unavailable, asking the first ones: ${picked.reason}`
    : !picked.questions.length ? 'No question fits this note.'
    : '';

  function skip() {
    if (item) skipped.current.push(item.file);
    next();
  }

  async function disableNote() {
    if (!item) return;
    try {
      await save();
      await disable(item.file);
      next();
    } catch (e) { showError(e); }
  }

  function toggleEdit() {
    if (editing) save();
    setEditing(!editing);
  }

  if (!note) return null;
  if (!item) return <p className="text-base-content/50">No notes to ask about.</p>;
  return (
    <div>
      <div className="flex items-center gap-1 mb-4">
        <button className="btn" title="next note" onClick={skip}><SkipForward size={20} />Skip</button>
        <button className="btn" title="never ask about this note (tag no-questions)" onClick={disableNote}><Ban size={20} />Disable</button>
        <button className={`btn btn-square ${editing ? 'btn-active' : ''}`} title="edit" onClick={toggleEdit}><Pencil size={20} /></button>
        <span className="ml-auto font-mono text-xs text-base-content/50">{item.file} · {note.total}</span>
      </div>
      {editing
        ? <ItemTextEditor key={editorKey} initial={item.text} onChange={change} onSave={save} />
        : (
          <div className="overview rounded-box border border-base-300 p-4">
            <ItemOverview item={item} onRef={(file) => navigate({ to: '/edit/$file', params: { file } })} />
          </div>
        )}
      <div className="mt-6 space-y-6">
        {pick.isFetching && <span className="loading loading-dots loading-sm" />}
        {pickNote && (
          <p className="text-sm text-base-content/50">{pickNote}
            {picked?.missing_model && (
              <ModelDownload kind="questions" model={picked.missing_model}
                             onInstalled={() => qc.invalidateQueries({ queryKey: pickQuery(item.file).queryKey })} />
            )}
          </p>
        )}
        {picked?.questions.map((q) => (
          <QuestionAnswer key={item.file + ':' + q.id} file={item.file} question={q} flush={save} onAnswered={(res) => show(res)} />
        ))}
      </div>
    </div>
  );
}
