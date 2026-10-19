import { useEffect, useRef } from 'react';
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
  /** Mod-Enter, instead of inserting a blank line */
  onSubmit?: () => void;
};

/** A CodeMirror editor with history, line wrapping and the app's theme. */
export function CodeMirrorHost({ initial, extensions, autofocus = true, onChange, onSave, onSubmit }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onChange, onSave, onSubmit });
  useEffect(() => { handlers.current = { onChange, onSave, onSubmit }; });

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: () => { handlers.current.onSave(); return true; } },
            { key: 'Mod-Enter', run: () => { handlers.current.onSubmit?.(); return !!handlers.current.onSubmit; } },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          editorTheme,
          ...extensions,
          EditorView.updateListener.of((u) => { if (u.docChanged) handlers.current.onChange(u.state.doc.toString()); }),
        ],
      }),
    });
    if (autofocus) view.focus();
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted once, see `initial`
  }, []);

  return <div ref={host} className="rounded-box border border-base-300 focus-within:border-base-content/40" />;
}
