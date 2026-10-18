import { useEffect } from 'react';
import { Link, Outlet, useLocation, type ErrorComponentProps } from '@tanstack/react-router';
import { errorBanner } from './dumb/errorBanner';
import { UndoDeleteToast } from './features/item-delete/UndoDeleteToast';

const TABS = [
  { to: '/', label: 'Notes' },
  { to: '/new', label: 'New' },
  { to: '/broken', label: 'Broken' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/questions', label: 'Questions' },
  { to: '/settings', label: 'Settings' },
] as const;

/** the tab a path belongs to: the editor is part of Notes */
const tabOf = (path: string) => (path.startsWith('/edit/') ? '/' : path);

export function App() {
  const path = useLocation({ select: (l) => l.pathname });
  const error = errorBanner.use();
  useEffect(() => errorBanner.set(''), [path]);

  return (
    <>
      <UndoDeleteToast />
      {error && <div role="alert" className="alert alert-error mb-4"><span>{error}</span></div>}
      <div role="tablist" className="tabs tabs-border mb-4">
        {TABS.map((t) => (
          <Link key={t.to} to={t.to} role="tab" className={`tab ${tabOf(path) === t.to ? 'tab-active' : ''}`}>{t.label}</Link>
        ))}
      </div>
      <Outlet />
    </>
  );
}

export function RootError({ error }: ErrorComponentProps) {
  return <div role="alert" className="alert alert-error mb-4"><span>{error instanceof Error ? error.message : String(error)}</span></div>;
}
