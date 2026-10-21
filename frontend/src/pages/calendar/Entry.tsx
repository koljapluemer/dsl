import type { CalendarEntry } from '@/api/types';
import { Note } from '@/meta/note/Note';

/** An item under a day, inline, edited in a modal. */
export function Entry({ entry }: { entry: CalendarEntry }) {
  return <Note file={entry.file} item={entry} render="inline" className="border-b border-base-300 py-2" />;
}
