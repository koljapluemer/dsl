import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SkipForward } from 'lucide-react';
import { ItemView } from '@/entities/item/ItemView';
import { HiddenFilter } from './HiddenFilter';
import { drawCount, drawQuery } from './queue';

/** A few random items from the whole folder, minus the hidden ones, and Next to draw others. */
export function QueuePage() {
  const n = drawCount.use();
  const { data, isFetching } = useQuery(drawQuery(n));
  const next = () => drawCount.set(n + 1);
  return (
    <div>
      <HiddenFilter onChanged={next} />
      {data && !data.items.length && <p className="text-base-content/50 my-6">No items found.</p>}
      {data?.items.map((i, k) => (
        <Fragment key={i.file}>
          {k > 0 && <div className="divider" />}
          <div className="overview"><ItemView item={i} /></div>
        </Fragment>
      ))}
      <button className="btn btn-primary w-full mt-6" disabled={isFetching || !data?.total} onClick={next}>
        <SkipForward size={20} />Next
      </button>
    </div>
  );
}
