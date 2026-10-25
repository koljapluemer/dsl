import { useQueryClient } from '@tanstack/react-query';
import type { Item } from '@/api/types';
import { showError } from '@/dumb/notice';
import { addRelation, relabelRelation, removeRelation } from '@/entities/item/dsl/relation';
import { addBacklink, detachItem, itemsChanged, relabelItem, relateItem } from '@/entities/item/mutations';
import { backlinksQuery, itemQuery } from '@/entities/item/queries';
import { useSchema } from '@/entities/item/schema';
import type { Pick } from './NotePicker';
import { stem, type Direction, type PendingOp, type Row } from './relationModel';

/** What the widget can do to a relationship; each resolves to whether it did. */
export type RelationOps = {
  add: (direction: Direction, label: string, pick: Pick) => Promise<boolean>;
  detach: (row: Row) => Promise<boolean>;
  relabel: (row: Row, next: string) => Promise<boolean>;
  /** deletes the other note */
  remove: (row: Row) => Promise<boolean>;
};

type Params = {
  /**
   * `staged`: nothing is written - this note's own lines are edits of `text`,
   * changes to other notes go to `pending` (see runPending). `immediate`: each
   * is written at once, after `flush` saved any pending edit.
   */
  mode: 'staged' | 'immediate';
  /** this note's (draft) text and its setter */
  text: string;
  setText: (text: string) => void;
  pending: PendingOp[];
  setPending: (pending: PendingOp[]) => void;
  /** resolves to the note's file once pending edits are saved */
  flush: () => Promise<string>;
  /** the note as written by an immediate change */
  onChanged: (item: Item) => void;
  /** deletes a note, offering to undo it; resolves to whether it was deleted */
  deleteItem: (item: Item) => Promise<boolean>;
};

/** The relationship changes for one note, as its commit policy has them (see Params.mode). */
export function useRelationOps({ mode, text, setText, pending, setPending, flush, onChanged, deleteItem }: Params): RelationOps {
  const qc = useQueryClient();
  const schema = useSchema();
  const fetchItem = (file: string) => qc.fetchQuery({ ...itemQuery(file), staleTime: 0 });

  /** Runs an immediate change; `write` resolves to this note when it changed it. */
  async function now(write: (file: string) => Promise<Item | void>) {
    try {
      const file = await flush();
      const changed = await write(file);
      if (changed) onChanged(changed);
      await itemsChanged(qc, false);
      await qc.invalidateQueries({ queryKey: backlinksQuery(file).queryKey });
      return true;
    } catch (e) {
      showError(e);
      return false;
    }
  }

  const staged = (change: () => void) => { change(); return Promise.resolve(true); };
  const withoutPending = (row: Row) => setPending(pending.filter((_, i) => i !== row.pending));
  const target = (row: Row) => stem(row.file!);

  async function deleteOther(row: Row) {
    if (!await deleteItem(await fetchItem(row.file!))) throw new Error(`${target(row)} not deleted`);
  }

  if (mode === 'staged') {
    return {
      add: (direction, label, pick) => staged(() => {
        if ('target' in pick) {
          if (direction === 'out') setText(addRelation(text, label, stem(pick.target)));
          else setPending([...pending, { kind: 'backlink', label, source: pick.target }]);
        } else {
          setPending([...pending, { kind: direction === 'out' ? 'relate-new' : 'backlink-new', label, text: pick.text }]);
        }
      }),
      detach: (row) => staged(() => {
        if (row.pending !== undefined) withoutPending(row);
        else if (row.direction === 'out') setText(removeRelation(schema, text, row.label, target(row)));
        else setPending([...pending, { kind: 'detach-in', source: row.file!, label: row.label }]);
      }),
      relabel: (row, next) => staged(() => {
        if (row.pending !== undefined) setPending(pending.map((op, i) => (i === row.pending && 'label' in op ? { ...op, label: next.trim() } : op)));
        else if (row.direction === 'out') setText(relabelRelation(schema, text, row.label, target(row), next));
        else setPending([...pending, { kind: 'relabel-in', source: row.file!, label: row.label, next: next.trim() }]);
      }),
      remove: (row) => staged(() => {
        if (row.pending !== undefined && row.file === null) { withoutPending(row); return; }
        if (row.direction === 'out') setText(removeRelation(schema, text, row.label, target(row)));
        setPending([...pending.filter((_, i) => i !== row.pending), { kind: 'delete', file: row.file! }]);
      }),
    };
  }

  return {
    add: (direction, label, pick) => now((file) => (direction === 'out'
      ? relateItem(file, { label, ...pick })
      : addBacklink(file, 'target' in pick ? { label, source: pick.target } : { label, text: pick.text }).then(() => undefined))),
    detach: (row) => now((file) => (row.direction === 'out'
      ? detachItem(file, { label: row.label, target: target(row) })
      : detachItem(row.file!, { label: row.label, target: stem(file) }).then(() => undefined))),
    relabel: (row, next) => now((file) => (row.direction === 'out'
      ? relabelItem(file, { label: row.label, target: target(row), nextLabel: next })
      : relabelItem(row.file!, { label: row.label, target: stem(file), nextLabel: next }).then(() => undefined))),
    remove: (row) => now(async (file) => {
      await deleteOther(row);
      if (row.direction === 'out') return detachItem(file, { label: row.label, target: target(row) });
    }),
  };
}

/**
 * Writes the staged ops for the saved note `file`, in order; `onDone` hears
 * how many were written, also when one fails (it then rejects), so a retry
 * doesn't repeat them. Resolves to the note when an op changed it.
 */
export async function runPending(
  file: string, ops: PendingOp[], deleteItem: (item: Item) => Promise<boolean>, fetchItem: (file: string) => Promise<Item>, onDone: (count: number) => void,
): Promise<Item | null> {
  let note: Item | null = null;
  let done = 0;
  try {
    for (const op of ops) {
      if (op.kind === 'relate-new') note = await relateItem(file, { label: op.label, text: op.text });
      else if (op.kind === 'backlink') await addBacklink(file, { label: op.label, source: op.source });
      else if (op.kind === 'backlink-new') await addBacklink(file, { label: op.label, text: op.text });
      else if (op.kind === 'detach-in') await detachItem(op.source, { label: op.label, target: stem(file) });
      else if (op.kind === 'relabel-in') await relabelItem(op.source, { label: op.label, target: stem(file), nextLabel: op.next });
      else if (!await deleteItem(await fetchItem(op.file))) throw new Error(`${stem(op.file)} not deleted`);
      done++;
    }
  } finally {
    onDone(done);
  }
  return note;
}
