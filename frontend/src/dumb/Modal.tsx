import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal, open while mounted; Escape and a click outside call `onClose`.
 * Not a top-layer <dialog>, so toasts (z-index above the modal's) stay usable over it.
 */
export function Modal({ onClose, wide = false, children }: { onClose: () => void; wide?: boolean; children: ReactNode }) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="modal modal-open" role="dialog">
      <div className={`modal-box ${wide ? 'max-w-3xl' : ''}`}>{children}</div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
