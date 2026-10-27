import { autocompletion, startCompletion, type CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { api } from '@/api/client';
import type { NoteSearchPage, Schema } from '@/api/types';
import { firstLine } from './firstLine';
import { outline } from './outline';

const LIMIT = 8;

/** Autocomplete note targets after `[[`, but only in the body and `extra`. */
export const referenceCompletion = (schema: Schema, currentFile?: string | null) => autocompletion({
  override: [async (context): Promise<CompletionResult | null> => {
    const before = context.matchBefore(/\[\[[^\]|]*/);
    if (!before || !referencePosition(schema, context.state.doc.toString(), context.pos)) return null;
    const query = before.text.slice(2);
    const params = new URLSearchParams({ q: query, page: '0', orphan: 'any', regex: '0', limit: String(LIMIT) });
    if (currentFile) params.set('exclude', currentFile);
    const controller = new AbortController();
    context.addEventListener('abort', () => controller.abort(), { onDocChange: true });
    const found = await api<NoteSearchPage>('GET', `/api/search?${params}`, undefined, controller.signal);
    return {
      from: before.from + 2,
      validFor: /^[^\]|]*$/,
      options: found.results.map((result) => ({
        label: firstLine(schema, result.text).line || result.file,
        detail: result.file,
        apply: (view: EditorView, _completion: unknown, from: number, to: number) => {
          const target = result.file.replace(/\.txt$/, '');
          const suffix = view.state.sliceDoc(to, to + 2);
          view.dispatch({ changes: { from, to, insert: target + (suffix.startsWith(']]') || suffix.startsWith('|') ? '' : ']]') },
                          selection: { anchor: from + target.length } });
        },
      })),
    };
  }],
});

/** Insert an opener (wrapping selected text as its label) and show completion. */
export function insertReference(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const insert = selected ? `[[|${selected}]]` : '[[';
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + 2 } });
  view.focus();
  return startCompletion(view);
}

function referencePosition(schema: Schema, text: string, pos: number) {
  const { lines, starts, first, boundary, parts } = outline(schema, text);
  if (first >= 0 && pos >= starts[first] && (boundary >= starts.length || pos < starts[boundary])) return true;
  return parts.some(({ line, end, keyword }) => !!keyword && schema.keywords[keyword].block === 'text' && pos > starts[line] + lines[line].length
    && (end >= starts.length || pos < starts[end]));
}
