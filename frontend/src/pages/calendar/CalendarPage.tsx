import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useHotkeys } from '@/dumb/keys';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { ItemModal } from '@/meta/item-form/ItemModal';
import { calendarQuery } from './calendar';
import { addDays, daysBetween, startOfWeek, toDsl, today, type Day } from './dates';
import { DayView } from './DayView';
import { RangeView } from './RangeView';
import type { CalendarSearch } from './search';

/** The modal: an item to edit, or a new one starting as `initial`. */
type Editing = { file: string | null; initial: string; key: number };

/** Appointments and recurring items, by day or over a range (this week by default); items open in a modal to edit, add or delete. */
export function CalendarPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as CalendarSearch;
  const { data } = useQuery(calendarQuery);
  const [editing, setEditing] = useState<Editing | null>(null);
  const remove = useDeleteItem();

  const now = today();
  const day = search.day ?? now;
  const from = search.from ?? startOfWeek(now);
  const to = search.to ?? addDays(from, 6);
  const set = (next: CalendarSearch) => navigate({ to: '.', search: { ...search, ...next }, replace: true });
  const open = (file: string) => setEditing({ file, initial: '', key: Date.now() });
  const add = (d: Day) => setEditing({ file: null, initial: `\nappointment ${toDsl(d)}\n`, key: Date.now() });

  // a day back or forward, or the range by its own length
  const step = (n: number) => {
    if (search.view !== 'range') {
      const d = addDays(day, n);
      void set({ day: d === now ? undefined : d });
    } else {
      const len = daysBetween(from, to).length;
      void set({ from: addDays(from, n * len), to: addDays(to, n * len) });
    }
  };
  useHotkeys({
    ArrowLeft: () => step(-1),
    ArrowRight: () => step(1),
    // today, or this week
    t: () => set({ day: undefined, from: undefined, to: undefined }),
    a: () => { if (search.view !== 'range') add(day); },
    d: () => set({ view: undefined }),
    r: () => set({ view: 'range' }),
  });

  return (
    <div>
      <div className="join mb-4">
        <button className={`btn join-item ${search.view ? '' : 'btn-active'}`} title="d" onClick={() => set({ view: undefined })}>Day</button>
        <button className={`btn join-item ${search.view ? 'btn-active' : ''}`} title="r" onClick={() => set({ view: 'range' })}>Range</button>
      </div>
      {data && (search.view === 'range'
        ? <RangeView entries={data} from={from} to={to} onRange={(f, t) => set({ from: f, to: t })} onOpen={open} onAdd={add} />
        : <DayView entries={data} day={day} onDay={(d) => set({ day: d === now ? undefined : d })} onOpen={open} onAdd={add} />)}
      {editing && <ItemModal key={editing.key} file={editing.file} initial={editing.initial} refresh={calendarQuery.queryKey} onDelete={remove} onClose={() => setEditing(null)} />}
    </div>
  );
}
