import type { MatchRange } from '@/api/types';

export interface HighlightedTextProps {
  text: string;
  match: MatchRange | null;
}

export function HighlightedText({ text, match }: HighlightedTextProps) {
  if (!match || match.length === 0) {
    return <>{text}</>;
  }

  const end = match.start + match.length;
  return (
    <>
      {text.slice(0, match.start)}
      <mark className="bg-primary/30 text-inherit">{text.slice(match.start, end)}</mark>
      {text.slice(end)}
    </>
  );
}
