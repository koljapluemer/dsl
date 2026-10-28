import { describe, expect, inject, it } from 'vitest';
import { carryHeaders, theaBlocks, theaId } from './thea';

const schema = inject('schema');

describe('theaBlocks', () => {
  it('finds closed thea fences in the body and text blocks', () => {
    const text = 'Head\n```thea brave-otter-2\nspec a\ntags x\n```\n~~~thea\nb\n~~~\ntags y\nextra\n```thea calm-fox\nc\n```\n```thea\nopen';
    const blocks = theaBlocks(schema, text);
    expect(blocks.map((b) => [b.section, b.name, b.version, b.spec, theaId(b)])).toEqual([
      ['body', 'brave-otter', 2, 'spec a\ntags x', 'brave-otter-2'],
      ['body', null, null, 'b', null],
      ['extra', 'calm-fox', null, 'c', null],
    ]);
  });
});

describe('carryHeaders', () => {
  it('takes a header the server rewrote into an edited draft', () => {
    const base = 'Head\n```thea\nspec\n```';
    const next = 'Head\n```thea brave-otter-1\nspec\n```';
    const draft = 'Head edited\n```thea\nspec\n```';
    expect(carryHeaders(schema, draft, base, next)).toBe('Head edited\n```thea brave-otter-1\nspec\n```');
  });

  it('keeps a header edited in the draft', () => {
    const base = 'Head\n```thea a-b-1\nspec\n```';
    const next = 'Head\n```thea a-b-2\nspec\n```';
    const draft = 'Head\n```thea c-d-1\nspec\n```';
    expect(carryHeaders(schema, draft, base, next)).toBe(draft);
  });
});
