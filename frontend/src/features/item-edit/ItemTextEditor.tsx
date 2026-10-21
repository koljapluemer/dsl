import { useMemo, useRef } from 'react';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { Link2 } from 'lucide-react';
import { CodeMirrorHost } from '@/dumb/CodeMirrorHost';
import { dslExtensions } from '@/entities/item/dslExtensions';
import { insertReference, referenceCompletion } from '@/entities/item/dsl/referenceCompletion';
import { pastedMedia } from '@/entities/item/media';
import { useSchema } from '@/entities/item/schema';

type Props = {
  /** the text when mounted; remount (key) to replace it */
  initial: string;
  autofocus?: boolean;
  onChange: (text: string) => void;
  /** on Mod-s and Mod-Enter, and on blur unless `saveOnBlur` is false */
  onSave: () => void;
  saveOnBlur?: boolean;
  /** Escape */
  onEscape?: () => void;
  onPasteFile?: (file: File) => void;
  currentFile?: string | null;
};

/** An editor for item text, highlighted and linted as the item language. */
export function ItemTextEditor({ initial, autofocus, onChange, onSave, saveOnBlur = true, onEscape, onPasteFile, currentFile }: Props) {
  const schema = useSchema();
  const editorRef = useRef<EditorView | null>(null);
  const hasPaste = !!onPasteFile;
  const extensions = useMemo(() => [
    ...dslExtensions(schema),
    referenceCompletion(schema, currentFile),
    // Mod-Enter saves (see onKeyDown) instead of the default keymap's blank line
    Prec.high(keymap.of([{ key: 'Mod-Enter', run: () => true }])),
    ...(hasPaste ? [EditorView.domEventHandlers({ paste: (event) => pastedMedia(event.clipboardData) !== undefined })] : []),
  ], [schema, hasPaste, currentFile]);
  return (
    <div
      onBlur={saveOnBlur ? onSave : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSave();
        else if (event.key === 'Escape') onEscape?.();
      }}
      onPaste={onPasteFile ? (event) => {
        const file = pastedMedia(event.clipboardData);
        if (file) { event.preventDefault(); onPasteFile(file); }
      } : undefined}
    >
      <div className="mb-1 flex justify-end">
        <button type="button" className="btn btn-ghost btn-xs" title="insert note reference" onMouseDown={(event) => event.preventDefault()}
                onClick={() => editorRef.current && insertReference(editorRef.current)}>
          <Link2 size={14} /> <span className="hidden sm:inline">Reference</span>
        </button>
      </div>
      <CodeMirrorHost initial={initial} extensions={extensions} autofocus={autofocus} onChange={onChange} onSave={onSave} editorRef={editorRef} />
    </div>
  );
}
