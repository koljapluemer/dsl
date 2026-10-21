import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { PanelLeft, Plus } from 'lucide-react';
import { useSlashFocus } from '@/dumb/keys';
import { itemsChanged, saveItem } from '@/entities/item/mutations';
import { NoteLine } from '@/entities/item/NoteLine';
import { itemQuery } from '@/entities/item/queries';
import { Note } from '@/meta/note/Note';
import { explorationsQuery, explorationText, type ExplorationsSearch } from './explorations';
import './explorations.css';

/**
 * The notes tagged `exploration`, inline, beside the one open, in the editor
 * to begin with and saved as focus leaves it; the field above the list starts a new one.
 */
export function ExplorationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { open } = useSearch({ strict: false }) as ExplorationsSearch;
  const list = useQuery(explorationsQuery);
  /** on a narrow screen the list takes the place of the editor */
  const [listing, setListing] = useState(!open);
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useSlashFocus();

  const show = (file: string | undefined) => {
    setListing(!file);
    void navigate({ to: '.', search: { open: file } });
  };

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !start.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await saveItem(null, explorationText(start));
      qc.setQueryData(itemQuery(created.file).queryKey, created);
      void itemsChanged(qc);
      setStart('');
      show(created.file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-4 md:grid md:grid-cols-[22rem_minmax(0,1fr)] md:gap-4">
      <button type="button" className="btn btn-sm self-start md:hidden" onClick={() => setListing(!listing)}>
        <PanelLeft size={16} />{listing ? 'Editor' : 'Explorations'}
      </button>
      <aside className={`flex min-h-0 flex-1 flex-col border border-base-300 md:flex-none ${listing ? '' : 'max-md:hidden'}`}>
        <form className="flex gap-2 border-b border-base-300 p-2" onSubmit={(e) => void create(e)}>
          <input ref={input} className="input input-sm min-w-0 flex-1" placeholder="new exploration" value={start}
                 onChange={(e) => setStart(e.target.value)} />
          <button type="submit" className="btn btn-sm btn-square btn-primary" title="add" disabled={busy || !start.trim()}>
            {busy ? <span className="loading loading-spinner loading-xs" /> : <Plus size={16} />}
          </button>
        </form>
        {error && <p className="p-2 text-sm text-error">{error}</p>}
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 text-sm">
          {list.data?.map((e) => (
            <li key={e.file}>
              <NoteLine item={e} onClick={() => show(e.file)}
                        className={`rounded-field px-2 py-1.5 hover:bg-base-200 ${e.file === open ? 'bg-base-300' : ''}`} />
            </li>
          ))}
          {list.data?.length === 0 && <li className="px-2 text-base-content/50">No explorations yet.</li>}
        </ul>
      </aside>
      <section className={`min-h-0 flex-1 ${listing ? 'max-md:hidden' : ''}`}>
        {open ? (
          <Note key={open} file={open} fill commit="blur" defaultMode="edit" persist="explorations"
                className="exploration h-full rounded-box border border-base-300 bg-base-100 p-3" onDeleted={() => show(undefined)} />
        ) : <p className="text-sm text-base-content/50">Pick or start an exploration.</p>}
      </section>
    </div>
  );
}
