import { useMemo } from 'react';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { CodeMirrorHost } from '@/dumb/CodeMirrorHost';
import { dslExtensions } from '@/entities/item/dslExtensions';
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
};

/** An editor for item text, highlighted and linted as the item language. */
export function ItemTextEditor({ initial, autofocus, onChange, onSave, saveOnBlur = true, onEscape, onPasteFile }: Props) {
  const schema = useSchema();
  const hasPaste = !!onPasteFile;
  const extensions = useMemo(() => [
    ...dslExtensions(schema),
    // Mod-Enter saves (see onKeyDown) instead of the default keymap's blank line
    Prec.high(keymap.of([{ key: 'Mod-Enter', run: () => true }])),
    ...(hasPaste ? [EditorView.domEventHandlers({ paste: (event) => pastedMedia(event.clipboardData) !== undefined })] : []),
  ], [schema, hasPaste]);
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
      <CodeMirrorHost initial={initial} extensions={extensions} autofocus={autofocus} onChange={onChange} onSave={onSave} />
    </div>
  );
}
