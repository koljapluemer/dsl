import { queryOptions } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
import type { Item, ItemPage } from '@/api/types';

/** Shuffles the list's order; kept until the page reloads, so the order stays put while working. */
export const SEED = Math.floor(Math.random() * 2 ** 32);

export type ListParams = { page?: number; attention?: boolean; tasks?: boolean };

/** A page of items, in an order shuffled by SEED. */
export const itemsQuery = (p: ListParams) => queryOptions({
  queryKey: ['items', p],
  queryFn: () => api<ItemPage>('GET', `/api/items?${new URLSearchParams({
    page: String(p.page ?? 0), seed: String(SEED),
    ...(p.attention ? { attention: '1' } : {}), ...(p.tasks ? { tasks: '1' } : {}),
  })}`),
});

export const itemQuery = (file: string) => queryOptions({
  queryKey: ['item', file],
  queryFn: () => api<Item>('GET', `/api/items/${enc(file)}`),
});
