import { describe, expect, it } from 'vitest';
import { cardColorFor, hueFor } from './cardColor';

describe('cardColorFor', () => {
  it('matches the zero app per file name', () => {
    expect(hueFor('a.txt')).toBe(225);
    expect(cardColorFor('a.txt')).toBe('rgb(170, 188, 242)');
    expect(cardColorFor('groceries-1a2b3c.txt')).toBe('rgb(170, 242, 233)');
    expect(cardColorFor('über.txt')).toBe('rgb(242, 170, 201)');
  });
});
