import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Item } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { deleteItem, itemsChanged } from '@/entities/item/mutations';
import { offerUndo } from './undoStore';

/** Deletes an item, offering to undo it; resolves to whether it was deleted. */
export function useDeleteItem() {
  const qc = useQueryClient();
  return useCallback(async (item: Item) => {
    try {
      await deleteItem(item.file);
      offerUndo(item);
      await itemsChanged(qc);
      return true;
    } catch (e) {
      showError(e);
      return false;
    }
  }, [qc]);
}
