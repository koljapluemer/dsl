import { describe, expect, inject, it } from 'vitest';
import { canvasReducer, fromWire, newId, noteBody, toWire, type CanvasDoc, type CanvasNode } from './canvas-model';

const schema = inject('schema');
const text: CanvasNode = { id: 't', x: 0, y: 0, kind: 'text', text: 'hi' };
const note: CanvasNode = { id: 'n', x: 10, y: 20, kind: 'note', file: 'other.txt' };
const doc: CanvasDoc = { nodes: [text, note] };

describe('canvasReducer', () => {
  it('adds at the top, once per id', () => {
    const added = canvasReducer(doc, { type: 'add', node: { ...text, id: 'u' } });
    expect(added.nodes.map((n) => n.id)).toEqual(['t', 'n', 'u']);
    expect(canvasReducer(doc, { type: 'add', node: { ...note, id: 't' } })).toBe(doc);
  });

  it('moves, sets text and converts in place, keeping id and position', () => {
    expect(canvasReducer(doc, { type: 'move', id: 'n', x: 1, y: 2 }).nodes[1]).toEqual({ ...note, x: 1, y: 2 });
    expect(canvasReducer(doc, { type: 'setText', id: 't', text: 'yo' }).nodes[0]).toEqual({ ...text, text: 'yo' });
    expect(canvasReducer(doc, { type: 'toText', id: 'n', text: 'body' }).nodes[1]).toEqual({ id: 'n', x: 10, y: 20, kind: 'text', text: 'body' });
    expect(canvasReducer(doc, { type: 'toNote', id: 't', file: 'new.txt' }).nodes[0]).toEqual({ id: 't', x: 0, y: 0, kind: 'note', file: 'new.txt' });
  });

  it('leaves the doc as it is for nothing to change and for unknown ids', () => {
    expect(canvasReducer(doc, { type: 'move', id: 't', x: 0, y: 0 })).toBe(doc);
    expect(canvasReducer(doc, { type: 'setText', id: 'n', text: 'x' })).toBe(doc);
    for (const action of [
      { type: 'move', id: 'gone', x: 1, y: 1 }, { type: 'setText', id: 'gone', text: 'x' }, { type: 'remove', id: 'gone' },
      { type: 'toText', id: 'gone', text: 'x' }, { type: 'toNote', id: 'gone', file: 'x.txt' },
    ] as const) expect(canvasReducer(doc, action)).toBe(doc);
  });

  it('restores a removed node at its z-position, once', () => {
    const removed = canvasReducer(doc, { type: 'remove', id: 't' });
    expect(removed.nodes).toEqual([note]);
    const restored = canvasReducer(removed, { type: 'restore', node: text, index: 0 });
    expect(restored.nodes).toEqual(doc.nodes);
    expect(canvasReducer(restored, { type: 'restore', node: text, index: 0 })).toBe(restored);
    expect(canvasReducer(removed, { type: 'restore', node: text, index: 9 }).nodes.map((n) => n.id)).toEqual(['n', 't']);
  });
});

describe('wire format', () => {
  it('round-trips, names notes without .txt and rounds positions', () => {
    const wire = toWire({ nodes: [{ ...text, x: 1.6 }, note] });
    expect(wire).toEqual([{ id: 't', x: 2, y: 0, text: 'hi' }, { id: 'n', x: 10, y: 20, note: 'other' }]);
    expect(fromWire(wire)).toEqual({ nodes: [{ ...text, x: 2 }, note] });
  });
});

describe('newId', () => {
  it('is not taken', () => {
    expect(newId(doc)).toMatch(/^[a-z0-9]{8}$/);
  });
});

describe('noteBody', () => {
  it('is the body without the keyword section', () => {
    expect(noteBody(schema, 'Heading\nmore\n\ntags a\ndata\nx: 1\n')).toBe('Heading\nmore');
    expect(noteBody(schema, '')).toBe('');
  });
});
