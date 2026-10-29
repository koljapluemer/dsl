import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Item } from '@/api/types';

/** a new day starts at this local hour, not at midnight */
export const DAY_STARTS_AT = 4;

const pad = (n: number) => String(n).padStart(2, '0');

/** The local date `now` counts as, `yy-mm-dd` (the language's `date`); before DAY_STARTS_AT it's still the day before. */
export function dailyDate(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < DAY_STARTS_AT ? 1 : 0));
  return `${pad(d.getFullYear() % 100)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The daily note for `date`, created by the server when missing (repeating it
 * changes nothing); under `items`, so writes refetch it.
 */
export const dailyQuery = (date: string) => queryOptions({
  queryKey: ['items', 'daily', date],
  queryFn: () => api<Item>('POST', `/api/daily/${date}`),
});
