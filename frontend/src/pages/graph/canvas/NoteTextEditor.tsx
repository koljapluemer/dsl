import { useMemo, useState } from 'react';
import { Prec } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap } from '@codemirror/view';
import { CodeMirrorHost } from '@/dumb/CodeMirrorHost';
import { analyze } from '@/entities/item/dsl/analyze';
import { dslExtensions } from '@/entities/item/dslExtensions';
import { pastedMedia } from '@/entities/item/media';
import { useSchema } from '@/entities/item/schema';

export interface NoteTextEditorProps {
  initialText: string;
  onChange: (text: string) => void;
  /** Mod-Enter (and Mod-s). */
  onSubmit: () => void;
  /** Escape. */
  onCancel: () => void;
  /** A pasted image or video, instead of inserting anything. */
  onPasteFile: (file: File) => void;
}

/**
 * A note file's full text in the app's item-language editor (highlighting,
 * inline lint, hovers), with the problems listed below it.
 */
export function NoteTextEditor({ initialText, onChange, onSubmit, onCancel, onPasteFile }: NoteTextEditorProps) {
  const schema = useSchema();
  const [text, setText] = useState(initialText);

  const extensions = useMemo(
    () => [
      ...dslExtensions(schema),
      // Mod-Enter saves (see the wrapper's onKeyDown) instead of the default keymap's blank line.
      Prec.high(keymap.of([{ key: 'Mod-Enter', run: () => true }])),
      // A pasted image or video is the wrapper's (see onPaste), not text to insert.
      EditorView.domEventHandlers({ paste: (event) => pastedMedia(event.clipboardData) !== undefined }),
      // Focus deferred a frame, like the draft card's textarea: React Flow may still be settling focus when this mounts.
      ViewPlugin.define((view) => {
        const frame = requestAnimationFrame(() => view.focus());
        return { destroy: () => cancelAnimationFrame(frame) };
      }),
    ],
    [schema],
  );

  const problems = useMemo(
    () => analyze(schema, text).problems.map((p) => ({ ...p, line: text.slice(0, p.from).split('\n').length })),
    [schema, text],
  );

  return (
    <div
      className="nodrag nowheel nopan"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') onCancel();
        else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSubmit();
      }}
      onPaste={(event) => {
        const file = pastedMedia(event.clipboardData);
        if (file) {
          event.preventDefault();
          onPasteFile(file);
        }
      }}
    >
      <div className="raw-note-editor text-sm">
        <CodeMirrorHost
          initial={initialText}
          extensions={extensions}
          autofocus={false}
          onChange={(next) => {
            setText(next);
            onChange(next);
          }}
          onSave={onSubmit}
        />
      </div>
      {problems.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs">
          {problems.map((problem, index) => (
            <li key={index} className={problem.severity === 'warning' ? 'text-warning' : 'text-error'}>
              Line {problem.line}: {problem.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
