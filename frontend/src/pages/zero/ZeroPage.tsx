import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { ItemView } from '@/api/types';
import { Markdown } from '@/dumb/Markdown';
import { cardColorFor } from './cardColor';
import { done, markDone, ordered } from './session';
import './zero.css';

const zeroQuery = { queryKey: ['zero'], queryFn: () => api<ItemView[]>('GET', '/api/zero') };

/** A card per item tagged `zero`, in a random order per page load; clicking one greys it out and moves it last. */
export function ZeroPage() {
  const { data } = useQuery(zeroQuery);
  const isDone = done.use();
  if (!data) return null;
  if (!data.length) return <p className="text-base-content/50">No items found.</p>;
  return (
    <div className="space-y-2">
      {ordered(data, isDone).map((i) => (
        <div key={i.file} className={`zero-card rounded-box p-2 cursor-pointer ${isDone.has(i.file) ? 'opacity-40' : ''}`}
             style={{ backgroundColor: cardColorFor(i.file) }}
             onClick={(e) => { if (!(e.target as Element).closest('a')) markDone(i.file); }}>
          <Markdown source={i.body.trim() ? i.body : i.text} />
        </div>
      ))}
    </div>
  );
}
