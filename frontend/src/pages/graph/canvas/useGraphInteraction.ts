import type { OnConnectEnd, OnConnectStart } from '@xyflow/react';
import { useCallback, useMemo, useRef, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';
import { persistMedia, type MediaDraft } from '@/features/item-media/useMediaAttachments';
import { IDLE_INTERACTION, connectionTargetFilename, type ConnectingInteraction, type Interaction } from './graph-interaction';
import { EXPAND_PIN_DEPTH } from './graph-hidden-relations';
import type { ViewCallbacks } from './graph-view-model';
import { useUndoToast, type UndoAction } from './useUndoToast';
import { CREATED_NOTE_PIN_DEPTH, MANUAL_PIN_DEPTH, SEARCH_RESULT_PIN_DEPTH } from '../useNoteGraph';
import { useQueryClient } from '@tanstack/react-query';
import type { GraphEdgePayload, Item } from '@/api/types';
import {
  connectNotes,
  deleteNote,
  deleteRelation,
  hideNote,
  notesChanged,
  undoDelete,
  updateNote,
} from '@/entities/graph/mutations';
import { markDeleted, markWritten } from '@/entities/item/deleted';

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
  addNote: () => void;
  /** A note made in the new-note modal: pinned, as its own root. */
  onCreated: (item: Item) => void;
  selectSearchNote: (filename: string) => void;
  performUndo: () => void;
  dismissUndo: () => void;
}

/**
 * Owns every handler that mutates notes or relations through the API, and
 * the gestures that open the new-note / connect / search interactions. The
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
  const { undoAction, showUndo, dismissUndo } = useUndoToast();

  // Not state: onConnectStart/onConnectEnd fire in the same gesture and never
  // need to re-render anything in between.
  const connectingFromRef = useRef<string | null>(null);

  const onConnectStart: OnConnectStart = useCallback((_event, { nodeId }) => {
    connectingFromRef.current = nodeId;
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(
    (_event, connectionState) => {
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

      // dropped on empty canvas: a new note, related from the dragged one
      setInteraction({ type: 'create', sourceFilename });
    },
    [setInteraction],
  );

  const onPaneDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      if ((event.target as HTMLElement).classList.contains('react-flow__pane')) {
        setInteraction({ type: 'create', sourceFilename: null });
      }
    },
    [setInteraction],
  );

  const addNote = useCallback(() => setInteraction({ type: 'create', sourceFilename: null }), [setInteraction]);

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

  // The new note becomes its own BFS root, so its relation to the source renders
  // correctly even if the source itself is several hops from every other pin.
  const handleCreated = useCallback(
    (item: Item) => {
      void notesChanged(qc);
      onPinNote(item.file, CREATED_NOTE_PIN_DEPTH);
      setInteraction(IDLE_INTERACTION);
    },
    [qc, onPinNote, setInteraction],
  );

  const handleDeleteNote = useCallback(
    async (filename: string, priorDepth: number | null): Promise<void> => {
      await deleteNote(filename);
      await markDeleted(qc, filename);
      onUnpinNote(filename);
      await notesChanged(qc);
      showUndo('Note deleted.', async () => {
        await undoDelete();
        markWritten(filename);
        await notesChanged(qc);
        if (priorDepth !== null) {
          onPinNote(filename, priorDepth);
        }
      });
    },
    [qc, onUnpinNote, onPinNote, showUndo],
  );

  // Tags the note so the graph leaves it out (see docs/hiding.md); undone like a delete.
  const handleHideNote = useCallback(
    async (filename: string, priorDepth: number | null): Promise<void> => {
      await hideNote(filename);
      onUnpinNote(filename);
      await notesChanged(qc);
      showUndo('Note hidden.', async () => {
        await undoDelete();
        await notesChanged(qc);
        if (priorDepth !== null) {
          onPinNote(filename, priorDepth);
        }
      });
    },
    [qc, onUnpinNote, onPinNote, showUndo],
  );

  // The card's editor reads the file's full text fresh from disk.
  const handleStartEdit = useCallback(
    (filename: string) => {
      setInteraction({ type: 'edit', filename });
    },
    [setInteraction],
  );

  const handleSaveEdit = useCallback(
    async (filename: string, text: string, media: MediaDraft): Promise<void> => {
      await updateNote(filename, text);

      // Media has its own endpoints (they write the files and the note's `media`
      // lines), so it reconciles separately from the note text.
      await persistMedia(filename, media);

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

  const handleOpenInlineRelation = useCallback(
    (relation: GraphEdgePayload) => {
      markInteraction(relation.source);
      setInteraction({ type: 'edit', filename: relation.source });
    },
    [markInteraction, setInteraction],
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
      onHideNote: handleHideNote,
      onStartEdit: handleStartEdit,
      onSaveEdit: handleSaveEdit,
      onCancelInteraction: cancelInteraction,
      onConfirmConnection: handleConfirmConnection,
      onDeleteRelation: handleDeleteRelation,
      onOpenInlineRelation: handleOpenInlineRelation,
      onPinNote: handlePinNote,
      onUnpinNote,
      onChangeDepth: onSetPinDepth,
      onExpandHiddenRelations: handleExpandHiddenRelations,
    }),
    [
      handleDeleteNote,
      handleHideNote,
      handleStartEdit,
      handleSaveEdit,
      cancelInteraction,
      handleConfirmConnection,
      handleDeleteRelation,
      handleOpenInlineRelation,
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
    addNote,
    onCreated: handleCreated,
    selectSearchNote,
    performUndo,
    dismissUndo,
  };
}
