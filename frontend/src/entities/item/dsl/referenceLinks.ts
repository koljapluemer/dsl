import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { Schema } from '@/api/types';
import { analyze } from './analyze';
import { itemInlineReferences } from './inlineRefs';

const HINT = 'Ctrl/Cmd-click to open';

/** Inline references marked as targets; Ctrl/Cmd-click on one, or on a relationship's `@target`, opens it in a new tab. */
export function referenceLinks(schema: Schema) {
  const build = (view: EditorView) => Decoration.set(itemInlineReferences(schema, view.state.doc.toString()).map((r) =>
    Decoration.mark({ class: 'tok-target', attributes: { title: `${r.target}.txt — ${HINT}` } }).range(r.from, r.to)), true);

  const marks = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(u: ViewUpdate) { if (u.docChanged) this.decorations = build(u.view); }
  }, { decorations: (v) => v.decorations });

  const targetAt = (view: EditorView, pos: number) => {
    const text = view.state.doc.toString();
    const inline = itemInlineReferences(schema, text).find((r) => pos >= r.from && pos <= r.to);
    if (inline) return inline.target;
    const explicit = analyze(schema, text).segments.find((s) => s.cls === 'tok-target' && pos >= s.from && pos <= s.to);
    return explicit && text.slice(explicit.from + 1, explicit.to);
  };

  const open = EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
      const pos = view.posAtCoords(event);
      const target = pos === null ? undefined : targetAt(view, pos);
      if (!target) return false;
      event.preventDefault();
      window.open(`/edit/${encodeURIComponent(`${target}.txt`)}`, '_blank', 'noopener');
      return true;
    },
  });

  return [marks, open];
}
