import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { SemanticStatus } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { useDebounced } from '@/dumb/useDebounced';
import { itemsQuery } from '@/entities/item/queries';
import { semanticStatusQuery } from '@/entities/ollama/queries';
import type { NotesSearch } from './search';

/** The list's page of items per the URL, following the background embedding while semantic search waits on it. */
export function useItemList(attention: boolean) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as NotesSearch;
  const q = search.q ?? '';
  const semantic = !!search.s;
  const page = search.page ?? 0;
  const debouncedQ = useDebounced(q, 200);
  /** the item last jumped to via a reference */
  const [focused, setFocused] = useState<string | null>(null);

  const setSearch = (next: NotesSearch) => navigate({ to: '.', search: next, replace: true });
  const params = { q: debouncedQ, page, attention, semantic };

  const list = useQuery({
    ...itemsQuery(params),
    placeholderData: keepPreviousData,
    // the ranking covers only what's embedded: retry while nothing is yet
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.semantic?.embedding && !d.items.length && semantic && q ? 2000 : false;
    },
  });
  const listStatus = list.data?.semantic ?? null;

  const polled = useQuery({
    ...semanticStatusQuery,
    enabled: semantic && !!listStatus?.embedding,
    refetchInterval: (query) => (query.state.data?.embedding ? 2000 : false),
  });
  const status: SemanticStatus | null = listStatus && (polled.dataUpdatedAt > list.dataUpdatedAt ? { ...listStatus, ...polled.data } : listStatus);

  // the list was ranked on what was embedded then: rank again once it's all done
  const embedding = status?.embedding;
  const wasEmbedding = useRef(false);
  useEffect(() => {
    if (wasEmbedding.current && embedding === false && semantic && q) qc.invalidateQueries({ queryKey: ['items'] });
    wasEmbedding.current = !!embedding;
  }, [embedding, semantic, q, qc]);

  useEffect(() => {
    if (focused && list.data?.items.some((i) => i.file === focused)) {
      document.getElementById('item:' + focused)?.scrollIntoView({ block: 'center' });
    }
  }, [focused, list.data]);

  /** Shows the page holding `file`; clears the query when it hides it. */
  async function jump(file: string) {
    try {
      let res = await qc.fetchQuery(itemsQuery({ ...params, q, focus: file }));
      let shownQ = q;
      if (!res.focused && q) {
        shownQ = '';
        res = await qc.fetchQuery(itemsQuery({ ...params, q: '', focus: file }));
      }
      if (!res.focused) throw new Error(`'${file}' not found`);
      qc.setQueryData(itemsQuery({ ...params, q: shownQ, page: res.page }).queryKey, res);
      setSearch({ ...search, q: shownQ || undefined, page: res.page || undefined });
      setFocused(file);
    } catch (e) { showError(e); }
  }

  return {
    q, semantic, page, focused, status, list: list.data,
    setQuery: (next: string) => setSearch({ ...search, q: next || undefined, page: undefined }),
    toggleSemantic: () => setSearch({ ...search, s: semantic ? undefined : true, page: undefined }),
    setPage: (p: number) => setSearch({ ...search, page: p || undefined }),
    jump,
    reload: () => qc.invalidateQueries({ queryKey: ['items'] }),
  };
}
