import { queryOptions } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
import type { Item, ItemPage, Suggestion } from '@/api/types';

/** Shuffles the list's order; kept until the page reloads, so the order stays put while working. */
export const SEED = Math.floor(Math.random() * 2 ** 32);

/** `attention`: only the items with problems, with false only those without */
export type ListParams = { q?: string; page?: number; attention?: boolean; tasks?: boolean; semantic?: boolean; focus?: string };

/** A page of items, or with `focus` the page holding that item. */
export const itemsQuery = (p: ListParams) => queryOptions({
  queryKey: ['items', p],
  queryFn: () => api<ItemPage>('GET', `/api/items?${new URLSearchParams({
    q: p.q ?? '', page: String(p.page ?? 0), seed: String(SEED),
    ...(p.attention !== undefined ? { attention: p.attention ? '1' : '0' } : {}), ...(p.tasks ? { tasks: '1' } : {}),
    ...(p.semantic ? { semantic: '1' } : {}), ...(p.focus ? { focus: p.focus } : {}),
  })}`),
});

export const itemQuery = (file: string) => queryOptions({
  queryKey: ['item', file],
  queryFn: () => api<Item>('GET', `/api/items/${enc(file)}`),
});

/** Notes matching `q` by heading, for linking; not `exclude`. */
export const searchQuery = (q: string, exclude: string[]) => queryOptions({
  queryKey: ['search', q, exclude],
  queryFn: () => api<Suggestion[]>('GET', `/api/search?${new URLSearchParams({ q, exclude: exclude.join(',') })}`),
});
