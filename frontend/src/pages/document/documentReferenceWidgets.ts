import { StateEffect, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import type { Schema } from '@/api/types';
import { documentReferences, type DocumentReference } from './documentReferences';

const hoverEffect = StateEffect.define<number | null>();
const editEffect = StateEffect.define<string | null>();
const NEAR = 8;

class ReferenceWidget extends WidgetType {
  constructor(private ref: DocumentReference, private raw: string, private expanded: boolean, private activate: (id: string) => void) { super(); }

  eq(other: ReferenceWidget) {
    return this.ref.id === other.ref.id && this.ref.number === other.ref.number && this.ref.from === other.ref.from
      && this.ref.to === other.ref.to && this.raw === other.raw && this.expanded === other.expanded;
  }

  toDOM(view: EditorView) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'document-reference-widget';
    button.dataset.documentReference = this.ref.id;
    button.setAttribute('aria-label', `annotation ${this.ref.number}: ${this.ref.target}`);
    if (this.expanded) {
      button.classList.add('document-reference-widget-expanded');
      button.textContent = this.raw;
    } else {
      if (this.ref.label) {
        const label = document.createElement('span');
        label.textContent = this.ref.label;
        button.append(label);
      }
      const number = document.createElement('sup');
      number.textContent = String(this.ref.number);
      button.append(number);
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      this.activate(this.ref.id);
    });
    const edit = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ effects: editEffect.of(this.ref.id), selection: { anchor: Math.min(this.ref.from + 2, this.ref.to) } });
      view.focus();
    };
    button.addEventListener('dblclick', edit);
    button.addEventListener('keydown', (event) => { if (event.key === 'Enter') edit(event); });
    return button;
  }

  ignoreEvent() { return false; }
}

const distance = (pos: number, ref: DocumentReference) => pos < ref.from ? ref.from - pos : pos > ref.to ? pos - ref.to : 0;

/** Live-preview widgets for a document's inline references; the stored text is never changed. */
export function documentReferenceWidgets(schema: Schema, activate: (id: string) => void): Extension {
  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none;
    private hover: number | null = null;
    private editing: string | null = null;

    constructor(view: EditorView) { this.build(view); }

    update(update: ViewUpdate) {
      for (const effect of update.transactions.flatMap((tr) => tr.effects)) {
        if (effect.is(hoverEffect)) this.hover = effect.value;
        if (effect.is(editEffect)) this.editing = effect.value;
      }
      if (this.editing) {
        const editing = documentReferences(schema, update.state.doc.toString()).find((ref) => ref.id === this.editing);
        if (!editing || update.state.selection.ranges.every((range) => range.to < editing.from || range.from > editing.to)) this.editing = null;
      }
      if (update.docChanged || update.selectionSet || update.transactions.some((tr) => tr.effects.length)) this.build(update.view);
    }

    private build(view: EditorView) {
      const caret = view.state.selection.main.head;
      const ranges = documentReferences(schema, view.state.doc.toString()).flatMap((ref) => {
        if (ref.id === this.editing) return [];
        const expanded = distance(caret, ref) <= NEAR || (this.hover !== null && distance(this.hover, ref) <= NEAR);
        return [Decoration.replace({ widget: new ReferenceWidget(ref, view.state.sliceDoc(ref.from, ref.to), expanded, activate) }).range(ref.from, ref.to)];
      });
      this.decorations = Decoration.set(ranges, true);
    }
  }, {
    decorations: (value) => value.decorations,
    provide: (value) => EditorView.atomicRanges.of((view) => view.plugin(value)?.decorations ?? Decoration.none),
  });

  let frame = 0;
  const pointer = EditorView.domEventHandlers({
    pointermove(event, view) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => view.dispatch({ effects: hoverEffect.of(view.posAtCoords(event) ?? null) }));
      return false;
    },
    pointerleave(_event, view) {
      cancelAnimationFrame(frame);
      view.dispatch({ effects: hoverEffect.of(null) });
      return false;
    },
  });
  return [plugin, pointer];
}

