import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { showError } from '@/dumb/errorBanner';
import { filterQuery, saveFilter } from './queue';

const TAG = /^[a-z0-9-]+$/;

/** The item types and tags the queue ignores; `onChanged` once a change is saved. */
export function HiddenFilter({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery(filterQuery);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  if (!data) return null;

  async function save(next: { types: string[]; tags: string[] }) {
    try {
      qc.setQueryData(filterQuery.queryKey, await saveFilter(next));
      onChanged();
    } catch (e) { showError(e); }
  }

  const toggleType = (t: string) => save({ ...data, types: data.types.includes(t) ? data.types.filter((x) => x !== t) : [...data.types, t] });
  const removeTag = (t: string) => save({ ...data, tags: data.tags.filter((x) => x !== t) });

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    if (!TAG.test(tag)) { setError('Tags are a-z, 0-9 and -'); return; }
    setText('');
    setError('');
    if (!data!.tags.includes(tag)) save({ ...data!, tags: [...data!.tags, tag] });
  }

  // hidden types no longer in the folder stay listed, so they can be shown again
  const types = [...new Set([...data.known_types, ...data.types])].sort();
  const q = text.trim().toLowerCase();
  const suggestions = q ? data.known_tags.filter((t) => t.startsWith(q) && !data.tags.includes(t)).slice(0, 8) : [];
  const hiddenCount = data.types.length + data.tags.length;

  return (
    <details className="collapse collapse-arrow border border-base-300 mb-4">
      <summary className="collapse-title text-sm">Hidden{hiddenCount ? ` (${hiddenCount})` : ''}</summary>
      <div className="collapse-content space-y-4">
        <div>
          <p className="text-sm font-medium mb-1">Types</p>
          {!types.length && <p className="text-xs text-base-content/50">No typed items</p>}
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <button key={t} className={`btn btn-xs ${data.types.includes(t) ? 'btn-primary' : 'btn-outline'}`} onClick={() => toggleType(t)}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-1">Tags</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {data.tags.map((t) => (
              <span key={t} className="badge badge-neutral gap-1">{t}
                <button title="remove" onClick={() => removeTag(t)}><X size={12} /></button>
              </span>
            ))}
          </div>
          <input className={`input input-sm w-full ${error ? 'input-error' : ''}`} value={text} placeholder="Add tag"
                 onChange={(e) => {
                   const v = e.target.value;
                   if (v.endsWith(' ') || v.endsWith(',')) addTag(v.slice(0, -1)); else setText(v);
                 }}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(text); } }} />
          {error && <p className="text-error text-xs mt-1">{error}</p>}
          {suggestions.length > 0 && (
            <ul className="menu menu-sm bg-base-200 rounded-box w-full mt-1">
              {suggestions.map((t) => <li key={t}><a onMouseDown={(e) => { e.preventDefault(); addTag(t); }}>{t}</a></li>)}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
