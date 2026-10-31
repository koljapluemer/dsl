import { fenceEnd } from './fence';

/**
 * Flashcards in Markdown: `::front::back` on one line, or `::`, front lines,
 * `---`, back lines, `::` (docs/flashcards.md); lines in a closed fence never
 * count. Mirrors dsl_crud/core/flashcards.py.
 */
export type Flashcard = {
  /** 'body' or the text block's keyword */
  section: string;
  /** the line it starts on, and its last line */
  line: number;
  end: number;
  /** the `---` line; null for a card on one line */
  separator: number | null;
  front: string;
  back: string;
};

const DELIMITER = /^::[ \t]*$/;
const SEPARATOR = /^---[ \t]*$/;

/** The lines without blank ends, joined; null when all are blank. */
function joined(lines: string[]): string | null {
  const kept = lines.map((l) => l.trimEnd());
  while (kept.length && !kept[0].trim()) kept.shift();
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  return kept.length ? kept.join('\n') : null;
}

/** The card starting at lines[i], within lines up to `stop`; null when none does. */
export function cardAt(lines: string[], i: number, stop: number): { front: string; back: string; end: number; separator: number | null } | null {
  const line = lines[i];
  if (DELIMITER.test(line)) {
    let separator = -1;
    for (let j = i + 1; j < stop;) {
      const fence = fenceEnd(lines, j);
      if (fence >= 0 && fence < stop) { j = fence + 1; continue; }
      if (separator < 0 && SEPARATOR.test(lines[j])) separator = j;
      else if (DELIMITER.test(lines[j])) {
        if (separator < 0) return null;
        const front = joined(lines.slice(i + 1, separator)), back = joined(lines.slice(separator + 1, j));
        return front && back ? { front, back, end: j, separator } : null;
      }
      j++;
    }
    return null;
  }
  const k = line.startsWith('::') ? line.indexOf('::', 2) : -1;
  if (k < 0) return null;
  const front = line.slice(2, k).trim(), back = line.slice(k + 2).trim();
  return front && back ? { front, back, end: i, separator: null } : null;
}

/** The cards in lines from `start` up to `stop`, outside closed fences, in order. */
export function cardsIn(lines: string[], start: number, stop: number, section = 'body'): Flashcard[] {
  const out: Flashcard[] = [];
  for (let i = start; i < stop;) {
    const fence = fenceEnd(lines, i);
    if (fence >= 0 && fence < stop) { i = fence + 1; continue; }
    const card = cardAt(lines, i, stop);
    if (card) {
      out.push({ section, line: i, ...card });
      i = card.end + 1;
    } else i++;
  }
  return out;
}
