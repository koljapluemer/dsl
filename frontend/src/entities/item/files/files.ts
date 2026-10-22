import type { Extension } from '@codemirror/state';
import { IMAGE_EXTENSIONS } from './kinds/image';
import { JINJA_EXTENSIONS, jinjaEditor } from './kinds/jinja';
import { VIDEO_EXTENSIONS } from './kinds/video';

/**
 * What the app does with a file a note names, by its extension (as file_kinds.py):
 * images and videos are `shown` as its attachment, kinds with an `editor` are edited as text.
 */
export type FileKind = { name: 'image' | 'video' | 'jinja' | 'other'; extensions: string[]; shown?: boolean; editor?: () => Extension[] };

const KINDS: FileKind[] = [
  { name: 'image', extensions: IMAGE_EXTENSIONS, shown: true },
  { name: 'video', extensions: VIDEO_EXTENSIONS, shown: true },
  { name: 'jinja', extensions: JINJA_EXTENSIONS, editor: jinjaEditor },
];
const OTHER: FileKind = { name: 'other', extensions: [] };

export const kindOf = (path: string): FileKind => {
  const ext = path.includes('.') ? path.split('.').pop()!.toLowerCase() : '';
  return KINDS.find((k) => k.extensions.includes(ext)) ?? OTHER;
};

export const fileName = (path: string) => path.split('/').pop() ?? path;

export const fileUrl = (path: string) => `/api/files/${path.split('/').map(encodeURIComponent).join('/')}`;

export const pastedMedia = (data: DataTransfer | null) =>
  Array.from(data?.files ?? []).find((item) => item.type.startsWith('image/') || item.type.startsWith('video/'));
