import { useQueryClient } from '@tanstack/react-query';
import { showError } from '@/dumb/errorBanner';
import { itemsChanged, restoreItem } from '@/entities/item/mutations';
import { dropUndo, lastDeleted } from './undoStore';

export function UndoDeleteToast() {
  const qc = useQueryClient();
  const deleted = lastDeleted.use();
  if (!deleted) return null;

  async function undo() {
    if (!deleted) return;
    try {
      await restoreItem(deleted);
      dropUndo();
      await itemsChanged(qc);
    } catch (e) { showError(e); }
  }

  return (
    <div className="toast toast-top toast-end z-50">
      <div className="alert shadow-lg">
        <span>{deleted.file} deleted</span>
        <button className="btn btn-sm" onClick={undo}>Undo</button>
      </div>
    </div>
  );
}
