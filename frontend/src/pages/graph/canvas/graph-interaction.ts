import type { InternalNode } from '@xyflow/react';

/**
 * What the user is currently doing on the canvas, beyond just looking at it.
 * A single union (rather than separate booleans/slots per gesture) makes the
 * mutually-exclusive states structurally mutually exclusive - you can't have a
 * new note AND a pending connection open at once, because there is only one
 * `interaction` value.
 */
export type Interaction = IdleInteraction | CreateInteraction | ConnectingInteraction | EditInteraction | SearchInteraction;

export interface IdleInteraction {
  type: 'idle';
}

/** A new note, in the new-note modal. */
export interface CreateInteraction {
  type: 'create';
  /** The note it starts related from (`source -> new`), or null for a freestanding note. */
  sourceFilename: string | null;
}

export interface ConnectingInteraction {
  type: 'connecting';
  source: string;
  target: string;
}

/** The note's card shows its editor. */
export interface EditInteraction {
  type: 'edit';
  filename: string;
}

export interface SearchInteraction {
  type: 'search';
  /** Viewport (clientX/clientY) coordinates of the right-click that opened this menu. */
  screenPosition: { x: number; y: number };
}

export const IDLE_INTERACTION: Interaction = { type: 'idle' };

/**
 * The note a connection drag ended on, or null when it didn't end on one.
 * React Flow resolves the drop to the nearest handle within `connectionRadius`
 * even if that handle isn't connectable, so the node it reports can be a
 * hidden-relations badge - which sits right under its note, so a drop that
 * lands on it means that note.
 */
export function connectionTargetFilename(toNode: InternalNode | null): string | null {
  if (!toNode) {
    return null;
  }
  return toNode.type === 'hiddenRelations' ? (toNode.parentId ?? null) : toNode.id;
}
