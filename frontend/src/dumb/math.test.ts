import { describe, expect, it } from 'vitest';
import { mathSpans } from './inlineReference';
import { mathAt } from './math';

const tex = (s: string) => mathSpans(s).map((m) => [m.tex, m.display]);

describe('mathAt', () => {
  it('reads inline and display math', () => {
    expect(mathAt('$x^2$ y', 0)).toEqual({ from: 0, to: 5, tex: 'x^2', display: false });
    expect(mathAt('$$\n\\int f\n$$', 0)).toEqual({ from: 0, to: 12, tex: '\n\\int f\n', display: true });
  });

  it('follows Pandoc on whitespace and digits', () => {
    expect(mathAt('$ x$', 0)).toBeNull();
    expect(mathAt('$x $', 0)).toBeNull();
    expect(mathAt('$20,000 and $30,000', 0)).toBeNull();
    expect(mathAt('$x$1', 0)).toBeNull();
  });

  it('keeps inline math on one line and display math within a paragraph', () => {
    expect(mathAt('$x\ny$', 0)).toBeNull();
    expect(mathAt('$$x\n\ny$$', 0)).toBeNull();
    expect(mathAt('$$ $$', 0)).toBeNull();
  });

  it('skips escaped dollars inside', () => {
    expect(mathAt('$a\\$b$', 0)?.tex).toBe('a\\$b');
  });
});

describe('mathSpans', () => {
  it('finds math outside code', () => {
    expect(tex('a $x$ `$y$` b\n```\n$z$\n```\n$$w$$')).toEqual([['x', false], ['w', true]]);
  });

  it('skips escaped dollars', () => {
    expect(tex('\\$x$ and $y$')).toEqual([['y', false]]);
  });

  it('follows display math across lines', () => {
    expect(mathSpans('a $$\nx [[n]]\n$$ $y$ b')).toEqual([
      { from: 2, to: 15, tex: '\nx [[n]]\n', display: true },
      { from: 16, to: 19, tex: 'y', display: false },
    ]);
  });
});
