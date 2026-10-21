import { BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, type EdgeProps } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { memo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isSubmit } from '@/dumb/keys';
import { showNotice, UNSAVED } from '@/dumb/notice';
import { notesChanged, updateRelationLabel } from '@/entities/graph/mutations';
import { EDGE_OVERLAY_Z_INDEX, getEdgeParams } from './graph-edge-geometry';
import type { GraphEdgePayload } from '@/api/types';

export interface FloatingEdgeData extends Record<string, unknown> {
  relations: GraphEdgePayload[];
  onDeleteRelation?: (relation: GraphEdgePayload) => Promise<void>;
  onOpenInlineRelation?: (relation: GraphEdgePayload) => void;
}

// Memoized so a node drag only re-renders the edges actually touching the moved
// node: for every other edge the props stay referentially stable (the view sync
// is paused during a drag) and its `useInternalNode` subscriptions don't change.
function FloatingEdgeInner({ id, source, target, style, markerStart, markerEnd, data }: EdgeProps) {
  const qc = useQueryClient();
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const [editing, setEditing] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!sourceNode?.measured.width || !targetNode?.measured.width) {
    return null;
  }

  const { relations = [], onDeleteRelation, onOpenInlineRelation } = (data ?? {}) as Partial<FloatingEdgeData>;
  const inline = relations.length > 0 && relations.every((relation) => relation.inline);
  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);

  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
    curvature: 0.32,
  });

  const openEditor = (): void => {
    setLabels(relations.map((relation) => relation.label));
    setError(null);
    setEditing(true);
  };

  const handleSave = async (): Promise<void> => {
    setBusy(true);
    setError(null);

    try {
      await Promise.all(
        relations.map((relation, index) => {
          const nextLabel = labels[index]?.trim();
          if (!nextLabel || nextLabel === relation.label) {
            return Promise.resolve();
          }
          return updateRelationLabel({
            source: relation.source,
            target: relation.target,
            label: relation.label,
            nextLabel,
          });
        }),
      );
      await notesChanged(qc);
      setEditing(false);
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (relation: GraphEdgePayload): Promise<void> => {
    setBusy(true);
    setError(null);

    try {
      await onDeleteRelation?.(relation);
      setEditing(false);
    } catch (deleteError) {
      setError((deleteError as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <BaseEdge id={id} path={path} style={{ ...style, ...(inline ? { cursor: 'pointer' } : {}) }} markerStart={markerStart} markerEnd={markerEnd}
                interactionWidth={inline ? 20 : 0} onClick={inline ? () => onOpenInlineRelation?.(relations[0]) : undefined} />
      {relations.length > 0 && !inline ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              zIndex: EDGE_OVERLAY_Z_INDEX,
            }}
          >
            {editing ? (
              <form
                className="w-56  border border-base-300 bg-base-100 p-2.5 shadow-lg"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSave();
                }}
              >
                {relations.map((relation, index) => (
                  <div key={relation.id} className="mb-1.5 flex items-center gap-1.5 last:mb-0">
                    <input
                      autoFocus={index === 0}
                      value={labels[index] ?? ''}
                      onChange={(event) =>
                        setLabels((prev) => {
                          const next = [...prev];
                          next[index] = event.target.value;
                          return next;
                        })
                      }
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === 'Escape') {
                          if (labels.some((label, i) => label !== relations[i]?.label)) showNotice(UNSAVED);
                          else setEditing(false);
                        } else if (isSubmit(event)) {
                          event.preventDefault();
                          void handleSave();
                        }
                      }}
                      className="input input-xs w-full rounded-full focus:border-primary/60"
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs rounded-full text-error"
                      onClick={() => void handleDelete(relation)}
                      title="Delete this relationship"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                {error ? <p className="mb-1.5 text-xs text-error">{error}</p> : null}
                <div className="flex justify-end gap-1.5">
                  <button type="button" className="btn btn-ghost btn-xs rounded-full" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-xs rounded-full" disabled={busy}>
                    Save
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={openEditor}
                className="rounded-full border border-base-300 bg-base-100/90 px-2 py-0.5 text-xs font-bold text-base-content shadow-sm hover:border-primary/50"
              >
                {relations.map((relation) => relation.label).join(' | ')}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const FloatingEdge = memo(FloatingEdgeInner);
