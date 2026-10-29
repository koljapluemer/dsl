import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { LayoutDashboard, PanelRight } from 'lucide-react';
import { NoteLine } from '@/entities/item/NoteLine';
import { sidebarShown, useSidebarAction, type SidebarAction } from '@/entities/item/sidebar';
import { canvasesQuery, canvasQuery } from './canvas-api';
import { CanvasScene } from './CanvasScene';
import type { CanvasSearch } from './search';
import './canvas.css';

/**
 * Any note as an infinite canvas of text and linked notes, stored in its data
 * block (docs/canvas.md); the notes with one are listed beside it.
 */
export function CanvasPage() {
  const navigate = useNavigate();
  const { open } = useSearch({ strict: false }) as CanvasSearch;
  /** on a narrow screen the list takes the place of the canvas */
  const [listing, setListing] = useState(!open);
  const show = (file: string) => {
    setListing(false);
    void navigate({ to: '/canvas', search: { open: file } });
  };
  const openAction: SidebarAction = {
    icon: <LayoutDashboard size={14} />,
    title: 'open as canvas',
    run: (file) => {
      sidebarShown.set(false);
      show(file);
    },
    marked: { has: (file) => file === open },
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_18rem] @3xl:gap-4">
      <button type="button" className="btn btn-sm self-start @3xl:hidden" onClick={() => setListing(!listing)}>
        <PanelRight size={16} />{listing ? 'Canvas' : 'Canvases'}
      </button>
      <section className={`flex min-h-0 flex-1 flex-col ${listing ? '@max-3xl:hidden' : ''}`}>
        {open
          ? <CanvasLoader key={open} file={open} openAction={openAction} />
          : <Offering action={openAction}><p className="text-sm text-base-content/50">Pick a canvas, or open any note here from the notes sidebar.</p></Offering>}
      </section>
      <CanvasList open={open} onOpen={show} className={listing ? '' : '@max-3xl:hidden'} />
    </div>
  );
}

/** The notes with a canvas, the one open marked. */
function CanvasList({ open, onOpen, className }: { open: string | undefined; onOpen: (file: string) => void; className: string }) {
  const list = useQuery(canvasesQuery);
  return (
    <aside className={`flex min-h-0 flex-1 flex-col border border-base-300 @3xl:flex-none ${className}`}>
      {list.error && <p className="p-2 text-sm text-error">{list.error.message}</p>}
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 text-sm">
        {list.data?.map((c) => (
          <li key={c.file}>
            <NoteLine item={c} onClick={() => onOpen(c.file)}
                      className={`rounded-field px-2 py-1.5 hover:bg-base-200 ${c.file === open ? 'bg-base-300' : ''}`} />
          </li>
        ))}
        {list.data?.length === 0 && <li className="px-2 text-base-content/50">No canvases yet.</li>}
      </ul>
    </aside>
  );
}

/** Loads the canvas once per opening; Reload opens it again, from what's stored. */
export function CanvasLoader({ file, openAction }: { file: string; openAction: SidebarAction }) {
  const [generation, setGeneration] = useState(0);
  const stored = useQuery(canvasQuery(file, generation));
  if (!stored.data) {
    return (
      <Offering action={openAction}>
        {stored.error ? <p className="text-sm text-error">{stored.error.message}</p> : <span className="loading loading-dots loading-sm" />}
      </Offering>
    );
  }
  return (
    <div className="relative min-h-0 flex-1">
      <CanvasScene key={generation} file={file} stored={stored.data} openAction={openAction} onReload={() => setGeneration((g) => g + 1)} />
    </div>
  );
}

/** While no canvas is shown: the sidebar only opens one. */
export function Offering({ action, children }: { action: SidebarAction; children: ReactNode }) {
  useSidebarAction(action);
  return <>{children}</>;
}
