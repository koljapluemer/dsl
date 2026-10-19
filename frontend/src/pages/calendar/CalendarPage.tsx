import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Modal } from '@/dumb/Modal';
import { NotePanel } from '@/meta/note-panel/NotePanel';
import { calendarQuery } from './calendar';
import { addDays, startOfWeek, toDsl, today, type Day } from './dates';
import { DayView } from './DayView';
import { RangeView } from './RangeView';
import type { CalendarSearch } from './search';

/** The modal: an item, or a new one starting as `initial`. */
type Editing = { file: string | null; initial: string; key: number };

/** Appointments and recurring items, by day or over a range (this week by default); items open in a modal to read, edit or delete; new ones too. */
export function CalendarPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as CalendarSearch;
  const { data } = useQuery(calendarQuery);
  const [editing, setEditing] = useState<Editing | null>(null);

  const now = today();
  const day = search.day ?? now;
  const from = search.from ?? startOfWeek(now);
  const to = search.to ?? addDays(from, 6);
  const set = (next: CalendarSearch) => navigate({ to: '.', search: { ...search, ...next }, replace: true });
  const open = (file: string) => setEditing({ file, initial: '', key: Date.now() });
  const add = (d: Day) => setEditing({ file: null, initial: `\nappointment ${toDsl(d)}\n`, key: Date.now() });

  return (
    <div>
      <div className="join mb-4">
        <button className={`btn join-item ${search.view ? '' : 'btn-active'}`} onClick={() => set({ view: undefined })}>Day</button>
        <button className={`btn join-item ${search.view ? 'btn-active' : ''}`} onClick={() => set({ view: 'range' })}>Range</button>
      </div>
      {data && (search.view === 'range'
        ? <RangeView entries={data} from={from} to={to} onRange={(f, t) => set({ from: f, to: t })} onOpen={open} onAdd={add} />
        : <DayView entries={data} day={day} onDay={(d) => set({ day: d === now ? undefined : d })} onOpen={open} onAdd={add} />)}
      {editing && (
        <Modal wide onClose={() => setEditing(null)}>
          <NotePanel key={editing.key} file={editing.file} initial={editing.initial} onClose={() => setEditing(null)} onDeleted={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}
