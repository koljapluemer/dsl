import { useState } from 'react';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import type { Settings } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { saveSettings, settingsQuery } from '@/entities/settings/queries';

/** The .bib files every source is exported to, each with its last export's result. */
export function BibtexSettings() {
  const { bibtex } = useSuspenseQuery(settingsQuery).data;
  // remount on what's saved, so the rows start from it
  return <BibtexForm key={JSON.stringify(bibtex)} saved={bibtex} />;
}

function BibtexForm({ saved }: { saved: Settings['bibtex'] }) {
  const qc = useQueryClient();
  const [paths, setPaths] = useState([...saved.map((b) => b.path), '']);

  function setPath(i: number, v: string) {
    const next = paths.map((p, j) => (j === i ? v : p));
    setPaths(next[next.length - 1] === '' ? next : [...next, '']);
  }

  async function save() {
    const kept = paths.map((p) => p.trim()).filter(Boolean);
    if (JSON.stringify(kept) === JSON.stringify(saved.map((b) => b.path))) return;
    try {
      await saveSettings(qc, { bibtex: kept });
    } catch (e) { showError(e); }
  }

  return (
    <fieldset className="fieldset"><legend className="fieldset-legend">bibtex export</legend>
      <div className="flex flex-col gap-1" onBlur={save}>
        {paths.map((p, i) => {
          const status = saved.find((b) => b.path === p);
          return (
            <div key={i}>
              <label className={`input input-sm w-full ${status?.error ? 'input-error' : ''}`}>
                <input className="grow font-mono" value={p} placeholder="~/path/to/sources.bib"
                       onChange={(e) => setPath(i, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
                {status && !status.error && <Check size={14} className="text-success" />}
              </label>
              {status?.error && <div className="text-error text-xs mt-0.5">{status.error}</div>}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
