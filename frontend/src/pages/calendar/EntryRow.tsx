import type { CalendarEntry } from '@/api/types';

/** An entry under a day: its heading, the rest of its body muted beneath, and "weekly" on recurring ones. */
export function EntryRow({ entry, onOpen }: { entry: CalendarEntry; onOpen: (file: string) => void }) {
  return (
    <div className="py-2 border-b border-base-300 cursor-pointer hover:bg-base-200" onClick={() => onOpen(entry.file)}>
      <div className="flex gap-2">
        <span className="flex-1">{entry.heading}</span>
        {'recurring' in entry.when && <span className="text-xs text-base-content/50">weekly</span>}
      </div>
      {entry.details.length > 0 && <p className="text-sm text-base-content/50 whitespace-pre-wrap">{entry.details.join('\n')}</p>}
    </div>
  );
}
