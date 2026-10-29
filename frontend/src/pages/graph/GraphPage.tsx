import { useState } from 'react';
import { Pin } from 'lucide-react';
import { showError, showNotice } from '@/dumb/notice';
import { randomNote } from '@/entities/graph/mutations';
import { searchFilenames } from '@/entities/item/search/search';
import { useNoteSearch } from '@/entities/item/search/useNoteSearch';
import { useSidebarAction, useSidebarSearch } from '@/entities/item/sidebar';
import { GraphCanvas } from './canvas/GraphCanvas';
import { MANUAL_PIN_DEPTH, PIN_ALL_CAP, PIN_ALL_DEPTH, SEARCH_RESULT_PIN_DEPTH, useNoteGraph } from './useNoteGraph';
import './graph.css';

/** Pinned notes and their relationships on a canvas; the sidebar's results pin notes, and its query drives the toolbar's search actions. */
export function GraphPage() {
  const { graph, pins, loading: graphLoading, pinNote, pinNotes, unpinNote, unpinOthers, setPinDepth, pinAtLeast, clearPins } = useNoteGraph();
  const { state: search } = useSidebarSearch();
  const searching = search.query.trim() !== '';
  const [orphanBusy, setOrphanBusy] = useState(false);
  const [randomNoteBusy, setRandomNoteBusy] = useState(false);
  const [pinAllBusy, setPinAllBusy] = useState(false);
  const found = useNoteSearch(search, { scope: 'graph' });
  const { results } = found;
  useSidebarAction({ icon: <Pin size={14} />, title: 'pin', run: (file) => pinNote(file, SEARCH_RESULT_PIN_DEPTH), marked: pins });

  const pinRandom = async (orphan: boolean, setBusy: (busy: boolean) => void, noneLeft: string) => {
    setBusy(true);
    try {
      const { filename } = await randomNote(Array.from(pins.keys()), orphan);
      if (filename) pinNote(filename, MANUAL_PIN_DEPTH);
      else showNotice(noneLeft);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const handlePinAllSearchResults = async () => {
    setPinAllBusy(true);
    try {
      const { filenames, total } = await searchFilenames(search.query, { scope: 'graph', orphan: search.orphan, semantic: search.semantic }, PIN_ALL_CAP);
      pinNotes(filenames, PIN_ALL_DEPTH);
      if (total > filenames.length) showNotice(`Pinned the first ${filenames.length} of ${total} matches.`);
    } catch (error) {
      showError(error);
    } finally {
      setPinAllBusy(false);
    }
  };

  const handleOpenRandomSearchResult = () => {
    if (!searching || results.length === 0) return;
    pinNote(results[Math.floor(Math.random() * results.length)].file, SEARCH_RESULT_PIN_DEPTH);
  };

  return (
    <section className="relative min-h-0 flex-1">
      <GraphCanvas
        graph={graph}
        loading={graphLoading}
        pins={pins}
        onPinNote={pinNote}
        onUnpinNote={unpinNote}
        onUnpinOthers={unpinOthers}
        onSetPinDepth={setPinDepth}
        onPinAtLeast={pinAtLeast}
        onClearPins={clearPins}
        onPinRandomOrphan={() => void pinRandom(true, setOrphanBusy, 'No unopened orphan notes left to pin.')}
        pinRandomOrphanBusy={orphanBusy}
        onOpenRandomNote={() => void pinRandom(false, setRandomNoteBusy, 'No unopened notes left to open.')}
        openRandomNoteBusy={randomNoteBusy}
        onOpenRandomSearchResult={handleOpenRandomSearchResult}
        openRandomSearchResultDisabled={!searching || results.length === 0}
        onPinAllSearchResults={() => void handlePinAllSearchResults()}
        pinAllSearchResultsDisabled={!searching || found.total === 0 || pinAllBusy}
      />
    </section>
  );
}
