import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { MediaDraft } from '@/features/item-media/useMediaAttachments';
import { NoteCard } from './NoteCard';
import type { GraphNodePayload } from '@/api/types';

export type NoteNodeData = {
  note: GraphNodePayload;
  /** How many hops of relations to render from this note, or null if it isn't pinned. */
  pinDepth: number | null;
  /** Whether this note is the current session's soft anchor for placing new notes. */
  isAnchor: boolean;
  onDelete: (filename: string, pinDepth: number | null) => Promise<void>;
  onHide: (filename: string, pinDepth: number | null) => Promise<void>;
  /** Whether the card shows its editor. */
  editing: boolean;
  onEdit: (filename: string) => void;
  onSaveEdit: (filename: string, text: string, media: MediaDraft) => Promise<void>;
  onCancelEdit: () => void;
  onPin: (filename: string) => void;
  onUnpin: (filename: string) => void;
  onChangeDepth: (filename: string, nextDepth: number) => void;
};

export type NoteFlowNode = Node<NoteNodeData, 'note'>;

const CONNECT_HANDLE_POSITIONS = [Position.Top, Position.Right, Position.Bottom, Position.Left];

// Memoized: during a node drag React Flow re-renders on every frame, but a
// non-dragged node's `data` prop keeps their identity (the view sync
// in useGraphNodes doesn't run mid-drag), so this skips re-rendering every card -
// and its markdown - on each frame.
function NoteNodeInner({ data }: NodeProps<NoteFlowNode>) {
  return (
    <>
      {/*
        A single target handle, centered over the whole node and given a generous
        connectionRadius (see GraphCanvas) so any drop point on the card resolves to
        it. Two jobs: (1) lets React Flow resolve *some* handle for edges pointing at
        this node - FloatingEdge recomputes the actual path from the node rect anyway,
        so the handle's position doesn't matter for rendering, but its absence means
        edges into a source-only node silently fail to render; (2) makes "drag from
        one note onto another" reliably detect the drop target via onConnectEnd's
        connectionState.toNode.
      */}
      <Handle
        type="target"
        position={Position.Top}
        className="opacity-0 pointer-events-none"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      />

      {/*
        Always mounted - React Flow derives edge geometry from handle bounds
        even for a custom edge type that recomputes its own path (see
        FloatingEdge/getEdgeParams), so unmounting these while editing would
        drop that node's outgoing edges. Hidden (opacity-0 pointer-events-none)
        but for a small dot on hover of the node (`group` class set on the node wrapper in
        buildView) - see https://reactflow.dev/learn/customization/handles.
      */}
      {CONNECT_HANDLE_POSITIONS.map((position) => (
        <Handle
          key={position}
          id={position}
          type="source"
          position={position}
          className="size-3.5 rounded-full border-2 border-base-100 bg-primary opacity-0 pointer-events-none transition-opacity group-hover:opacity-90 group-hover:pointer-events-auto"
        />
      ))}

      <NoteCard
        note={data.note}
        pinDepth={data.pinDepth}
        isAnchor={data.isAnchor}
        onDelete={data.onDelete}
        onHide={data.onHide}
        editing={data.editing}
        onEdit={data.onEdit}
        onSaveEdit={data.onSaveEdit}
        onCancelEdit={data.onCancelEdit}
        onPin={data.onPin}
        onUnpin={data.onUnpin}
        onChangeDepth={data.onChangeDepth}
      />
    </>
  );
}

export const NoteNode = memo(NoteNodeInner);
