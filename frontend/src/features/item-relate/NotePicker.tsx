import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { Suggestion } from '@/api/types';
import { useDebounced } from '@/dumb/useDebounced';
import { searchQuery } from '@/entities/item/queries';

export type Pick = { target: string } | { text: string };

type Props = {
  /** files not to suggest */
  exclude: string[];
  busy: boolean;
  /** resolves once the pick is done; the field is cleared when it succeeds */
  onPick: (how: Pick) => Promise<boolean>;
  inputRef?: React.Ref<HTMLInputElement>;
};

/** A field whose text either picks an existing note (from search suggestions) or becomes a new one. */
export function NotePicker({ exclude, busy, onPick, inputRef }: Props) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 120);
  const { data } = useQuery({ ...searchQuery(q, exclude), enabled: q.length >= 2 && !busy });
  /** the highlighted suggestion and Escape, both for the current query only */
  const [active, setActive] = useState({ q: '', i: -1 });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const suggestions = q.length >= 2 && text.trim() && dismissed !== q ? data ?? [] : [];
  const at = active.q === q ? active.i : -1;

  async function submit(how: Pick) {
    if (busy) return;
    if (await onPick(how)) setText('');
  }

  const link = (s: Suggestion) => submit({ target: s.file });
  const createNew = () => { if (text.trim()) void submit({ text: text.trim() }); };

  function keydown(e: React.KeyboardEvent) {
    const n = suggestions.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      setActive({ q, i: (at + 1) % n });
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      setActive({ q, i: at <= 0 ? n - 1 : at - 1 });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (at >= 0 && at < n) void link(suggestions[at]);
      else createNew();
    } else if (e.key === 'Escape') {
      setDismissed(q);
    }
  }

  return (
    <div className="w-full">
      <div className="join w-full">
        <input ref={inputRef} className="input join-item w-full" value={text} disabled={busy} placeholder="Search a note to link, or write a new one"
               onChange={(e) => { setText(e.target.value); setDismissed(null); }} onKeyDown={keydown} />
        <button className="btn join-item" disabled={busy || !text.trim()} title="create as new note" onClick={createNew}>
          <Plus size={20} /><span className="hidden sm:inline">New note</span>
        </button>
      </div>
      {suggestions.length > 0 && (
        <ul className="menu menu-sm bg-base-200 rounded-box w-full mt-1">
          {suggestions.map((s, i) => (
            <li key={s.file}>
              <a className={'flex min-w-0' + (i === at ? ' menu-active' : '')} onMouseDown={(e) => { e.preventDefault(); void link(s); }}>
                <span className="truncate min-w-0">{s.heading || s.file}</span>
                <span className="ml-auto truncate min-w-0 shrink-[2] font-mono text-xs text-base-content/50">{s.file}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
