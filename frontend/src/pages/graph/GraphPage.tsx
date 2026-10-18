import { useReducer, useState } from 'react';
import { errorBanner, showError } from '@/dumb/errorBanner';
import { randomNote, searchFilenames } from '@/entities/graph/mutations';
import { GraphCanvas } from './canvas/GraphCanvas';
import { Sidebar } from './sidebar/Sidebar';
import { INITIAL_SEARCH_STATE, searchReducer } from './sidebar/search-state';
import { MANUAL_PIN_DEPTH, PIN_ALL_CAP, PIN_ALL_DEPTH, SEARCH_RESULT_PIN_DEPTH, useNoteGraph } from './useNoteGraph';
import { useNoteSearch } from './useNoteSearch';
import { useSearchHistory } from './useSearchHistory';
import './graph.css';

/** Pinned notes and their relationships on a canvas, with search and recent notes beside it. */
export function GraphPage() {
  const { graph, pins, loading: graphLoading, pinNote, pinNotes, unpinNote, setPinDepth, pinAtLeast, clearPins } = useNoteGraph();
  const [search, dispatchSearch] = useReducer(searchReducer, INITIAL_SEARCH_STATE);
  const searchHistory = useSearchHistory();
  const [orphanBusy, setOrphanBusy] = useState(false);
  const [randomNoteBusy, setRandomNoteBusy] = useState(false);
  const [pinAllBusy, setPinAllBusy] = useState(false);
  const { results, total: searchTotal, loading: searchLoading } = useNoteSearch(search.criteria, { page: search.page });

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
      const { filenames, total } = await searchFilenames(search.criteria, PIN_ALL_CAP);
      pinNotes(filenames, PIN_ALL_DEPTH);
      searchHistory.record(search.criteria.query);
      errorBanner.set(total > filenames.length ? `Pinned the first ${filenames.length} of ${total} matches.` : '');
    } catch (error) {
      showError(error);
    } finally {
      setPinAllBusy(false);
    }
  };

  const handleSelectSearchResult = (filename: string) => {
    pinNote(filename, SEARCH_RESULT_PIN_DEPTH);
    searchHistory.record(search.criteria.query);
  };

  const handleOpenRandomSearchResult = () => {
    if (results.length === 0) return;
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
          openRandomSearchResultDisabled={results.length === 0}
          onPinAllSearchResults={() => void handlePinAllSearchResults()}
          pinAllSearchResultsDisabled={searchTotal === 0 || pinAllBusy}
        />
      </section>

      <Sidebar
        search={{
          state: search,
          dispatch: dispatchSearch,
          results,
          total: searchTotal,
          loading: searchLoading,
          history: searchHistory.history,
          onSelectNote: handleSelectSearchResult,
        }}
        pins={pins}
        onSelectNote={(filename) => pinNote(filename, SEARCH_RESULT_PIN_DEPTH)}
      />
    </div>
  );
}
