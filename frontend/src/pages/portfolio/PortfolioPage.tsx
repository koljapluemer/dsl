import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, ExternalLink } from 'lucide-react';
import { settingsQuery } from '@/entities/settings/queries';
import { Note } from '@/meta/note/Note';
import { TOOL } from '@/meta/note/tools';
import type { Item } from '@/api/types';
import { PREVIEW_URL, cardImageUrl, cardThumbUrl, cardsQuery, portfolioQuery } from './portfolio';

/**
 * The note tagged `portfolio`, in the editor to begin with and saved as focus
 * leaves it; its template is among its files. Below it, where the page is
 * exported to, then the notes tagged `card`.
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
      <Cards available={data.cards.available} reason={data.cards.reason} />
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

/**
 * The card notes: their collages' thumbnails, each opening the collage in a new
 * tab, then the notes themselves. Where collages can't be rendered, why instead of the thumbnails.
 */
function Cards({ available, reason }: { available: boolean; reason: string | null }) {
  const { data } = useQuery(cardsQuery);
  if (!data) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Cards</h2>
      {!data.length && <p className="text-sm text-base-content/50">No notes tagged <code>card</code>.</p>}
      {!!data.length && !available && <p className="text-sm text-warning">Card collages aren't available on this install: {reason}</p>}
      {!!data.length && available && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.map((i) => (
            <a key={i.file} href={cardImageUrl(i)} target="_blank" rel="noopener">
              <img src={cardThumbUrl(i)} alt={i.file} loading="lazy" className="w-full rounded-box border border-base-300" />
            </a>
          ))}
        </div>
      )}
      {data.map((i) => <CardRow key={i.file} item={i} />)}
    </section>
  );
}

function CardRow({ item }: { item: Item }) {
  const unreadable = item.errors.find((e) => e.code === 'unreadable');
  if (unreadable) return <p className="text-error text-sm">unreadable note: {unreadable.detail}</p>;
  return <Note file={item.file} item={item} commit="blur" defaultMode="view" persist={`portfolio:card:${item.file}`} className="rounded-box border border-base-300 p-3" />;
}
