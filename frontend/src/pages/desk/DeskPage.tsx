import { useNavigate, useSearch } from '@tanstack/react-router';
import { PanelLeft } from 'lucide-react';
import { sidebarShown, useSidebarAction } from '@/entities/item/sidebar';
import { Note } from '@/meta/note/Note';
import type { DeskSearch } from './search';
import './desk.css';

/** The notes opened from the sidebar's search (or from a link in one of them), in a grid that fills the pane. */
export function DeskPage() {
  const navigate = useNavigate();
  const { open = [] } = useSearch({ strict: false }) as DeskSearch;

  const setOpen = (files: string[]) => void navigate({ to: '.', search: ((prev: DeskSearch) => ({ ...prev, open: files.length ? files : undefined })) as never });
  const close = (file: string) => setOpen(open.filter((f) => f !== file));

  function show(file: string) {
    // on a narrow screen the sidebar is a drawer over the desk
    sidebarShown.set(false);
    if (open.includes(file)) document.getElementById('desk:' + file)?.scrollIntoView({ block: 'nearest' });
    else setOpen([...open, file]);
  }
  useSidebarAction({ icon: <PanelLeft size={14} />, title: 'open on the desk', run: show, marked: { has: (file) => open.includes(file) } });

  return (
    <section className="desk-pane min-h-0 flex-1 pb-4">
      {open.length === 0
        ? <p className="text-sm text-base-content/50">Open a note here from the sidebar's search.</p>
        : (
          <div className="desk-grid">
            {open.map((file) => (
              <Note key={file} id={'desk:' + file} file={file} fill persist={`desk:${file}`}
                    className="rounded-box border border-base-300 bg-base-100 p-3"
                    onClose={() => close(file)} onDeleted={() => close(file)} onRef={show} />
            ))}
          </div>
        )}
    </section>
  );
}
