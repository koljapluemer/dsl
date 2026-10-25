import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { backlinksQuery } from '@/entities/item/queries';
import { useSchema } from '@/entities/item/schema';
import { RelationAdder } from './RelationAdder';
import { RelationRow } from './RelationRow';
import { rowsOf, type PendingOp } from './relationModel';
import type { RelationOps } from './useRelationOps';

type Props = {
  /** the note; null for a new one */
  file: string | null;
  /** its text as edited (or saved), and the targets' headings */
  text: string;
  refs: Record<string, string | null>;
  /** its staged changes to other notes */
  pending: PendingOp[];
  /** rows detachable, deletable and relabelable, and the adder */
  editable: boolean;
  ops: RelationOps;
  /** a click on the other note */
  onRef: (file: string) => void;
};

/**
 * The note's relationships, both ways - the one place they're shown and
 * managed. What a change does (written at once, or staged) is `ops`'s.
 */
export function Relationships({ file, text, refs, pending, editable, ops, onRef }: Props) {
  const schema = useSchema();
  const { data: backlinks } = useQuery(backlinksQuery(file ?? ''));
  const rows = rowsOf(schema, text, refs, backlinks ?? [], pending);
  const [busy, setBusy] = useState(false);

  async function run(change: () => Promise<boolean>) {
    setBusy(true);
    try { return await change(); } finally { setBusy(false); }
  }

  if (!rows.length && !editable) return null;
  return (
    <div className="space-y-1.5 border-t border-base-300 pt-2">
      {rows.map((row) => (
        <RelationRow key={row.key} row={row} editable={editable} busy={busy} onOpen={onRef}
                     onDetach={() => void run(() => ops.detach(row))} onDelete={() => void run(() => ops.remove(row))}
                     onRelabel={(next) => void run(() => ops.relabel(row, next))} />
      ))}
      {editable && (
        <RelationAdder exclude={[...(file ? [file] : []), ...rows.flatMap((r) => (r.file ? [r.file] : []))]} busy={busy}
                       onAdd={(direction, label, how) => run(() => ops.add(direction, label, how))} />
      )}
    </div>
  );
}
