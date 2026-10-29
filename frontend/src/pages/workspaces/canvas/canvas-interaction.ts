import type { CanvasDoc } from './canvas-model';

export type XY = { x: number; y: number };

/**
 * What's being done on the canvas beyond looking at it. One union, so the
 * states exclude each other by construction: one node edited at a time, no
 * edit while the search is open, a node converting takes no other action.
 */
export type Interaction =
  | { type: 'idle' }
  /** the node shows its editor */
  | { type: 'editing'; id: string }
  /** the search adding notes at `flow` (the `placed`-th one a step further), shown at `screen` */
  | { type: 'search'; screen: XY; flow: XY; placed: number }
  /** the node converts between text and note */
  | { type: 'busy'; id: string };

export const IDLE: Interaction = { type: 'idle' };

/** The interaction, idle when it's about a node no longer on the canvas: none can hang on a removed one. */
export function currentInteraction(interaction: Interaction, doc: CanvasDoc): Interaction {
  if (interaction.type !== 'editing' && interaction.type !== 'busy') return interaction;
  return doc.nodes.some((node) => node.id === interaction.id) ? interaction : IDLE;
}

/** where the search's `placed`-th note goes, so several don't stack */
export const SEARCH_STEP = 32;
