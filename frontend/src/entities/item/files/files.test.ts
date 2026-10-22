import { describe, expect, it } from 'vitest';
import { fileName, fileUrl, kindOf } from './files';

describe('files', () => {
  it('knows a kind by its extension, as file_kinds.py', () => {
    expect(kindOf('images/a.JPG').name).toBe('image');
    expect(kindOf('images/a.mov').name).toBe('video');
    expect(kindOf('files/page.html.j2').name).toBe('jinja');
    expect(kindOf('files/page.html.j2').editor).toBeDefined();
    expect(kindOf('files/cv.pdf').name).toBe('other');
    expect(kindOf('files/README').name).toBe('other');
  });

  it('names and addresses a file', () => {
    expect(fileName('files/site/page.html.j2')).toBe('page.html.j2');
    expect(fileUrl('files/my cv.pdf')).toBe('/api/files/files/my%20cv.pdf');
  });
});
