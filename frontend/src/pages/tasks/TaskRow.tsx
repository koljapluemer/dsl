import type { Item } from '@/api/types';
import { NotePanel } from '@/meta/note-panel/NotePanel';

/** A task item, rendered until edited. An unreadable item shows why instead. */
export function TaskRow({ item }: { item: Item }) {
  const unreadable = item.errors.find((e) => e.code === 'unreadable');
  if (unreadable) return <p className="text-error text-sm mb-4">{item.file}: {unreadable.detail}</p>;
  return <NotePanel file={item.file} item={item} className="mb-4 rounded-box border border-base-300 p-3" />;
}
