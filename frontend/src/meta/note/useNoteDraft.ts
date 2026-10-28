import { useState } from 'react';
import type { Item } from '@/api/types';
import { carryHeaders } from '@/entities/item/dsl/thea';
import { shownFiles } from '@/entities/item/files/files';
import { useSchema } from '@/entities/item/schema';
import { mediaChanged, mediaDraft, useMediaAttachments } from '@/features/item-media/useMediaAttachments';
import type { PendingOp } from '@/features/item-relate/relationModel';
import { useBibtexSources } from '@/features/source-bibtex/useBibtexSources';

const sameFiles = (a: string[], b: string[]) => a.length === b.length && a.every((f, i) => f === b[i]);

/**
 * What's edited of a note and not written yet: its text, images and videos, sources
 * pasted as BibTeX and staged relationship changes to other notes. It
 * follows a newer note while nothing is edited; `reset` starts it over.
 */
export function useNoteDraft(item: Item | null, initial: string, initialPending: PendingOp[] = []) {
  const schema = useSchema();
  const [base, setBase] = useState({ text: item?.text ?? initial, media: item ? shownFiles(item) : [] });
  const [text, setText] = useState(base.text);
  const media = useMediaAttachments(base.media);
  const bib = useBibtexSources();
  const [pending, setPending] = useState(initialPending);
  const mediaEdits = mediaDraft(base.media, media.entries);
  const dirty = text !== base.text || mediaChanged(mediaEdits) || bib.staged.length > 0 || pending.length > 0;

  /** Starts over from `text` and `files` (as written, or to drop the edits); `keepPending` keeps what's staged for other notes. */
  function reset(next: { text: string; files: string[] }, keepPending = false) {
    const shown = shownFiles(next);
    setBase({ text: next.text, media: shown });
    setText(next.text);
    media.reset(shown);
    bib.clear();
    if (!keepPending) setPending([]);
  }

  // a newer note while nothing is edited (another view wrote it): start from it; while
  // something is, keep the viz headers a generation rewrote (docs/thea.md)
  const [seen, setSeen] = useState(item);
  if (item !== seen) {
    setSeen(item);
    if (item && !dirty && (item.text !== base.text || !sameFiles(shownFiles(item), base.media))) reset(item);
    else if (item && dirty && item.text !== base.text) {
      const carried = carryHeaders(schema, text, base.text, item.text);
      if (carried !== text) {
        setText(carried);
        setBase({ ...base, text: carryHeaders(schema, base.text, base.text, item.text) });
      }
    }
  }

  return { text, setText, media, mediaEdits, bib, pending, setPending, dirty, reset };
}

export type NoteDraft = ReturnType<typeof useNoteDraft>;
