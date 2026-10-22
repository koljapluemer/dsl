import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { Check, Undo2, X } from 'lucide-react';
import { CodeMirrorHost } from '@/dumb/CodeMirrorHost';
import { Modal } from '@/dumb/Modal';
import { showNotice, UNSAVED } from '@/dumb/notice';
import { kindOf } from '@/entities/item/files/files';
import { writeTextFile } from '@/entities/item/mutations';
import { textFileQuery } from '@/entities/item/queries';

/**
 * A file the note names, of a kind edited as text (a Jinja template), in the
 * kind's editor. Nothing is written until Save (✓, Ctrl+S or Ctrl+Enter); while
 * something is unsaved, Escape and Close only say so.
 */
export function TextFileModal({ path, onClose }: { path: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: saved, error } = useQuery(textFileQuery(path));
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const extensions = useMemo(() => [
    ...(kindOf(path).editor?.() ?? []),
    // Mod-Enter saves (see onKeyDown) instead of the default keymap's blank line
    Prec.high(keymap.of([{ key: 'Mod-Enter', run: () => true }])),
  ], [path]);
  const dirty = text !== null && text !== saved;

  async function save() {
    if (text === null || text === saved || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await writeTextFile(path, text);
      qc.setQueryData(textFileQuery(path).queryKey, text);
      setText(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const close = () => (dirty ? showNotice(UNSAVED) : onClose());

  return (
    <Modal onClose={onClose} box="flex max-h-[90vh] w-11/12 max-w-4xl flex-col p-4">
      <div className="mb-2 flex shrink-0 items-center gap-1" data-unsaved={dirty || undefined}>
        <span className="min-w-0 flex-1 truncate font-mono text-sm" title={path}>{path}</span>
        {dirty && <>
          <button type="button" className="btn btn-primary btn-xs btn-square" title="save (Ctrl+Enter)" disabled={busy} onClick={() => void save()}>
            {busy ? <span className="loading loading-spinner loading-xs" /> : <Check size={14} />}
          </button>
          <button type="button" className="btn btn-ghost btn-xs btn-square" title="discard changes" disabled={busy} onClick={() => setText(null)}>
            <Undo2 size={14} />
          </button>
        </>}
        <button type="button" className="btn btn-ghost btn-xs btn-square" title="close" onClick={close}><X size={14} /></button>
      </div>
      {(problem || error) && <p className="mb-2 shrink-0 text-sm text-error">{problem ?? error?.message}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-box border border-base-300"
           onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save(); }}>
        {saved === undefined
          ? !error && <span className="loading loading-spinner loading-sm m-4" />
          : <CodeMirrorHost value={text ?? saved} extensions={extensions} onChange={setText} onSave={() => void save()} />}
      </div>
    </Modal>
  );
}
