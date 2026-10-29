import { describe, expect, inject, it } from 'vitest';
import { documentReferences } from './documentReferences';

const schema = inject('schema');

describe('documentReferences', () => {
  it('numbers body and extra occurrences in order and identifies repeated targets separately', () => {
    const text = 'Heading [[a]] and [[a|shown]]\n`[[ignored]]`\ntags x\nextra\nThen [[b]].';
    expect(documentReferences(schema, text).map(({ id, number, target, label }) => ({ id, number, target, label }))).toEqual([
      { id: 'a:1', number: 1, target: 'a', label: null },
      { id: 'a:2', number: 2, target: 'a', label: 'shown' },
      { id: 'b:1', number: 3, target: 'b', label: null },
    ]);
  });
});

