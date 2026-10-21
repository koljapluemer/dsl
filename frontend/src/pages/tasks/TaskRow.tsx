import type { Item } from '@/api/types';
import { Note } from '@/meta/note/Note';

/** A task item in its editor, written as focus leaves it. An unreadable item shows why instead. */
export function TaskRow({ item }: { item: Item }) {
  const unreadable = item.errors.find((e) => e.code === 'unreadable');
  if (unreadable) return <p className="text-error text-sm mb-4">unreadable note: {unreadable.detail}</p>;
  return <Note file={item.file} item={item} commit="blur" defaultMode="edit" persist={`tasks:${item.file}`} className="mb-4 rounded-box border border-base-300 p-3" />;
}
