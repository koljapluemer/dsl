import { useState } from 'react';
import { PanelRight, Plus } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate, type ErrorComponentProps } from '@tanstack/react-router';
import { useHotkeys, type Bindings } from './dumb/keys';
import { Modal } from './dumb/Modal';
import { performUndo } from './dumb/undo';
import { UndoToast } from './dumb/UndoToast';
import { sidebarShown } from './entities/item/sidebar';
import { NoteModal } from './meta/note/NoteModal';
import { NoteSidebar } from './meta/note/NoteSidebar';

/** `key`: `g <key>` opens the tab */
export const TABS = [
  { to: '/', label: 'Home', key: 'h' },
  { to: '/daily', label: 'Daily', key: 'a' },
  { to: '/desk', label: 'Desk', key: 'd' },
  { to: '/canvas', label: 'Canvas', key: 'v' },
  { to: '/canvas2typ', label: 'Canvas2Typ', key: 'y' },
  { to: '/explorations', label: 'Explorations', key: 'e' },
  { to: '/graph', label: 'Graph', key: 'g' },
  { to: '/tasks', label: 'Tasks', key: 't' },
  { to: '/goals', label: 'Goals', key: 'l' },
  { to: '/projects', label: 'Projects', key: 'p' },
  { to: '/sources', label: 'Sources', key: 's' },
  { to: '/published', label: 'Published', key: 'b' },
  { to: '/portfolio', label: 'Portfolio', key: 'o' },
  { to: '/questions', label: 'Questions', key: 'q' },
  { to: '/learn', label: 'Learn', key: 'r' },
  { to: '/calendar', label: 'Calendar', key: 'c' },
  { to: '/queue', label: 'Queue', key: 'u' },
  { to: '/float', label: 'Float', key: 'f' },
  { to: '/tags', label: 'Tags', key: 'z' },
  { to: '/suggest', label: 'Suggest', key: 'x' },
  { to: '/settings', label: 'Settings', key: ',' },
] as const;

/** the `?` list; keep in line with the README's Keyboard section */
const SHORTCUTS: [string, string][] = [
  ['Ctrl+Enter', 'save what you edit'],
  ['Esc', 'close, only when nothing was edited; leave a filter'],
  ['Ctrl+S', 'save in a note editor'],
  ['g h, g g, …', 'go to a tab (its key is in the tab\'s tooltip)'],
  ['c', 'new note (as the New note button)'],
  ['/', 'focus the page\'s filter, else the sidebar\'s search'],
  ['u', 'undo the last change offered'],
  ['← →', 'Calendar: day or range'],
  ['t · a · d · r', 'Calendar: today or this week · add · day view · range view'],
  ['n', 'Queue: next'],
  ['s · e · d', 'Questions: skip · edit · disable'],
  ['Space · 1–4', 'Learn: reveal · again, hard, good, easy'],
  ['N', 'Suggest: next'],
  ['?', 'this list'],
];


export function App() {
  const path = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const shown = sidebarShown.use();
  const [help, setHelp] = useState(false);
  /** a new note's modal, keyed so each opening starts fresh */
  const [adding, setAdding] = useState<number | null>(null);

  const add = () => setAdding(Date.now());

  const keys: Bindings = {
    c: add,
    u: () => void performUndo(),
    '?': () => setHelp(true),
  };
  for (const t of TABS) keys[`g ${t.key}`] = () => void navigate({ to: t.to });
  useHotkeys(keys);

  // these workspaces take the whole pane; the other pages use a readable column
  const full = ['/desk', '/canvas', '/canvas2typ', '/explorations', '/sources', '/published', '/graph', '/float'].includes(path);

  return (
    // the note sidebar is beside every page on a wide screen, a drawer otherwise
    <div className="drawer drawer-end lg:drawer-open">
      <input id="note-sidebar" type="checkbox" className="drawer-toggle" checked={shown} onChange={(e) => sidebarShown.set(e.target.checked)} />
      <div className="drawer-content flex h-dvh min-w-0 flex-col">
        <UndoToast />
        <div className="shrink-0 px-4 pt-4">
          <div className="mb-4 flex items-center gap-2">
            <div role="tablist" className="tabs tabs-border min-w-0 flex-1 flex-nowrap overflow-x-auto">
              {TABS.map((t) => (
                <Link key={t.to} to={t.to} role="tab" title={`g ${t.key}`} className={`tab ${path === t.to ? 'tab-active' : ''}`}>{t.label}</Link>
              ))}
            </div>
            <label htmlFor="note-sidebar" className="btn btn-ghost btn-sm btn-square lg:hidden" title="notes"><PanelRight size={18} /></label>
          </div>
        </div>
        {/* below lg, the bottom padding keeps the new-note button off the page's last controls */}
        <main className={`@container min-h-0 flex-1 px-4 pb-20 lg:pb-4 ${full ? 'flex flex-col' : 'overflow-y-auto'}`}>
          {full ? <Outlet /> : <div className="mx-auto max-w-5xl"><Outlet /></div>}
        </main>
      </div>
      <div className="drawer-side z-50">
        <label htmlFor="note-sidebar" aria-label="close the sidebar" className="drawer-overlay" />
        <aside className="h-full w-[22rem] max-w-[85vw] border-l border-base-300 bg-base-100"><NoteSidebar onNew={add} /></aside>
      </div>
      {!shown && (
        <button type="button" className="btn btn-circle btn-primary btn-lg fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 shadow-lg lg:hidden"
                title="new note (c)" onClick={add}>
          <Plus size={24} />
        </button>
      )}
      {adding !== null && <NoteModal key={adding} file={null} onClose={() => setAdding(null)} />}
      {help && (
        <Modal onClose={() => setHelp(false)}>
          <table className="table table-sm">
            <tbody>
              {SHORTCUTS.map(([k, what]) => <tr key={k}><td className="font-mono whitespace-nowrap">{k}</td><td>{what}</td></tr>)}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

export function RootError({ error }: ErrorComponentProps) {
  return <div className="max-w-5xl mx-auto p-4"><div role="alert" className="alert alert-error mb-4"><span>{error instanceof Error ? error.message : String(error)}</span></div></div>;
}
