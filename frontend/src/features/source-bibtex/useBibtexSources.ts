import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SourceMatch } from '@/api/types';
import { itemsChanged } from '@/entities/item/mutations';
import { matchBibtex, resolveSources } from '@/entities/source/match';

/** The relationship label a note gets to each source it's given. */
export const SOURCE_LABEL = 'source';

/** A pasted source and what it becomes: the existing source `choice`, or a new one when null. */
export type StagedSource = SourceMatch & { choice: string | null };

/** Fairly sure: preselected. */
const preselect = (m: SourceMatch) => (m.candidates[0] && m.candidates[0].level !== 'possible' ? m.candidates[0].file : null);

/**
 * Sources pasted as BibTeX, each matched against the existing ones, nothing
 * written until `apply`. Applied rows then point at their sources, so applying
 * again (a retry after the note failed to save) creates nothing twice.
 */
export function useBibtexSources() {
  const qc = useQueryClient();
  const [staged, setStaged] = useState<StagedSource[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** Stages the clipboard's entries; returns all staged rows, null on failure. */
  async function fromClipboard() {
    setError(null);
    try {
      const rows = [...staged, ...(await matchBibtex(await navigator.clipboard.readText())).map((m) => ({ ...m, choice: preselect(m) }))];
      setStaged(rows);
      return rows;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  const setChoice = (i: number, choice: string | null) => setStaged((s) => s.map((r, j) => (j === i ? { ...r, choice } : r)));
  const remove = (i: number) => setStaged((s) => s.filter((_, j) => j !== i));
  const clear = () => { setStaged([]); setError(null); };

  /** Creates the new sources; with `text`, returns it related to every source. Rejects on failure. */
  async function apply(text?: string, rows = staged) {
    const result = await resolveSources(rows.map((r) => (r.choice ? { file: r.choice } : { source: r.source })),
      text, text === undefined ? undefined : SOURCE_LABEL);
    setStaged(rows.map((r, i) => {
      const s = result.sources[i];
      const known = r.candidates.some((c) => c.file === s.file);
      return { ...r, choice: s.file, candidates: known ? r.candidates : [{ file: s.file, key: s.key, title: s.title, level: 'same', reasons: [], item: s.item }, ...r.candidates] };
    }));
    await itemsChanged(qc);
    return result;
  }

  return { staged, error, fromClipboard, setChoice, remove, clear, apply };
}
