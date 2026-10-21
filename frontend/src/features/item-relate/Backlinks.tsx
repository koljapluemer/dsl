import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Backlink, Item } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { addBacklink, detachItem, itemsChanged } from '@/entities/item/mutations';
import { backlinksQuery, itemQuery } from '@/entities/item/queries';
import type { Pick } from './NotePicker';
import { RelationAdder } from './RelationAdder';
import { RelationRow } from './RelationRow';

type Props = {
  /** the saved note the relationships point to */
  file: string;
  /** deletes a linking note; resolves to whether it was deleted */
  deleteItem: (item: Item) => Promise<boolean>;
  /** small controls and no heading, for tight spots like table rows */
  compact?: boolean;
};

/**
 * The relationships other notes have to `file`, each detachable (from the
 * other note) and that note deletable, then a group for linking another
 * note, existing or new, to it.
 */
export function Backlinks({ file, deleteItem, compact }: Props) {
  const qc = useQueryClient();
  const { data } = useQuery(backlinksQuery(file));
  const [busy, setBusy] = useState(false);
  const links = data ?? [];

  /** Runs `write`; resolves to whether it succeeded. */
  async function run(write: () => Promise<unknown>) {
    setBusy(true);
    try {
      await write();
      await itemsChanged(qc);
      return true;
    } catch (e) {
      showError(e);
      return false;
    } finally { setBusy(false); }
  }

  const add = (label: string, how: Pick) =>
    run(() => addBacklink(file, 'target' in how ? { label, source: how.target } : { label, text: how.text }));

  const unlink = (b: Backlink) => run(() => detachItem(b.file, { label: b.label, target: file.replace(/\.txt$/, '') }));

  const remove = (b: Backlink) => run(async () => {
    if (!await deleteItem(await qc.fetchQuery({ ...itemQuery(b.file), staleTime: 0 }))) throw new Error('note not deleted');
  });

  return (
    <div>
      {!compact && <p className="font-medium mb-1">Backlinks</p>}
      {data && !links.length && <p className="ov-muted text-xs">No notes link here.</p>}
      {links.map((b, i) => (
        <RelationRow key={`${b.file} ${b.label} ${b.inline} ${i}`} direction="in" label={b.label} file={b.file} heading={b.heading} inline={b.inline}
                     busy={busy} onDetach={() => unlink(b)} onDelete={() => remove(b)} compact={compact} />
      ))}
      <RelationAdder exclude={[file, ...links.map((b) => b.file)]} busy={busy} onAdd={add} compact={compact} />
    </div>
  );
}
