import { describe, expect, inject, it } from 'vitest';
import { addRelation, relabelRelation, relations, removeRelation } from './relation';
import { hasTag, tags } from './tags';
import { firstLine } from './firstLine';

const schema = inject('schema');

// the same texts and results as tests/test_store.py's detach and relabel cases
describe('relationship text transforms', () => {
  it('appends like questions.add_relation', () => {
    expect(addRelation('a\n\n', 'knows', 'x')).toBe('a\n-> knows @x\n');
    expect(addRelation('a', ' ', 'x')).toBe('a\n-> @x\n');
  });

  it('removes the first match only', () => {
    expect(removeRelation(schema, 'a > b\n-> knows @x\n-> @x\n-> knows @x\n', 'knows', 'x')).toBe('a > b\n-> @x\n-> knows @x\n');
    expect(removeRelation(schema, 'a\n-> @x\n', '', 'x')).toBe('a\n');
    expect(removeRelation(schema, 'a\n-> knows @x\n', 'met', 'x')).toBe('a\n-> knows @x\n');
  });

  it('relabels the first match only', () => {
    const text = 'a\n-> knows @x\n-> knows @x\n';
    expect(relabelRelation(schema, text, 'knows', 'x', ' met ')).toBe('a\n-> met @x\n-> knows @x\n');
    expect(relabelRelation(schema, 'a\n-> met @x\n', 'met', 'x', '')).toBe('a\n-> @x\n');
  });

  it('ignores lines in the body and in blocks', () => {
    const text = 'a -> not @here\nextra\n -> nor @here\n';
    expect(relations(schema, text)).toEqual([]);
    expect(relations(schema, 'a\nproject\n-> owner @p\n')).toEqual([{ line: 2, label: 'owner', target: 'p' }]);
  });
});

describe('tags', () => {
  it('reads the tags line', () => {
    expect(tags(schema, 'a\ntags x no-q\n')).toEqual(['x', 'no-q']);
    expect(hasTag(schema, 'a tags no-q\n', 'no-q')).toBe(false);
    expect(hasTag(schema, 'a\nissue\ntags suggest-think-and-sketch', 'suggest-think-and-sketch')).toBe(true);
  });
});

describe('firstLine', () => {
  it('is the heading and whether the body goes on', () => {
    expect(firstLine(schema, '\n  Title  \n\nmore\ntags x\n')).toEqual({ line: 'Title', more: true });
    expect(firstLine(schema, 'Title\ntags x\nextra\nlong')).toEqual({ line: 'Title', more: false });
    expect(firstLine(schema, '')).toEqual({ line: '', more: false });
  });
});
