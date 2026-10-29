import type { Item } from '@/api/types';
import { Modal } from '@/dumb/Modal';
import { TypstEditor, type BibtexTool } from './TypstEditor';

/** A Typst file the note names, in a modal: its source beside its PDF (one at a time on a narrow screen). */
export function TypstModal({ path, note, noteDirty, onItem, onClose, bibtexTool }: {
  path: string; note: Item; noteDirty: boolean; onItem: (item: Item) => void; onClose: () => void;
  bibtexTool?: BibtexTool;
}) {
  return (
    <Modal onClose={onClose} box="flex h-[90vh] w-11/12 max-w-6xl flex-col p-4">
      <TypstEditor path={path} note={note} noteDirty={noteDirty} onItem={onItem} split onClose={onClose} bibtexTool={bibtexTool} />
    </Modal>
  );
}
