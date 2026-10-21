import { useState } from 'react';
import type { Item } from '@/api/types';
import { useMediaAttachment } from '@/features/item-media/useMediaAttachment';
import type { PendingOp } from '@/features/item-relate/relationModel';
import { useBibtexSources } from '@/features/source-bibtex/useBibtexSources';

/**
 * What's edited of a note and not written yet: its text, attachment, sources
 * pasted as BibTeX and staged relationship changes to other notes. It
 * follows a newer note while nothing is edited; `reset` starts it over.
 */
export function useNoteDraft(item: Item | null, initial: string, initialPending: PendingOp[] = []) {
  const [base, setBase] = useState({ text: item?.text ?? initial, media: item?.media ?? null });
  const [text, setText] = useState(base.text);
  const media = useMediaAttachment(base.media);
  const bib = useBibtexSources();
  const [pending, setPending] = useState(initialPending);
  const mediaChanged = media.attachment?.status === 'new' || (media.attachment === null) !== !base.media;
  const dirty = text !== base.text || mediaChanged || bib.staged.length > 0 || pending.length > 0;

  /** Starts over from `text` and `media` (as written, or to drop the edits); `keepPending` keeps what's staged for other notes. */
  function reset(next: { text: string; media: string | null }, keepPending = false) {
    setBase(next);
    setText(next.text);
    media.resetAttachment(next.media);
    bib.clear();
    if (!keepPending) setPending([]);
  }

  // a newer note while nothing is edited (another view wrote it): start from it
  const [seen, setSeen] = useState(item);
  if (item !== seen) {
    setSeen(item);
    if (item && !dirty && (item.text !== base.text || item.media !== base.media)) reset(item);
  }

  return { text, setText, media, bib, pending, setPending, dirty, reset, base };
}

export type NoteDraft = ReturnType<typeof useNoteDraft>;
