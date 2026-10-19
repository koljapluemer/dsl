import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Item } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { offerUndo } from '@/dumb/undo';
import { deleteItem, itemsChanged, restoreItem } from '@/entities/item/mutations';

/** Deletes an item, offering to undo it; resolves to whether it was deleted. */
export function useDeleteItem() {
  const qc = useQueryClient();
  return useCallback(async (item: Item) => {
    try {
      await deleteItem(item.file);
      offerUndo(`${item.file} deleted`, async () => {
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
