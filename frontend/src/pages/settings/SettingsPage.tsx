import { useState } from 'react';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { showError } from '@/dumb/errorBanner';
import { saveSettings, settingsQuery } from '@/entities/settings/queries';
import { BibtexSettings } from './BibtexSettings';
import { LlmSettings } from './LlmSettings';

export function SettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { path, suggested } = useSuspenseQuery(settingsQuery).data;
  const [value, setValue] = useState(path || suggested || '');

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
        {suggested && suggested !== value && (
          <p className="label">calendar: <a className="link font-mono" onClick={() => setValue(suggested)}>{suggested}</a></p>
        )}
      </fieldset>
      <LlmSettings />
      {path && <BibtexSettings />}
    </div>
  );
}
