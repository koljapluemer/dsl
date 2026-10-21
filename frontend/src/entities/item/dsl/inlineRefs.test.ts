import { describe, expect, inject, it } from 'vitest';
import { itemInlineReferences } from './inlineRefs';

const schema = inject('schema');

describe('itemInlineReferences', () => {
  it('finds body and extra references at absolute offsets, nothing in the keyword section or code', () => {
    const text = 'Heading [[a]]\nsee `[[b]]`\nrecurring tu [[c]]\nextra\nmore [[d|D]]';
    const refs = itemInlineReferences(schema, text);
    expect(refs.map((r) => r.target)).toEqual(['a', 'd']);
    expect(refs.map((r) => text.slice(r.from, r.to))).toEqual(['[[a]]', '[[d|D]]']);
  });
});
