import { useState, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TheaStatus } from '@/api/types';
import { showError } from '@/dumb/notice';
import { theaStatusQuery } from '@/entities/item/viz/queries';
import { saveSettings } from '@/entities/settings/queries';

/** How viz blocks are generated: the claude CLI (docs/thea.md). */
export function TheaSettings() {
  const { data } = useQuery(theaStatusQuery);
  // remount on saved settings, so the fields start from them
  return data ? <TheaForm key={JSON.stringify(data.settings)} status={data} /> : null;
}

function TheaForm({ status }: { status: TheaStatus }) {
  const qc = useQueryClient();
  const s = status.settings;
  const [cli, setCli] = useState(s.cli);
  const [model, setModel] = useState(s.model);
  const [budget, setBudget] = useState(s.budget_usd === null ? '' : String(s.budget_usd));
  const [timeout, setTimeoutMin] = useState(String(s.timeout_min));

  async function save() {
    try {
      await saveSettings(qc, { thea: { cli, model, budget_usd: budget.trim() ? Number(budget) : null, timeout_min: Number(timeout) } });
    } catch (e) { showError(e); }
  }
  const enter = (e: KeyboardEvent) => { if (e.key === 'Enter') void save(); };

  return (
    <fieldset className="fieldset"><legend className="fieldset-legend">viz blocks</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="floating-label"><span>claude CLI command</span>
          <input className="input w-full" value={cli} placeholder="claude" onChange={(e) => setCli(e.target.value)} onKeyDown={enter} />
        </label>
        <label className="floating-label"><span>model (empty: the CLI's default)</span>
          <input className="input w-full" value={model} placeholder="model (empty: the CLI's default)" onChange={(e) => setModel(e.target.value)} onKeyDown={enter} />
        </label>
        <label className="floating-label"><span>cap per run, estimated USD (empty: none)</span>
          <input className="input w-full" inputMode="decimal" value={budget} placeholder="cap per run, estimated USD (empty: none)"
                 onChange={(e) => setBudget(e.target.value)} onKeyDown={enter} />
        </label>
        <label className="floating-label"><span>time limit, minutes</span>
          <input className="input w-full" inputMode="numeric" value={timeout} placeholder="time limit, minutes"
                 onChange={(e) => setTimeoutMin(e.target.value)} onKeyDown={enter} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => void save()}>Save</button>
        <p className="label whitespace-normal">{status.available ? 'ready: claude CLI, npm and Chromium found' : 'unavailable: ' + status.reason}</p>
      </div>
    </fieldset>
  );
}
