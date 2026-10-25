import { notice } from './notice';
import { dropUndo, pendingUndo, performUndo } from './undo';

/** The undo offer and the current notice or error, top right; a tap dismisses either. */
export function UndoToast() {
  const pending = pendingUndo.use();
  const message = notice.use();
  if (!pending && !message) return null;
  return (
    <div className="toast toast-top toast-end z-[1000]">
      {message && (
        <div role="alert" className={`alert ${message.error ? 'alert-error' : 'alert-info'} shadow-lg cursor-pointer`} onClick={() => notice.set(null)}>
          <span>{message.message}</span>
        </div>
      )}
      {pending && (
        <div className="alert shadow-lg cursor-pointer" onClick={dropUndo}>
          <span>{pending.message}</span>
          <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); void performUndo(); }}>Undo</button>
        </div>
      )}
    </div>
  );
}
