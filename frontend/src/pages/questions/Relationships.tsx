import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Trash2, Unlink } from 'lucide-react';
import type { Item } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { outline } from '@/entities/item/dsl/outline';
import { isRelationLine, relation } from '@/entities/item/dsl/relation';
import { itemsChanged } from '@/entities/item/mutations';
import { useSchema } from '@/entities/item/schema';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { NotePicker, type Pick } from './NotePicker';
import { detach, fetchNote, relate } from './questions';

type Props = {
  item: Item;
  /** resolves once pending edits of the note are saved */
  flush: () => Promise<void>;
  onChanged: (note: Item) => void;
};

/**
 * The note's relationships, each detachable and its target deletable, then
 * one empty group for another relationship with any label.
 */
export function Relationships({ item, flush, onChanged }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const schema = useSchema();
  const deleteItem = useDeleteItem();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  const { lines, parts } = outline(schema, item.text.trimEnd());
  const relations = parts.flatMap(({ line, keyword }) => {
    const trimmed = lines[line].trim();
    const rel = !keyword && isRelationLine(trimmed) && relation(trimmed);
    return rel ? [{ line, ...rel }] : [];
  });

  /** Runs `write` on the saved note; resolves to whether it succeeded. */
  async function run(write: () => Promise<Item>) {
    setBusy(true);
    try {
      await flush();
      onChanged(await write());
      await itemsChanged(qc, false);
      return true;
    } catch (e) {
      showError(e);
      return false;
    } finally { setBusy(false); }
  }

  async function add(how: Pick) {
    const done = await run(() => relate(item.file, { label, ...how }));
    if (done) setLabel('');
    return done;
  }

  const unlink = (rel: { label: string; target: string }) => run(() => detach(item.file, rel));

  const remove = (rel: { label: string; target: string }) => run(async () => {
    if (!await deleteItem(await fetchNote(rel.target + '.txt'))) throw new Error(`${rel.target} not deleted`);
    return detach(item.file, rel);
  });

  return (
    <div>
      <p className="font-medium mb-1">Relationships</p>
      {relations.map((rel) => {
        const heading = item.refs?.[rel.target];
        const file = rel.target + '.txt';
        return (
          <div key={rel.line} className="flex items-center gap-1 text-sm">
            <span className="ov-muted">{rel.label ? rel.label + ' ' : ''}→</span>
            {heading === null
              ? <span className="ov-missing" title={`no item ${file}`}>{rel.target}</span>
              : <a className="link link-hover truncate" title={file} onClick={() => navigate({ to: '/edit/$file', params: { file } })}>{heading || rel.target}</a>}
            <button className="btn btn-ghost btn-xs btn-square ml-auto" disabled={busy} title="detach (remove the relationship)" onClick={() => unlink(rel)}>
              <Unlink size={16} />
            </button>
            <button className="btn btn-ghost btn-xs btn-square" disabled={busy || heading === null} title={`delete ${file}`} onClick={() => remove(rel)}>
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
      <div className="flex gap-1 mt-1 items-start">
        <input className="input w-48 shrink-0" value={label} disabled={busy} placeholder="label"
               onChange={(e) => setLabel(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); picker.current?.focus(); } }} />
        <NotePicker exclude={[item.file, ...relations.map((r) => r.target + '.txt')]} busy={busy} onPick={add} inputRef={picker} />
      </div>
    </div>
  );
}
