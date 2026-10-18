import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { linter } from '@codemirror/lint';
import type { Schema } from '@/api/types';
import { analyze } from './dsl/analyze';
import './item.css';

/** Highlighting and lint for item text; decorations are recomputed per change (items are a few lines). */
export function dslExtensions(schema: Schema) {
  const build = (view: EditorView) => Decoration.set(analyze(schema, view.state.doc.toString()).segments.map((s) =>
    Decoration.mark({ class: s.cls, attributes: s.title ? { title: s.title } : {} }).range(s.from, s.to)), true);

  const highlight = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(u: ViewUpdate) { if (u.docChanged) this.decorations = build(u.view); }
  }, { decorations: (v) => v.decorations });

  return [highlight, linter((view) => analyze(schema, view.state.doc.toString()).problems, { delay: 150 })];
}
