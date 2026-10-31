import type { Extension } from '@codemirror/state';
import { IMAGE_EXTENSIONS } from './kinds/image';
import { JINJA_EXTENSIONS, jinjaEditor } from './kinds/jinja';
import { TYPST_EXTENSIONS, typstEditor } from './kinds/typst';
import { VIDEO_EXTENSIONS } from './kinds/video';

/**
 * What the app does with a file a note names, by its extension (as file_kinds.py):
 * images and videos are `shown` as its media, kinds with an `editor` are edited as text (Typst in its own modal),
 * `hidden` ones the app keeps for itself and doesn't list.
 */
export type FileKind = {
  name: 'image' | 'video' | 'jinja' | 'typst' | 'flashcard' | 'other';
  extensions: string[]; shown?: boolean; hidden?: boolean; editor?: () => Extension[];
};

const KINDS: FileKind[] = [
  { name: 'image', extensions: IMAGE_EXTENSIONS, shown: true },
  { name: 'video', extensions: VIDEO_EXTENSIONS, shown: true },
  { name: 'jinja', extensions: JINJA_EXTENSIONS, editor: jinjaEditor },
  { name: 'typst', extensions: TYPST_EXTENSIONS, editor: typstEditor },
];
const OTHER: FileKind = { name: 'other', extensions: [] };
/** a flashcard's review state (docs/flashcards.md), only in FLASHCARDS_DIR */
const FLASHCARD: FileKind = { name: 'flashcard', extensions: ['json'], hidden: true };
export const FLASHCARDS_DIR = 'files/flashcards';

export const kindOf = (path: string): FileKind => {
  const ext = path.includes('.') ? path.split('.').pop()!.toLowerCase() : '';
  if (path.startsWith(`${FLASHCARDS_DIR}/`) && FLASHCARD.extensions.includes(ext)) return FLASHCARD;
  return KINDS.find((k) => k.extensions.includes(ext)) ?? OTHER;
};

export const fileName = (path: string) => path.split('/').pop() ?? path;

export const fileUrl = (path: string) => `/api/files/${path.split('/').map(encodeURIComponent).join('/')}`;

/** The item's images and videos, in the order its `media` clauses name them (the first is `item.media`). */
export const shownFiles = (item: { files: string[] }) => item.files.filter((f) => kindOf(f).shown);

/**
 * The attached image or video an embed (`![[target]]`) names: by its path, or by
 * its file name when only one of `files` has it; null for anything else.
 * Mirrors site/service.py's `_embedded`.
 */
export function embedded(files: string[], target: string): string | null {
  const shown = files.filter((f) => kindOf(f).shown);
  if (shown.includes(target)) return target;
  const named = shown.filter((f) => fileName(f) === target);
  return named.length === 1 ? named[0] : null;
}

/** How a shown file is shown. */
export const mediaKind = (path: string): 'image' | 'video' => (kindOf(path).name === 'video' ? 'video' : 'image');

/** The images and videos among picked or pasted files. */
export const mediaFiles = (files: FileList | File[] | null | undefined) =>
  Array.from(files ?? []).filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));

export const pastedMedia = (data: DataTransfer | null) => mediaFiles(data?.files);
