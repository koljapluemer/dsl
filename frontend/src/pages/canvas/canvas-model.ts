import type { Schema } from '@/api/types';
import { outline } from '@/entities/item/dsl/outline';

/**
 * A canvas as the page holds it: its nodes in z-order, each free text or a
 * linked note (its file, with `.txt`), at a flow position (the node's top left).
 */
export type CanvasNode = { id: string; x: number; y: number } & ({ kind: 'text'; text: string } | { kind: 'note'; file: string });
export type CanvasDoc = { readonly nodes: readonly CanvasNode[] };

/** A node as stored under `canvas.nodes` in the note's `data` (docs/canvas.md); a note named without `.txt`. */
export type WireNode = { id: string; x: number; y: number } & ({ text: string } | { note: string });

export type CanvasAction =
  | { type: 'add'; node: CanvasNode }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'setText'; id: string; text: string }
  | { type: 'remove'; id: string }
  /** a removed node back where it was in the z-order */
  | { type: 'restore'; node: CanvasNode; index: number }
  | { type: 'toText'; id: string; text: string }
  | { type: 'toNote'; id: string; file: string };

const replace = (doc: CanvasDoc, id: string, change: (node: CanvasNode) => CanvasNode | null): CanvasDoc => {
  const index = doc.nodes.findIndex((node) => node.id === id);
  if (index < 0) return doc;
  const next = change(doc.nodes[index]);
  if (next === doc.nodes[index]) return doc;
  const nodes = [...doc.nodes];
  if (next) nodes[index] = next;
  else nodes.splice(index, 1);
  return { nodes };
};

/**
 * Every change to a canvas. An action naming a node that isn't there (any
 * more) changes nothing and returns the same doc, so a late async result
 * (a conversion finishing after its node was removed) can't bring a node back
 * or duplicate one; adding or restoring an id that's there does nothing either.
 */
export function canvasReducer(doc: CanvasDoc, action: CanvasAction): CanvasDoc {
  switch (action.type) {
    case 'add':
      return doc.nodes.some((node) => node.id === action.node.id) ? doc : { nodes: [...doc.nodes, action.node] };
    case 'restore': {
      if (doc.nodes.some((node) => node.id === action.node.id)) return doc;
      const nodes = [...doc.nodes];
      nodes.splice(Math.max(0, Math.min(action.index, nodes.length)), 0, action.node);
      return { nodes };
    }
    case 'move':
      return replace(doc, action.id, (node) => node.x === action.x && node.y === action.y ? node : { ...node, x: action.x, y: action.y });
    case 'setText':
      return replace(doc, action.id, (node) => node.kind !== 'text' || node.text === action.text ? node : { ...node, text: action.text });
    case 'remove':
      return replace(doc, action.id, () => null);
    case 'toText':
      return replace(doc, action.id, ({ id, x, y }) => ({ id, x, y, kind: 'text', text: action.text }));
    case 'toNote':
      return replace(doc, action.id, ({ id, x, y }) => ({ id, x, y, kind: 'note', file: action.file }));
  }
}

export const fromWire = (nodes: readonly WireNode[]): CanvasDoc => ({
  nodes: nodes.map((node) => 'note' in node
    ? { id: node.id, x: node.x, y: node.y, kind: 'note', file: `${node.note}.txt` }
    : { id: node.id, x: node.x, y: node.y, kind: 'text', text: node.text }),
});

export const toWire = (doc: CanvasDoc): WireNode[] => doc.nodes.map((node) => {
  const at = { id: node.id, x: Math.round(node.x), y: Math.round(node.y) };
  return node.kind === 'note' ? { ...at, note: node.file.replace(/\.txt$/, '') } : { ...at, text: node.text };
});

/** An id not in the doc. */
export function newId(doc: CanvasDoc): string {
  const taken = new Set(doc.nodes.map((node) => node.id));
  for (;;) {
    const id = Math.random().toString(36).slice(2, 10);
    if (id.length === 8 && !taken.has(id)) return id;
  }
}

/** The files of the notes on the canvas. */
export const linkedFiles = (doc: CanvasDoc) => new Set(doc.nodes.flatMap((node) => node.kind === 'note' ? [node.file] : []));

/** A note's main content: its body, without the keyword section (as NoteContent shows it). */
export function noteBody(schema: Schema, text: string): string {
  const { lines, first, boundary } = outline(schema, text.trimEnd());
  return first < 0 ? '' : lines.slice(first, boundary).join('\n').trimEnd();
}
