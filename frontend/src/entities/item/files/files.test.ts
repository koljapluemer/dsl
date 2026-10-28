import { describe, expect, it } from 'vitest';
import { fileName, fileUrl, kindOf, mediaFiles, mediaKind, shownFiles } from './files';
import { pdfOf } from './kinds/typst';

describe('files', () => {
  it('knows a kind by its extension, as file_kinds.py', () => {
    expect(kindOf('images/a.JPG').name).toBe('image');
    expect(kindOf('images/a.mov').name).toBe('video');
    expect(kindOf('files/page.html.j2').name).toBe('jinja');
    expect(kindOf('files/page.html.j2').editor).toBeDefined();
    expect(kindOf('files/doc-a1b2c3.typ').name).toBe('typst');
    expect(kindOf('files/doc-a1b2c3.typ').editor).toBeDefined();
    expect(kindOf('files/cv.pdf').name).toBe('other');
    expect(kindOf('files/README').name).toBe('other');
  });

  it('knows the PDF a Typst file is compiled to', () => {
    expect(pdfOf('files/doc-a1b2c3.typ')).toBe('files/doc-a1b2c3.pdf');
    expect(pdfOf('files/v1.2/doc.typ')).toBe('files/v1.2/doc.pdf');
  });

  it('names and addresses a file', () => {
    expect(fileName('files/site/page.html.j2')).toBe('page.html.j2');
    expect(fileUrl('files/my cv.pdf')).toBe('/api/files/files/my%20cv.pdf');
  });

  it('shows a note\'s images and videos in order', () => {
    expect(shownFiles({ files: ['files/t.j2', 'images/b.webp', 'images/a.mp4', 'files/cv.pdf'] })).toEqual(['images/b.webp', 'images/a.mp4']);
    expect(mediaKind('images/a.mp4')).toBe('video');
    expect(mediaKind('images/a.webp')).toBe('image');
  });

  it('keeps the images and videos among picked files', () => {
    const files = [new File([''], 'a.png', { type: 'image/png' }), new File([''], 'b.pdf', { type: 'application/pdf' }), new File([''], 'c.mp4', { type: 'video/mp4' })];
    expect(mediaFiles(files).map((f) => f.name)).toEqual(['a.png', 'c.mp4']);
    expect(mediaFiles(null)).toEqual([]);
  });
});
