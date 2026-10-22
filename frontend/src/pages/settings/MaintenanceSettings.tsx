import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { showError } from '@/dumb/errorBanner';
import { maintenanceQuery, runMaintenance } from '@/entities/settings/queries';
import { Note } from '@/meta/note/Note';

/** Cleanups, each listing what it would delete before doing so. */
export function MaintenanceSettings() {
  const { data } = useQuery(maintenanceQuery);
  if (!data) return null;
  return (
    <fieldset className="fieldset"><legend className="fieldset-legend">maintenance</legend>
      <Cleanup label="past appointments" action="past-appointments" count={data.pastAppointments.length}>
        {data.pastAppointments.map((a) => <li key={a.file}><Note file={a.file} item={a} render="inline" /></li>)}
      </Cleanup>
      <Cleanup label="orphaned files" action="orphaned-files" count={data.orphanedFiles.length}>
        {data.orphanedFiles.map((rel) => <li key={rel} className="font-mono">{rel}</li>)}
      </Cleanup>
    </fieldset>
  );
}

function Cleanup({ label, action, count, children }: {
  label: string; action: 'past-appointments' | 'orphaned-files'; count: number; children: ReactNode;
}) {
  const qc = useQueryClient();

  async function run() {
    try {
      await runMaintenance(qc, action);
    } catch (e) { showError(e); }
  }

  return (
    <div className="flex items-start gap-2">
      <details className="grow">
        <summary className="cursor-pointer">{label}: {count}</summary>
        <ul className="text-xs mt-1 max-h-60 space-y-1 overflow-y-auto">{children}</ul>
      </details>
      <button className="btn btn-sm btn-error" disabled={count === 0} onClick={run}>Delete {count}</button>
    </div>
  );
}
