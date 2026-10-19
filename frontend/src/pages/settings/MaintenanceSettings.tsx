import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { showError } from '@/dumb/errorBanner';
import { maintenanceQuery, runMaintenance } from '@/entities/settings/queries';

/** Cleanups, each listing what it would delete before doing so. */
export function MaintenanceSettings() {
  const { data } = useQuery(maintenanceQuery);
  if (!data) return null;
  return (
    <fieldset className="fieldset"><legend className="fieldset-legend">maintenance</legend>
      <Cleanup label="past appointments" action="past-appointments" count={data.pastAppointments.length}>
        {data.pastAppointments.map((a) => <li key={a.file}><span className="font-mono">{a.date}</span> {a.heading}</li>)}
      </Cleanup>
      <Cleanup label="orphaned media" action="orphaned-media" count={data.orphanedMedia.length}>
        {data.orphanedMedia.map((rel) => <li key={rel} className="font-mono">{rel}</li>)}
      </Cleanup>
    </fieldset>
  );
}

function Cleanup({ label, action, count, children }: {
  label: string; action: 'past-appointments' | 'orphaned-media'; count: number; children: ReactNode;
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
        <ul className="text-xs mt-1 max-h-60 overflow-y-auto">{children}</ul>
      </details>
      <button className="btn btn-sm btn-error" disabled={count === 0} onClick={run}>Delete {count}</button>
    </div>
  );
}
