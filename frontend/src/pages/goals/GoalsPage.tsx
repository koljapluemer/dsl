import { useQuery } from '@tanstack/react-query';
import type { Item } from '@/api/types';
import { Note } from '@/meta/note/Note';
import { goalsQuery } from './goals';

/** A goal rendered, editable in place and written as focus leaves it. An unreadable item shows why instead. */
function GoalRow({ item }: { item: Item }) {
  const unreadable = item.errors.find((e) => e.code === 'unreadable');
  if (unreadable) return <p className="text-error text-sm mb-4">unreadable note: {unreadable.detail}</p>;
  return <Note file={item.file} item={item} commit="blur" defaultMode="view" persist={`goals:${item.file}`} className="mb-4 rounded-box border border-base-300 p-3" />;
}

/** The goals not yet done (no attached image). */
export function GoalsPage() {
  const { data } = useQuery(goalsQuery);
  if (!data) return null;
  return (
    <div>
      {!data.length && <p className="text-base-content/50">No goals.</p>}
      {data.map((i) => <GoalRow key={i.file} item={i} />)}
    </div>
  );
}
