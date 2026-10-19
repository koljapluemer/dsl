import { useEffect, useRef, useState } from 'react';
import { NoteSearch } from '@/entities/item/search/NoteSearch';
import { EMPTY_SEARCH } from '@/entities/item/search/search';
import { useNoteSearch } from '@/entities/item/search/useNoteSearch';

export interface PaneSearchMenuProps {
  /** Viewport (clientX/clientY) coordinates of the right-click that opened this menu. */
  screenPosition: { x: number; y: number };
  pins: ReadonlyMap<string, number>;
  onSelectNote: (filename: string) => void;
  onClose: () => void;
}

/**
 * The right-click "open note here" popover: the sidebar's search, anchored at
 * the cursor, its first page only. Picking a result doesn't close the menu -
 * the query stays put so the same search can pin several matches in a row
 * without retyping it. Only Escape or clicking elsewhere closes it.
 */
export function PaneSearchMenu({ screenPosition, pins, onSelectNote, onClose }: PaneSearchMenuProps) {
  const [search, setSearch] = useState(EMPTY_SEARCH);
  const found = useNoteSearch(search, { scope: 'graph', browse: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // deferred a frame: React Flow may still be settling focus after the right-click
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className="nodrag nopan nowheel fixed z-50 flex max-h-80 w-80 flex-col border border-base-300 bg-base-100 p-3 shadow-xl"
      style={{ left: screenPosition.x, top: screenPosition.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <NoteSearch state={search} onState={setSearch} found={found} compact pager={false} marked={pins} inputRef={inputRef}
                  placeholder="Open a note here…" onSelect={onSelectNote} onEscape={onClose} />
    </div>
  );
}
