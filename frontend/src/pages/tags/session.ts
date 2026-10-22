import { store } from '@/dumb/store';

/**
 * Per page load, as the zero app's per launch: a random sort key per file,
 * drawn once so a refetch keeps the cards in place and a new item lands at a
 * random position, and per tag the files marked done.
 */
const rank = new Map<string, number>();
export const done = store<ReadonlyMap<string, ReadonlySet<string>>>(new Map());

/** Done can't be undone. */
export const markDone = (tag: string, file: string) => {
  const files = done.get().get(tag) ?? new Set<string>();
  if (!files.has(file)) done.set(new Map(done.get()).set(tag, new Set([...files, file])));
};

/** `items` in session order, done ones last. */
export function ordered<T extends { file: string }>(items: T[], isDone: ReadonlySet<string>): T[] {
  for (const i of items) if (!rank.has(i.file)) rank.set(i.file, Math.random());
  const byRank = (a: T, b: T) => rank.get(a.file)! - rank.get(b.file)!;
  return [...items.filter((i) => !isDone.has(i.file)).sort(byRank), ...items.filter((i) => isDone.has(i.file)).sort(byRank)];
}
