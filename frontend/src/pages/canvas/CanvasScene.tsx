import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Background, Panel, ReactFlow, ReactFlowProvider, useReactFlow, type NodeChange } from '@xyflow/react';
import { FilePlus, Maximize, PanelRight, SquarePlus, Type, ZoomIn, ZoomOut } from 'lucide-react';
import type { Item } from '@/api/types';
import { showError, showNotice } from '@/dumb/notice';
import { Toolbar } from '@/dumb/toolbar/Toolbar';
import type { ToolbarAction } from '@/dumb/toolbar/types';
import { dropUndo, offerUndo, pendingUndo } from '@/dumb/undo';
import { markDeleted } from '@/entities/item/deleted';
import { deleteItem, itemsChanged, restoreItem } from '@/entities/item/mutations';
import { itemQuery } from '@/entities/item/queries';
import { useSchema } from '@/entities/item/schema';
import { useOpenNote, useSidebarAction, type SidebarAction } from '@/entities/item/sidebar';
import { canvasesQuery, createNoteFromText, putCanvas, type StoredCanvas } from './canvas-api';
import { CanvasContext, type CanvasActions } from './canvas-context';
import { IDLE, SEARCH_STEP, currentInteraction, type Interaction, type XY } from './canvas-interaction';
import { canvasReducer, fromWire, linkedFiles, newId, noteBody, toWire, type CanvasNode } from './canvas-model';
import { CanvasSaver } from './canvas-save';
import { NoteNode, TextNode, type CanvasFlowNode } from './CanvasNodes';
import { PaneSearchMenu } from './PaneSearchMenu';

const nodeTypes = { text: TextNode, note: NoteNode };
const ZOOM_MS = 150;
const FIT_OPTIONS = { maxZoom: 1, padding: 0.2 };

type Props = {
  /** the note whose canvas this is */
  file: string;
  /** the canvas as loaded: the scene's state starts from it and never takes it again */
  stored: StoredCanvas;
  /** the sidebar's "open as canvas" */
  openAction: SidebarAction;
  /** load the stored canvas again, dropping the scene's state */
  onReload: () => void;
};

export function CanvasScene(props: Props) {
  return (
    <ReactFlowProvider>
      <Scene {...props} />
    </ReactFlowProvider>
  );
}

/**
 * One canvas being worked on (docs/canvas.md). Its nodes are the reducer's
 * state, the only truth while it's open; React Flow's nodes are derived from
 * it. The saver writes it back; `interaction` is what's being done.
 */
function Scene({ file, stored, openAction, onReload }: Props) {
  const qc = useQueryClient();
  const schema = useSchema();
  const openNote = useOpenNote();
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();

  const [doc, dispatch] = useReducer(canvasReducer, stored.nodes, fromWire);
  const [loaded] = useState(doc);
  const [saver] = useState(() => new CanvasSaver(file, stored.rev, async (nodes, rev) => {
    const written = await putCanvas(file, nodes, rev);
    // the note shown elsewhere (the sidebar) shows the canvas as written
    void qc.invalidateQueries({ queryKey: itemQuery(file).queryKey });
    // the list beside it: a first write adds the note, any write moves it to the top
    void qc.invalidateQueries({ queryKey: canvasesQuery.queryKey });
    return written;
  }));
  const save = useSyncExternalStore(saver.subscribe, saver.getState);
  const [asked, setInteraction] = useState<Interaction>(IDLE);
  const interaction = currentInteraction(asked, doc);
  const [measured, setMeasured] = useState<ReadonlyMap<string, { width: number; height: number }>>(new Map());
  const readOnly = stored.problems.length > 0 || !!stored.dataError || save.status === 'conflict';

  // for handlers, which act on the canvas as it is when they run
  const docRef = useRef(doc);
  const interactionRef = useRef(interaction);
  const readOnlyRef = useRef(readOnly);
  useEffect(() => {
    docRef.current = doc;
    interactionRef.current = interaction;
    readOnlyRef.current = readOnly;
  });
  const pane = useRef<HTMLDivElement>(null);
  const added = useRef(0);
  /** this scene's undo offers: dropped when it's gone (but a deleted note's restore is kept, without its node) */
  const offers = useRef(new Map<() => Promise<unknown>, (() => Promise<unknown>) | null>());

  // a failed write says so in the toast corner; the badge keeps showing it until a write succeeds
  useEffect(() => {
    if (save.status === 'error') showError(`Canvas not saved: ${save.error}`);
    if (save.status === 'conflict') showError('The canvas was changed elsewhere; changes here since the last save aren\'t written. Reload loads it.');
  }, [save]);

  // every change but the load is written
  useEffect(() => {
    if (doc !== loaded) saver.change(toWire(doc));
  }, [doc, loaded, saver]);

  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') saver.flush(true); };
    document.addEventListener('visibilitychange', hidden);
    const ours = offers.current;
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      saver.flush(true);
      const pending = pendingUndo.get();
      if (pending && ours.has(pending.perform)) {
        const kept = ours.get(pending.perform);
        if (kept) offerUndo('note deleted', kept);
        else dropUndo();
      }
    };
  }, [saver]);

  const actions = useMemo<CanvasActions & {
    addText: (at: XY) => void; addNote: (file: string, at: XY) => void; openSearch: (screen: XY) => void; pick: (file: string) => void;
  }>(() => {
    const find = (id: string) => docRef.current.nodes.find((node) => node.id === id);
    const offer = (message: string, perform: () => Promise<unknown>, kept: (() => Promise<unknown>) | null = null) => {
      offers.current.set(perform, kept);
      offerUndo(message, perform);
    };
    const toIdle = () => {
      const current = interactionRef.current;
      if (current.type === 'editing') {
        const node = find(current.id);
        if (node?.kind === 'text' && !node.text.trim()) dispatch({ type: 'remove', id: node.id });
      }
      setInteraction(IDLE);
    };
    /** back to idle from the conversion of `id`, unless something else was started meanwhile */
    const doneWith = (id: string) => setInteraction((current) => current.type === 'busy' && current.id === id ? IDLE : current);
    const removeNode = (id: string, message: string) => {
      const index = docRef.current.nodes.findIndex((node) => node.id === id);
      if (index < 0) return null;
      const node = docRef.current.nodes[index];
      dispatch({ type: 'remove', id });
      const restore = async () => dispatch({ type: 'restore', node, index });
      if (message) offer(message, restore);
      return restore;
    };
    return {
      toIdle,
      startEdit: (id) => {
        if (readOnlyRef.current) return;
        const current = interactionRef.current;
        if (current.type === 'editing' && current.id === id) return;
        toIdle();
        setInteraction({ type: 'editing', id });
      },
      setText: (id, text) => dispatch({ type: 'setText', id, text }),
      remove: (id) => { removeNode(id, find(id)?.kind === 'note' ? 'note detached' : 'text deleted'); },
      deleteNote: async (id) => {
        const node = find(id);
        if (node?.kind !== 'note') return false;
        let item: Item;
        try {
          item = await qc.fetchQuery(itemQuery(node.file));
        } catch (error) {
          showError(error);
          return false;
        }
        const restoreNode = removeNode(id, '');
        try {
          await deleteItem(item.file);
          await markDeleted(qc, item.file);
          const restoreNote = async () => { await restoreItem(item); await itemsChanged(qc); };
          offer('note deleted', async () => { await restoreNote(); await restoreNode?.(); }, restoreNote);
          await itemsChanged(qc);
          return true;
        } catch (error) {
          await restoreNode?.();
          showError(error);
          return false;
        }
      },
      toNote: (id) => {
        const node = find(id);
        if (readOnlyRef.current || node?.kind !== 'text' || !node.text.trim()) return;
        setInteraction({ type: 'busy', id });
        void createNoteFromText(node.text).then((item) => {
          if (!find(id)) showNotice('The note was made; its text had been removed from the canvas meanwhile.');
          dispatch({ type: 'toNote', id, file: item.file });
          void itemsChanged(qc);
        }, showError).finally(() => doneWith(id));
      },
      toText: (id) => {
        const node = find(id);
        if (readOnlyRef.current || node?.kind !== 'note') return;
        setInteraction({ type: 'busy', id });
        void qc.fetchQuery({ ...itemQuery(node.file), staleTime: 0 })
          .then((item) => dispatch({ type: 'toText', id, text: noteBody(schema, item.text) }), showError)
          .finally(() => doneWith(id));
      },
      addText: (at) => {
        if (readOnlyRef.current) return;
        toIdle();
        const id = newId(docRef.current);
        dispatch({ type: 'add', node: { id, x: at.x, y: at.y, kind: 'text', text: '' } });
        setInteraction({ type: 'editing', id });
      },
      addNote: (note, at) => {
        if (readOnlyRef.current) return;
        dispatch({ type: 'add', node: { id: newId(docRef.current), x: at.x, y: at.y, kind: 'note', file: note } });
      },
      openSearch: (screen) => {
        if (readOnlyRef.current) return;
        toIdle();
        setInteraction({ type: 'search', screen, flow: screenToFlowPosition(screen), placed: 0 });
      },
      pick: (note) => {
        const current = interactionRef.current;
        if (current.type !== 'search' || readOnlyRef.current) return;
        const step = current.placed * SEARCH_STEP;
        const node: CanvasNode = { id: newId(docRef.current), x: current.flow.x + step, y: current.flow.y + step, kind: 'note', file: note };
        dispatch({ type: 'add', node });
        setInteraction({ ...current, placed: current.placed + 1 });
      },
    };
  }, [qc, schema, screenToFlowPosition]);

  /** the middle of the visible canvas, in screen coordinates */
  const middle = (): XY => {
    const rect = pane.current?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 3 } : { x: 0, y: 0 };
  };

  const linked = useMemo(() => linkedFiles(doc), [doc]);
  useSidebarAction([
    openAction,
    ...(readOnly ? [] : [{
      icon: <SquarePlus size={14} />,
      title: 'add to this canvas',
      run: (note: string) => {
        // in the middle, each one a step further so they don't stack
        const step = (added.current++ % 8) * SEARCH_STEP;
        const at = screenToFlowPosition(middle());
        actions.addNote(note, { x: at.x + step, y: at.y + step });
      },
      marked: linked,
    }]),
  ]);

  const nodes = useMemo<CanvasFlowNode[]>(() => doc.nodes.map((node) => ({
    id: node.id,
    type: node.kind,
    position: { x: node.x, y: node.y },
    data: { node },
    dragHandle: '.canvas-drag-handle',
    draggable: !readOnly,
    measured: measured.get(node.id),
  })), [doc, measured, readOnly]);

  // positions go to the doc (written once the drag ends), sizes are kept for React Flow; nothing else applies
  const onNodesChange = (changes: NodeChange<CanvasFlowNode>[]) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        dispatch({ type: 'move', id: change.id, x: change.position.x, y: change.position.y });
      } else if (change.type === 'dimensions' && change.dimensions) {
        const { width, height } = change.dimensions;
        setMeasured((current) => {
          const was = current.get(change.id);
          return was && was.width === width && was.height === height ? current : new Map(current).set(change.id, { width, height });
        });
      }
    }
  };

  const onDoubleClick = (event: ReactMouseEvent) => {
    if ((event.target as HTMLElement).classList.contains('react-flow__pane')) {
      actions.addText(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    }
  };

  const onPaneContextMenu = (event: ReactMouseEvent | MouseEvent) => {
    event.preventDefault();
    actions.openSearch({ x: event.clientX, y: event.clientY });
  };

  const toolbar: ToolbarAction[][] = [
    [
      { id: 'add-text', label: 'Add text', icon: Type, disabled: readOnly, onClick: () => actions.addText(screenToFlowPosition(middle())) },
      { id: 'add-note', label: 'Add note', icon: FilePlus, disabled: readOnly, onClick: () => actions.openSearch(middle()) },
      { id: 'open-host', label: 'Open this note in the sidebar', icon: PanelRight, onClick: () => openNote(file) },
    ],
    [
      { id: 'zoom-in', label: 'Zoom in', icon: ZoomIn, onClick: () => void zoomIn({ duration: ZOOM_MS }) },
      { id: 'zoom-out', label: 'Zoom out', icon: ZoomOut, onClick: () => void zoomOut({ duration: ZOOM_MS }) },
      { id: 'fit-view', label: 'Fit view', icon: Maximize, onClick: () => void fitView({ ...FIT_OPTIONS, duration: 200 }) },
    ],
  ];

  const context = useMemo(() => ({ interaction, readOnly, actions }), [interaction, readOnly, actions]);
  const problems = stored.dataError ? [`The note's data block can't be read: ${stored.dataError}`] : stored.problems;

  return (
    <CanvasContext.Provider value={context}>
      <div ref={pane} className="relative h-full min-h-0 overflow-hidden border border-base-300 bg-base-100">
        <ReactFlow
          colorMode="system"
          nodes={nodes}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStart={() => saver.hold(true)}
          onNodeDragStop={() => saver.hold(false)}
          onPaneClick={() => { if (interactionRef.current.type === 'editing') actions.toIdle(); }}
          onDoubleClick={onDoubleClick}
          onPaneContextMenu={onPaneContextMenu}
          zoomOnDoubleClick={false}
          nodesConnectable={false}
          nodesFocusable={false}
          elevateNodesOnSelect={false}
          deleteKeyCode={null}
          fitView
          fitViewOptions={FIT_OPTIONS}
          minZoom={0.05}
          maxZoom={2}
          panOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={28} />
          <Panel position="top-left">
            <Toolbar label="Canvas tools" groups={toolbar} />
          </Panel>
          <Panel position="top-right">
            <SaveState status={save.status} onRetry={() => saver.flush(true)} onReload={onReload} />
          </Panel>
          {problems.length > 0 && (
            <Panel position="top-center">
              <div role="alert" className="alert alert-warning max-w-md text-sm">
                <div>
                  <p>The canvas is read-only until this is fixed in the note:</p>
                  <ul className="list-disc pl-4">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
                </div>
                <button type="button" className="btn btn-sm" onClick={() => openNote(file)}>Open the note</button>
              </div>
            </Panel>
          )}
          {doc.nodes.length === 0 && interaction.type === 'idle' && !readOnly && (
            <Panel position="bottom-center">
              <p className="pointer-events-none rounded-full border border-base-300 bg-base-100/90 px-4 py-2 text-sm text-base-content/70 shadow">
                Double-click to write; right-click to add a note.
              </p>
            </Panel>
          )}
        </ReactFlow>
        {interaction.type === 'search' && (
          <PaneSearchMenu screen={interaction.screen} marked={linked} onSelect={actions.pick} onClose={actions.toIdle} />
        )}
      </div>
    </CanvasContext.Provider>
  );
}

/** How saving stands, beside the toolbar: nothing when saved; a failed write or a conflict with what to do about it. */
function SaveState({ status, onRetry, onReload }: { status: string; onRetry: () => void; onReload: () => void }) {
  if (status === 'saved') return null;
  if (status === 'conflict') {
    return <button type="button" className="btn btn-error btn-xs" title="load the canvas as stored" onClick={onReload}>Changed elsewhere: reload</button>;
  }
  if (status === 'error') {
    return <button type="button" className="btn btn-error btn-xs" title="write the canvas again" onClick={onRetry}>Not saved: retry</button>;
  }
  return <span className="badge badge-ghost badge-sm">{status === 'saving' ? 'saving…' : 'unsaved'}</span>;
}
