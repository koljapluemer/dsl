import { useNavigate, useSearch } from '@tanstack/react-router';
import { Columns2 } from 'lucide-react';
import { useSessionState } from '@/dumb/useSessionState';
import { sidebarShown, useSidebarAction, type SidebarAction } from '@/entities/item/sidebar';
import { CanvasLoader } from '../canvas/CanvasPage';
import { DocumentView } from '../document/DocumentPage';
import type { Canvas2DocSearch } from './search';

type Pane = 'canvas' | 'document';

/** One note as its canvas beside its document; on a narrow screen one of them at a time. */
export function Canvas2DocPage() {
  const navigate = useNavigate();
  const { open } = useSearch({ strict: false }) as Canvas2DocSearch;
  const [pane, setPane] = useSessionState<Pane>('canvas2doc-pane', 'canvas', (v) => v === 'canvas' || v === 'document');
  const openAction: SidebarAction = {
    icon: <Columns2 size={14} />,
    title: 'open as canvas + document',
    run: (file) => {
      sidebarShown.set(false);
      void navigate({ to: '/canvas2doc', search: { open: file } });
    },
    marked: { has: (file) => file === open },
  };

  if (!open) return <Empty action={openAction} />;
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div role="tablist" className="join self-start lg:hidden">
        {(['canvas', 'document'] as const).map((p) => (
          <button key={p} type="button" role="tab" className={`btn btn-sm join-item ${pane === p ? 'btn-active' : ''}`} onClick={() => setPane(p)}>
            {p === 'canvas' ? 'Canvas' : 'Document'}
          </button>
        ))}
      </div>
      {/* both stay mounted, so switching panes keeps the canvas and its saves */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`min-h-0 flex-col ${pane === 'canvas' ? 'flex' : 'hidden lg:flex'}`}>
          <CanvasLoader key={open} file={open} openAction={openAction} />
        </div>
        <div className={`min-h-0 flex-col ${pane === 'document' ? 'flex' : 'hidden lg:flex'}`}>
          <DocumentView key={open} file={open} persist="canvas2doc" onDeleted={() => void navigate({ to: '/canvas2doc', search: {} })} />
        </div>
      </div>
    </section>
  );
}

function Empty({ action }: { action: SidebarAction }) {
  useSidebarAction(action);
  return <p className="text-sm text-base-content/50">Open any note here from the notes sidebar.</p>;
}
