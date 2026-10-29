import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { FileText, PanelLeft, Plus } from 'lucide-react';
import { useSlashFocus } from '@/dumb/keys';
import { showError } from '@/dumb/notice';
import { deletedItems } from '@/entities/item/deleted';
import { hasTag } from '@/entities/item/dsl/tags';
import { itemsChanged, saveItem, setTag } from '@/entities/item/mutations';
import { NoteLine } from '@/entities/item/NoteLine';
import { itemQuery } from '@/entities/item/queries';
import { useSchema } from '@/entities/item/schema';
import { sidebarShown, useSidebarAction } from '@/entities/item/sidebar';
import { Note } from '@/meta/note/Note';
import { DocumentPreview } from './DocumentPreview';
import { documentReferences } from './documentReferences';
import { documentReferenceWidgets } from './documentReferenceWidgets';
import { DOCUMENT_TAG, documentsQuery, documentText } from './documents';
import { connectorOpacity, placeAnnotations } from './layout';
import type { DocumentSearch } from './search';
import './document.css';

type Connector = { id: string; path: string; anchorY: number };

/**
 * The notes tagged `document`, listed beside the one open, which has its
 * inline references as annotation cards; the field above the list starts a new one,
 * and from the sidebar any note is tagged `document` (unless it is) and opens here.
 */
export function DocumentPage() {
  const qc = useQueryClient();
  const schema = useSchema();
  const navigate = useNavigate();
  const { open } = useSearch({ strict: false }) as DocumentSearch;
  const list = useQuery(documentsQuery);
  /** on a narrow screen the list takes the place of the document */
  const [listing, setListing] = useState(!open);
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useSlashFocus();

  const show = useCallback((file: string | undefined) => {
    sidebarShown.set(false);
    setListing(!file);
    void navigate({ to: '/document', search: { open: file } });
  }, [navigate]);

  /** Tags the note `document` unless it is, then opens it. */
  async function openAsDocument(file: string) {
    try {
      const current = await qc.fetchQuery({ ...itemQuery(file), staleTime: 0 });
      if (!hasTag(schema, current.text, DOCUMENT_TAG)) {
        qc.setQueryData(itemQuery(file).queryKey, await setTag(file, DOCUMENT_TAG, true));
        void itemsChanged(qc);
      }
      show(file);
    } catch (e) { showError(e); }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !start.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await saveItem(null, documentText(start));
      qc.setQueryData(itemQuery(created.file).queryKey, created);
      void itemsChanged(qc);
      setStart('');
      show(created.file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useSidebarAction({
    icon: <FileText size={14} />,
    title: 'open as document',
    run: (file) => void openAsDocument(file),
    marked: { has: (file) => file === open },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 @3xl:grid @3xl:grid-cols-[16rem_minmax(0,1fr)] @3xl:gap-4">
      <button type="button" className="btn btn-sm self-start @3xl:hidden" onClick={() => setListing(!listing)}>
        <PanelLeft size={16} />{listing ? 'Document' : 'Documents'}
      </button>
      <aside className={`mb-4 flex min-h-0 flex-1 flex-col border border-base-300 @3xl:flex-none ${listing ? '' : '@max-3xl:hidden'}`}>
        <form className="flex gap-2 border-b border-base-300 p-2" onSubmit={(e) => void create(e)}>
          <input ref={input} className="input input-sm min-w-0 flex-1" placeholder="new document" value={start}
                 onChange={(e) => setStart(e.target.value)} />
          <button type="submit" className="btn btn-sm btn-square btn-primary" title="add" disabled={busy || !start.trim()}>
            {busy ? <span className="loading loading-spinner loading-xs" /> : <Plus size={16} />}
          </button>
        </form>
        {error && <p className="p-2 text-sm text-error">{error}</p>}
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 text-sm">
          {list.data?.map((d) => (
            <li key={d.file}>
              <NoteLine item={d} onClick={() => show(d.file)}
                        className={`rounded-field px-2 py-1.5 hover:bg-base-200 ${d.file === open ? 'bg-base-300' : ''}`} />
            </li>
          ))}
          {list.data?.length === 0 && <li className="px-2 text-base-content/50">No documents yet.</li>}
        </ul>
      </aside>
      {open ? (
        <div className={`flex min-h-0 flex-1 flex-col ${listing ? '@max-3xl:hidden' : ''}`}>
          <DocumentView key={open} file={open} onDeleted={() => show(undefined)} />
        </div>
      ) : <p className={`text-sm text-base-content/50 ${listing ? '@max-3xl:hidden' : ''}`}>Pick or start a document.</p>}
    </div>
  );
}

type ViewProps = {
  file: string;
  /** where the note's mode is kept for the session */
  persist?: string;
  onDeleted: () => void;
};

/** A note as a document with its annotations. Its page offers it in the sidebar. */
export function DocumentView({ file: open, persist = 'document', onDeleted }: ViewProps) {
  const schema = useSchema();
  const item = useQuery(itemQuery(open));
  const deleted = deletedItems.use();
  const [draft, setDraft] = useState<{ file: string; text: string } | null>(null);
  const [annotationsShown, setAnnotationsShown] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [positions, setPositions] = useState<number[]>([]);
  const [height, setHeight] = useState(0);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [pointerY, setPointerY] = useState<number | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const pointerFrame = useRef(0);

  const setDocumentText = useCallback((next: string) => {
    setDraft((current) => current && current.file === open && current.text === next ? current : { file: open, text: next });
  }, [open]);

  const text = draft && draft.file === open ? draft.text : (item.data?.text ?? '');
  const references = useMemo(() => documentReferences(schema, text), [schema, text]);

  const focusCard = useCallback((id: string) => {
    setActive(id);
    setAnnotationsShown(true);
  }, []);

  const focusAnchor = useCallback((id: string) => {
    setActive(id);
    setAnnotationsShown(false);
  }, []);

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      if (annotationsShown) {
        cards.current.get(active)?.scrollIntoView({ block: 'nearest' });
        return;
      }
      const node = [...(main.current?.querySelectorAll<HTMLElement>('[data-document-reference]') ?? [])]
        .find((candidate) => candidate.dataset.documentReference === active);
      node?.scrollIntoView({ block: 'center' });
      node?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, annotationsShown]);

  const editorExtensions = useMemo(() => [documentReferenceWidgets(schema, focusCard)], [schema, focusCard]);
  const renderPreview = useCallback((shown: NonNullable<typeof item.data>) => (
    <DocumentPreview item={shown} onActivate={focusCard} />
  ), [focusCard]);

  const measure = useCallback(() => {
    const root = workspace.current;
    const documentPane = main.current;
    if (!root || !documentPane) return;
    const rootRect = root.getBoundingClientRect();
    const anchors = new Map<string, DOMRect>();
    for (const node of documentPane.querySelectorAll<HTMLElement>('[data-document-reference]')) {
      const id = node.dataset.documentReference;
      if (id && !anchors.has(id)) anchors.set(id, node.getBoundingClientRect());
    }
    const desired = references.map((ref) => {
      const rect = anchors.get(ref.id);
      return rect ? rect.top - rootRect.top - 10 : 0;
    });
    const heights = references.map((ref) => cards.current.get(ref.id)?.offsetHeight ?? 0);
    const nextPositions = placeAnnotations(desired, heights);
    const last = nextPositions.length ? nextPositions.at(-1)! + (heights.at(-1) ?? 0) : 0;
    const nextHeight = Math.max(documentPane.scrollHeight, last);
    const nextConnectors = references.flatMap((ref, index) => {
      const anchor = anchors.get(ref.id);
      const card = cards.current.get(ref.id);
      if (!anchor || !card) return [];
      const cardRect = card.getBoundingClientRect();
      const x1 = cardRect.right - rootRect.left;
      const y1 = nextPositions[index] + Math.min(24, heights[index] / 2);
      const x2 = anchor.left - rootRect.left;
      const y2 = anchor.top - rootRect.top + anchor.height / 2;
      const bend = Math.max(20, (x2 - x1) * 0.45);
      return [{ id: ref.id, anchorY: y2, path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` }];
    });
    setPositions((current) => JSON.stringify(current) === JSON.stringify(nextPositions) ? current : nextPositions);
    setHeight(nextHeight);
    setConnectors(nextConnectors);
  }, [references]);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (workspace.current) observer.observe(workspace.current);
    if (main.current) observer.observe(main.current);
    for (const card of cards.current.values()) observer.observe(card);
    void document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, [measure, annotationsShown]);

  useEffect(() => () => cancelAnimationFrame(pointerFrame.current), []);

  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const clientY = event.clientY;
    cancelAnimationFrame(pointerFrame.current);
    pointerFrame.current = requestAnimationFrame(() => {
      const rect = workspace.current?.getBoundingClientRect();
      if (rect) setPointerY(clientY - rect.top);
    });
  };
  const style = { '--document-height': `${height}px` } as CSSProperties;

  return (
    <section className="document-page min-h-0 flex-1 pb-4">
      <button type="button" className="btn btn-sm mb-3 self-start @3xl:hidden" onClick={() => setAnnotationsShown((shown) => !shown)}>
        <PanelLeft size={16} />{annotationsShown ? 'Document' : `Annotations (${references.length})`}
      </button>
      <div className="document-scroll" onPointerMove={pointerMove} onPointerLeave={() => setPointerY(null)}>
        <div ref={workspace} className="document-workspace" style={style}>
          <aside className={`document-annotations ${annotationsShown ? '' : '@max-3xl:hidden'}`} aria-label="annotations">
            {references.map((ref, index) => (
              <div key={ref.id} ref={(node) => { if (node) cards.current.set(ref.id, node); else cards.current.delete(ref.id); }}
                   data-annotation-card={ref.id} style={{ '--annotation-top': `${positions[index] ?? 0}px` } as CSSProperties}
                   className={`document-annotation-card rounded-box border bg-base-100 p-3 ${active === ref.id ? 'border-primary' : 'border-base-300'}`}
                   onFocusCapture={() => setActive(ref.id)} onPointerDown={() => setActive(ref.id)}>
                <button type="button" className="document-annotation-number" title="show anchor in document" onClick={() => focusAnchor(ref.id)}>
                  {ref.number}
                </button>
                {deleted.has(`${ref.target}.txt`)
                  ? <p className="text-sm text-error">Missing note: {ref.target}</p>
                  : <Note file={`${ref.target}.txt`} modes={['view', 'edit']} commit="blur" persist={`document-annotation:${ref.target}`} />}
              </div>
            ))}
            {!references.length && <p className="text-sm text-base-content/50">No inline references.</p>}
          </aside>
          <main ref={main} className={`document-main min-w-0 ${annotationsShown ? '@max-3xl:hidden' : ''}`}>
            <Note key={open} file={open} modes={['edit', 'view']} defaultMode="edit" commit="blur" persist={persist}
                  relationships={false} className="document-note rounded-box border border-base-300 bg-base-100 p-4"
                  editorExtensions={editorExtensions} renderPreview={renderPreview} onTextChange={setDocumentText}
                  onDeleted={onDeleted} />
          </main>
          <svg className="document-connectors @max-3xl:hidden" aria-hidden="true">
            {connectors.map((connector) => (
              <path key={connector.id} d={connector.path} style={{ opacity: active === connector.id ? 1
                : pointerY === null ? 0.18 : connectorOpacity(Math.abs(pointerY - connector.anchorY)) }} />
            ))}
          </svg>
        </div>
      </div>
    </section>
  );
}

