import type { Schema } from '@/api/types';
import { cardsIn, type Flashcard } from '@/dumb/flashcards';
import type { Segment } from './analyze';
import { textSpans } from './outline';

/** the Markdown parts cards are found in: the body (undefined) and these text blocks; as flashcards.py's SECTIONS */
const SECTIONS = [undefined, 'extra'];

/** Every card in the item's body and `extra` block, in order. */
export function flashcards(schema: Schema, text: string): Flashcard[] {
  if (!text.includes('::')) return [];
  const lines = text.split('\n').map((l) => l.replace(/\r/g, ''));
  return textSpans(schema, text)
    .filter((s) => SECTIONS.includes(s.keyword))
    .flatMap((s) => cardsIn(lines, s.start, s.end, s.keyword ?? 'body'));
}

/** The cards' `::` and `---` delimiters, as editor highlighting. */
export function flashcardDelimiters(schema: Schema, text: string): Segment[] {
  const lines = text.split('\n');
  const starts: number[] = [];
  lines.reduce((at, l) => (starts.push(at), at + l.length + 1), 0);
  const mark = (line: number, from = 0, length = lines[line].trimEnd().length) =>
    ({ from: starts[line] + from, to: starts[line] + from + length, cls: 'tok-card' });
  return flashcards(schema, text).flatMap((c) => c.separator === null
    ? [mark(c.line, 0, 2), mark(c.line, lines[c.line].indexOf('::', 2), 2)]
    : [mark(c.line), mark(c.separator), mark(c.end)]);
}
