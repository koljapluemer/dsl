import { escapeHtml, type EmbedHtml } from '@/dumb/markdown';
import { embedded, fileName, fileUrl, mediaKind } from './files';

/** Embeds of the note's attached images and videos in place; any other as a broken embed. */
export const embedHtml = (files: string[]): EmbedHtml => ({ target, label }) => {
  const file = embedded(files, target);
  // `$` as an entity: never math
  const alt = escapeHtml(label ?? fileName(target)).replaceAll('$', '&#36;');
  if (!file) return `<span class="ov-missing" title="not attached">${alt}</span>`;
  const src = escapeHtml(fileUrl(file));
  return mediaKind(file) === 'video' ? `<video class="ov-embed" src="${src}" controls></video>` : `<img class="ov-embed" src="${src}" alt="${alt}">`;
};
