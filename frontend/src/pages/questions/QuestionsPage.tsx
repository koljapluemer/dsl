import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, SkipForward } from 'lucide-react';
import type { Item } from '@/api/types';
import { showError } from '@/dumb/notice';
import { useHotkeys } from '@/dumb/keys';
import { useSessionState } from '@/dumb/useSessionState';
import { ModelDownload } from '@/features/model-download/ModelDownload';
import { isMode, type NoteMode } from '@/meta/note/mode';
import { Note } from '@/meta/note/Note';
import { QuestionAnswer } from './QuestionAnswer';
import { disable, nextNote, pickQuery } from './questions';

/** A random loosely-linked note and the questions picked for it. */
export function QuestionsPage() {
  const qc = useQueryClient();
  const [note, setNote] = useState<{ item: Item | null; total: number } | null>(null);
  const item = note?.item ?? null;
  /** skipped this session, so Skip doesn't bring them right back */
  const skipped = useRef<string[]>([]);
  const shownFile = useRef<string | null>(null);
  /** kept here for `e`; the same for every note asked about */
  const [mode, setMode] = useSessionState<NoteMode>('note-mode:questions', 'view', isMode);

  function show(i: Item | null, total?: number) {
    shownFile.current = i?.file ?? null;
    setNote((n) => ({ item: i, total: total ?? n?.total ?? 0 }));
  }

  async function next() {
    try {
      const res = await nextNote([...skipped.current, ...(shownFile.current ? [shownFile.current] : [])]);
      show(res.item, res.total);
    } catch (e) { showError(e); }
  }

  // the first note, once; its state is set after the fetch, not during the effect
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks-js/set-state-in-effect
  useEffect(() => { void next(); }, []);

  const pick = useQuery({ ...pickQuery(item?.file ?? ''), enabled: !!item });
  const picked = pick.isFetching ? null : pick.data;
  const pickNote = !picked ? ''
    : picked.missing_model ? `${picked.missing_model} isn't installed, asking the first ones.`
    : picked.reason ? `LLM unavailable, asking the first ones: ${picked.reason}`
    : !picked.questions.length ? 'No question fits this note.'
    : '';

  function skip() {
    if (item) skipped.current.push(item.file);
    void next();
  }

  async function disableNote() {
    if (!item) return;
    try {
      await disable(item.file);
      await next();
    } catch (e) { showError(e); }
  }

  useHotkeys({ s: skip, e: () => setMode('edit'), d: () => void disableNote() }, !!item);

  if (!note) return null;
  if (!item) return <p className="text-base-content/50">No notes to ask about.</p>;
  return (
    <div>
      <div className="flex items-center gap-1 mb-4">
        <button className="btn" title="next note (s)" onClick={skip}><SkipForward size={20} />Skip</button>
        <button className="btn" title="never ask about this note, tag no-questions (d)" onClick={disableNote}><Ban size={20} />Disable</button>
        <span className="ml-auto font-mono text-xs text-base-content/50">{note.total}</span>
      </div>
      <Note key={item.file} file={item.file} item={item} className="rounded-box border border-base-300 p-4"
            mode={mode} onModeChange={setMode} onSaved={(saved) => show(saved)} onDeleted={() => void next()} />
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
          <QuestionAnswer key={item.file + ':' + q.id} file={item.file} question={q} onAnswered={(res) => show(res)} />
        ))}
      </div>
    </div>
  );
}
