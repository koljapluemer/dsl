import { useReactFlow, useStore, type OnConnectEnd, type OnConnectStart, type ReactFlowState } from '@xyflow/react';
import { useCallback, useMemo, useRef, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';
import type { ImageState } from './DraftNoteCard';
import {
  DRAFT_ID_PREFIX,
  IDLE_INTERACTION,
  connectionTargetFilename,
  type ConnectingInteraction,
  type DraftInteraction,
  type Interaction,
} from './graph-interaction';
import { EXPAND_PIN_DEPTH } from './graph-hidden-relations';
import type { ViewCallbacks } from './graph-view-model';
import { useUndoToast, type UndoAction } from './useUndoToast';
import { CREATED_NOTE_PIN_DEPTH, MANUAL_PIN_DEPTH, SEARCH_RESULT_PIN_DEPTH } from '../useNoteGraph';
import { useQueryClient } from '@tanstack/react-query';
import type { GraphEdgePayload } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import {
  attachMedia,
  clearMedia,
  connectNotes,
  createNote,
  deleteNote,
  deleteRelation,
  noteText,
  notesChanged,
  undoDelete,
  updateNote,
} from '@/entities/graph/mutations';

const selectDomNode = (state: ReactFlowState): HTMLDivElement | null => state.domNode;

export interface UseGraphInteractionParams {
  setInteraction: Dispatch<SetStateAction<Interaction>>;
  onPinNote: (filename: string, depth: number) => void;
  onUnpinNote: (filename: string) => void;
  onSetPinDepth: (filename: string, depth: number) => void;
  onPinAtLeast: (filename: string, depth: number) => void;
  /** From useElkLayout - promotes the acted-on note to the next layout anchor. */
  markInteraction: (filename: string) => void;
}

export interface UseGraphInteractionResult {
  /** Handlers the note/edge components call, threaded through buildView. */
  callbacks: ViewCallbacks;
  undoAction: UndoAction | null;
  onConnectStart: OnConnectStart;
  onConnectEnd: OnConnectEnd;
  onPaneDoubleClick: (event: ReactMouseEvent) => void;
  onPaneContextMenu: (event: ReactMouseEvent | MouseEvent) => void;
  cancelInteraction: () => void;
  addNoteAtCenter: () => void;
  selectSearchNote: (filename: string) => void;
  performUndo: () => void;
}

/**
 * Owns every handler that mutates notes or relations through the API, and
 * the gestures that open the draft / connect / search interactions. The
 * `interaction` value itself is held by the caller (FlowScene) so the layout
 * hook can read its type without a hook-ordering cycle.
 */
export function useGraphInteraction({
  setInteraction,
  onPinNote,
  onUnpinNote,
  onSetPinDepth,
  onPinAtLeast,
  markInteraction,
}: UseGraphInteractionParams): UseGraphInteractionResult {
  const qc = useQueryClient();
  const { screenToFlowPosition } = useReactFlow();
  const domNode = useStore(selectDomNode);
  const { undoAction, showUndo, dismissUndo } = useUndoToast();

  // Not state: onConnectStart/onConnectEnd fire in the same gesture and never
  // need to re-render anything in between.
  const connectingFromRef = useRef<string | null>(null);

  const onConnectStart: OnConnectStart = useCallback((_event, { nodeId }) => {
    connectingFromRef.current = nodeId;
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      const sourceFilename = connectingFromRef.current;
      connectingFromRef.current = null;
      if (!sourceFilename) {
        return;
      }

      const targetFilename = connectionTargetFilename(connectionState.toNode);
      if (targetFilename && targetFilename !== sourceFilename) {
        setInteraction({ type: 'connecting', source: sourceFilename, target: targetFilename });
        return;
      }

      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!point || !('clientX' in point)) {
        return;
      }

      setInteraction({
        type: 'draft',
        clientId: `${DRAFT_ID_PREFIX}${sourceFilename}:${Date.now()}`,
        sourceFilename,
        position: screenToFlowPosition({ x: point.clientX, y: point.clientY }),
      });
    },
    [screenToFlowPosition, setInteraction],
  );

  // Opens a freestanding (unconnected) draft note at a screen point - shared by
  // the double-click gesture and the toolbar's "Add note" button.
  const openFreestandingDraft = useCallback(
    (screenPoint: { x: number; y: number }) => {
      setInteraction({
        type: 'draft',
        clientId: `${DRAFT_ID_PREFIX}orphan:${Date.now()}`,
        sourceFilename: null,
        position: screenToFlowPosition(screenPoint),
      });
    },
    [screenToFlowPosition, setInteraction],
  );

  const onPaneDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) {
        return;
      }
      openFreestandingDraft({ x: event.clientX, y: event.clientY });
    },
    [openFreestandingDraft],
  );

  const addNoteAtCenter = useCallback(() => {
    const rect = domNode?.getBoundingClientRect();
    openFreestandingDraft(
      rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    );
  }, [domNode, openFreestandingDraft]);

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault();
      setInteraction({
        type: 'search',
        screenPosition: { x: event.clientX, y: event.clientY },
      });
    },
    [setInteraction],
  );

  const cancelInteraction = useCallback(() => {
    setInteraction(IDLE_INTERACTION);
  }, [setInteraction]);

  const handleSaveDraft = useCallback(
    async (draft: DraftInteraction, body: string, label: string, reverse: boolean, image: ImageState): Promise<void> => {
      const response = await createNote({
        related: draft.sourceFilename ?? undefined,
        label,
        reverse,
        body,
      });

      // A brand-new note has no on-disk stem until it exists, so its image is a
      // second write - mirrors how `../note` adds an image right after `addNote`.
      if (image?.status === 'new') {
        await attachMedia(response.filename, image.blob);
      }

      // The new note becomes its own BFS root, so its relation to the source renders
      // correctly even if the source itself is several hops from every other pin.
      await notesChanged(qc);
      onPinNote(response.filename, CREATED_NOTE_PIN_DEPTH);
      setInteraction(IDLE_INTERACTION);
    },
    [qc, onPinNote, setInteraction],
  );

  const handleDeleteNote = useCallback(
    async (filename: string, priorDepth: number | null): Promise<void> => {
      await deleteNote(filename);
      onUnpinNote(filename);
      await notesChanged(qc);
      showUndo('Note deleted.', async () => {
        await undoDelete();
        await notesChanged(qc);
        if (priorDepth !== null) {
          onPinNote(filename, priorDepth);
        }
      });
    },
    [qc, onUnpinNote, onPinNote, showUndo],
  );

  // Edit mode works on the file's full text, read fresh from disk.
  const handleStartEdit = useCallback(
    (filename: string) => {
      void noteText(filename).then((text) => setInteraction({ type: 'edit', filename, text }), showError);
    },
    [setInteraction],
  );

  const handleSaveEdit = useCallback(
    async (filename: string, text: string, image: ImageState, previousImage: string | null): Promise<void> => {
      await updateNote(filename, text);

      // Media has its own endpoints (they write the file and the note's `media`
      // line), so it reconciles separately from the note text.
      if (image?.status === 'new') {
        await attachMedia(filename, image.blob);
      } else if (image === null && previousImage !== null) {
        await clearMedia(filename);
      }

      await notesChanged(qc);
      markInteraction(filename);
      setInteraction(IDLE_INTERACTION);
    },
    [qc, markInteraction, setInteraction],
  );

  const handleConfirmConnection = useCallback(
    async (connecting: ConnectingInteraction, label: string): Promise<void> => {
      await connectNotes({
        source: connecting.source,
        target: connecting.target,
        label,
      });

      await notesChanged(qc);
      markInteraction(connecting.target);
      setInteraction(IDLE_INTERACTION);
    },
    [qc, markInteraction, setInteraction],
  );

  const handleDeleteRelation = useCallback(
    async (relation: GraphEdgePayload): Promise<void> => {
      await deleteRelation({
        source: relation.source,
        target: relation.target,
        label: relation.label,
      });
      await notesChanged(qc);
      showUndo('Relationship deleted.', async () => {
        await undoDelete();
        await notesChanged(qc);
      });
    },
    [qc, showUndo],
  );

  const handlePinNote = useCallback(
    (filename: string) => {
      onPinNote(filename, MANUAL_PIN_DEPTH);
    },
    [onPinNote],
  );

  // A hidden-relations badge was clicked: pin its note deep enough that its direct
  // relations render. `onPinAtLeast` leaves the pins untouched when the note is
  // already that deep, so a stray second click while the new graph is still
  // loading is a no-op instead of a redundant refetch. The note also becomes the
  // layout anchor, so the notes that appear are seeded next to it rather than
  // next to an older anchor.
  const handleExpandHiddenRelations = useCallback(
    (filename: string) => {
      markInteraction(filename);
      onPinAtLeast(filename, EXPAND_PIN_DEPTH);
    },
    [markInteraction, onPinAtLeast],
  );

  // Left open after picking a result (see PaneSearchMenu) rather than resetting
  // to idle, so the same right-click session can pin several search matches in
  // a row without reopening the menu each time.
  const selectSearchNote = useCallback(
    (filename: string) => {
      onPinNote(filename, SEARCH_RESULT_PIN_DEPTH);
    },
    [onPinNote],
  );

  const performUndo = useCallback(() => {
    if (!undoAction) {
      return;
    }
    const action = undoAction;
    dismissUndo();
    void action.perform();
  }, [undoAction, dismissUndo]);

  const callbacks = useMemo<ViewCallbacks>(
    () => ({
      onDeleteNote: handleDeleteNote,
      onStartEdit: handleStartEdit,
      onSaveEdit: handleSaveEdit,
      onSaveDraft: handleSaveDraft,
      onCancelInteraction: cancelInteraction,
      onConfirmConnection: handleConfirmConnection,
      onDeleteRelation: handleDeleteRelation,
      onPinNote: handlePinNote,
      onUnpinNote,
      onChangeDepth: onSetPinDepth,
      onExpandHiddenRelations: handleExpandHiddenRelations,
    }),
    [
      handleDeleteNote,
      handleStartEdit,
      handleSaveEdit,
      handleSaveDraft,
      cancelInteraction,
      handleConfirmConnection,
      handleDeleteRelation,
      handlePinNote,
      onUnpinNote,
      onSetPinDepth,
      handleExpandHiddenRelations,
    ],
  );

  return {
    callbacks,
    undoAction,
    onConnectStart,
    onConnectEnd,
    onPaneDoubleClick,
    onPaneContextMenu,
    cancelInteraction,
    addNoteAtCenter,
    selectSearchNote,
    performUndo,
  };
}
