import { showError } from '@/dumb/notice';
import { BibtexPicker, StagedSources } from './BibtexSourcesField';
import { useBibtexSources, type StagedSource } from './useBibtexSources';

/**
 * An icon button citing the sources in the clipboard's BibTeX: each becomes a
 * new source or one that exists; `onCite` gets their keys. Cited at once when
 * none may exist yet, else after choosing in the dropdown below the button.
 */
export function BibtexCite({ onCite, className }: { onCite: (keys: string[]) => void; className: string }) {
  const bib = useBibtexSources();

  async function cite(rows?: StagedSource[]) {
    try {
      const { sources } = await bib.apply(undefined, rows);
      bib.clear();
      onCite(sources.map((s) => s.key));
    } catch (e) { showError(e); }
  }

  async function fromClipboard() {
    const rows = await bib.fromClipboard();
    if (rows?.length && rows.every((r) => !r.candidates.length)) await cite(rows);
  }

  const open = bib.staged.length > 0 || bib.error !== null;
  return (
    <div className={`dropdown dropdown-end ${open ? 'dropdown-open' : ''}`}>
      <BibtexPicker onPick={() => void fromClipboard()} className={className} title="cite the sources in the clipboard's BibTeX (adding them)" />
      {open && (
        <div className="dropdown-content z-10 mt-1 max-h-96 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-box bg-base-100 p-3 shadow">
          {bib.error && <p className="mb-2 text-sm text-error">{bib.error}</p>}
          <StagedSources rows={bib.staged} onChoice={bib.setChoice} onRemove={bib.remove} />
          <div className="flex gap-1">
            {bib.staged.length > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={() => void cite()}>Cite</button>}
            <button type="button" className="btn btn-sm" onClick={bib.clear}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
