import { useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { EditorView } from '@codemirror/view';
import { BookDown, Check, Copy, Pencil, Trash2, Undo2, X } from 'lucide-react';
import type { Item } from '@/api/types';
import { showError, showNotice, UNSAVED } from '@/dumb/notice';
import { analyze } from '@/entities/item/dsl/analyze';
import { insertReference } from '@/entities/item/dsl/referenceCompletion';
import { hasTag } from '@/entities/item/dsl/tags';
import { draftItem } from '@/entities/item/draftItem';
import { FileList } from '@/entities/item/files/FileList';
import { NoteMedia } from '@/entities/item/files/Media';
import { attachMedia, clearMedia, itemsChanged, saveItem, setTag } from '@/entities/item/mutations';
import { NoteContent } from '@/entities/item/NoteContent';
import { NoteLine } from '@/entities/item/NoteLine';
import { deletedItems } from '@/entities/item/deleted';
import { itemQuery } from '@/entities/item/queries';
import { useSchema } from '@/entities/item/schema';
import { useOpenNote } from '@/entities/item/sidebar';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { TextFileModal } from '@/features/file-edit/TextFileModal';
import { ItemTextEditor } from '@/features/item-edit/ItemTextEditor';
import { MediaAttachmentPreview, MediaPicker } from '@/features/item-media/MediaAttachmentField';
import type { MediaAttachment } from '@/features/item-media/useMediaAttachment';
import type { PendingOp } from '@/features/item-relate/relationModel';
import { Relationships } from '@/features/item-relate/Relationships';
import { runPending, useRelationOps } from '@/features/item-relate/useRelationOps';
import { BibtexConflicts, BibtexPicker, StagedSources } from '@/features/source-bibtex/BibtexSourcesField';
import { useBibtexUpdate } from '@/features/source-bibtex/useBibtexUpdate';
import { useSessionState } from '@/dumb/useSessionState';
import { ALL_MODES, isMode, resolveMode, type NoteMode } from './mode';
import { NoteModal } from './NoteModal';
import { Extra, ModeToggle, TOOL, ToolButton, type ExtraTool, type TagToggle, type ToolId } from './tools';
import { useNoteDraft } from './useNoteDraft';
import { useNoteItem } from './useNoteItem';

export type NoteProps = {
  /** the note; null for a new one (key the component by it) */
  file: string | null;
  /** a new note's text */
  initial?: string;
  /** the note as already loaded (a list's), so it isn't fetched */
  item?: Item;
  /** `full` (default), `simple`: the body and attachment only, `inline`: one line (see NoteLine) */
  render?: 'full' | 'simple' | 'inline';
  /** the modes offered (default all; a new note only edits); the toggle hides when there's one */
  modes?: readonly NoteMode[];
  /** the mode shown first (default view) */
  defaultMode?: NoteMode;
  /** the mode, when the caller keeps it */
  mode?: NoteMode;
  onModeChange?: (mode: NoteMode) => void;
  /** a key keeping the mode chosen for the browser tab's session: per view (`notes`), per view and note (`notes:<file>`), … */
  persist?: string;
  /** `explicit` (default): Save/Discard replace the toggle while edited; `blur`: edits are written as focus leaves the note */
  commit?: 'explicit' | 'blur';
  /** the relationships widget (default on; never in `simple` and `inline`) */
  relationships?: boolean;
  /** whether it's editable in view mode too (default); in edit and split it always is */
  relationshipsEditableInView?: boolean;
  /** relationship changes staged from the start (a new note related to another) */
  initialPending?: PendingOp[];
  /** tools switched off (or `edit` on in `full`); by default each shows where it applies */
  tools?: Partial<Record<ToolId, boolean>>;
  tagToggles?: TagToggle[];
  /** the page's own tools, first in the row */
  extraTools?: ExtraTool[];
  /** where the attachment sits: above (default), or beside the rest on a wide enough note */
  mediaPosition?: 'top' | 'start' | 'end';
  /** inline: characters of the first line shown; text to mark; the whole line clickable */
  inlineChars?: number;
  /** inline: the whole body, uncut, instead of the first line */
  inlineWhole?: boolean;
  highlight?: string | null;
  onClick?: () => void;
  /** the edit tool does this instead of opening its own modal (a page keeping the modal) */
  onEdit?: () => void;
  /** writes the edit instead of the items API (the graph's update) */
  save?: (text: string, media: MediaAttachment, item: Item | null) => Promise<Item | void>;
  /** deletes instead of the items API (with its undo); resolves to whether it did */
  onDelete?: () => Promise<boolean>;
  onSaved?: (item: Item) => void;
  /** a new note, once written */
  onCreated?: (item: Item) => void;
  onDeleted?: () => void;
  /** a close button */
  onClose?: () => void;
  /** a click on a related or linked note; by default it opens in the sidebar */
  onRef?: (file: string) => void;
  /** Escape in an unedited editor; by default it leaves the editor */
  onEscape?: () => void;
  autofocus?: boolean;
  /** fills its box, the note scrolling inside */
  fill?: boolean;
  id?: string;
  className?: string;
};

/**
 * A note, wherever one is shown: rendered, edited or both, with its tools,
 * attachment and relationships, as its parameters ask (docs/note-component.md).
 */
export function Note(props: NoteProps) {
  const { item, adopt, loading, error } = useNoteItem(props.file, props.item);
  const deleted = deletedItems.use();
  // gone at once, not when the list showing it has refetched; back if it's restored
  const file = props.file ?? props.item?.file;
  if (file && deleted.has(file)) return null;
  if (loading || (props.file && !item)) {
    return (
      <div id={props.id} className={props.className}>
        {error ? <p className="text-sm text-error">{error.message}</p> : <span className="loading loading-dots loading-sm" />}
      </div>
    );
  }
  return <LoadedNote {...props} item={item ?? undefined} adopt={adopt} />;
}

function LoadedNote({
  initial = '', item: shown, adopt, render = 'full', modes: modesAsked = ALL_MODES, defaultMode = 'view', mode: modeAsked, onModeChange,
  persist, commit = 'explicit', relationships = true, relationshipsEditableInView = true, initialPending, tools = {}, tagToggles = [],
  extraTools = [], mediaPosition = 'top', inlineChars, inlineWhole, highlight, onClick, onEdit, save: write, onDelete, onSaved, onCreated, onDeleted, onClose,
  onRef, onEscape, autofocus = false, fill = false, id, className = '',
}: NoteProps & { adopt: (item: Item) => void }) {
  const qc = useQueryClient();
  const schema = useSchema();
  const openNote = useOpenNote();
  const deleteItem = useDeleteItem();
  const item = shown ?? null;
  const isNew = !item;
  const ref = onRef ?? openNote;

  const modes = isNew ? (['edit'] as const) : modesAsked;
  const [stored, setStored] = useSessionState<NoteMode>(persist && `note-mode:${persist}`, defaultMode, isMode);
  const mode = render === 'full' ? resolveMode(modes, modeAsked ?? stored, isNew ? 'edit' : defaultMode) : 'view';
  const editing = mode !== 'view';
  const blur = commit === 'blur' && !isNew;

  const draft = useNoteDraft(item, initial, initialPending);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  // the file open in its text editor (see FileList)
  const [textFile, setTextFile] = useState<string | null>(null);
  const [focus, setFocus] = useState(autofocus);
  const editorRef = useRef<EditorView | null>(null);
  const deleting = useRef(false);
  // into the editor afterwards, so focus leaving the note writes a blur-committed update
  const update = useBibtexUpdate((text) => { draft.setText(text); editorRef.current?.focus(); });
  const fetchItem = (f: string) => qc.fetchQuery({ ...itemQuery(f), staleTime: 0 });

  const setMode = async (next: NoteMode) => {
    if (blur && draft.dirty && !(await save())) return;
    setFocus(next !== 'view');
    setStored(next);
    onModeChange?.(next);
  };

  /** Writes the draft; resolves to the note as written, null when nothing was (or it failed, shown). */
  async function save(): Promise<Item | null> {
    // a delete in flight or done leaves nothing to write to (a blur may still come)
    if (busy || deleting.current || !draft.text.trim() || !draft.dirty) return null;
    setBusy(true);
    setProblem(null);
    try {
      const text = draft.bib.staged.length ? (await draft.bib.apply(draft.text)).text! : draft.text;
      const attachment = draft.media.attachment;
      let saved: Item;
      if (write) {
        saved = (await write(text, attachment, item)) ?? draftItem(text, item ?? undefined);
      } else {
        saved = !item || text !== item.text ? await saveItem(item?.file ?? null, text) : item;
        if (attachment?.status === 'new') saved = await attachMedia(saved.file, attachment.blob);
        else if (attachment === null && item?.media) saved = await clearMedia(saved.file);
        adopt(saved);
      }
      draft.reset(saved, true);
      if (draft.pending.length) {
        const changed = await runPending(saved.file, draft.pending, deleteItem, fetchItem, (done) => draft.setPending(draft.pending.slice(done)));
        if (changed) { saved = changed; adopt(changed); draft.reset(changed); }
      }
      void itemsChanged(qc);
      onSaved?.(saved);
      if (isNew) onCreated?.(saved);
      return saved;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  const discard = () => {
    update.cancel();
    if (isNew && onClose) onClose();
    else draft.reset({ text: item?.text ?? initial, media: item?.media ?? null });
  };

  async function del() {
    deleting.current = true;
    const deleted = onDelete ? await onDelete() : !!item && await deleteItem(item);
    deleting.current = deleted;
    if (deleted) onDeleted?.();
  }

  async function toggleTag(tag: string, on: boolean) {
    try {
      adopt(await setTag(item!.file, tag, on));
      void itemsChanged(qc);
    } catch (e) { showError(e); }
  }

  const ops = useRelationOps({
    mode: editing && (commit === 'explicit' || isNew) ? 'staged' : 'immediate',
    text: draft.text, setText: draft.setText, pending: draft.pending, setPending: draft.setPending,
    flush: async () => {
      if (draft.dirty && !(await save())) throw new Error('The note could not be saved');
      if (!item) throw new Error('Write the note first');
      return item.file;
    },
    onChanged: (changed) => { adopt(changed); draft.reset(changed); },
    deleteItem,
  });

  const want = (tool: ToolId, applies: boolean) => applies && (tools[tool] ?? (tool !== 'edit' || render !== 'full'));
  const attach = (f: File) => void draft.media.attachFile(f);
  const toolRow: ReactNode[] = [
    ...extraTools.map((t) => <Extra key={t.key} tool={t} />),
    want('media', editing) && <MediaPicker key="media" onAttach={attach} className={TOOL} />,
    want('reference', editing) && (
      <ToolButton key="reference" title="insert note reference" onClick={() => editorRef.current && insertReference(editorRef.current)}>[[</ToolButton>
    ),
    want('bibtex', editing) && <BibtexPicker key="bibtex" onPick={() => void draft.bib.fromClipboard()} className={TOOL} />,
    want('bibtexUpdate', editing && !!item?.sourceKey) && (
      <ToolButton key="bibtexUpdate" title="update this source from BibTeX in the clipboard"
                  onClick={() => void update.fromClipboard(item!.file, draft.text)}><BookDown size={14} /></ToolButton>
    ),
    want('copyKey', !!item?.sourceKey) && (
      <ToolButton key="copyKey" title={`copy key ${item!.sourceKey}`} onClick={() => void navigator.clipboard.writeText(item!.sourceKey!)
        .then(() => showNotice(`copied ${item!.sourceKey}`), showError)}><Copy size={14} /></ToolButton>
    ),
    ...(item ? tagToggles.map((t) => {
      const on = hasTag(schema, item.text, t.tag);
      const Icon = on && t.activeIcon ? t.activeIcon : t.icon;
      return (
        <ToolButton key={`tag ${t.tag}`} title={on ? (t.activeTitle ?? t.title) : t.title} active={on && !t.activeIcon}
                    onClick={() => void toggleTag(t.tag, !on)}><Icon size={14} /></ToolButton>
      );
    }) : []),
    want('edit', !!item) && <ToolButton key="edit" title="edit" onClick={onEdit ?? (() => setModal(true))}><Pencil size={14} /></ToolButton>,
    want('delete', !!item || !!onDelete) && (
      <ToolButton key="delete" title="delete" danger disabled={busy} onClick={() => void del()}><Trash2 size={14} /></ToolButton>
    ),
  ].filter(Boolean);

  const modalNote = modal && item && (
    <NoteModal file={item.file} onClose={() => setModal(false)} onSaved={adopt} onDeleted={onDeleted} onRef={onRef} />
  );

  if (render === 'inline') {
    return (
      <div id={id} className={className}>
        <NoteLine item={item ?? draftItem(initial)} chars={inlineChars} whole={inlineWhole} highlight={highlight} onClick={onClick} onRef={ref}
                  actions={toolRow.length ? toolRow : undefined} />
        {modalNote}
      </div>
    );
  }

  const explicitEdits = editing && !blur && draft.dirty;
  const header = (
    <div className="mb-2 flex min-h-6 flex-wrap items-center gap-0.5">
      {toolRow}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {blur && busy && <span className="loading loading-spinner loading-xs" />}
        {explicitEdits ? <>
          <button type="button" className="btn btn-primary btn-xs btn-square" title="save (Ctrl+Enter)" disabled={busy || !draft.text.trim()}
                  onClick={() => void save()}>
            {busy ? <span className="loading loading-spinner loading-xs" /> : <Check size={14} />}
          </button>
          <button type="button" className="btn btn-ghost btn-xs btn-square" title="discard changes" disabled={busy} onClick={discard}><Undo2 size={14} /></button>
        </> : render === 'full' && modes.length > 1 && <ModeToggle modes={modes} mode={mode} onMode={(m) => void setMode(m)} />}
        {onClose && <button type="button" className={TOOL} title="close" onClick={onClose}><X size={14} /></button>}
      </div>
    </div>
  );

  const media = editing
    ? draft.media.attachment && <MediaAttachmentPreview attachment={draft.media.attachment} onRemove={() => draft.media.setAttachment(null)} />
    : item?.media && (
      <NoteMedia path={item.media} onDelete={async () => { const cleared = await clearMedia(item.file); adopt(cleared); draft.reset(cleared); void itemsChanged(qc); }} />
    );

  const keys = (event: KeyboardEvent) => {
    // keys stay here: the graph's canvas and a modal would act on them too
    event.stopPropagation();
    if (event.key !== 'Escape') return;
    if (draft.dirty && !blur) showNotice(UNSAVED);
    else if (onEscape) onEscape();
    else (document.activeElement as HTMLElement | null)?.blur();
  };

  const editor = (
    <div className="nodrag nowheel nopan cursor-auto select-text" onKeyDown={keys}>
      <StagedSources rows={draft.bib.staged} onChoice={draft.bib.setChoice} onRemove={draft.bib.remove} />
      <BibtexConflicts conflicts={update.conflicts} take={update.take} onTake={update.setTake} onApply={() => void update.apply(draft.text)}
                       onCancel={() => { update.cancel(); editorRef.current?.focus(); }} />
      {(draft.media.error || draft.bib.error || update.error) && (
        <p className="mb-2 text-sm text-error">{draft.media.error ?? draft.bib.error ?? update.error}</p>
      )}
      <ItemTextEditor value={draft.text} autofocus={focus} onChange={draft.setText} onSave={() => void save()} onPasteFile={attach}
                      currentFile={item?.file} editorRef={editorRef} />
      <Problems text={draft.text} />
    </div>
  );

  const preview = (text: string) => <NoteContent item={draftItem(text, item ?? undefined)} variant={render === 'simple' ? 'simple' : 'full'} onRef={ref} />;
  const content = mode === 'edit' ? editor
    : mode === 'split' ? <div className="grid gap-3 @3xl:grid-cols-2">{editor}<div className="min-w-0">{preview(draft.text)}</div></div>
    : preview(item?.text ?? initial);

  const side = mediaPosition !== 'top' && media;
  const body = (
    <div className={side ? `flex flex-col gap-3 ${mediaPosition === 'end' ? '@2xl:flex-row-reverse' : '@2xl:flex-row'}` : 'space-y-3'}>
      {media && <div className={side ? 'shrink-0 @2xl:w-1/3' : ''}>{media}</div>}
      <div className="min-w-0 flex-1 space-y-3">
        {content}
        {item && <FileList item={item} onOpen={setTextFile} />}
        {render === 'full' && relationships && (
          <Relationships file={item?.file ?? null} text={draft.text} refs={item?.refs ?? {}} pending={draft.pending}
                         editable={editing || relationshipsEditableInView} ops={ops} onRef={ref} />
        )}
      </div>
    </div>
  );

  // focus leaving the note (not moving within it) writes a blur-committed edit
  const onBlur = blur ? (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) void save();
  } : undefined;

  return (
    // data-unsaved: a modal around it then won't close on Escape or a click outside
    <div id={id} className={`@container ${fill ? 'flex h-full min-h-0 flex-col' : ''} ${className}`} onBlur={onBlur}
         data-unsaved={(!blur && draft.dirty) || undefined}>
      {header}
      {problem && <p className="mb-2 text-sm text-error">{problem}</p>}
      <div className={fill ? 'min-h-0 flex-1 overflow-y-auto' : ''}>{body}</div>
      {modalNote}
      {textFile && <TextFileModal path={textFile} onClose={() => setTextFile(null)} />}
    </div>
  );
}

/** The text's errors and warnings, by line. */
function Problems({ text }: { text: string }) {
  const schema = useSchema();
  const problems = useMemo(
    () => analyze(schema, text).problems.map((p) => ({ ...p, line: text.slice(0, p.from).split('\n').length })),
    [schema, text],
  );
  if (!problems.length) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs">
      {problems.map((p, i) => (
        <li key={i} className={p.severity === 'warning' ? 'text-warning' : 'text-error'}>Line {p.line}: {p.message}</li>
      ))}
    </ul>
  );
}
