import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ClipboardPaste, PanelLeft, Plus } from 'lucide-react';
import { showError } from '@/dumb/errorBanner';
import { blurOnEscape, useSlashFocus } from '@/dumb/keys';
import { itemsChanged, saveItem } from '@/entities/item/mutations';
import { NoteLine } from '@/entities/item/NoteLine';
import { itemQuery } from '@/entities/item/queries';
import { useSidebarAction } from '@/entities/item/sidebar';
import { StagedSources } from '@/features/source-bibtex/BibtexSourcesField';
import { useBibtexSources, type StagedSource } from '@/features/source-bibtex/useBibtexSources';
import { Note } from '@/meta/note/Note';
import { matches, sourceText, sourcesQuery, type SourcesSearch } from './sources';

/**
 * The sources, inline, filtered by the URL's `q`, beside the one open: in the
 * editor, written as focus leaves it. New ones from a title or from BibTeX in the clipboard.
 */
export function SourcesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { q = '', open } = useSearch({ strict: false }) as SourcesSearch;
  const { data } = useQuery(sourcesQuery);
  /** on a narrow screen the list takes the place of the editor */
  const [listing, setListing] = useState(!open);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const bib = useBibtexSources();
  const filter = useSlashFocus();

  const show = (file: string | undefined) => {
    setListing(!file);
    void navigate({ to: '.', search: { q: q || undefined, open: file } });
  };
  useSidebarAction({ icon: <PanelLeft size={14} />, title: 'open here', run: show, applies: (r) => !!r.sourceKey, marked: { has: (file) => file === open } });

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    try {
      const created = await saveItem(null, sourceText(title));
      qc.setQueryData(itemQuery(created.file).queryKey, created);
      void itemsChanged(qc);
      setTitle('');
      show(created.file);
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  /** Imports right away unless an entry may already exist; then the choices are shown first. */
  async function fromClipboard() {
    const rows = await bib.fromClipboard();
    if (rows && rows.every((r) => !r.candidates.length)) await importStaged(rows);
  }

  async function importStaged(rows?: StagedSource[]) {
    try {
      const { sources } = await bib.apply(undefined, rows);
      bib.clear();
      if (sources.length === 1) show(sources[0].file);
    } catch (e) { showError(e); }
  }

  const rows = data?.filter((s) => matches(s.fields, q)) ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-4 @3xl:grid @3xl:grid-cols-[22rem_minmax(0,1fr)] @3xl:gap-4">
      <button type="button" className="btn btn-sm self-start @3xl:hidden" onClick={() => setListing(!listing)}>
        <PanelLeft size={16} />{listing ? 'Editor' : 'Sources'}
      </button>
      <aside className={`flex min-h-0 flex-1 flex-col gap-2 border border-base-300 p-2 @3xl:flex-none ${listing ? '' : '@max-3xl:hidden'}`}>
        <form className="flex gap-2" onSubmit={(e) => void create(e)}>
          <input className="input input-sm min-w-0 flex-1" placeholder="new source: its title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button type="submit" className="btn btn-sm btn-square btn-primary" title="add" disabled={busy || !title.trim()}>
            {busy ? <span className="loading loading-spinner loading-xs" /> : <Plus size={16} />}
          </button>
          <button type="button" className="btn btn-sm btn-square" title="import BibTeX from the clipboard" onClick={() => void fromClipboard()}>
            <ClipboardPaste size={16} />
          </button>
        </form>
        {bib.error && <p className="text-sm text-error">{bib.error}</p>}
        {bib.staged.length > 0 && (
          <div>
            <StagedSources rows={bib.staged} onChoice={bib.setChoice} onRemove={bib.remove} />
            <div className="flex gap-1">
              <button className="btn btn-primary btn-sm" autoFocus onClick={() => void importStaged()}>Import</button>
              <button className="btn btn-sm" onClick={bib.clear}>Cancel</button>
            </div>
          </div>
        )}
        <input ref={filter} onKeyDown={blurOnEscape} className="input input-sm w-full" type="search" value={q} placeholder="Filter"
               onChange={(e) => void navigate({ to: '.', search: { q: e.target.value || undefined, open }, replace: true })} />
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
          {rows.map((s) => (
            <li key={s.file}>
              <NoteLine item={s} onClick={() => show(s.file)}
                        className={`rounded-field px-2 py-1.5 hover:bg-base-200 ${s.file === open ? 'bg-base-300' : ''}`} />
            </li>
          ))}
          {data && !rows.length && <li className="px-2 text-base-content/50">{q ? 'No matches.' : 'No sources yet.'}</li>}
        </ul>
      </aside>
      <section className={`min-h-0 flex-1 ${listing ? '@max-3xl:hidden' : ''}`}>
        {open ? (
          <Note key={open} file={open} modes={['edit']} commit="blur" fill className="h-full rounded-box border border-base-300 bg-base-100 p-3"
                onDeleted={() => show(undefined)} />
        ) : <p className="text-sm text-base-content/50">Pick, add or import a source.</p>}
      </section>
    </div>
  );
}
