import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Item } from '@/api/types';
import { Note } from '@/meta/note/Note';
import { done, markDone, ordered } from './session';

const zeroQuery = { queryKey: ['zero'], queryFn: () => api<Item[]>('GET', '/api/zero') };

/** Each item tagged `zero`, inline, in a random order per page load; clicking one greys it out and moves it last. */
export function ZeroPage() {
  const { data } = useQuery(zeroQuery);
  const isDone = done.use();
  if (!data) return null;
  if (!data.length) return <p className="text-base-content/50">No items found.</p>;
  return (
    <div className="space-y-2">
      {ordered(data, isDone).map((i) => (
        <Note key={i.file} file={i.file} item={i} render="inline" onClick={() => markDone(i.file)}
              className={`rounded-box border border-base-300 p-2 ${isDone.has(i.file) ? 'opacity-40' : ''}`} />
      ))}
    </div>
  );
}
