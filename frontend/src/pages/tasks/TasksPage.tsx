import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pager } from '@/dumb/Pager';
import { itemsQuery } from '@/entities/item/queries';
import { TaskRow } from './TaskRow';

/** The items with problems, then the other items with tasks; each editable in place. */
export function TasksPage() {
  const [brokenPage, setBrokenPage] = useState(0);
  const [taskPage, setTaskPage] = useState(0);
  const broken = useQuery(itemsQuery({ attention: true, page: brokenPage }));
  const tasks = useQuery(itemsQuery({ tasks: true, attention: false, page: taskPage }));
  if (!broken.data || !tasks.data) return null;
  return (
    <div>
      {broken.data.total > 0 && <>
        <h2 className="text-lg font-semibold mb-2">Broken</h2>
        {broken.data.items.map((i) => <TaskRow key={i.file} item={i} />)}
        <Pager page={broken.data.page} pageSize={broken.data.page_size} total={broken.data.total} onPage={setBrokenPage} />
        <h2 className="text-lg font-semibold mb-2 mt-6">Tasks</h2>
      </>}
      {!tasks.data.items.length && <p className="text-base-content/50">No tasks.</p>}
      {tasks.data.items.map((i) => <TaskRow key={i.file} item={i} />)}
      <Pager page={tasks.data.page} pageSize={tasks.data.page_size} total={tasks.data.total} onPage={setTaskPage} />
    </div>
  );
}
