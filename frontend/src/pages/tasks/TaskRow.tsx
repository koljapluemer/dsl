import type { Item } from '@/api/types';
import { NotePanel } from '@/meta/note-panel/NotePanel';

/** A task item, rendered until edited. */
export function TaskRow({ item }: { item: Item }) {
  return <NotePanel file={item.file} item={item} className="mb-4 rounded-box border border-base-300 p-3" />;
}
