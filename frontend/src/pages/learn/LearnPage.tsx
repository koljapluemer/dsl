import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import type { LearnNext, Rating } from '@/api/types';
import { useHotkeys } from '@/dumb/keys';
import { Markdown } from '@/dumb/Markdown';
import { showError } from '@/dumb/notice';
import { embedHtml } from '@/entities/item/files/embed';
import { useOpenNote } from '@/entities/item/sidebar';
import { nextCard, RATINGS, review, until } from './learn';

const LABELS: Record<Rating, string> = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };

/** Spaced repetition of the notes' flashcards: the front, then front and back with the four ratings. */
export function LearnPage() {
  const [next, setNext] = useState<LearnNext | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const openNote = useOpenNote();
  const files = next?.item?.files;
  const embeds = useMemo(() => embedHtml(files ?? []), [files]);

  function show(n: LearnNext) {
    setNext(n);
    setRevealed(false);
  }

  // the first card, once; its state is set after the fetch, not during the effect
  // eslint-disable-next-line react-hooks-js/set-state-in-effect
  useEffect(() => { nextCard().then(show, showError); }, []);

  const card = next?.card ?? null;

  async function rate(rating: Rating) {
    if (!card || busy) return;
    setBusy(true);
    try {
      show(await review(card, rating));
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  useHotkeys(revealed
    ? Object.fromEntries(RATINGS.map((r, i) => [String(i + 1), () => void rate(r)]))
    : { ' ': () => setRevealed(true) }, !!card);

  if (!next) return null;
  const { counts } = next;
  const part = (source: string) => <Markdown source={source} refs={next.item?.refs} onRef={openNote} embedHtml={embeds} />;
  return (
    <div>
      <div className="flex items-center gap-1 mb-4">
        {card && (
          <button className="btn btn-ghost btn-square" title="open its note" onClick={() => openNote(card.file)}><FileText size={20} /></button>
        )}
        <span className="ml-auto font-mono text-xs text-base-content/50" title="due · new · all cards">{counts.due} · {counts.new} · {counts.total}</span>
      </div>
      {!card ? (
        <p className="text-base-content/50">
          {next.next_due ? `Nothing due. Next in ${until(next.next_due)}.` : 'No flashcards.'}
        </p>
      ) : (
        <>
          <div key={`${card.file}:${card.id}`} className="learn-card rounded-box border border-base-300 p-4">
            {part(card.front)}
            {revealed && <><div className="divider" />{part(card.back)}</>}
          </div>
          {revealed ? (
            <div className="grid grid-cols-4 gap-2 mt-4">
              {RATINGS.map((r, i) => (
                <button key={r} className="btn" title={String(i + 1)} disabled={busy} onClick={() => void rate(r)}>{LABELS[r]}</button>
              ))}
            </div>
          ) : (
            <button className="btn btn-primary btn-block mt-4" title="Space" onClick={() => setRevealed(true)}>Reveal</button>
          )}
        </>
      )}
    </div>
  );
}
