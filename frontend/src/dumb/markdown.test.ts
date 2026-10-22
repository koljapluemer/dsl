import { describe, expect, it, vi } from 'vitest';

vi.mock('dompurify', () => ({ default: { addHook: vi.fn(), sanitize: (html: string) => html } }));

import { inlineMarkdown, markdown, noteHref } from './markdown';

describe('inline note Markdown', () => {
  it('renders headings, aliases and missing targets safely', () => {
    const html = markdown('[[a]] [[a|Alias]] [[gone]]', { a: 'A & B', gone: null });
    expect(html).toContain('data-note="a"');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('>Alias</a>');
    expect(html).toContain('class="ov-missing"');
  });

  it('leaves references in code literal', () => {
    expect(markdown('`[[a]]`', { a: 'A' })).toContain('<code>[[a]]</code>');
  });
});

describe('inlineMarkdown', () => {
  it('keeps short lines whole', () => {
    expect(inlineMarkdown('a **b**', {}, 10)).toEqual({ html: 'a <strong>b</strong>', cut: false });
  });

  it('cuts the text, not the syntax', () => {
    const { html, cut } = inlineMarkdown('ab [link text](http://x) tail', {}, 6);
    expect(cut).toBe(true);
    expect(html).toBe('ab <a href="http://x">lin</a>');
  });

  it('cuts exactly at the budget', () => {
    expect(inlineMarkdown('abcd', {}, 4).cut).toBe(false);
    expect(inlineMarkdown('abcde', {}, 4)).toEqual({ html: 'abcd', cut: true });
  });

  it('counts an inline reference by its label', () => {
    const { html, cut } = inlineMarkdown('[[a]] and more', { a: 'Alpha' }, 5);
    expect(html).toBe(`<a class="link link-hover" data-note="a" href="${noteHref('a.txt')}">Alpha</a>`);
    expect(cut).toBe(true);
  });

  it('cuts code spans', () => {
    expect(inlineMarkdown('`abcdef`', {}, 3)).toEqual({ html: '<code>abc</code>', cut: true });
  });

  it('marks the first occurrence of the highlight, ignoring case', () => {
    expect(inlineMarkdown('Needle and needle', {}, 50, 'needle').html).toBe('<mark>Needle</mark> and needle');
    expect(inlineMarkdown('a *needle*', {}, 50, 'needle').html).toBe('a <em><mark>needle</mark></em>');
  });
});

describe('noteHref', () => {
  it('opens the note in the sidebar', () => {
    expect(decodeURIComponent(noteHref('a b.txt'))).toBe('/?sopen=["a b.txt"]');
  });
});
