import type { SearchResult } from '@/api/types';
import { NoteLine } from '../NoteLine';
import { HighlightedText } from './HighlightedText';

type Props = {
  result: SearchResult;
  /** already open, pinned, ... */
  marked: boolean;
  /** the keyboard's choice */
  active: boolean;
  compact?: boolean;
  onSelect: () => void;
  /** a click on a note link in it: that note, picked as if found */
  onRef: (file: string) => void;
};

/** A found note, inline, its match marked; when the match isn't in its first line, an excerpt around it below. */
export function NoteResult({ result, marked, active, compact = false, onSelect, onRef }: Props) {
  return (
    <div
      className={[
        'border text-sm transition-colors',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        marked ? 'border-primary/50 bg-primary/10' : 'border-transparent bg-base-200/70 hover:border-base-300 hover:bg-base-100',
        active ? 'outline-2 -outline-offset-2 outline-primary' : '',
      ].join(' ')}
      // keeps the focus in the search field, so the keys keep working there
      onMouseDown={(event) => event.preventDefault()}
    >
      <NoteLine item={result} highlight={result.match} onClick={onSelect} onRef={onRef} />
      {result.excerpt ? (
        <p className="mt-1.5 line-clamp-2 text-[0.6875rem] leading-4 text-base-content/60 cursor-pointer" onClick={onSelect}>
          <HighlightedText text={result.excerpt.text} match={result.excerpt.match} />
        </p>
      ) : null}
    </div>
  );
}
