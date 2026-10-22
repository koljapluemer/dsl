import { File, FileCode } from 'lucide-react';
import type { Item } from '@/api/types';
import { fileName, fileUrl, kindOf } from './files';
import { NoteMedia } from './Media';

/**
 * The note's files besides its displayed attachment: images and videos as
 * thumbnails, files edited as text as buttons calling `onOpen`, others as links.
 */
export function FileList({ item, onOpen }: { item: Item; onOpen?: (path: string) => void }) {
  const rest = item.files.filter((f) => f !== item.media);
  if (!rest.length) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1">
      {rest.map((path) => {
        const kind = kindOf(path);
        return (
          <li key={path}>
            {kind.shown ? <NoteMedia path={path} size="thumb" />
              : kind.editor && onOpen ? (
                <button type="button" className="btn btn-ghost btn-sm font-mono" title={`edit ${path}`} onClick={() => onOpen(path)}>
                  <FileCode size={14} /> {fileName(path)}
                </button>
              ) : (
                <a className="btn btn-ghost btn-sm font-mono" href={fileUrl(path)} target="_blank" rel="noopener" title={path}>
                  <File size={14} /> {fileName(path)}
                </a>
              )}
          </li>
        );
      })}
    </ul>
  );
}
