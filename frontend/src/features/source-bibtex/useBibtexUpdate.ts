import { useState } from 'react';
import type { SourceConflict } from '@/api/types';
import { showNotice } from '@/dumb/notice';
import { mergeBibtex } from '@/entities/source/match';

type Pending = { file: string; bibtex: string; conflicts: SourceConflict[]; take: string[] };

/**
 * A source's draft text updated from the BibTeX in the clipboard: the fields it
 * lacks are filled in at once (`onText`), those it has otherwise wait as
 * `conflicts` (each taken from the BibTeX unless switched) until `apply`.
 * Nothing is written; the note saves the text as usual.
 */
export function useBibtexUpdate(onText: (text: string) => void) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fromClipboard(file: string, text: string) {
    setError(null);
    try {
      const bibtex = await navigator.clipboard.readText();
      const merged = await mergeBibtex(file, text, bibtex);
      if (merged.text !== text) onText(merged.text);
      if (merged.filled.length) showNotice(`filled ${merged.filled.join(', ')}`);
      else if (!merged.conflicts.length) showNotice('nothing new in the BibTeX');
      setPending(merged.conflicts.length ? { file, bibtex, conflicts: merged.conflicts, take: merged.conflicts.map((c) => c.field) } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const setTake = (field: string, take: boolean) =>
    setPending((p) => p && { ...p, take: take ? [...p.take, field] : p.take.filter((f) => f !== field) });

  /** Replaces the fields taken in `text`, the draft as it is now. */
  async function apply(text: string) {
    if (!pending) return;
    setError(null);
    try {
      const merged = await mergeBibtex(pending.file, text, pending.bibtex, pending.take);
      setPending(null);
      if (merged.text !== text) onText(merged.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const cancel = () => { setPending(null); setError(null); };

  return { conflicts: pending?.conflicts ?? [], take: pending?.take ?? [], error, fromClipboard, setTake, apply, cancel };
}
