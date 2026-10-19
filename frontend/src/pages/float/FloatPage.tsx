import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeOff } from 'lucide-react';
import type { ItemView as View } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { offerUndo } from '@/dumb/undo';
import { useDebounced } from '@/dumb/useDebounced';
import { ItemView } from '@/entities/item/ItemView';
import { itemsChanged, saveItem } from '@/entities/item/mutations';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { ItemModal } from '@/features/item-edit/ItemModal';
import { MAX_S, MIN_S, SPAWN_MS, floatQuery, hideFromFloat } from './float';
import './float.css';

type Card = { id: number; item: View; top: string; duration: number };

let nextId = 0;

/**
 * Random items, minus those the float view hides (see docs/hiding.md), drifting across the stage one after another.
 * A card stops under the pointer; clicking it opens the item in a modal, which holds everything still.
 */
export function FloatPage() {
  const qc = useQueryClient();
  const remove = useDeleteItem();
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [round, setRound] = useState(0);
  const { data } = useQuery(floatQuery(query, round));
  const [cards, setCards] = useState<Card[]>([]);
  const [editing, setEditing] = useState<Card | null>(null);

  // the drawn items not yet sent off; a new batch replaces them
  const pending = useRef<View[]>([]);
  useEffect(() => { pending.current = [...(data?.items ?? [])]; }, [data]);

  useEffect(() => {
    if (editing) return;
    const spawn = () => {
      const item = pending.current.shift();
      if (!item) {
        if (data?.total) setRound((r) => r + 1);
        return;
      }
      const card = { id: nextId++, item, top: `${10 + Math.random() * 60}%`, duration: MIN_S + Math.random() * (MAX_S - MIN_S) };
      setCards((cs) => [...cs, card]);
    };
    const first = setTimeout(spawn, 200);
    const timer = setInterval(spawn, SPAWN_MS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [editing, data]);

  const drop = (file: string) => setCards((cs) => cs.filter((c) => c.item.file !== file));

  async function hide(e: MouseEvent, item: View) {
    e.stopPropagation();
    try {
      await hideFromFloat(item.file);
      drop(item.file);
      pending.current = pending.current.filter((i) => i.file !== item.file);
      offerUndo(`${item.file} hidden from float`, async () => {
        await saveItem(item.file, item.text);
        await itemsChanged(qc);
      });
      await itemsChanged(qc);
    } catch (err) { showError(err); }
  }

  // links in a card work as links rather than opening the editor
  const open = (e: MouseEvent, card: Card) => { if (!(e.target as Element).closest('a')) setEditing(card); };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`float-stage relative min-h-0 flex-1 overflow-hidden ${editing ? 'paused' : ''}`}>
        {data && !data.total && <p className="text-base-content/50 my-6">No items found.</p>}
        {cards.map((c) => (
          <div
            key={c.id}
            className="float-card card bg-base-200 shadow-lg w-64 cursor-pointer"
            style={{ top: c.top, animationDuration: `${c.duration}s` }}
            onAnimationEnd={() => setCards((cs) => cs.filter((x) => x.id !== c.id))}
            onClick={(e) => open(e, c)}
          >
            <div className="card-body flex-row items-start gap-1 p-3">
              <div className="overview min-w-0 flex-1"><ItemView item={c.item} /></div>
              <button className="btn btn-ghost btn-xs btn-square" title="Hide from float" onClick={(e) => hide(e, c.item)}>
                <EyeOff size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <input className="input w-full my-4" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />
      {editing && (
        <ItemModal
          key={editing.id}
          file={editing.item.file}
          initial=""
          refresh={['float']}
          onDelete={remove}
          onClose={() => { drop(editing.item.file); setEditing(null); }}
        />
      )}
    </div>
  );
}
