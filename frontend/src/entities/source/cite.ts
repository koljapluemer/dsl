import type { EditorState, TransactionSpec } from '@codemirror/state';

/** The bibliography of every source, written before each Typst build (infrastructure/typst.py). */
export const BIBLIOGRAPHY_LINE = '#bibliography("/sources.bib", style: "association-for-computing-machinery")';

// Typst's reference syntax: letters, digits, `_` and `-`, also `.` and `:` inside
const REF_KEY = /^[\p{L}\p{N}_-]([\p{L}\p{N}_\-.:]*[\p{L}\p{N}_-])?$/u;

/** How a Typst document cites `key`: `@key`, or `#cite(label("…"))` for a key that isn't one. */
export const citation = (key: string) => (REF_KEY.test(key) ? `@${key}` : `#cite(label(${JSON.stringify(key)}))`);

export const hasBibliography = (text: string) => /#bibliography\(/.test(text);

/**
 * Cites `keys` in place of `from`–`to` (the selection by default), with the
 * bibliography appended when the document has none; the cursor after the citations.
 */
export function citeTransaction(state: EditorState, keys: string[], from = state.selection.main.from, to = state.selection.main.to): TransactionSpec {
  const insert = keys.map(citation).join(' ');
  const changes = [{ from, to, insert }];
  const text = state.doc.toString();
  if (!hasBibliography(text)) {
    const end = state.doc.length;
    changes.push({ from: end, to: end, insert: `${text.endsWith('\n') ? '\n' : '\n\n'}${BIBLIOGRAPHY_LINE}\n` });
  }
  return { changes, selection: { anchor: from + insert.length } };
}

/** `sources` with those in `preferred` first, in its order; the rest as they were. */
export function rankSources<T extends { file: string }>(sources: T[], preferred: string[]): T[] {
  const rank = new Map(preferred.map((f, i) => [f, i]));
  const first = sources.filter((s) => rank.has(s.file)).sort((a, b) => rank.get(a.file)! - rank.get(b.file)!);
  return [...first, ...sources.filter((s) => !rank.has(s.file))];
}
