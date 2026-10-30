import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ExportKey } from '@/api/types';
import { settingsQuery } from './queries';

/** Where an export (exports.py) is written, each path with its last result; or that it isn't. */
export function ExportStatus({ exportKey }: { exportKey: ExportKey }) {
  const targets = useQuery(settingsQuery).data?.exports[exportKey];
  if (!targets) return null;
  if (!targets.length) {
    return <p className="text-sm">Not exported: set a path under <Link to="/settings" className="link">Settings</Link>.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {targets.map((t) => (
        <li key={t.path} className="flex flex-wrap items-center gap-x-2 font-mono break-all">
          {t.path}
          {t.error ? <span className="font-sans text-error">{t.error}</span> : <Check size={14} className="text-success" />}
        </li>
      ))}
    </ul>
  );
}
