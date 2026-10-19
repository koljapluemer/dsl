import { notice } from './notice';
import { pendingUndo, performUndo } from './undo';

/** The undo offer and the current notice, top right. */
export function UndoToast() {
  const pending = pendingUndo.use();
  const message = notice.use();
  if (!pending && !message) return null;
  return (
    <div className="toast toast-top toast-end z-[1000]">
      {message && <div className="alert alert-info shadow-lg"><span>{message}</span></div>}
      {pending && (
        <div className="alert shadow-lg">
          <span>{pending.message}</span>
          <button className="btn btn-sm" onClick={() => void performUndo()}>Undo</button>
        </div>
      )}
    </div>
  );
}
