import { useEffect, useRef, type MutableRefObject } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { editorTheme } from './editorTheme';

type Props = {
  /** the document; a value other than the editor's own (a change from outside) replaces it, undoably */
  value: string;
  extensions: Extension[];
  autofocus?: boolean;
  onChange: (doc: string) => void;
  /** Mod-s */
  onSave: () => void;
  editorRef?: MutableRefObject<EditorView | null>;
};

/** A CodeMirror editor with history, line wrapping and the app's theme. */
export function CodeMirrorHost({ value, extensions, autofocus = true, onChange, onSave, editorRef }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onChange, onSave });
  useEffect(() => { handlers.current = { onChange, onSave }; });

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { handlers.current.onSave(); return true; } }, ...defaultKeymap, ...historyKeymap]),
          editorTheme,
          ...extensions,
          EditorView.updateListener.of((u) => { if (u.docChanged) handlers.current.onChange(u.state.doc.toString()); }),
        ],
      }),
    });
    view.current = editor;
    if (editorRef) editorRef.current = editor;
    // a frame late: mounted mid-drag (a graph card), React Flow is still settling focus
    const frame = autofocus ? requestAnimationFrame(() => editor.focus()) : 0;
    return () => { cancelAnimationFrame(frame); if (editorRef) editorRef.current = null; view.current = null; editor.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted once; `value` is reconciled below
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className="rounded-box border border-base-300 focus-within:border-base-content/40" />;
}
