import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import type { NoteGraph, PinSpec } from '@/api/types';
import { graphQuery, pinsQuery } from '@/entities/graph/queries';

export const MANUAL_PIN_DEPTH = 1;
export const SEARCH_RESULT_PIN_DEPTH = 2;
export const CREATED_NOTE_PIN_DEPTH = 1;
/** "Pin all" from search pins roots only, so a broad query doesn't flood the graph with neighbors. */
export const PIN_ALL_DEPTH = 0;
export const PIN_ALL_CAP = 100;

export interface UseNoteGraphResult {
  graph: NoteGraph | null;
  pins: ReadonlyMap<string, number>;
  /** The pins changed and their graph isn't there yet; a background refetch (focus, a write) doesn't count. */
  loading: boolean;
  pinNote: (filename: string, depth: number) => void;
  pinNotes: (filenames: readonly string[], depth: number) => void;
  unpinNote: (filename: string) => void;
  /** Keeps only `filename` pinned, at its depth. */
  unpinOthers: (filename: string) => void;
  setPinDepth: (filename: string, depth: number) => void;
  /** Pins `filename` at `depth` unless it is already pinned at least that deep. */
  pinAtLeast: (filename: string, depth: number) => void;
  clearPins: () => void;
}

/**
 * Owns the pinned-note set and the graph fetched for it. The pinned set is the real
 * input to the backend's graph query (see graph.py build) - there is no
 * client-side patch layer on top. It starts from the pins the server kept.
 */
export function useNoteGraph(): UseNoteGraphResult {
  const qc = useQueryClient();
  const stored = useSuspenseQuery(pinsQuery).data;
  const [pins, setPins] = useState<Map<string, number>>(() => new Map(stored.map((pin) => [pin.filename, pin.depth])));
  const specs = useMemo(() => toPinSpecs(pins), [pins]);
  const { data, isPlaceholderData, isFetching } = useQuery(graphQuery(specs));

  // the server keeps the pins with each graph request; this page starts from them when shown again
  useEffect(() => { qc.setQueryData(pinsQuery.queryKey, specs); }, [qc, specs]);

  const pinNote = useCallback((filename: string, depth: number) => {
    setPins((prev) => (prev.has(filename) ? prev : new Map(prev).set(filename, depth)));
  }, []);

  const pinNotes = useCallback((filenames: readonly string[], depth: number) => {
    setPins((prev) => {
      const missing = filenames.filter((filename) => !prev.has(filename));
      if (missing.length === 0) return prev;
      const next = new Map(prev);
      for (const filename of missing) next.set(filename, depth);
      return next;
    });
  }, []);

  const unpinNote = useCallback((filename: string) => {
    setPins((prev) => {
      if (!prev.has(filename)) return prev;
      const next = new Map(prev);
      next.delete(filename);
      return next;
    });
  }, []);

  const unpinOthers = useCallback((filename: string) => {
    setPins((prev) => {
      const depth = prev.get(filename);
      return depth === undefined || prev.size === 1 ? prev : new Map([[filename, depth]]);
    });
  }, []);

  const setPinDepth = useCallback((filename: string, depth: number) => {
    const clamped = Math.max(0, depth);
    setPins((prev) => (prev.has(filename) ? new Map(prev).set(filename, clamped) : prev));
  }, []);

  const pinAtLeast = useCallback((filename: string, depth: number) => {
    setPins((prev) => {
      const current = prev.get(filename);
      return current !== undefined && current >= depth ? prev : new Map(prev).set(filename, depth);
    });
  }, []);

  const clearPins = useCallback(() => setPins(new Map()), []);

  return {
    graph: data ?? null,
    pins,
    loading: isPlaceholderData && isFetching,
    pinNote,
    pinNotes,
    unpinNote,
    unpinOthers,
    setPinDepth,
    pinAtLeast,
    clearPins,
  };
}

function toPinSpecs(pins: Map<string, number>): PinSpec[] {
  return Array.from(pins, ([filename, depth]) => ({ filename, depth }));
}
