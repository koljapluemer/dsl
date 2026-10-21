import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Item } from '@/api/types';
import { itemQuery } from '@/entities/item/queries';

/**
 * The note shown: as `given` (a list's), else fetched by `file`; in either
 * case as last written here (`adopt`) until a newer one is given. Null for a
 * new note not written yet, and while it loads.
 */
export function useNoteItem(file: string | null, given: Item | undefined) {
  const qc = useQueryClient();
  const fetching = !!file && !given;
  const fetched = useQuery({ ...itemQuery(file ?? ''), enabled: fetching });
  const [written, setWritten] = useState<{ item: Item; over: Item | undefined } | null>(null);
  // a note given since is newer
  const item = (fetching ? fetched.data : null) ?? (written && written.over === given ? written.item : given) ?? null;
  const adopt = (saved: Item) => {
    qc.setQueryData(itemQuery(saved.file).queryKey, saved);
    setWritten({ item: saved, over: given });
  };
  return { item, adopt, loading: fetching && fetched.isPending, error: fetched.error };
}
