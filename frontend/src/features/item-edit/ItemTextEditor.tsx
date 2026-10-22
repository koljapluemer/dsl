import { useMemo, type MutableRefObject } from 'react';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { CodeMirrorHost } from '@/dumb/CodeMirrorHost';
import { dslExtensions } from '@/entities/item/dslExtensions';
import { referenceCompletion } from '@/entities/item/dsl/referenceCompletion';
import { referenceLinks } from '@/entities/item/dsl/referenceLinks';
import { pastedMedia } from '@/entities/item/files/files';
import { useSchema } from '@/entities/item/schema';

type Props = {
  /** the text; a change from outside replaces the editor's (see CodeMirrorHost) */
  value: string;
  autofocus?: boolean;
  onChange: (text: string) => void;
  /** Mod-s and Mod-Enter */
  onSave: () => void;
  onPasteFile?: (file: File) => void;
  currentFile?: string | null;
  /** the CodeMirror view, for tools acting on it (see insertReference) */
  editorRef?: MutableRefObject<EditorView | null>;
};

/** An editor for item text, highlighted and linted as the item language. */
export function ItemTextEditor({ value, autofocus, onChange, onSave, onPasteFile, currentFile, editorRef }: Props) {
  const schema = useSchema();
  const hasPaste = !!onPasteFile;
  const extensions = useMemo(() => [
    ...dslExtensions(schema),
    referenceCompletion(schema, currentFile),
    ...referenceLinks(schema),
    // Mod-Enter saves (see onKeyDown) instead of the default keymap's blank line
    Prec.high(keymap.of([{ key: 'Mod-Enter', run: () => true }])),
    ...(hasPaste ? [EditorView.domEventHandlers({ paste: (event) => pastedMedia(event.clipboardData) !== undefined })] : []),
  ], [schema, hasPaste, currentFile]);
  return (
    <div
      onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSave(); }}
      onPaste={onPasteFile ? (event) => {
        const file = pastedMedia(event.clipboardData);
        if (file) { event.preventDefault(); onPasteFile(file); }
      } : undefined}
    >
      <CodeMirrorHost value={value} extensions={extensions} autofocus={autofocus} onChange={onChange} onSave={onSave} editorRef={editorRef} />
    </div>
  );
}
