import { describe, expect, it } from 'vitest';
import { validateSidebarSearch, withOpened } from './sidebar';

describe('validateSidebarSearch', () => {
  it('keeps what is valid, drops the rest', () => {
    expect(validateSidebarSearch({ sq: 'x', ss: '1', sorphan: 'orphan', spage: 2, sopen: ['a.txt', 'a.txt', 3, '', 'b.txt'] }))
      .toEqual({ sq: 'x', ss: true, sorphan: 'orphan', spage: 2, sopen: ['a.txt', 'b.txt'] });
    expect(validateSidebarSearch({ sq: '', ss: 0, sorphan: 'any', spage: 0, sopen: [] }))
      .toEqual({ sq: undefined, ss: undefined, sorphan: undefined, spage: undefined, sopen: undefined });
  });

  it('ignores the pages\' own keys', () => {
    expect(validateSidebarSearch({ q: 'x', open: 'a.txt' }).sopen).toBeUndefined();
  });
});

describe('withOpened', () => {
  it('puts the note first, once', () => {
    expect(withOpened(undefined, 'a')).toEqual(['a']);
    expect(withOpened(['b', 'a', 'c'], 'a')).toEqual(['a', 'b', 'c']);
  });
});
