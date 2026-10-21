import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeOff } from 'lucide-react';
import type { Item } from '@/api/types';
import { blurOnEscape, useSlashFocus } from '@/dumb/keys';
import { useDebounced } from '@/dumb/useDebounced';
import { Note } from '@/meta/note/Note';
import { NoteModal } from '@/meta/note/NoteModal';
import type { TagToggle } from '@/meta/note/tools';
import { FLOAT_HIDE_TAG, MAX_S, MIN_S, SPAWN_MS, floatQuery } from './float';
import './float.css';

type Card = { id: number; item: Item; top: string; duration: number };

const HIDE: TagToggle = { tag: FLOAT_HIDE_TAG, icon: EyeOff, title: 'hide from float', activeTitle: 'hidden from float (click: back in it)' };

let nextId = 0;

/**
 * Random items, minus those the float view hides (see docs/hiding.md), drifting across the stage one after another,
 * shown simply. A card stops under the pointer; its edit button opens the item in a modal, which holds everything still.
 */
export function FloatPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const filter = useSlashFocus();
  const query = useDebounced(q.trim(), 300);
  const [round, setRound] = useState(0);
  const { data } = useQuery(floatQuery(query, round));
  const [cards, setCards] = useState<Card[]>([]);
  const [editing, setEditing] = useState<Card | null>(null);

  // the drawn items not yet sent off; a new batch replaces them
  const pending = useRef<Item[]>([]);
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

  const drop = (card: Card) => setCards((cs) => cs.filter((c) => c.id !== card.id));

  // the stage moves on with what's drawn next, and the card is gone
  function close() {
    if (editing) drop(editing);
    setEditing(null);
    void qc.invalidateQueries({ queryKey: ['float'] });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`float-stage relative min-h-0 flex-1 overflow-hidden ${editing ? 'paused' : ''}`}>
        {data && !data.total && <p className="text-base-content/50 my-6">No items found.</p>}
        {cards.map((c) => (
          <div
            key={c.id}
            className="float-card card bg-base-200 shadow-lg w-64"
            style={{ top: c.top, animationDuration: `${c.duration}s` }}
            onAnimationEnd={() => drop(c)}
          >
            <Note file={c.item.file} item={c.item} render="simple" tagToggles={[HIDE]} onEdit={() => setEditing(c)} onDeleted={() => drop(c)}
                  className="card-body p-3" />
          </div>
        ))}
      </div>
      <input ref={filter} onKeyDown={blurOnEscape} className="input w-full my-4" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />
      {editing && <NoteModal key={editing.id} file={editing.item.file} tagToggles={[HIDE]} onClose={close} />}
    </div>
  );
}
