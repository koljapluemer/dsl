import { describe, expect, it, vi } from 'vitest';

vi.mock('dompurify', () => ({ default: { addHook: vi.fn(), sanitize: (html: string) => html } }));

import { markdown } from '@/dumb/markdown';
import { embedHtml } from './embed';
import { fileUrl } from './files';

describe('embedHtml', () => {
  it('renders embeds of the note\'s files in a card, and in a front or back on its own (as Learn does)', () => {
    const embeds = embedHtml(['images/n-B3.webp']);
    const img = `<img class="ov-embed" src="${fileUrl('images/n-B3.webp')}" alt="n-B3.webp">`;
    expect(markdown('::\n**il piatto**\n---\nthe plate\n![[n-B3.webp]]\n::', {}, undefined, embeds))
      .toContain(`<div class="flashcard">\n<p><strong>il piatto</strong></p>\n<hr>\n<p>the plate<br>${img}</p>`);
    expect(markdown('![[n-B3.webp]]\nthe plate', {}, undefined, embeds)).toContain(img);
    expect(markdown('![[other.webp]]', {}, undefined, embeds)).toContain('class="ov-missing"');
  });
});
