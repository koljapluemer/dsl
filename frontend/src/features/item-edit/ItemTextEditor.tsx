import { useMemo, type MutableRefObject } from 'react';
import { Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
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
  /** pasted images and videos, instead of the editor */
  onPasteFiles?: (files: File[]) => void;
  currentFile?: string | null;
  /** the CodeMirror view, for tools acting on it (see insertReference) */
  editorRef?: MutableRefObject<EditorView | null>;
  /** Page-specific behavior layered after the shared DSL/reference extensions. */
  extraExtensions?: Extension[];
};

/** An editor for item text, highlighted and linted as the item language. */
export function ItemTextEditor({ value, autofocus, onChange, onSave, onPasteFiles, currentFile, editorRef, extraExtensions = [] }: Props) {
  const schema = useSchema();
  const hasPaste = !!onPasteFiles;
  const extensions = useMemo(() => [
    ...dslExtensions(schema),
    referenceCompletion(schema, currentFile),
    ...referenceLinks(schema),
    ...extraExtensions,
    // Mod-Enter saves (see onKeyDown) instead of the default keymap's blank line
    Prec.high(keymap.of([{ key: 'Mod-Enter', run: () => true }])),
    // Tab/Shift-Tab indent the line(s) instead of moving focus; Esc then Tab still moves it
    keymap.of([indentWithTab]),
    ...(hasPaste ? [EditorView.domEventHandlers({ paste: (event) => pastedMedia(event.clipboardData).length > 0 })] : []),
  ], [schema, hasPaste, currentFile, extraExtensions]);
  return (
    <div
      onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSave(); }}
      onPaste={onPasteFiles ? (event) => {
        const files = pastedMedia(event.clipboardData);
        if (files.length) { event.preventDefault(); onPasteFiles(files); }
      } : undefined}
    >
      <CodeMirrorHost value={value} extensions={extensions} autofocus={autofocus} onChange={onChange} onSave={onSave} editorRef={editorRef} />
    </div>
  );
}
