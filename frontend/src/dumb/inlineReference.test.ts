import { describe, expect, it } from 'vitest';
import { inlineReferences } from './inlineReference';

describe('inlineReferences', () => {
  it('finds targets and display labels', () => {
    expect(inlineReferences('See [[alpha]] and [[beta|the other note]].')).toEqual([
      { from: 4, to: 13, target: 'alpha', label: null },
      { from: 18, to: 41, target: 'beta', label: 'the other note' },
    ]);
  });

  it('ignores escapes, code, fences and malformed references', () => {
    const source = '\\[[escaped]] `[[span]]`\n```\n[[fenced]]\n```\n[[bad target]] [[bad|]] [[ok]]';
    expect(inlineReferences(source).map(({ target }) => target)).toEqual(['ok']);
  });
});

describe('inlineReferences and math', () => {
  it('ignores references in math', () => {
    expect(inlineReferences('$[[a]]$ $$\n[[b]]\n$$ [[c]]').map(({ target }) => target)).toEqual(['c']);
  });

  it('keeps math in a label as text', () => {
    expect(inlineReferences('[[a|$x$]]')).toEqual([{ from: 0, to: 9, target: 'a', label: '$x$' }]);
  });
});
