import { useState } from 'react';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import type { ExportKey, Settings } from '@/api/types';
import { showError } from '@/dumb/notice';
import { saveSettings, settingsQuery } from '@/entities/settings/queries';

type Props = { exportKey: ExportKey; legend: string; placeholder: string };

/** The files an export (exports.py) writes, each with its last export's result. */
export function ExportSettings(props: Props) {
  const saved = useSuspenseQuery(settingsQuery).data.exports[props.exportKey];
  // remount on what's saved, so the rows start from it
  return <ExportForm key={JSON.stringify(saved)} saved={saved} {...props} />;
}

function ExportForm({ saved, exportKey, legend, placeholder }: Props & { saved: Settings['exports'][ExportKey] }) {
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
      await saveSettings(qc, { exports: { [exportKey]: kept } });
    } catch (e) { showError(e); }
  }

  return (
    <fieldset className="fieldset"><legend className="fieldset-legend">{legend}</legend>
      <div className="flex flex-col gap-1" onBlur={save}>
        {paths.map((p, i) => {
          const status = saved.find((b) => b.path === p);
          return (
            <div key={i}>
              <label className={`input input-sm w-full ${status?.error ? 'input-error' : ''}`}>
                <input className="grow font-mono" value={p} placeholder={placeholder}
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
