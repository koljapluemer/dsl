import { useState } from 'react';
import { errorBanner, showError } from '@/dumb/errorBanner';
import { useSlashFocus } from '@/dumb/keys';
import { randomNote } from '@/entities/graph/mutations';
import { EMPTY_SEARCH, searchFilenames } from '@/entities/item/search/search';
import { useNoteSearch } from '@/entities/item/search/useNoteSearch';
import { NoteSearchSidebar } from '@/meta/note-search-sidebar/NoteSearchSidebar';
import { GraphCanvas } from './canvas/GraphCanvas';
import { MANUAL_PIN_DEPTH, PIN_ALL_CAP, PIN_ALL_DEPTH, SEARCH_RESULT_PIN_DEPTH, useNoteGraph } from './useNoteGraph';
import './graph.css';

/** Pinned notes and their relationships on a canvas, with a search beside it (the newest notes without a query). */
export function GraphPage() {
  const { graph, pins, loading: graphLoading, pinNote, pinNotes, unpinNote, setPinDepth, pinAtLeast, clearPins } = useNoteGraph();
  const [search, setSearch] = useState(EMPTY_SEARCH);
  const searching = search.query.trim() !== '';
  const [orphanBusy, setOrphanBusy] = useState(false);
  const [randomNoteBusy, setRandomNoteBusy] = useState(false);
  const [pinAllBusy, setPinAllBusy] = useState(false);
  const found = useNoteSearch(search, { scope: 'graph' });
  const searchInput = useSlashFocus();
  const { results } = found;

  const pinRandom = async (orphan: boolean, setBusy: (busy: boolean) => void, noneLeft: string) => {
    setBusy(true);
    try {
      const { filename } = await randomNote(Array.from(pins.keys()), orphan);
      if (filename) {
        pinNote(filename, MANUAL_PIN_DEPTH);
        errorBanner.set('');
      } else {
        errorBanner.set(noneLeft);
      }
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
      errorBanner.set(total > filenames.length ? `Pinned the first ${filenames.length} of ${total} matches.` : '');
    } catch (error) {
      showError(error);
    } finally {
      setPinAllBusy(false);
    }
  };

  const handleOpenRandomSearchResult = () => {
    if (!searching || results.length === 0) return;
    pinNote(results[Math.floor(Math.random() * results.length)].filename, SEARCH_RESULT_PIN_DEPTH);
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22rem]">
      <section className="relative min-h-0">
        <GraphCanvas
          graph={graph}
          loading={graphLoading}
          pins={pins}
          onPinNote={pinNote}
          onUnpinNote={unpinNote}
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

      <aside className="flex min-h-0 flex-col border border-base-300 bg-base-100/90 shadow-xl backdrop-blur">
        <NoteSearchSidebar state={search} onState={setSearch} found={found} historyKey="graph-search-history" marked={pins} inputRef={searchInput}
                           onSelect={(filename) => pinNote(filename, SEARCH_RESULT_PIN_DEPTH)} />
      </aside>
    </div>
  );
}
