import { CircleX, TriangleAlert } from 'lucide-react';
import type { SearchResult } from '@/api/types';
import { HighlightedText } from './HighlightedText';

type Props = {
  result: SearchResult;
  /** already open, pinned, ... */
  marked: boolean;
  /** the keyboard's choice */
  active: boolean;
  compact?: boolean;
  onSelect: () => void;
};

/** A found note: its opening text with the match highlighted, or an excerpt around it below. */
export function NoteResult({ result, marked, active, compact = false, onSelect }: Props) {
  return (
    <button
      type="button"
      className={[
        'block w-full border text-left transition-colors',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        marked ? 'border-primary/50 bg-primary/10' : 'border-transparent bg-base-200/70 hover:border-base-300 hover:bg-base-100',
        active ? 'outline-2 -outline-offset-2 outline-primary' : '',
      ].join(' ')}
      title={result.filename}
      // keeps the focus in the search field, so the keys keep working there
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
    >
      <p className={`${compact ? 'line-clamp-2' : 'line-clamp-4'} text-xs leading-5`}>
        {result.problem === 'error' && <CircleX size={12} className="mr-1 inline text-error" />}
        {result.problem === 'warning' && <TriangleAlert size={12} className="mr-1 inline text-warning" />}
        <HighlightedText text={result.preview} match={result.previewMatch} />
      </p>
      {result.excerpt ? (
        <p className="mt-1.5 line-clamp-2 text-[0.6875rem] leading-4 text-base-content/60">
          <HighlightedText text={result.excerpt.text} match={result.excerpt.match} />
        </p>
      ) : null}
    </button>
  );
}
