import { Modal } from '@/dumb/Modal';
import { showNotice } from '@/dumb/notice';
import { Note, type NoteProps } from './Note';

/**
 * A note in a modal, to edit it (or a new one): the note component, in the
 * editor first, with Save and Discard. Saving closes it with a notice, as
 * deleting does; Escape and a click outside close it while nothing is edited.
 */
export function NoteModal({ onClose, onSaved, onDeleted, ...note }: NoteProps & { onClose: () => void }) {
  return (
    <Modal wide onClose={onClose}>
      <Note defaultMode="edit" autofocus {...note} commit="explicit" onClose={onClose} onEscape={onClose}
            onSaved={(item) => { showNotice(note.file ? 'Note saved' : 'Note created'); onSaved?.(item); onClose(); }}
            onDeleted={() => { onDeleted?.(); onClose(); }} />
    </Modal>
  );
}
