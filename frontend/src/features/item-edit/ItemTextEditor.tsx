import { useMemo } from 'react';
import { CodeMirrorHost } from '@/dumb/CodeMirrorHost';
import { dslExtensions } from '@/entities/item/dslExtensions';
import { useSchema } from '@/entities/item/schema';

type Props = {
  /** the text when mounted; remount (key) to replace it */
  initial: string;
  autofocus?: boolean;
  onChange: (text: string) => void;
  /** on blur and Mod-s */
  onSave: () => void;
};

/** An editor for item text, highlighted and linted as the item language. */
export function ItemTextEditor({ initial, autofocus, onChange, onSave }: Props) {
  const schema = useSchema();
  const extensions = useMemo(() => dslExtensions(schema), [schema]);
  return (
    <div onBlur={onSave}>
      <CodeMirrorHost initial={initial} extensions={extensions} autofocus={autofocus} onChange={onChange} onSave={onSave} />
    </div>
  );
}
