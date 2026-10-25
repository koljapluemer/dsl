import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Item } from '@/api/types';
import { showError } from '@/dumb/notice';
import { offerUndo } from '@/dumb/undo';
import { markDeleted } from '@/entities/item/deleted';
import { deleteItem, itemsChanged, restoreItem } from '@/entities/item/mutations';

/** Deletes an item, offering to undo it; resolves to whether it was deleted. */
export function useDeleteItem() {
  const qc = useQueryClient();
  return useCallback(async (item: Item) => {
    try {
      await deleteItem(item.file);
      // before anything refetches: the note's views and queries are done with it
      await markDeleted(qc, item.file);
      offerUndo('note deleted', async () => {
        await restoreItem(item);
        await itemsChanged(qc);
      });
      await itemsChanged(qc);
      return true;
    } catch (e) {
      showError(e);
      return false;
    }
  }, [qc]);
}
