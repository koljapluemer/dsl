import { useMemo } from 'react';
import { CodeMirrorHost } from '@/dumb/CodeMirrorHost';
import { dslExtensions } from '@/entities/item/dslExtensions';
import { useSchema } from '@/entities/item/schema';

type Props = {
  /** the text when mounted; remount (key) to replace it */
  initial: string;
  autofocus?: boolean;
  onChange: (text: string) => void;
  /** on Mod-s, and on blur unless `saveOnBlur` is false */
  onSave: () => void;
  saveOnBlur?: boolean;
};

/** An editor for item text, highlighted and linted as the item language. */
export function ItemTextEditor({ initial, autofocus, onChange, onSave, saveOnBlur = true }: Props) {
  const schema = useSchema();
  const extensions = useMemo(() => dslExtensions(schema), [schema]);
  return (
    <div onBlur={saveOnBlur ? onSave : undefined}>
      <CodeMirrorHost initial={initial} extensions={extensions} autofocus={autofocus} onChange={onChange} onSave={onSave} />
    </div>
  );
}
