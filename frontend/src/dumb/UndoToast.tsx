import { showError } from './errorBanner';
import { dropUndo, pendingUndo } from './undo';

export function UndoToast() {
  const pending = pendingUndo.use();
  if (!pending) return null;

  async function undo() {
    if (!pending) return;
    try {
      await pending.perform();
      dropUndo();
    } catch (e) { showError(e); }
  }

  return (
    <div className="toast toast-top toast-end z-[1000]">
      <div className="alert shadow-lg cursor-pointer" onClick={dropUndo}>
        <span>{pending.message}</span>
        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); void undo(); }}>Undo</button>
      </div>
    </div>
  );
}
