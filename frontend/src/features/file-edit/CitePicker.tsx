import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Quote } from 'lucide-react';
import { NoteLine } from '@/entities/item/NoteLine';
import { rankSources } from '@/entities/source/cite';
import { citeSourcesQuery, matches, sourcesQuery } from '@/entities/source/queries';

const LIMIT = 30;

/**
 * A dropdown to cite a source: filtered by key, title, date or name, those of
 * `note` (related, on its canvas) first. `onCite` gets the key picked.
 */
export function CitePicker({ note, onCite }: { note: string; onCite: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const details = useRef<HTMLDetailsElement>(null);
  const sources = useQuery({ ...sourcesQuery, enabled: open });
  const preferred = useQuery({ ...citeSourcesQuery(note), enabled: open });
  const found = rankSources((sources.data ?? []).filter((s) => matches(s.fields, q)), preferred.data ?? []).slice(0, LIMIT);

  const pick = (key: string) => {
    details.current?.removeAttribute('open');
    setQ('');
    onCite(key);
  };

  return (
    <details ref={details} className="dropdown dropdown-end" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="btn btn-ghost btn-xs btn-square" title="cite a source"><Quote size={14} /></summary>
      <div className="dropdown-content z-10 mt-1 flex max-h-96 w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-box bg-base-100 p-2 shadow">
        {open && (
          <input autoFocus className="input input-sm w-full shrink-0" placeholder="key, title, author, year" value={q}
                 onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' && found[0]) { e.preventDefault(); pick(found[0].fields.key); } }} />
        )}
        <ul className="min-h-0 space-y-1 overflow-y-auto text-sm">
          {found.map((s) => (
            <li key={s.file}>
              <NoteLine item={s} onClick={() => pick(s.fields.key)} className="cursor-pointer rounded-field px-2 py-1.5 hover:bg-base-200"
                        actions={<span className="shrink-0 font-mono text-xs text-base-content/60">{s.fields.key}</span>} />
            </li>
          ))}
          {sources.data && !found.length && <li className="px-2 text-base-content/50">No source found.</li>}
        </ul>
      </div>
    </details>
  );
}
