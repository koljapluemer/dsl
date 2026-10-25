import { useState } from 'react';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { showError } from '@/dumb/notice';
import { saveSettings, settingsQuery } from '@/entities/settings/queries';
import { ExportSettings } from './ExportSettings';
import { LlmSettings } from './LlmSettings';
import { MaintenanceSettings } from './MaintenanceSettings';

export function SettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { path } = useSuspenseQuery(settingsQuery).data;
  const [value, setValue] = useState(path ?? '');

  async function save() {
    if (!value.trim() || value === path) return;
    try {
      await saveSettings(qc, { path: value });
      void navigate({ to: '/' });
    } catch (e) { showError(e); }
  }

  return (
    <div>
      <fieldset className="fieldset"><legend className="fieldset-legend">data directory</legend>
        <div className="join w-full">
          <input className="input join-item w-full" value={value} onChange={(e) => setValue(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus />
          <button className="btn join-item" onClick={save}>Save</button>
        </div>
      </fieldset>
      <LlmSettings />
      {path && <ExportSettings exportKey="bibtex" legend="bibtex export" placeholder="~/path/to/sources.bib" />}
      {path && <ExportSettings exportKey="portfolio" legend="portfolio export" placeholder="~/path/to/site/index.html" />}
      {path && <MaintenanceSettings />}
    </div>
  );
}
