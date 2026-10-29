import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { LayoutDashboard } from 'lucide-react';
import { sidebarShown, useSidebarAction, type SidebarAction } from '@/entities/item/sidebar';
import { canvasQuery } from './canvas-api';
import { CanvasScene } from './CanvasScene';
import type { CanvasSearch } from './search';
import './canvas.css';

/** Any note as an infinite canvas of text and linked notes, stored in its data block (docs/canvas.md). */
export function CanvasPage() {
  const navigate = useNavigate();
  const { open } = useSearch({ strict: false }) as CanvasSearch;
  const openAction: SidebarAction = {
    icon: <LayoutDashboard size={14} />,
    title: 'open as canvas',
    run: (file) => {
      sidebarShown.set(false);
      void navigate({ to: '/canvas', search: { open: file } });
    },
    marked: { has: (file) => file === open },
  };

  if (!open) {
    return <Offering action={openAction}><p className="text-sm text-base-content/50">Open any note here from the notes sidebar.</p></Offering>;
  }
  return <CanvasLoader key={open} file={open} openAction={openAction} />;
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
    <section className="relative min-h-0 flex-1">
      <CanvasScene key={generation} file={file} stored={stored.data} openAction={openAction} onReload={() => setGeneration((g) => g + 1)} />
    </section>
  );
}

/** While no canvas is shown: the sidebar only opens one. */
function Offering({ action, children }: { action: SidebarAction; children: ReactNode }) {
  useSidebarAction(action);
  return <>{children}</>;
}
