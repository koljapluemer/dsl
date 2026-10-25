import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { markDeleted, markWritten } from './deleted';
import { itemsChanged } from './mutations';
import { backlinksQuery } from './queries';

const api = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', () => ({ api, enc: encodeURIComponent }));

describe('a deleted note', () => {
  it('has its backlinks left out of refetches while still shown, and back in once restored', async () => {
    api.mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // a view still showing the note, as the list it's in hasn't refetched yet
    const shown = new QueryObserver(qc, backlinksQuery('a.txt'));
    const unsubscribe = shown.subscribe(() => {});
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));

    await markDeleted(qc, 'a.txt');
    await itemsChanged(qc);
    expect(api).toHaveBeenCalledTimes(1);

    markWritten('a.txt');
    await itemsChanged(qc);
    expect(api).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
