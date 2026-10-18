import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, inject, it } from 'vitest';
import { analyze } from './analyze';
import { highlight } from './highlight';
import { outline } from './outline';

const schema = inject('schema');
const EXAMPLES = new URL('../../../../../spec/examples/', import.meta.url).pathname;
const cases = readdirSync(EXAMPLES).filter((f) => f.endsWith('.txt')).sort();
/** found only by the server: YAML validity, and an empty item */
const SERVER_ONLY = ['invalid_yaml', 'empty'];

type Diagnostics = { code: string; line: number }[];
type Expected = { errors?: Diagnostics; warnings?: Diagnostics };

/** problems as sorted `code@line` (1-based), like the examples' diagnostics */
function found(text: string, severity: 'error' | 'warning') {
  return analyze(schema, text).problems
    .filter((p) => p.severity === severity)
    .map((p) => `${p.message.split(':')[0]}@${text.slice(0, p.from).split('\n').length}`)
    .sort();
}

const expected = (ds: Diagnostics = []) => ds.filter((d) => !SERVER_ONLY.includes(d.code)).map((d) => `${d.code}@${d.line}`).sort();

describe.skipIf(!cases.length)('spec examples', () => {
  it.each(cases)('%s', (name) => {
    const text = readFileSync(EXAMPLES + name, 'utf-8');
    const want: Expected = JSON.parse(readFileSync(EXAMPLES + name.replace(/\.txt$/, '.json'), 'utf-8'));
    expect(found(text, 'error')).toEqual(expected(want.errors));
    expect(found(text, 'warning')).toEqual(expected(want.warnings));
  });
});

describe('outline', () => {
  it('splits body from keyword section', () => {
    const { first, boundary, parts } = outline(schema, '\nHeading\nmore body\ntags a b');
    expect([first, boundary]).toEqual([1, 3]);
    expect(parts).toEqual([{ line: 3, end: 4, keyword: undefined }]);
  });

  it('is empty for blank text', () => {
    expect(outline(schema, '  \n').first).toBe(-1);
    expect(analyze(schema, '  \n')).toEqual({ segments: [], problems: [] });
  });
});

describe('highlight', () => {
  it('covers the range with marked and plain pieces', () => {
    const text = 'Heading\ntags a b';
    const from = text.indexOf('tags');
    const pieces = highlight(text, analyze(schema, text), from, text.length);
    expect(pieces.map((p) => p.text).join('')).toBe('tags a b');
    expect(pieces.filter((p) => p.cls).map((p) => [p.text, p.cls])).toEqual([['tags', 'tok-property'], ['a', 'tok-tags'], ['b', 'tok-tags']]);
  });
});
