import { useEffect } from 'react';
import { Link, Outlet, useLocation, type ErrorComponentProps } from '@tanstack/react-router';
import { errorBanner } from './dumb/errorBanner';
import { UndoToast } from './dumb/UndoToast';

const TABS = [
  { to: '/', label: 'Notes' },
  { to: '/new', label: 'New' },
  { to: '/graph', label: 'Graph' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/projects', label: 'Projects' },
  { to: '/sources', label: 'Sources' },
  { to: '/questions', label: 'Questions' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/queue', label: 'Queue' },
  { to: '/float', label: 'Float' },
  { to: '/zero', label: 'Zero' },
  { to: '/suggest', label: 'Suggest' },
  { to: '/settings', label: 'Settings' },
] as const;

/** the tab a path belongs to: the editor is part of Notes, the source form of Sources */
const tabOf = (path: string) => (path.startsWith('/edit/') ? '/' : path.startsWith('/sources/') ? '/sources' : path);

export function App() {
  const path = useLocation({ select: (l) => l.pathname });
  const error = errorBanner.use();
  useEffect(() => errorBanner.set(''), [path]);

  // the graph's canvas and the float stage take the whole window; the other pages a readable column
  const full = path === '/graph' || path === '/float';

  return (
    <div className={full ? 'flex h-screen flex-col px-4 pt-4' : 'max-w-5xl mx-auto p-4'}>
      <UndoToast />
      {error && <div role="alert" className="alert alert-error mb-4"><span>{error}</span></div>}
      <div role="tablist" className="tabs tabs-border mb-4 flex-nowrap overflow-x-auto">
        {TABS.map((t) => (
          <Link key={t.to} to={t.to} role="tab" className={`tab ${tabOf(path) === t.to ? 'tab-active' : ''}`}>{t.label}</Link>
        ))}
      </div>
      <Outlet />
    </div>
  );
}

export function RootError({ error }: ErrorComponentProps) {
  return <div className="max-w-5xl mx-auto p-4"><div role="alert" className="alert alert-error mb-4"><span>{error instanceof Error ? error.message : String(error)}</span></div></div>;
}
