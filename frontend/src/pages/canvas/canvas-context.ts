import { createContext, useContext } from 'react';
import type { Interaction } from './canvas-interaction';

/** What a node can do to the canvas; stable for the scene's life, so nodes don't re-render for it. */
export type CanvasActions = {
  startEdit: (id: string) => void;
  /** back to idle; an edited text node left empty is removed */
  toIdle: () => void;
  setText: (id: string, text: string) => void;
  /** off the canvas, with undo; a linked note stays as it is */
  remove: (id: string) => void;
  /** the linked note deleted and its node removed, both undone together */
  deleteNote: (id: string) => Promise<boolean>;
  toNote: (id: string) => void;
  toText: (id: string) => void;
};

export type CanvasContextValue = { interaction: Interaction; readOnly: boolean; actions: CanvasActions };

export const CanvasContext = createContext<CanvasContextValue | null>(null);

export function useCanvas() {
  const value = useContext(CanvasContext);
  if (!value) throw new Error('useCanvas outside a canvas');
  return value;
}
