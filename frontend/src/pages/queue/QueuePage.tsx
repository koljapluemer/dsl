import { Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeOff, SkipForward } from 'lucide-react';
import type { Item } from '@/api/types';
import { useHotkeys } from '@/dumb/keys';
import { useSessionState } from '@/dumb/useSessionState';
import { Note } from '@/meta/note/Note';
import { SimpleToggle } from '@/meta/note/SimpleToggle';
import type { TagToggle } from '@/meta/note/tools';
import { drawCount, drawQuery, QUEUE_HIDE_TAG } from './queue';

const HIDE: TagToggle = { tag: QUEUE_HIDE_TAG, icon: EyeOff, title: 'hide from the queue', activeTitle: 'hidden from the queue (click: back in it)' };

/**
 * A few random items from the whole folder, minus those the queue hides (see docs/hiding.md), and Next to draw others;
 * shown simply or in full, as toggled.
 */
export function QueuePage() {
  const qc = useQueryClient();
  const n = drawCount.use();
  const { data, isFetching } = useQuery(drawQuery(n));
  const [simple, setSimple] = useSessionState('queue-simple', false, (v) => typeof v === 'boolean');
  const next = () => drawCount.set(n + 1);
  useHotkeys({ n: () => { if (!isFetching && data?.total) next(); } });

  // the batch keeps what was written to its notes, so they show it when toggled
  const written = (item: Item) => qc.setQueryData(drawQuery(n).queryKey, (d) => d && { ...d, items: d.items.map((i) => (i.file === item.file ? item : i)) });
  const without = (file: string) => qc.setQueryData(drawQuery(n).queryKey, (d) => d && { items: d.items.filter((i) => i.file !== file), total: d.total - 1 });

  return (
    <div>
      {data && !data.items.length && <p className="text-base-content/50 my-6">No items found.</p>}
      {data?.items.map((i, k) => (
        <Fragment key={i.file}>
          {k > 0 && <div className="divider" />}
          <Note file={i.file} item={i} render={simple ? 'simple' : 'full'} persist="queue" tagToggles={[HIDE]}
                onSaved={written} onDeleted={() => without(i.file)} />
        </Fragment>
      ))}
      <div className="mt-6 flex gap-2">
        <button className="btn btn-primary flex-1" title="n" disabled={isFetching || !data?.total} onClick={next}>
          <SkipForward size={20} />Next
        </button>
        <SimpleToggle simple={simple} onChange={setSimple} />
      </div>
    </div>
  );
}
