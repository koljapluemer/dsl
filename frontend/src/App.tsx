import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate, type ErrorComponentProps } from '@tanstack/react-router';
import { errorBanner } from './dumb/errorBanner';
import { useHotkeys, type Bindings } from './dumb/keys';
import { Modal } from './dumb/Modal';
import { performUndo } from './dumb/undo';
import { UndoToast } from './dumb/UndoToast';
import { NoteModal } from './meta/note/NoteModal';

/** `key`: `g <key>` opens the tab */
const TABS = [
  { to: '/', label: 'Notes', key: 'n' },
  { to: '/explorations', label: 'Explorations', key: 'e' },
  { to: '/graph', label: 'Graph', key: 'g' },
  { to: '/tasks', label: 'Tasks', key: 't' },
  { to: '/projects', label: 'Projects', key: 'p' },
  { to: '/sources', label: 'Sources', key: 's' },
  { to: '/questions', label: 'Questions', key: 'q' },
  { to: '/calendar', label: 'Calendar', key: 'c' },
  { to: '/queue', label: 'Queue', key: 'u' },
  { to: '/float', label: 'Float', key: 'f' },
  { to: '/zero', label: 'Zero', key: 'z' },
  { to: '/suggest', label: 'Suggest', key: 'x' },
  { to: '/settings', label: 'Settings', key: ',' },
] as const;

/** the `?` list; keep in line with the README's Keyboard section */
const SHORTCUTS: [string, string][] = [
  ['Ctrl+Enter', 'save what you edit'],
  ['Esc', 'close, only when nothing was edited; leave a filter'],
  ['Ctrl+S', 'save in a note editor'],
  ['g n, g g, …', 'go to a tab (its key is in the tab\'s tooltip)'],
  ['c', 'new note (as the + button)'],
  ['/', 'focus the filter or search'],
  ['u', 'undo the last change offered'],
  ['← →', 'Notes: page · Calendar: day or range'],
  ['t · a · d · r', 'Calendar: today or this week · add · day view · range view'],
  ['n', 'Queue: next'],
  ['s · e · d', 'Questions: skip · edit · disable'],
  ['N', 'Suggest: next'],
  ['?', 'this list'],
];


export function App() {
  const path = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const error = errorBanner.use();
  const [help, setHelp] = useState(false);
  /** a new note's modal, keyed so each opening starts fresh */
  const [adding, setAdding] = useState<number | null>(null);
  useEffect(() => errorBanner.set(''), [path]);

  const keys: Bindings = {
    c: () => setAdding(Date.now()),
    u: () => void performUndo(),
    '?': () => setHelp(true),
  };
  for (const t of TABS) keys[`g ${t.key}`] = () => void navigate({ to: t.to });
  useHotkeys(keys);

  // the notes, explorations, sources, the graph's canvas and the float stage take the whole window; the other pages a readable column
  const full = ['/', '/explorations', '/sources', '/graph', '/float'].includes(path);

  return (
    // the bottom padding keeps the new-note button off the page's last controls
    <div className={full ? 'flex h-screen flex-col px-4 pt-4 pb-20' : 'max-w-5xl mx-auto p-4 pb-24'}>
      <UndoToast />
      {error && <div role="alert" className="alert alert-error mb-4"><span>{error}</span></div>}
      <div role="tablist" className="tabs tabs-border mb-4 flex-nowrap overflow-x-auto">
        {TABS.map((t) => (
          <Link key={t.to} to={t.to} role="tab" title={`g ${t.key}`} className={`tab ${path === t.to ? 'tab-active' : ''}`}>{t.label}</Link>
        ))}
      </div>
      <Outlet />
      <button type="button" className="btn btn-circle btn-primary btn-lg fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 shadow-lg"
              title="new note (c)" onClick={() => setAdding(Date.now())}>
        <Plus size={24} />
      </button>
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
