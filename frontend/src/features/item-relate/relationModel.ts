import type { Backlink, Schema } from '@/api/types';
import { itemInlineReferences } from '@/entities/item/dsl/inlineRefs';
import { relations } from '@/entities/item/dsl/relation';

/** 'out': this note → the other; 'in': the other → this note (a backlink). */
export type Direction = 'out' | 'in';

/**
 * A relationship change that touches other notes, kept until this note is
 * saved (staged mode, see useRelationOps); changes to this note's own
 * relationship lines are edits of its text instead.
 */
export type PendingOp =
  /** this note → a new note with `text` */
  | { kind: 'relate-new'; label: string; text: string }
  /** the existing note `source` → this note */
  | { kind: 'backlink'; label: string; source: string }
  /** a new note with `text` → this note */
  | { kind: 'backlink-new'; label: string; text: string }
  /** `source`'s first relationship `label` to this note removed */
  | { kind: 'detach-in'; source: string; label: string }
  /** `source`'s first relationship `label` to this note labeled `next` */
  | { kind: 'relabel-in'; source: string; label: string; next: string }
  /** the note `file` deleted */
  | { kind: 'delete'; file: string };

/** One relationship as the widget shows it. */
export type Row = {
  key: string;
  direction: Direction;
  label: string;
  /** an inline reference `[[…]]`: read-only here, it's edited in the prose */
  inline: boolean;
  /** the other note; null for one staged to be created */
  file: string | null;
  /** the other note's heading when known; null when there's no such note */
  heading?: string | null;
  /** a staged new note's text */
  text?: string;
  /** the index in `pending` of the op adding it */
  pending?: number;
};

export const stem = (file: string) => file.replace(/\.txt$/, '');

/**
 * The note's relationships: outgoing ones from its (draft) `text` and incoming
 * ones from its `backlinks`, with the staged `pending` ops applied - the rows
 * they add, and those they detach, relabel or delete (the other note) gone or changed.
 */
export function rowsOf(schema: Schema, text: string, refs: Record<string, string | null>, backlinks: Backlink[], pending: PendingOp[]): Row[] {
  const deleted = new Set(pending.flatMap((op) => (op.kind === 'delete' ? [op.file] : [])));
  const out: Row[] = relations(schema, text).map((r) => ({
    key: `out ${r.line}`, direction: 'out', label: r.label, inline: false, file: `${r.target}.txt`, heading: refs[r.target],
  }));
  const inlineTargets = [...new Set(itemInlineReferences(schema, text).map((r) => r.target))].sort();
  const outInline: Row[] = inlineTargets.map((t) => ({
    key: `out inline ${t}`, direction: 'out', label: '', inline: true, file: `${t}.txt`, heading: refs[t],
  }));

  let incoming = backlinks.map((b, i): Row => ({
    key: `in ${b.file} ${b.inline} ${i}`, direction: 'in', label: b.label, inline: b.inline, file: b.file, heading: b.heading,
  }));
  const staged: Row[] = [];
  pending.forEach((op, i) => {
    if (op.kind === 'detach-in' || op.kind === 'relabel-in') {
      const at = incoming.findIndex((r) => !r.inline && r.file === op.source && r.label === op.label);
      if (at < 0) return;
      incoming = op.kind === 'detach-in'
        ? incoming.toSpliced(at, 1)
        : incoming.with(at, { ...incoming[at], label: op.next });
    } else if (op.kind === 'relate-new') {
      staged.push({ key: `pending ${i}`, direction: 'out', label: op.label, inline: false, file: null, text: op.text, pending: i });
    } else if (op.kind === 'backlink-new') {
      staged.push({ key: `pending ${i}`, direction: 'in', label: op.label, inline: false, file: null, text: op.text, pending: i });
    } else if (op.kind === 'backlink') {
      staged.push({ key: `pending ${i}`, direction: 'in', label: op.label, inline: false, file: op.source, pending: i });
    }
  });

  const rows = [
    ...out, ...staged.filter((r) => r.direction === 'out'), ...outInline,
    ...incoming.filter((r) => !r.inline), ...staged.filter((r) => r.direction === 'in'), ...incoming.filter((r) => r.inline),
  ];
  return rows.filter((r) => !r.file || !deleted.has(r.file));
}
