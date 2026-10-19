import { queryOptions } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
import type { Backlink, Item, ItemPage } from '@/api/types';

/** Shuffles the list's order; kept until the page reloads, so the order stays put while working. */
export const SEED = Math.floor(Math.random() * 2 ** 32);

/** `attention`: only the items with problems, with false only those without */
export type ListParams = { page?: number; attention?: boolean; tasks?: boolean };

/** A page of items, in an order shuffled by SEED. */
export const itemsQuery = (p: ListParams) => queryOptions({
  queryKey: ['items', p],
  queryFn: () => api<ItemPage>('GET', `/api/items?${new URLSearchParams({
    page: String(p.page ?? 0), seed: String(SEED),
    ...(p.attention !== undefined ? { attention: p.attention ? '1' : '0' } : {}), ...(p.tasks ? { tasks: '1' } : {}),
  })}`),
});

export const itemQuery = (file: string) => queryOptions({
  queryKey: ['item', file],
  queryFn: () => api<Item>('GET', `/api/items/${enc(file)}`),
});

/** The relationships in other notes pointing to `file`; under `items`, so writes refetch it. */
export const backlinksQuery = (file: string) => queryOptions({
  queryKey: ['items', 'backlinks', file],
  queryFn: () => api<Backlink[]>('GET', `/api/items/${enc(file)}/backlinks`),
});
