import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, ExternalLink } from 'lucide-react';
import { settingsQuery } from '@/entities/settings/queries';
import { Note } from '@/meta/note/Note';
import { TOOL } from '@/meta/note/tools';
import { PREVIEW_URL, portfolioQuery } from './portfolio';

/**
 * The note tagged `portfolio`, in the editor to begin with and saved as focus
 * leaves it; its template is among its files. Below it, where the page is exported to.
 */
export function PortfolioPage() {
  const { data, error } = useQuery(portfolioQuery);
  if (error) return <p className="text-error">{error.message}</p>;
  if (!data) return <span className="loading loading-spinner loading-sm" />;
  return (
    <div className="space-y-3 pb-4">
      <Note key={data.note.file} file={data.note.file} item={data.note} commit="blur" defaultMode="edit" persist="portfolio"
            relationships={false} tools={{ delete: false }}
            extraTools={[{
              key: 'preview',
              node: <a key="preview" className={TOOL} href={PREVIEW_URL} target="_blank" rel="noopener" title="preview"><ExternalLink size={14} /></a>,
            }]} />
      <ExportStatus />
    </div>
  );
}

function ExportStatus() {
  const targets = useQuery(settingsQuery).data?.exports.portfolio;
  if (!targets) return null;
  if (!targets.length) {
    return <p className="text-sm">Not exported: set a path under <Link to="/settings" className="link">Settings</Link>.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {targets.map((t) => (
        <li key={t.path} className="flex flex-wrap items-center gap-x-2 font-mono">
          {t.path}
          {t.error ? <span className="font-sans text-error">{t.error}</span> : <Check size={14} className="text-success" />}
        </li>
      ))}
    </ul>
  );
}
