import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { ChevronLeft, ChevronRight, CircleHelp, LoaderCircle, Search } from 'lucide-react';
import type { OrphanFilter } from '@/api/types';
import { NoteResult } from './NoteResult';
import { SearchHelpModal } from './SearchHelpModal';
import { withQuery, type SearchState } from './search';
import type { NoteSearch as Found } from './useNoteSearch';
import { useSearchHistory } from './useSearchHistory';

type Props = {
  state: SearchState;
  onState: (state: SearchState) => void;
  /** what useNoteSearch found for `state` */
  found: Found;
  /** `list`: the results below the field, paged; `suggest`: a dropdown under it while there's a query */
  variant?: 'list' | 'suggest';
  /** `full`: the query language with regexes, explained behind `?`; `words`: no regexes and no help */
  syntax?: 'full' | 'words';
  /** a toggle to rank by meaning instead */
  semanticToggle?: boolean;
  /** a filter by whether a note has relationships */
  orphanFilter?: boolean;
  /** local storage key of the queries acted on, offered as suggestions; none without */
  historyKey?: string;
  /** notes to set apart (open, pinned) */
  marked?: { has: (file: string) => boolean };
  onSelect: (file: string) => void;
  /** a button beside the field acting on its text; Enter does it while no result is chosen with the arrow keys */
  action?: { label: ReactNode; title: string; run: (text: string) => void };
  /** Escape; without it, Escape only closes the dropdown */
  onEscape?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** pages through the results (`list`); else only the first page shows */
  pager?: boolean;
  compact?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** under the field, e.g. why semantic search isn't ranking */
  children?: ReactNode;
};

const ORPHAN_OPTIONS: { value: OrphanFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'orphan', label: 'Yes' },
  { value: 'connected', label: 'No' },
];

/**
 * The one way to find a note: a field searching as you type, with ↑/↓ to
 * choose a result and Enter to pick it (the first one when none is chosen).
 */
export function NoteSearch({
  state, onState, found, variant = 'list', syntax = 'full', semanticToggle = false, orphanFilter = false, historyKey,
  marked, onSelect, action, onEscape, placeholder = 'Search notes…', autoFocus = false, disabled = false, pager = true,
  compact = false, inputRef, children,
}: Props) {
  const { results, total, pageSize, loading } = found;
  const query = state.query.trim();
  const history = useSearchHistory(historyKey);
  const historyId = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  /** the chosen result and Escape, both for the current query only */
  const [active, setActive] = useState({ query: '', index: -1 });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const at = active.query === query ? active.index : -1;
  const suggest = variant === 'suggest';
  const shown = suggest && (!query || dismissed === query) ? [] : results;

  const pick = (file: string) => {
    history.record(state.query);
    onSelect(file);
  };

  function keydown(event: React.KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    const n = shown.length;
    if (event.key === 'ArrowDown' && n) {
      event.preventDefault();
      setActive({ query, index: (at + 1) % n });
    } else if (event.key === 'ArrowUp' && n) {
      event.preventDefault();
      setActive({ query, index: at <= 0 ? n - 1 : at - 1 });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (at >= 0 && at < n) pick(shown[at].filename);
      else if (action) { if (query) action.run(query); }
      else if (shown[0]) pick(shown[0].filename);
    } else if (event.key === 'Escape') {
      if (onEscape) onEscape();
      else setDismissed(query);
    }
  }

  const field = (
    <label className={`input min-w-0 flex-1 ${suggest && action ? 'join-item' : ''} ${compact ? 'input-sm' : ''}`}>
      <Search className="size-4 shrink-0 text-base-content/60" />
      <input
        ref={inputRef}
        value={state.query}
        list={history.history.length ? historyId : undefined}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => { onState(withQuery(state, event.target.value)); setDismissed(null); }}
        onKeyDown={keydown}
      />
      {loading ? <LoaderCircle className="size-4 shrink-0 animate-spin text-base-content/60" /> : null}
    </label>
  );

  const head = (
    <>
      <div className={`flex items-center ${suggest && action ? 'join w-full' : 'gap-2'}`}>
        {field}
        {action && (
          <button type="button" className={`btn ${suggest ? 'join-item' : ''} ${compact ? 'btn-sm' : ''}`} disabled={disabled || !query} title={action.title}
                  onClick={() => action.run(query)}>
            {action.label}
          </button>
        )}
        {syntax === 'full' && (
          <button type="button" className="btn btn-ghost btn-square btn-sm" title="Search syntax" onClick={() => setHelpOpen(true)}>
            <CircleHelp className="size-4.5" />
          </button>
        )}
      </div>
      {history.history.length > 0 && (
        <datalist id={historyId}>
          {history.history.map((entry) => <option key={entry} value={entry} />)}
        </datalist>
      )}
      {(semanticToggle || orphanFilter) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/70">
          {semanticToggle && (
            <label className="flex items-center gap-2">
              <input type="checkbox" className="toggle toggle-xs" checked={state.semantic}
                     onChange={() => onState({ ...state, semantic: !state.semantic, page: 0 })} />
              semantic
            </label>
          )}
          {orphanFilter && (
            <label className="flex items-center gap-2">
              orphan
              <select className="select select-xs w-20" value={state.orphan}
                      onChange={(event) => onState({ ...state, orphan: event.target.value as OrphanFilter, page: 0 })}>
                {ORPHAN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {children}
      {helpOpen && <SearchHelpModal onClose={() => setHelpOpen(false)} />}
    </>
  );

  const list = shown.map((result, i) => (
    <NoteResult key={result.filename} result={result} marked={!!marked?.has(result.filename)} active={i === at} compact={compact || suggest}
                onSelect={() => pick(result.filename)} />
  ));

  if (suggest) {
    return (
      <div className="relative w-full">
        {head}
        {list.length > 0 && <div className="mt-1 max-h-72 space-y-1 overflow-y-auto rounded-box bg-base-200 p-1">{list}</div>}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={compact ? '' : 'border-b border-base-300 px-4 pt-4 pb-3'}>{head}</div>
      <ResultList page={state.page} pageCount={pager ? Math.ceil(total / pageSize) : 1} loading={loading} compact={compact}
                  onPage={(page) => onState({ ...state, page })}
                  empty={total === 0 && !loading ? (query ? 'No matches.' : 'No notes.') : null}>
        {list}
      </ResultList>
    </div>
  );
}

function ResultList({ page, pageCount, loading, compact, onPage, empty, children }: {
  page: number; pageCount: number; loading: boolean; compact: boolean; onPage: (page: number) => void; empty: string | null; children: ReactNode;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }); }, [page]);
  // a write elsewhere can shrink the list below the page shown
  useEffect(() => {
    if (!loading && pageCount > 0 && page >= pageCount) onPage(pageCount - 1);
  }, [loading, page, pageCount, onPage]);

  return (
    <>
      <div ref={scroll} className={`min-h-0 flex-1 overflow-y-auto ${compact ? 'mt-2' : 'px-3 py-3'}`}>
        {empty && <div className="px-2 py-2 text-sm text-base-content/60">{empty}</div>}
        <div className="space-y-2">{children}</div>
      </div>
      {pageCount > 1 && (
        <div className="flex justify-center border-t border-base-300 px-4 py-2">
          <div className="join">
            <button type="button" className="join-item btn btn-xs" disabled={page === 0} onClick={() => onPage(page - 1)}>
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="join-item btn btn-xs pointer-events-none tabular-nums">{page + 1} / {pageCount}</span>
            <button type="button" className="join-item btn btn-xs" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
