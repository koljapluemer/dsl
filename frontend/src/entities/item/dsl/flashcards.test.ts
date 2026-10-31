import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, inject, it } from 'vitest';
import { cardsIn } from '@/dumb/flashcards';
import { flashcardDelimiters, flashcards } from './flashcards';

const schema = inject('schema');
const EXAMPLES = new URL('../../../../../spec/examples/', import.meta.url).pathname;
const cases = readdirSync(EXAMPLES).filter((f) => f.endsWith('.txt')).sort();

describe.skipIf(!cases.length)('spec examples', () => {
  it.each(cases)('%s', (name) => {
    const want: { flashcards?: { front: string; back: string; line: number }[] } =
      JSON.parse(readFileSync(EXAMPLES + name.replace(/\.txt$/, '.json'), 'utf-8'));
    if (!want.flashcards) return;
    const text = readFileSync(EXAMPLES + name, 'utf-8');
    expect(flashcards(schema, text).map(({ front, back, line }) => ({ front, back, line: line + 1 }))).toEqual(want.flashcards);
  });
});

describe('flashcards', () => {
  it('ends the body at a section opener inside a card', () => {
    expect(flashcards(schema, 'N\n::\nq\ntags x\n---\na\n::\n')).toEqual([]);
    expect(flashcards(schema, 'N\n::\nq\n tags x\n---\na\n::\n')[0].front).toBe('q\n tags x');
  });

  it('finds cards in plain Markdown lines', () => {
    expect(cardsIn(['::a::b', 'x', '::', 'c', '---', 'd', '::'], 0, 7).map((c) => [c.line, c.end])).toEqual([[0, 0], [2, 6]]);
  });
});

describe('flashcardDelimiters', () => {
  it('marks the delimiters of both kinds', () => {
    const text = 'N\n::q::a\n::\nf\n---\nb\n::';
    expect(flashcardDelimiters(schema, text).map((s) => text.slice(s.from, s.to))).toEqual(['::', '::', '::', '---', '::']);
  });
});
