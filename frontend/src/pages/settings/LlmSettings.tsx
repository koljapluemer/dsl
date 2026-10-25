import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LlmInfo } from '@/api/types';
import { showError } from '@/dumb/notice';
import { llmQuery, saveSettings } from '@/entities/settings/queries';

export function LlmSettings() {
  const { data } = useQuery(llmQuery);
  // remount on a new url, so the field starts from what's saved
  return data ? <LlmForm key={data.url} info={data} /> : null;
}

function LlmForm({ info }: { info: LlmInfo }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState(info.url === info.default_url ? '' : info.url);

  async function save() {
    try {
      await saveSettings(qc, { llm: { url } });
    } catch (e) { showError(e); }
  }

  return (
    <fieldset className="fieldset"><legend className="fieldset-legend">Ollama server</legend>
      <div className="join w-full">
        <input className="input join-item w-full" value={url} placeholder={info.default_url}
               onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <button className="btn join-item" onClick={save}>Save</button>
      </div>
      <p className="label">{info.available ? 'reachable at ' + info.url : 'unavailable: ' + info.reason}</p>
    </fieldset>
  );
}
