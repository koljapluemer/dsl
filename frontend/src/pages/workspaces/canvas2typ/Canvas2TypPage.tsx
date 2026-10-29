import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { FilePlus2, FileType, PanelLeft } from 'lucide-react';
import type { Item } from '@/api/types';
import { showError, showNotice } from '@/dumb/notice';
import { useSessionState } from '@/dumb/useSessionState';
import { fileName } from '@/entities/item/files/files';
import { createTypst, itemsChanged } from '@/entities/item/mutations';
import { NoteLine } from '@/entities/item/NoteLine';
import { itemQuery, typstStatusQuery } from '@/entities/item/queries';
import { sidebarShown, type SidebarAction } from '@/entities/item/sidebar';
import { TypstEditor } from '@/features/file-edit/TypstEditor';
import { BibtexCite } from '@/features/source-bibtex/BibtexCite';
import { CanvasLoader, Offering } from '../canvas/CanvasPage';
import type { Canvas2TypSearch } from './search';
import { typstFiles, typstNotesQuery } from './typstNotes';

type Pane = 'canvas' | 'typst';

/**
 * The notes naming a Typst file, listed beside the one open: its canvas on
 * the left, its Typst file on the right; on a narrow screen one of them at a
 * time. From the sidebar any note opens here, given a new Typst file first unless it has one.
 */
export function Canvas2TypPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { open } = useSearch({ strict: false }) as Canvas2TypSearch;
  const list = useQuery(typstNotesQuery);
  /** on a narrow screen the list takes the place of the note */
  const [listing, setListing] = useState(!open);
  const [pane, setPane] = useSessionState<Pane>('canvas2typ-pane', 'canvas', (v) => v === 'canvas' || v === 'typst');

  const show = (file: string | undefined) => {
    sidebarShown.set(false);
    setListing(!file);
    void navigate({ to: '/canvas2typ', search: { open: file } });
  };

  /** Gives the note a new Typst file unless it names one; false when it can't. */
  async function ensureTypst(file: string) {
    const current = await qc.fetchQuery({ ...itemQuery(file), staleTime: 0 });
    if (typstFiles(current).length) return true;
    const status = await qc.fetchQuery(typstStatusQuery);
    if (!status.available) {
      showNotice(`Typst files can't be built here: ${status.reason}`);
      return false;
    }
    qc.setQueryData(itemQuery(file).queryKey, (await createTypst(file)).item);
    void itemsChanged(qc);
    return true;
  }

  async function openHere(file: string) {
    try {
      if (await ensureTypst(file)) show(file);
    } catch (e) { showError(e); }
  }

  // the canvas registers it (with its "add to this canvas") while a note is open
  const openAction: SidebarAction = {
    icon: <FileType size={14} />,
    title: 'open as canvas + Typst (a new Typst file unless it has one)',
    run: (file) => void openHere(file),
    marked: { has: (file) => file === open },
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 @3xl:grid @3xl:grid-cols-[16rem_minmax(0,1fr)] @3xl:gap-4">
      <button type="button" className="btn btn-sm self-start @3xl:hidden" onClick={() => setListing(!listing)}>
        <PanelLeft size={16} />{listing ? 'Note' : 'Notes'}
      </button>
      <aside className={`mb-4 flex min-h-0 flex-1 flex-col border border-base-300 @3xl:flex-none ${listing ? '' : '@max-3xl:hidden'}`}>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 text-sm">
          {list.data?.map((d) => (
            <li key={d.file}>
              <NoteLine item={d} onClick={() => show(d.file)}
                        className={`rounded-field px-2 py-1.5 hover:bg-base-200 ${d.file === open ? 'bg-base-300' : ''}`} />
            </li>
          ))}
          {list.data?.length === 0 && <li className="px-2 text-base-content/50">No notes with a Typst file yet.</li>}
        </ul>
      </aside>
      {open ? (
        <section className={`flex min-h-0 flex-1 flex-col gap-3 ${listing ? '@max-3xl:hidden' : ''}`}>
          <div role="tablist" className="join self-start lg:hidden">
            {(['canvas', 'typst'] as const).map((p) => (
              <button key={p} type="button" role="tab" className={`btn btn-sm join-item ${pane === p ? 'btn-active' : ''}`} onClick={() => setPane(p)}>
                {p === 'canvas' ? 'Canvas' : 'Typst'}
              </button>
            ))}
          </div>
          {/* both stay mounted, so switching panes keeps the canvas and unsaved Typst edits */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={`min-h-0 flex-col ${pane === 'canvas' ? 'flex' : 'hidden lg:flex'}`}>
              <CanvasLoader key={open} file={open} openAction={openAction} />
            </div>
            <div className={`min-h-0 flex-col pb-4 ${pane === 'typst' ? 'flex' : 'hidden lg:flex'}`}>
              <TypstPane key={open} file={open} onAttach={() => void openHere(open)} />
            </div>
          </div>
        </section>
      ) : (
        <Offering action={openAction}>
          <p className={`text-sm text-base-content/50 ${listing ? '@max-3xl:hidden' : ''}`}>Pick a note, or open any from the notes sidebar.</p>
        </Offering>
      )}
    </div>
  );
}

/** The note's Typst file (the one picked when it names several), else a way to attach one. */
function TypstPane({ file, onAttach }: { file: string; onAttach: () => void }) {
  const qc = useQueryClient();
  const { data: item } = useQuery(itemQuery(file));
  const [picked, setPicked] = useState<string | null>(null);
  if (!item) return null;
  const paths = typstFiles(item);
  const path = picked && paths.includes(picked) ? picked : paths[0];
  const adopt = (changed: Item) => {
    qc.setQueryData(itemQuery(file).queryKey, changed);
    void itemsChanged(qc);
  };

  if (!path) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/70">
        This note names no Typst file.
        <button type="button" className="btn btn-sm" onClick={onAttach}><FilePlus2 size={14} />new Typst document</button>
      </div>
    );
  }
  return (
    <>
      {paths.length > 1 && (
        <select className="select select-sm mb-2 w-full shrink-0 font-mono" value={path} onChange={(e) => setPicked(e.target.value)}>
          {paths.map((p) => <option key={p} value={p}>{fileName(p)}</option>)}
        </select>
      )}
      <TypstEditor key={path} path={path} note={item} noteDirty={false} onItem={adopt} split={false} persist="canvas2typ-typst-pane"
                   bibtexTool={BibtexCite} />
    </>
  );
}
