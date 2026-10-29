import { useEffect, useRef, useState } from 'react';
import { NoteSearch } from '@/entities/item/search/NoteSearch';
import { EMPTY_SEARCH } from '@/entities/item/search/search';
import { useNoteSearch } from '@/entities/item/search/useNoteSearch';
import type { XY } from './canvas-interaction';

/**
 * The search adding notes to the canvas, anchored at `screen`. Picking one
 * keeps it open, so one query can add several; Escape or a click elsewhere
 * closes it.
 */
export function PaneSearchMenu({ screen, marked, onSelect, onClose }: {
  screen: XY;
  marked: { has: (file: string) => boolean };
  onSelect: (file: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(EMPTY_SEARCH);
  const found = useNoteSearch(search, { scope: 'all', browse: false });
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // a frame late: React Flow may still be settling focus after the right-click
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onClose]);

  return (
    <div ref={root} className="nodrag nopan nowheel fixed z-50 flex max-h-80 w-80 max-w-[calc(100vw-2rem)] flex-col border border-base-300 bg-base-100 p-3 shadow-xl"
         style={{ left: Math.min(screen.x, window.innerWidth - 336), top: screen.y }} onContextMenu={(event) => event.preventDefault()}>
      <NoteSearch state={search} onState={setSearch} found={found} compact pager={false} marked={marked} inputRef={input}
                  placeholder="Add a note here…" onSelect={onSelect} onEscape={onClose} />
    </div>
  );
}
