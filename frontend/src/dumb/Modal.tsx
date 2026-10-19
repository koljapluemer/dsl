import { useEffect, useRef, type ReactNode } from 'react';
import { showNotice, UNSAVED } from './notice';

/**
 * A modal, open while mounted; Escape and a click outside call `onClose`, or
 * only say so while `dirty` (they never save or discard edits).
 * Not a top-layer <dialog>, so toasts (z-index above the modal's) stay usable over it.
 */
export function Modal({ onClose, dirty, wide = false, children }: { onClose: () => void; dirty?: () => boolean; wide?: boolean; children: ReactNode }) {
  const dismiss = useRef(() => {});
  useEffect(() => { dismiss.current = () => (dirty?.() ? showNotice(UNSAVED) : onClose()); });
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss.current(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="modal modal-open" role="dialog">
      <div className={`modal-box ${wide ? 'max-w-3xl' : ''}`}>{children}</div>
      <div className="modal-backdrop" onClick={() => dismiss.current()} />
    </div>
  );
}
