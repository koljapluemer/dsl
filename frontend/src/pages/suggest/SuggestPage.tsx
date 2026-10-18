import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SuggestModal } from './SuggestModal';
import { tagsQuery } from './suggest';

/** A card per hashtag across all notes; clicking one shows a random note carrying it. */
export function SuggestPage() {
  const { data } = useQuery(tagsQuery);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return null;
  return (
    <div>
      {!data.length && <p className="text-base-content/50">No hashtags found.</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
        {data.map((t) => (
          <button key={t} className="btn h-16 truncate" onClick={() => setOpen(t)}>{t}</button>
        ))}
      </div>
      {open && <SuggestModal key={open} tag={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
