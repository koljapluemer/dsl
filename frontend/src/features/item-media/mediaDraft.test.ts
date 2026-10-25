import { describe, expect, it } from 'vitest';
import { mediaChanged, mediaDraft, type MediaEntry } from './useMediaAttachments';

const existing = (path: string): MediaEntry => ({ status: 'existing', path });
const fresh: MediaEntry = { status: 'new', kind: 'image', blob: new Blob(), url: 'blob:x' };

describe('mediaDraft', () => {
  it('is unchanged while every written file is staged', () => {
    const draft = mediaDraft(['images/a.webp', 'images/b.webp'], [existing('images/a.webp'), existing('images/b.webp')]);
    expect(draft.removed).toEqual([]);
    expect(mediaChanged(draft)).toBe(false);
  });

  it('removes written files no longer staged', () => {
    const draft = mediaDraft(['images/a.webp', 'images/b.webp'], [existing('images/b.webp')]);
    expect(draft.removed).toEqual(['images/a.webp']);
    expect(mediaChanged(draft)).toBe(true);
  });

  it('changes with a new file', () => {
    expect(mediaChanged(mediaDraft(['images/a.webp'], [existing('images/a.webp'), fresh]))).toBe(true);
  });
});
