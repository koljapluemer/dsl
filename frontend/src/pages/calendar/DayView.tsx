import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { CalendarEntry } from '@/api/types';
import { entriesOn } from './calendar';
import { addDays, formatDayHeading, isDay, today, type Day } from './dates';
import { Entry } from './Entry';

type Props = { entries: CalendarEntry[]; day: Day; onDay: (day: Day) => void; onAdd: (day: Day) => void };

/** The items of one day; the bar steps a day back or forward, picks a date, or jumps back to today. */
export function DayView({ entries, day, onDay, onAdd }: Props) {
  const now = today();
  const items = entriesOn(entries, day);
  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <button className="btn btn-square btn-ghost" title="previous day" onClick={() => onDay(addDays(day, -1))}><ChevronLeft size={20} /></button>
        <input type="date" className="input flex-1" value={day} onChange={(e) => isDay(e.target.value) && onDay(e.target.value)} />
        <button className="btn btn-ghost" disabled={day === now} onClick={() => onDay(now)}>Today</button>
        <button className="btn btn-square btn-ghost" title="next day" onClick={() => onDay(addDays(day, 1))}><ChevronRight size={20} /></button>
        <button className="btn btn-square" title="add appointment" onClick={() => onAdd(day)}><Plus size={20} /></button>
      </div>
      <h3 className={`font-medium border-b border-base-300 pb-1 ${day === now ? 'text-primary font-bold' : ''}`}>
        {day === now ? `Today — ${formatDayHeading(day)}` : formatDayHeading(day)}
      </h3>
      {!items.length && <p className="text-base-content/50 text-center my-8">Nothing on this day</p>}
      {items.map((e) => <Entry key={e.file} entry={e} />)}
    </div>
  );
}
