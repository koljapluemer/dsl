import { EditorView } from '@codemirror/view';

export const editorTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '0.9rem' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '0.75rem 0', minHeight: '12rem', caretColor: 'var(--color-base-content)' },
  '.cm-line': { padding: '0 1rem' },
  '.cm-cursor': { borderLeftColor: 'var(--color-base-content)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in oklab, var(--color-primary) 25%, transparent) !important' },
  '.cm-tooltip': { backgroundColor: 'var(--color-base-100)', color: 'var(--color-base-content)', border: '1px solid var(--color-base-300)' },
});
