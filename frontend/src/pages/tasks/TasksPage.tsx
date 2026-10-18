import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pager } from '@/dumb/Pager';
import { itemsQuery } from '@/entities/item/queries';
import { TaskRow } from './TaskRow';

/** Every item with tasks, each in its own editor. */
export function TasksPage() {
  const [page, setPage] = useState(0);
  const { data } = useQuery(itemsQuery({ tasks: true, page }));
  if (!data) return null;
  return (
    <div>
      {!data.items.length && <p className="text-base-content/50">No tasks.</p>}
      {data.items.map((i) => <TaskRow key={i.file} item={i} />)}
      <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
    </div>
  );
}
