import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { BIBLIOGRAPHY_LINE, citation, citeTransaction, rankSources } from './cite';

const cite = (doc: string, keys: string[], from?: number, to?: number) => {
  const state = EditorState.create({ doc, selection: { anchor: from ?? doc.length } });
  const tr = state.update(citeTransaction(state, keys, from, to));
  return { text: tr.state.doc.toString(), cursor: tr.state.selection.main.head };
};

describe('citation', () => {
  it('cites a reference key with @', () => {
    expect(citation('vaswani2017')).toBe('@vaswani2017');
    expect(citation('van-der.x:2')).toBe('@van-der.x:2');
    expect(citation('müller2020')).toBe('@müller2020');
  });
  it('cites any other key by label', () => {
    expect(citation('a/b')).toBe('#cite(label("a/b"))');
    expect(citation('ends.')).toBe('#cite(label("ends."))');
  });
});

describe('citeTransaction', () => {
  it('appends the bibliography with the first citation', () => {
    const { text, cursor } = cite('= Doc\nSee \n', ['a', 'b'], 10);
    expect(text).toBe(`= Doc\nSee @a @b\n\n${BIBLIOGRAPHY_LINE}\n`);
    expect(cursor).toBe(15);
  });
  it('appends it once', () => {
    const doc = `See \n#bibliography("/x.bib")\n`;
    expect(cite(doc, ['a'], 4).text).toBe(`See @a\n#bibliography("/x.bib")\n`);
  });
  it('replaces what it is given', () => {
    expect(cite(`@va\n${BIBLIOGRAPHY_LINE}`, ['vaswani'], 0, 3).text).toBe(`@vaswani\n${BIBLIOGRAPHY_LINE}`);
  });
});

it('rankSources puts the preferred first, in their order', () => {
  const s = ['a', 'b', 'c', 'd'].map((file) => ({ file }));
  expect(rankSources(s, ['c', 'x', 'a']).map((x) => x.file)).toEqual(['c', 'a', 'b', 'd']);
});
