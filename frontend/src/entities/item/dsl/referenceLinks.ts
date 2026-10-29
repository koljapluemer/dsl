import { type EditorState, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, showTooltip, type Tooltip, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { Schema } from '@/api/types';
import { noteHref } from '@/dumb/markdown';
import { analyze } from './analyze';
import { itemInlineReferences } from './inlineRefs';

const HINT = 'Ctrl/Cmd-click to open, middle-click for a new tab';

/** The note (without `.txt`) an inline reference or a relationship's `@target` at `pos` names. */
function targetAt(schema: Schema, state: EditorState, pos: number) {
  const text = state.doc.toString();
  const inline = itemInlineReferences(schema, text).find((r) => pos >= r.from && pos <= r.to);
  if (inline) return inline.target;
  const explicit = analyze(schema, text).segments.find((s) => s.cls === 'tok-target' && pos >= s.from && pos <= s.to);
  return explicit && text.slice(explicit.from + 1, explicit.to);
}

/**
 * Inline references marked as targets. Ctrl/Cmd-click on one, or on a relationship's
 * `@target`, opens it with `open`; middle-click opens it in a new tab. On touch screens,
 * with the cursor on one, an "open" button above it does what Ctrl/Cmd-click does.
 */
export function referenceLinks(schema: Schema, open: (file: string) => void) {
  const build = (view: EditorView) => Decoration.set(itemInlineReferences(schema, view.state.doc.toString()).map((r) =>
    Decoration.mark({ class: 'tok-target', attributes: { title: `${r.target}.txt — ${HINT}` } }).range(r.from, r.to)), true);

  const marks = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(u: ViewUpdate) { if (u.docChanged) this.decorations = build(u.view); }
  }, { decorations: (v) => v.decorations });

  const clicked = (event: MouseEvent, view: EditorView) => {
    const pos = view.posAtCoords(event);
    return pos === null ? undefined : targetAt(schema, view.state, pos);
  };

  const clicks = EditorView.domEventHandlers({
    mousedown(event, view) {
      const modified = (event.ctrlKey || event.metaKey) && event.button === 0;
      if (!modified && event.button !== 1) return false;
      const target = clicked(event, view);
      if (!target) return false;
      // a middle mousedown would start the browser's autoscroll; the tab opens on auxclick
      event.preventDefault();
      if (modified) open(`${target}.txt`);
      return true;
    },
    auxclick(event, view) {
      if (event.button !== 1) return false;
      const target = clicked(event, view);
      if (!target) return false;
      event.preventDefault();
      window.open(noteHref(`${target}.txt`), '_blank', 'noopener');
      return true;
    },
  });

  const tooltip = (state: EditorState): Tooltip | null => {
    const { head, empty } = state.selection.main;
    const target = empty ? targetAt(schema, state, head) : undefined;
    if (!target) return null;
    return {
      pos: head,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        // touch only: on a desktop Ctrl/Cmd-click does this
        dom.className = 'hidden pointer-coarse:block';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-ghost btn-xs';
        button.textContent = `open ${target}`;
        // keeps the editor focused (and the keyboard up) through the tap
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', () => open(`${target}.txt`));
        dom.append(button);
        return { dom };
      },
    };
  };

  const openButton = StateField.define<Tooltip | null>({
    create: tooltip,
    update: (value, tr) => (tr.docChanged || tr.selection ? tooltip(tr.state) : value),
    provide: (f) => showTooltip.from(f),
  });

  return [marks, clicks, openButton];
}
