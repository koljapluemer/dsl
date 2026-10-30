import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Plus } from 'lucide-react';
import { ExportStatus } from '@/entities/settings/ExportStatus';
import { Note } from '@/meta/note/Note';
import { NoteModal } from '@/meta/note/NoteModal';
import { TOOL } from '@/meta/note/tools';
import type { Item } from '@/api/types';
import { NEW_CARD, PREVIEW_URL, cardThumbUrl, cardsQuery, portfolioQuery } from './portfolio';

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
      <ExportStatus exportKey="portfolio" />
      <Cards available={data.cards.available} reason={data.cards.reason} />
    </div>
  );
}

/**
 * The card notes as their collages' thumbnails (their headings where collages
 * can't be rendered, with why), each opening the note in a modal, then a tile
 * adding a new card.
 */
function Cards({ available, reason }: { available: boolean; reason: string | null }) {
  const { data } = useQuery(cardsQuery);
  const [editing, setEditing] = useState<Item | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  if (!data) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Cards</h2>
      {!!data.length && !available && <p className="text-sm text-warning">Card collages aren't available on this install: {reason}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {data.map((i) => (
          <button key={i.file} type="button" className="cursor-pointer text-left" onClick={() => setEditing(i)}>
            {available
              ? <img src={cardThumbUrl(i)} alt={i.file} loading="lazy" className="w-full rounded-box border border-base-300" />
              : <span className="block rounded-box border border-base-300 p-3 text-sm">{heading(i)}</span>}
          </button>
        ))}
        <button type="button" className="btn btn-dash h-auto min-h-16 rounded-box" onClick={() => setAdding(Date.now())}>
          <Plus size={16} />Card
        </button>
      </div>
      {editing && <NoteModal key={editing.file} file={editing.file} item={editing} onClose={() => setEditing(null)} />}
      {adding && <NoteModal key={adding} file={null} initial={NEW_CARD} onClose={() => setAdding(null)} />}
    </section>
  );
}

const heading = (item: Item) => item.text.split('\n')[0].replace(/^#+\s*/, '') || item.file;
