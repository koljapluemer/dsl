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

  it('renders embeds only with a renderer, in order with references', () => {
    expect(markdown('![[x.png]] [[a]]', { a: 'A' })).toContain('![[x.png]]');
    const html = markdown('![[x.png]] [[a]] ![[y.png|Y]]', { a: 'A' }, undefined, (e) => `<img alt="${e.label ?? ''}" src="${e.target}">`);
    expect(html).toContain('<img alt="" src="x.png">');
    expect(html).toContain('<img alt="Y" src="y.png">');
    expect(html).toContain('data-note="a"');
  });

  it('leaves references in code literal', () => {
    expect(markdown('`[[a]]`', { a: 'A' })).toContain('<code>[[a]]</code>');
  });
});

describe('math', () => {
  it('renders inline and display math as MathML', () => {
    const html = markdown('a $x^2$ b\n$$\n\\frac{1}{2}\n$$');
    expect(html).toContain('<math><msup>');
    expect(html).toContain('<math display="block"');
    expect(html).toContain('<mfrac>');
  });

  it('leaves money, escapes and code alone', () => {
    expect(markdown('$20 and $30')).not.toContain('<math');
    expect(markdown('\\$x$')).not.toContain('<math');
    expect(markdown('`$x$`')).toContain('<code>$x$</code>');
  });

  it('keeps references in math as TeX and math out of labels', () => {
    expect(markdown('$[[a]]$', { a: 'A' })).not.toContain('data-note');
    const html = markdown('[[a|$x$]]', { a: 'A' });
    expect(html).toContain('>$x$</a>');
    expect(html).not.toContain('<math');
  });

  it('shows bad TeX as an error, not an exception', () => {
    expect(markdown('$\\frac{a$')).toContain('temml-error');
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

  it('keeps math whole, counted by its TeX', () => {
    expect(inlineMarkdown('ab $xyz$', {}, 4)).toMatchObject({ cut: false });
    expect(inlineMarkdown('ab $xyz$ c', {}, 4)).toMatchObject({ cut: true });
    expect(inlineMarkdown('abcd $x$', {}, 4)).toEqual({ html: 'abcd', cut: true });
  });
});

describe('noteHref', () => {
  it('opens the note in the sidebar', () => {
    expect(decodeURIComponent(noteHref('a b.txt'))).toBe('/?sopen=["a b.txt"]');
  });

});
