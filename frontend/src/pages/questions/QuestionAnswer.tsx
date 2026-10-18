import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { Answered, Question, Suggestion } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { useDebounced } from '@/dumb/useDebounced';
import { searchQuery } from '@/entities/item/queries';
import { answer } from './questions';

type Props = {
  file: string;
  question: Question;
  /** resolves once pending edits of the note are saved */
  flush: () => Promise<void>;
  onAnswered: (note: Answered) => void;
};

/** One question about a note: a field whose text either links an existing note (picked from search suggestions) or becomes a new one. */
export function QuestionAnswer({ file, question, flush, onAnswered }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  /** the notes linked so far */
  const [linked, setLinked] = useState<Suggestion[]>([]);
  const q = useDebounced(text.trim(), 120);
  const { data } = useQuery({ ...searchQuery(q, [file, ...linked.map((l) => l.file)]), enabled: q.length >= 2 && !busy });
  /** the highlighted suggestion and Escape, both for the current query only */
  const [active, setActive] = useState({ q: '', i: -1 });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const suggestions = q.length >= 2 && text.trim() && dismissed !== q ? data ?? [] : [];
  const at = active.q === q ? active.i : -1;

  async function submit(how: { target: string } | { text: string }) {
    if (busy) return;
    setBusy(true);
    try {
      await flush();
      const res = await answer(file, question.id, how);
      setLinked((l) => [...l, res.target]);
      setText('');
      onAnswered(res);
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  const link = (s: Suggestion) => submit({ target: s.file });
  const createNew = () => { if (text.trim()) submit({ text: text.trim() }); };

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
      if (at >= 0 && at < n) link(suggestions[at]);
      else createNew();
    } else if (e.key === 'Escape') {
      setDismissed(q);
    }
  }

  return (
    <div>
      <p className="font-medium mb-1">{question.question}</p>
      {linked.map((l) => (
        <div key={l.file} className="text-sm"><span className="ov-muted">{question.label} →</span> {l.heading || l.file}</div>
      ))}
      <div className="join w-full mt-1">
        <input className="input join-item w-full" value={text} disabled={busy} placeholder="Search a note to link, or write a new one"
               onChange={(e) => { setText(e.target.value); setDismissed(null); }} onKeyDown={keydown} />
        <button className="btn join-item" disabled={busy || !text.trim()} title="create as new note" onClick={createNew}>
          <Plus size={20} />New note
        </button>
      </div>
      {suggestions.length > 0 && (
        <ul className="menu menu-sm bg-base-200 rounded-box w-full mt-1">
          {suggestions.map((s, i) => (
            <li key={s.file}>
              <a className={i === at ? 'menu-active' : ''} onMouseDown={(e) => { e.preventDefault(); link(s); }}>
                <span className="truncate">{s.heading || s.file}</span>
                <span className="ml-auto font-mono text-xs text-base-content/50">{s.file}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
