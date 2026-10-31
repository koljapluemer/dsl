import type { EditorView } from '@codemirror/view';
import type { Schema } from '@/api/types';
import { fenceEnd } from '@/dumb/fence';
import { textSpans } from './outline';

/** ```thea fences: a viz block's spec (docs/thea.md); mirrors dsl_crud/core/thea.py. */
const HEADER = /^([ \t]{0,3}(?:`{3,}|~{3,}))[ \t]*thea(?:[ \t]+(\S+))?[ \t]*$/;
const ID = /^([a-z]+-[a-z]+)(?:-([1-9][0-9]*))?$/;

export type TheaBlock = {
  /** 'body' or the text block's keyword */
  section: string;
  /** its place among the note's viz blocks */
  index: number;
  /** the line of its opening fence */
  line: number;
  /** null until it's first generated; version null until a generation succeeded */
  name: string | null;
  version: number | null;
  spec: string;
};

/** The current version's id, `<name>-<version>`, or null. */
export const theaId = (b: TheaBlock) => (b.name && b.version ? `${b.name}-${b.version}` : null);

/** Every closed thea fence in the body and the `text` blocks, in order. */
export function theaBlocks(schema: Schema, text: string): TheaBlock[] {
  if (!text.includes('thea')) return [];
  const lines = text.split('\n');
  const out: TheaBlock[] = [];
  for (const { keyword, start, end: stop } of textSpans(schema, text)) {
    for (let i = start; i < stop;) {
      const end = fenceEnd(lines, i);
      if (end < 0 || end >= stop) { i++; continue; }
      const m = HEADER.exec(lines[i]);
      if (m) {
        const id = ID.exec(m[2] ?? '');
        out.push({ section: keyword ?? 'body', index: out.length, line: i, name: id?.[1] ?? null,
                   version: id?.[2] ? Number(id[2]) : null, spec: lines.slice(i + 1, end).join('\n').trim() });
      }
      i = end + 1;
    }
  }
  return out;
}

/**
 * `draft` with the viz headers the server rewrote between `base` and `next`
 * (a name given, a version made) carried over, where the draft still has the
 * header `base` had: so saving an edit made meanwhile doesn't undo them.
 */
export function carryHeaders(schema: Schema, draft: string, base: string, next: string): string {
  const [was, now, mine] = [base, next, draft].map((t) => theaBlocks(schema, t));
  const lines = draft.split('\n');
  const header = (t: string, b: TheaBlock) => t.split('\n')[b.line];
  for (const b of mine) {
    const old = was[b.index], fresh = now[b.index];
    if (!old || !fresh || old.spec !== fresh.spec) continue;
    const before = header(base, old);
    if (header(draft, b) === before && header(next, fresh) !== before) lines[b.line] = header(next, fresh);
  }
  return lines.join('\n');
}

const PLACEHOLDER = 'Describe the visualization.';

/** Inserts an empty viz block on its own lines at the cursor, its placeholder spec selected. */
export function insertViz(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const before = from === line.from ? '' : '\n';
  const insert = `${before}\`\`\`thea\n${PLACEHOLDER}\n\`\`\`\n`;
  const start = from + before.length + '```thea\n'.length;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: start, head: start + PLACEHOLDER.length } });
  view.focus();
}
