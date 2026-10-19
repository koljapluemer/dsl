import { Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SkipForward } from 'lucide-react';
import type { ItemView as View, QueueDraw } from '@/api/types';
import { offerUndo } from '@/dumb/undo';
import { itemsChanged, saveItem } from '@/entities/item/mutations';
import { NotePanel } from '@/meta/note-panel/NotePanel';
import { drawCount, drawQuery, hideFromQueue } from './queue';

/** A few random items from the whole folder, minus those the queue hides (see docs/hiding.md), and Next to draw others. */
export function QueuePage() {
  const qc = useQueryClient();
  const n = drawCount.use();
  const { data, isFetching } = useQuery(drawQuery(n));
  const next = () => drawCount.set(n + 1);

  const update = (f: (d: QueueDraw) => QueueDraw) => qc.setQueryData(drawQuery(n).queryKey, (d) => d && f(d));
  const without = (file: string) => update((d) => ({ items: d.items.filter((i) => i.file !== file), total: d.total - 1 }));

  // the batch on screen loses the item, and gets it back in its place on undo
  async function hide(item: View, index: number) {
    await hideFromQueue(item.file);
    without(item.file);
    offerUndo('note hidden from queue', async () => {
      await saveItem(item.file, item.text);
      update((d) => ({ items: d.items.toSpliced(index, 0, item), total: d.total + 1 }));
      await itemsChanged(qc);
    });
    await itemsChanged(qc);
  }

  return (
    <div>
      {data && !data.items.length && <p className="text-base-content/50 my-6">No items found.</p>}
      {data?.items.map((i, k) => (
        <Fragment key={i.file}>
          {k > 0 && <div className="divider" />}
          <NotePanel file={i.file} item={i} hide={{ title: 'Hide from queue', run: () => hide(i, k) }}
                     onDeleted={() => without(i.file)} />
        </Fragment>
      ))}
      <button className="btn btn-primary w-full mt-6" disabled={isFetching || !data?.total} onClick={next}>
        <SkipForward size={20} />Next
      </button>
    </div>
  );
}
