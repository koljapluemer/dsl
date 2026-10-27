import { useEffect, useState } from 'react';
import { ChevronDown, Maximize2, Plus } from 'lucide-react';
import type { SearchResult } from '@/api/types';
import { useSlashFocus } from '@/dumb/keys';
import { NoteSearch } from '@/entities/item/search/NoteSearch';
import { useNoteSearch } from '@/entities/item/search/useNoteSearch';
import { sidebarActions, useOpenNote, useSidebarSearch } from '@/entities/item/sidebar';
import { Note } from './Note';
import { NoteModal } from './NoteModal';
import { SemanticNote } from './SemanticNote';
import { ToolButton } from './tools';

const SIDEBAR_MODES = ['view', 'edit'] as const;

/**
 * The column beside every page: a new note, a search over all notes, and the
 * notes opened from it (or from a link anywhere) below it, the last opened
 * first, viewed or edited and written as focus leaves them. The page may add
 * its own way to open a result (`useSidebarAction`).
 */
export function NoteSidebar({ onNew }: { onNew: () => void }) {
  const { state, setState, open, setOpen } = useSidebarSearch();
  const found = useNoteSearch(state, { scope: 'all' });
  const actions = sidebarActions.use();
  const openNote = useOpenNote();
  const input = useSlashFocus(true);
  const [modal, setModal] = useState<string | null>(null);

  // the note opened last is on top, below the search: bring it into view
  const latest = open[0];
  useEffect(() => {
    if (latest) document.getElementById('sidebar:' + latest)?.scrollIntoView({ block: 'nearest' });
  }, [latest]);

  const close = (file: string) => setOpen(open.filter((f) => f !== file));
  const marked = { has: (file: string) => open.includes(file) || actions.some((action) => action.marked?.has(file)) };
  const resultActions = actions.length ? (result: SearchResult) => (
    <>
      <ToolButton title="open in the sidebar" onClick={() => openNote(result.file)}><ChevronDown size={14} /></ToolButton>
      {actions.filter((action) => action.applies?.(result) ?? true).map((action) => (
        <ToolButton key={action.title} title={action.title} onClick={() => action.run(result.file)}>{action.icon}</ToolButton>
      ))}
    </>
  ) : undefined;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="shrink-0 p-2">
        <button type="button" className="btn btn-primary btn-sm btn-block" title="new note (c)" onClick={onNew}><Plus size={16} />New note</button>
      </div>
      <div className={`flex min-h-0 flex-col border-y border-base-300 ${open.length ? 'h-1/2 shrink-0' : 'flex-1'}`}>
        <NoteSearch state={state} onState={setState} found={found} semanticToggle orphanFilter historyKey="sidebar-search-history"
                    inputRef={input} marked={marked} onSelect={openNote} resultActions={resultActions}>
          <SemanticNote status={found.semantic} ranking={state.semantic && !!state.query.trim()} />
        </NoteSearch>
      </div>
      {open.map((file) => (
        <Note key={file} id={'sidebar:' + file} file={file} modes={SIDEBAR_MODES} commit="blur" persist={`sidebar:${file}`}
              className="border-b border-base-300 p-3"
              extraTools={[{ key: 'modal', title: 'open in a modal', icon: <Maximize2 size={14} />, onClick: () => setModal(file) }]}
              onClose={() => close(file)} onDeleted={() => close(file)} />
      ))}
      {modal && <NoteModal file={modal} onClose={() => setModal(null)} onDeleted={() => close(modal)} />}
    </div>
  );
}
