import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A modal, open while mounted; Escape and a click outside call `onClose`.
 * Not a top-layer <dialog>, so toasts (z-index above the modal's) stay usable over it.
 * Portaled to the body, so it covers the screen from inside transformed parents (the graph's nodes) too.
 * `box` replaces the box's width classes.
 */
export function Modal({ onClose, wide = false, box, children }: { onClose: () => void; wide?: boolean; box?: string; children: ReactNode }) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return createPortal(
    <div className="modal modal-open" role="dialog">
      <div className={`modal-box ${box ?? (wide ? 'max-w-3xl' : '')}`}>{children}</div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>,
    document.body,
  );
}
