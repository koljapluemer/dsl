import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { Check, FileText, ImagePlus, Images, Undo2, X } from 'lucide-react';
import type { Item } from '@/api/types';
import { CodeMirrorHost } from '@/dumb/CodeMirrorHost';
import { showError, showNotice, UNSAVED } from '@/dumb/notice';
import { useSessionState } from '@/dumb/useSessionState';
import { fileName, fileUrl, kindOf, mediaKind, pastedMedia, shownFiles } from '@/entities/item/files/files';
import { compressImage } from '@/entities/item/files/kinds/image';
import { pdfOf } from '@/entities/item/files/kinds/typst';
import { attachMedia, writeTypst } from '@/entities/item/mutations';
import { textFileQuery, typstStatusQuery } from '@/entities/item/queries';
import { citeTransaction } from '@/entities/source/cite';
import { citeCompletion } from './citeCompletion';
import { CitePicker } from './CitePicker';

/** What the note must not have while an upload writes it. */
const NOTE_UNSAVED = 'Save the note first: an upload adds it to the note';

type Pane = 'source' | 'pdf';

/** A toolbar tool citing more sources (the BibTeX one, from `source-bibtex`), given the function citing their keys. */
export type BibtexTool = ComponentType<{ onCite: (keys: string[]) => void; className: string }>;

/**
 * A Typst file the note names, its source and its PDF: side by side from `md`
 * up when `split`, else one at a time, toggled (remembered under `persist`).
 * Save (✓, Ctrl+S or Ctrl+Enter) writes it and builds the PDF;
 * Typst's errors show above, the PDF stays as it was then. The note's images
 * insert as `#image("/<path>")`; an uploaded or pasted one is attached to the
 * note at once, so not while the note has unsaved edits (`noteDirty`). Read-only
 * where Typst isn't installed. `onClose`: a ✕ that won't close with unsaved edits.
 * Sources are cited by `@` completion or the cite tool, and `bibtexTool`; the
 * first citation appends the bibliography. Saving relates the note to the sources cited, unless it has unsaved edits.
 */
export function TypstEditor({ path, note, noteDirty, onItem, split, persist, onClose, bibtexTool: Bibtex }: {
  path: string; note: Item; noteDirty: boolean; onItem: (item: Item) => void; split: boolean; persist?: string; onClose?: () => void;
  bibtexTool?: BibtexTool;
}) {
  const qc = useQueryClient();
  const { data: saved, error } = useQuery(textFileQuery(path));
  const { data: status } = useQuery(typstStatusQuery);
  const readOnly = status?.available === false;
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [errors, setErrors] = useState<string | null>(null);
  // whether the PDF exists (null: not known yet), and a version that reloads its preview
  const [pdf, setPdf] = useState<boolean | null>(null);
  const [version, setVersion] = useState(0);
  const [pane, setPane] = useSessionState<Pane>(persist, 'source', (v) => v === 'source' || v === 'pdf');
  const editorRef = useRef<EditorView | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const pdfPath = pdfOf(path);
  const images = shownFiles(note).filter((f) => mediaKind(f) === 'image');
  const extensions = useMemo(() => [
    ...(kindOf(path).editor?.() ?? []),
    ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [citeCompletion(qc, note.file)]),
    // Mod-Enter saves (see onKeyDown) instead of the default keymap's blank line
    Prec.high(keymap.of([{ key: 'Mod-Enter', run: () => true }])),
  ], [path, readOnly, qc, note.file]);
  const dirty = text !== null && text !== saved;

  useEffect(() => {
    let live = true;
    void fetch(fileUrl(pdfPath), { method: 'HEAD' }).then((res) => { if (live) setPdf(res.ok); }, () => { if (live) setPdf(false); });
    return () => { live = false; };
  }, [pdfPath]);

  async function save() {
    if (readOnly || text === null || text === saved || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      // with unsaved edits the note isn't written; a later save relates it
      const build = await writeTypst(path, text, noteDirty ? undefined : note.file);
      qc.setQueryData(textFileQuery(path).queryKey, text);
      setText(null);
      if (build.item) onItem(build.item);
      setErrors(build.errors);
      setPdf(build.pdf);
      setVersion((v) => v + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const insert = (image: string) => {
    const view = editorRef.current;
    if (!view || readOnly) return;
    view.dispatch(view.state.replaceSelection(`#image("/${image}")`));
    view.focus();
  };

  const cite = (keys: string[]) => {
    const view = editorRef.current;
    if (!view || readOnly || !keys.length) return;
    view.dispatch(citeTransaction(view.state, keys));
    view.focus();
  };

  async function attach(files: File[]) {
    const picked = files.filter((f) => f.type.startsWith('image/'));
    if (!picked.length || readOnly) return;
    if (noteDirty) {
      showNotice(NOTE_UNSAVED);
      return;
    }
    try {
      for (const file of picked) {
        const item = await attachMedia(note.file, await compressImage(file));
        onItem(item);
        insert(item.files[item.files.length - 1]);
      }
    } catch (e) { showError(e); }
  }

  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // reset so picking the same file again still fires a change event
    event.target.value = '';
    void attach(files);
  };

  const close = () => (dirty ? showNotice(UNSAVED) : onClose?.());
  // with `split`, both panes show from md up
  const paneClass = (hidden: boolean) => (hidden ? (split ? 'hidden md:block' : 'hidden') : '');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1" data-unsaved={dirty || undefined}>
        <span className="min-w-0 flex-1 truncate font-mono text-sm" title={path}>{path}</span>
        {!readOnly && <>
          <CitePicker note={note.file} onCite={(key) => cite([key])} />
          {Bibtex && <Bibtex onCite={cite} className="btn btn-ghost btn-xs btn-square" />}
          {images.length > 0 && (
            <details className="dropdown dropdown-end">
              <summary className="btn btn-ghost btn-xs btn-square" title="insert one of the note's images"><Images size={14} /></summary>
              <ul className="dropdown-content z-10 mt-1 grid max-h-80 w-64 grid-cols-3 gap-1 overflow-y-auto rounded-box bg-base-100 p-2 shadow">
                {images.map((image) => (
                  <li key={image}>
                    <button type="button" className="block w-full" title={fileName(image)}
                            onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); insert(image); }}>
                      <img src={fileUrl(image)} alt={fileName(image)} loading="lazy" className="aspect-square w-full rounded object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <input ref={upload} type="file" accept="image/*" multiple className="hidden" onChange={picked} />
          <button type="button" className="btn btn-ghost btn-xs btn-square" title="attach an image to the note and insert it"
                  onClick={() => (noteDirty ? showNotice(NOTE_UNSAVED) : upload.current?.click())}>
            <ImagePlus size={14} />
          </button>
        </>}
        {pdf && (
          <a className="btn btn-ghost btn-xs btn-square" href={`${fileUrl(pdfPath)}?v=${version}`} target="_blank" rel="noopener" title={`open ${pdfPath}`}>
            <FileText size={14} />
          </a>
        )}
        <div className={`join ${split ? 'md:hidden' : ''}`}>
          {(['source', 'pdf'] as const).map((p) => (
            <button key={p} type="button" className={`btn join-item btn-xs ${pane === p ? 'btn-active' : 'btn-ghost'}`}
                    aria-pressed={pane === p} onClick={() => setPane(p)}>{p === 'source' ? 'Source' : 'PDF'}</button>
          ))}
        </div>
        {dirty && <>
          <button type="button" className="btn btn-primary btn-xs btn-square" title="save and build (Ctrl+Enter)" disabled={busy} onClick={() => void save()}>
            {busy ? <span className="loading loading-spinner loading-xs" /> : <Check size={14} />}
          </button>
          <button type="button" className="btn btn-ghost btn-xs btn-square" title="discard changes" disabled={busy} onClick={() => setText(null)}>
            <Undo2 size={14} />
          </button>
        </>}
        {onClose && <button type="button" className="btn btn-ghost btn-xs btn-square" title="close" onClick={close}><X size={14} /></button>}
      </div>
      {readOnly && <p className="mb-2 shrink-0 text-sm text-base-content/70">Read-only: Typst files can't be built here ({status?.reason}).</p>}
      {(problem || error) && <p className="mb-2 shrink-0 text-sm text-error">{problem ?? error?.message}</p>}
      {errors && <pre className="mb-2 max-h-40 shrink-0 overflow-auto rounded-box bg-error/10 p-2 text-xs text-error">{errors}</pre>}
      <div className={`grid min-h-0 flex-1 gap-2 ${split ? 'md:grid-cols-2' : ''}`}>
        <div className={`min-h-0 overflow-y-auto rounded-box border border-base-300 ${paneClass(pane === 'pdf')}`}
             onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save(); }}
             onPasteCapture={(event) => {
               const files = pastedMedia(event.clipboardData);
               if (!files.length) return;
               event.preventDefault();
               event.stopPropagation();
               void attach(files);
             }}>
          {saved === undefined
            ? !error && <span className="loading loading-spinner loading-sm m-4" />
            : <CodeMirrorHost value={text ?? saved} extensions={extensions} onChange={setText} onSave={() => void save()} editorRef={editorRef} />}
        </div>
        <div className={`min-h-0 overflow-hidden rounded-box border border-base-300 ${paneClass(pane === 'source')}`}>
          {pdf
            ? <iframe key={version} src={`${fileUrl(pdfPath)}?v=${version}`} title={pdfPath} className="size-full" />
            : pdf === false && <p className="p-4 text-sm text-base-content/70">No PDF yet: it's built when the file is saved without errors.</p>}
        </div>
      </div>
    </div>
  );
}
