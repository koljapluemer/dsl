import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { PanelLeft } from 'lucide-react';
import { NoteSearch } from '@/entities/item/search/NoteSearch';
import type { SearchState } from '@/entities/item/search/search';
import { useNoteSearch } from '@/entities/item/search/useNoteSearch';
import { NotePanel } from '@/meta/note-panel/NotePanel';
import type { NotesSearch } from './search';
import { SemanticNote } from './SemanticNote';
import './notes.css';

/**
 * A search beside the notes opened from it, in a grid that fills the pane.
 */
export function NotesPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as NotesSearch;
  const open = search.open ?? [];
  const state: SearchState = { query: search.q ?? '', page: search.page ?? 0, orphan: 'any', semantic: !!search.s };
  const found = useNoteSearch(state, { scope: 'all' });
  /** on a narrow screen the search takes the place of the notes */
  const [searching, setSearching] = useState(open.length === 0);

  const setState = (next: SearchState) => void navigate({
    to: '.', replace: true,
    search: { ...search, q: next.query || undefined, s: next.semantic || undefined, page: next.page || undefined },
  });
  const setOpen = (files: string[]) => void navigate({ to: '.', search: { ...search, open: files.length ? files : undefined } });

  function show(file: string) {
    setSearching(false);
    if (open.includes(file)) document.getElementById('note:' + file)?.scrollIntoView({ block: 'nearest' });
    else setOpen([...open, file]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-4 md:grid md:grid-cols-[22rem_minmax(0,1fr)] md:gap-4">
      <button type="button" className="btn btn-sm self-start md:hidden" onClick={() => setSearching(!searching)}>
        <PanelLeft size={16} />{searching ? `Notes (${open.length})` : 'Search'}
      </button>
      <aside className={`flex min-h-0 flex-1 flex-col border border-base-300 md:flex-none ${searching ? '' : 'max-md:hidden'}`}>
        <NoteSearch state={state} onState={setState} found={found} semanticToggle historyKey="notes-search-history" autoFocus
                    marked={new Set(open)} onSelect={show}>
          <SemanticNote status={found.semantic} ranking={state.semantic && !!state.query.trim()} />
        </NoteSearch>
      </aside>
      <section className={`note-pane min-h-0 flex-1 ${searching ? 'max-md:hidden' : ''}`}>
        {open.length === 0
          ? <p className="text-sm text-base-content/50">Pick a note from the search to open it here.</p>
          : (
            <div className="note-grid">
              {open.map((file) => (
                <NotePanel key={file} id={'note:' + file} file={file} fill
                           className="rounded-box border border-base-300 bg-base-100 p-3"
                           onClose={() => setOpen(open.filter((f) => f !== file))}
                           onDeleted={() => setOpen(open.filter((f) => f !== file))}
                           onRef={show} />
              ))}
            </div>
          )}
      </section>
    </div>
  );
}
