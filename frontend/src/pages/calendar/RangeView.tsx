import { Plus } from 'lucide-react';
import type { CalendarEntry } from '@/api/types';
import { entriesOn } from './calendar';
import { daysBetween, formatDayHeading, isDay, today, type Day } from './dates';
import { EntryRow } from './EntryRow';

type Props = {
  entries: CalendarEntry[];
  from: Day;
  to: Day;
  onRange: (from: Day, to: Day) => void;
  onOpen: (file: string) => void;
  onAdd: (day: Day) => void;
};

/** Every day of From..To (inclusive) with its items, empty days included. */
export function RangeView({ entries, from, to, onRange, onOpen, onAdd }: Props) {
  const now = today();
  // a From after To drags To along, and the other way round, so the range is never empty
  const pickFrom = (d: string) => isDay(d) && onRange(d, d > to ? d : to);
  const pickTo = (d: string) => isDay(d) && onRange(d < from ? d : from, d);
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <label className="input flex-1"><span className="label">From</span>
          <input type="date" value={from} onChange={(e) => pickFrom(e.target.value)} />
        </label>
        <label className="input flex-1"><span className="label">To</span>
          <input type="date" value={to} onChange={(e) => pickTo(e.target.value)} />
        </label>
      </div>
      {daysBetween(from, to).map((day) => {
        const items = entriesOn(entries, day);
        return (
          <section key={day} className="mt-4">
            <div className="flex items-center border-b border-base-300 pb-1">
              <h3 className={`flex-1 font-medium ${day === now ? 'text-primary font-bold' : ''}`}>
                {day === now ? `Today — ${formatDayHeading(day)}` : formatDayHeading(day)}
              </h3>
              <button className="btn btn-ghost btn-xs btn-square" title="add appointment" onClick={() => onAdd(day)}><Plus size={14} /></button>
            </div>
            {!items.length && <p className="text-base-content/50 py-2">Nothing</p>}
            {items.map((e) => <EntryRow key={e.file} entry={e} onOpen={onOpen} />)}
          </section>
        );
      })}
    </div>
  );
}
