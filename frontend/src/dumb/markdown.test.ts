import { describe, expect, it, vi } from 'vitest';

vi.mock('dompurify', () => ({ default: { addHook: vi.fn(), sanitize: (html: string) => html } }));

import { markdown } from './markdown';

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
