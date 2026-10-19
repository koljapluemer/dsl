import { useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import { CodeMirrorHost } from '@/dumb/CodeMirrorHost';
import { dslExtensions } from '@/entities/item/dslExtensions';
import { pastedMedia } from '@/entities/item/media';
import { useSchema } from '@/entities/item/schema';

type Props = {
  /** the text when mounted; remount (key) to replace it */
  initial: string;
  autofocus?: boolean;
  onChange: (text: string) => void;
  /** on Mod-s, and on blur unless `saveOnBlur` is false */
  onSave: () => void;
  saveOnBlur?: boolean;
  onPasteFile?: (file: File) => void;
};

/** An editor for item text, highlighted and linted as the item language. */
export function ItemTextEditor({ initial, autofocus, onChange, onSave, saveOnBlur = true, onPasteFile }: Props) {
  const schema = useSchema();
  const extensions = useMemo(() => [
    ...dslExtensions(schema),
    ...(onPasteFile ? [EditorView.domEventHandlers({ paste: (event) => pastedMedia(event.clipboardData) !== undefined })] : []),
  ], [schema, onPasteFile]);
  return (
    <div
      onBlur={saveOnBlur ? onSave : undefined}
      onPaste={onPasteFile ? (event) => {
        const file = pastedMedia(event.clipboardData);
        if (file) { event.preventDefault(); onPasteFile(file); }
      } : undefined}
    >
      <CodeMirrorHost initial={initial} extensions={extensions} autofocus={autofocus} onChange={onChange} onSave={onSave} />
    </div>
  );
}
