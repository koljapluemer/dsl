import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Item } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { itemInlineReferences } from '@/entities/item/dsl/inlineRefs';
import { outline } from '@/entities/item/dsl/outline';
import { isRelationLine, relation } from '@/entities/item/dsl/relation';
import { detachItem, itemsChanged, relateItem } from '@/entities/item/mutations';
import { itemQuery } from '@/entities/item/queries';
import { useSchema } from '@/entities/item/schema';
import type { Pick } from './NotePicker';
import { RelationAdder } from './RelationAdder';
import { RelationRow } from './RelationRow';

type Props = {
  /** null for a new note not saved yet */
  item: Item | null;
  /** resolves to the note's file once pending edits are saved, null when there's no note yet */
  flush: () => Promise<string | null>;
  onChanged: (note: Item) => void;
  /** deletes a target; resolves to whether it was deleted */
  deleteItem: (item: Item) => Promise<boolean>;
  /** a click on a target; by default it opens in the editor page */
  onRef?: (file: string) => void;
};

/**
 * The note's relationships, each detachable and its target deletable, then
 * one empty group for another relationship with any label.
 */
export function Relationships({ item, flush, onChanged, deleteItem, onRef }: Props) {
  const qc = useQueryClient();
  const schema = useSchema();
  const [busy, setBusy] = useState(false);

  const text = (item?.text ?? '').trimEnd();
  const { lines, parts } = outline(schema, text);
  const relations = parts.flatMap(({ line, keyword }) => {
    const trimmed = lines[line].trim();
    const rel = !keyword && isRelationLine(trimmed) && relation(trimmed);
    return rel ? [{ line, ...rel }] : [];
  });
  const inlineTargets = new Set(itemInlineReferences(schema, text).map((ref) => ref.target));

  /** Runs `write` on the saved note's file; resolves to whether it succeeded. */
  async function run(write: (file: string) => Promise<Item>) {
    setBusy(true);
    try {
      const file = await flush();
      if (!file) throw new Error('Write the note first');
      onChanged(await write(file));
      await itemsChanged(qc, false);
      return true;
    } catch (e) {
      showError(e);
      return false;
    } finally { setBusy(false); }
  }

  const add = (label: string, how: Pick) => run((file) => relateItem(file, { label, ...how }));

  const unlink = (rel: { label: string; target: string }) => run((file) => detachItem(file, rel));

  const remove = (rel: { label: string; target: string }) => run(async (file) => {
    if (!await deleteItem(await qc.fetchQuery(itemQuery(rel.target + '.txt')))) throw new Error(`${rel.target} not deleted`);
    return detachItem(file, rel);
  });

  return (
    <div>
      <p className="font-medium mb-1">Relationships</p>
      {relations.map((rel) => (
        <RelationRow key={rel.line} direction="out" label={rel.label} file={rel.target + '.txt'} heading={item?.refs?.[rel.target]}
                     busy={busy} onDetach={() => unlink(rel)} onDelete={() => remove(rel)} onOpen={onRef} />
      ))}
      {[...inlineTargets].sort().map((target) => (
        <RelationRow key={`inline ${target}`} direction="out" label="" file={`${target}.txt`} heading={item?.refs?.[target]}
                     busy={busy} inline onOpen={onRef} />
      ))}
      <RelationAdder exclude={[...(item ? [item.file] : []), ...relations.map((r) => r.target + '.txt')]} busy={busy} onAdd={add} />
    </div>
  );
}
