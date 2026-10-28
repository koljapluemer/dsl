import { memo, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Node, NodeProps } from '@xyflow/react';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { Eye, FileText, GripVertical, Pencil, Trash2, Type, Unlink } from 'lucide-react';
import { ApiError } from '@/api/client';
import { CodeMirrorHost } from '@/dumb/CodeMirrorHost';
import { isSubmit } from '@/dumb/keys';
import { Markdown } from '@/dumb/Markdown';
import { deletedItems } from '@/entities/item/deleted';
import { itemQuery } from '@/entities/item/queries';
import { useOpenNote } from '@/entities/item/sidebar';
import { Note } from '@/meta/note/Note';
import { ToolButton } from '@/meta/note/tools';
import { useCanvas, type CanvasActions } from './canvas-context';
import type { CanvasNode } from './canvas-model';

export type CanvasFlowNode = Node<{ node: CanvasNode }, 'text' | 'note'>;

const NOTE_MODES = ['view', 'edit'] as const;
const VIEW_ONLY = ['view'] as const;
// Mod-Enter finishes the edit (see `keys`) instead of the default keymap's blank line, as in the note editor
const TEXT_EXTENSIONS = [Prec.high(keymap.of([{ key: 'Mod-Enter', run: () => true }]))];

/** The only place a node is dragged by (React Flow's `dragHandle`), so the rest stays free for selecting text. */
const grip = (
  <span key="grip" className="canvas-drag-handle cursor-grab rounded p-0.5 text-base-content/40 hover:text-base-content/70 active:cursor-grabbing" title="drag to move">
    <GripVertical size={14} />
  </span>
);

const spinner = <span key="busy" className="loading loading-spinner loading-xs" />;

function Frame({ tools, children }: { tools: ReactNode[]; children: ReactNode }) {
  return (
    // React Flow's node wrapper sets `user-select: none` and a grab cursor; the content gets text selection back
    <article className="canvas-node cursor-auto select-text rounded-box border border-base-300 bg-base-100 p-3 text-left shadow-lg">
      <div className="mb-1 flex min-h-6 flex-wrap items-center gap-0.5">{tools}</div>
      {children}
    </article>
  );
}

export function TextNode({ data }: NodeProps<CanvasFlowNode>) {
  const { interaction, readOnly, actions } = useCanvas();
  const node = data.node;
  if (node.kind !== 'text') return null;
  const id = node.id;
  return <TextView id={id} text={node.text} editing={interaction.type === 'editing' && interaction.id === id}
                   busy={interaction.type === 'busy' && interaction.id === id} readOnly={readOnly} actions={actions} />;
}

// memoized: a drag re-renders every node each frame, but not what they show
const TextView = memo(function TextView({ id, text, editing, busy, readOnly, actions }: {
  id: string; text: string; editing: boolean; busy: boolean; readOnly: boolean; actions: CanvasActions;
}) {
  const openNote = useOpenNote();
  const keys = (event: KeyboardEvent) => {
    // the canvas would act on them too
    event.stopPropagation();
    if (event.key === 'Escape' || isSubmit(event)) actions.toIdle();
  };
  const tools = readOnly ? [] : [
    grip,
    editing
      ? <ToolButton key="mode" title="view" onClick={actions.toIdle}><Eye size={14} /></ToolButton>
      : <ToolButton key="mode" title="edit" disabled={busy} onClick={() => actions.startEdit(id)}><Pencil size={14} /></ToolButton>,
    <ToolButton key="convert" title="make it a note (the text becomes a new note)" disabled={busy || !text.trim()}
                onClick={() => actions.toNote(id)}><FileText size={14} /></ToolButton>,
    <ToolButton key="delete" title="delete" danger disabled={busy} onClick={() => actions.remove(id)}><Trash2 size={14} /></ToolButton>,
    busy && spinner,
  ];
  return (
    <Frame tools={tools}>
      {editing ? (
        <div className="nodrag nowheel nopan" onKeyDown={keys}>
          <CodeMirrorHost value={text} extensions={TEXT_EXTENSIONS} onChange={(next) => actions.setText(id, next)} onSave={actions.toIdle} />
        </div>
      ) : (
        <div onDoubleClick={readOnly || busy ? undefined : (event) => { event.stopPropagation(); actions.startEdit(id); }}>
          {text.trim() ? <Markdown source={text} onRef={openNote} /> : <p className="text-sm text-base-content/40">Empty</p>}
        </div>
      )}
    </Frame>
  );
});

export function NoteNode({ data }: NodeProps<CanvasFlowNode>) {
  const { interaction, readOnly, actions } = useCanvas();
  const node = data.node;
  if (node.kind !== 'note') return null;
  const id = node.id;
  return <NoteView id={id} file={node.file} editing={interaction.type === 'editing' && interaction.id === id}
                   busy={interaction.type === 'busy' && interaction.id === id} readOnly={readOnly} actions={actions} />;
}

const NoteView = memo(function NoteView({ id, file, editing, busy, readOnly, actions }: {
  id: string; file: string; editing: boolean; busy: boolean; readOnly: boolean; actions: CanvasActions;
}) {
  const deleted = deletedItems.use().has(file);
  // the note component's own query: this only learns whether the note is there
  const item = useQuery({ ...itemQuery(file), enabled: !deleted });
  const missing = deleted || (item.error instanceof ApiError && item.error.status === 404);
  const detach = <ToolButton key="detach" title="detach from the canvas (the note stays)" disabled={busy} onClick={() => actions.remove(id)}><Unlink size={14} /></ToolButton>;

  if (missing) {
    return (
      <Frame tools={readOnly ? [] : [grip, detach]}>
        <p className="text-sm text-error">Missing note: {file.replace(/\.txt$/, '')}</p>
      </Frame>
    );
  }
  const tools = readOnly ? [] : [
    { key: 'grip', node: grip },
    {
      key: 'convert', title: editing ? 'finish editing first' : 'make it text (a copy of the note\'s body; the note stays)',
      icon: <Type size={14} />, disabled: busy || editing, onClick: () => actions.toText(id),
    },
    { key: 'detach', node: detach },
    ...(busy ? [{ key: 'busy', node: spinner }] : []),
  ];
  return (
    <article className="canvas-node canvas-note cursor-auto select-text rounded-box border border-base-300 bg-base-100 p-3 text-left shadow-lg">
      <Note file={file} modes={readOnly ? VIEW_ONLY : NOTE_MODES} mode={editing ? 'edit' : 'view'} commit="blur" relationships={false} compactViz
            onModeChange={(next) => (next === 'edit' ? actions.startEdit(id) : actions.toIdle())} onEscape={actions.toIdle}
            extraTools={tools} tools={{ delete: !readOnly && !busy }} onDelete={() => actions.deleteNote(id)} />
    </article>
  );
});
