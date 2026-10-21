import { useEffect, useRef, type MutableRefObject } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { editorTheme } from './editorTheme';

type Props = {
  /** the document when mounted; later changes are ignored, remount (key) to replace it */
  initial: string;
  extensions: Extension[];
  autofocus?: boolean;
  onChange: (doc: string) => void;
  /** Mod-s */
  onSave: () => void;
  editorRef?: MutableRefObject<EditorView | null>;
};

/** A CodeMirror editor with history, line wrapping and the app's theme. */
export function CodeMirrorHost({ initial, extensions, autofocus = true, onChange, onSave, editorRef }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onChange, onSave });
  useEffect(() => { handlers.current = { onChange, onSave }; });

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
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
    if (editorRef) editorRef.current = view;
    // a frame late: mounted mid-drag (a graph draft dropped on the canvas), React Flow is still settling focus
    const frame = autofocus ? requestAnimationFrame(() => view.focus()) : 0;
    return () => { cancelAnimationFrame(frame); if (editorRef) editorRef.current = null; view.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted once, see `initial`
  }, []);

  return <div ref={host} className="rounded-box border border-base-300 focus-within:border-base-content/40" />;
}
