import { Maximize2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { MediaPreview } from '@/dumb/MediaPreview';
import { MediaModal } from './MediaModal';
import { fileUrl, kindOf } from './files';

/**
 * How an attachment is shown: `inline` at most a third of the screen high,
 * `fill` as wide as its box, `thumb` a small square that only enlarges.
 */
export type MediaSize = 'inline' | 'fill' | 'thumb';

/**
 * An image or video, enlarged into a MediaModal by its corner button or, for an
 * image (any thumbnail), a click. `path` and `onDelete` go to the modal; `actions` are more corner buttons.
 */
export function Media({ src, kind, path, onDelete, actions, size = 'inline', className = '' }: {
  src: string;
  kind: 'image' | 'video';
  path?: string;
  onDelete?: () => Promise<unknown>;
  actions?: ReactNode;
  size?: MediaSize;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  if (failed) return <p className="text-error text-sm">Can't show {path ?? src}</p>;
  const modal = full && <MediaModal src={src} kind={kind} path={path} onDelete={onDelete} onClose={() => setFull(false)} />;
  if (size === 'thumb') {
    // the modal beside the button, not in it: clicks in it would bubble to the button (through the portal)
    return (
      <>
        <button type="button" className={`size-10 shrink-0 cursor-zoom-in overflow-hidden rounded ${className}`} title="Enlarge"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); setFull(true); }}>
          {kind === 'image'
            ? <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
            : <video src={src} className="size-full object-cover" muted playsInline preload="metadata" onError={() => setFailed(true)} />}
        </button>
        {modal}
      </>
    );
  }
  return (
    <div className={`relative ${size === 'fill' ? 'w-full' : 'w-fit max-w-full'} ${className}`}>
      <MediaPreview src={src} kind={kind} onError={() => setFailed(true)} onClick={kind === 'image' ? () => setFull(true) : undefined}
                    className={`${size === 'fill' ? 'h-auto w-full' : 'max-h-[33vh] max-w-full rounded-box object-contain'} ${kind === 'image' ? 'cursor-zoom-in' : ''}`} />
      <div className="absolute right-1.5 top-1.5 flex gap-1">
        <button type="button" className="btn btn-ghost btn-xs rounded-full bg-base-100/90" onClick={() => setFull(true)} title="Enlarge">
          <Maximize2 className="size-3.5" />
        </button>
        {actions}
      </div>
      {modal}
    </div>
  );
}

/** The attachment at `path` in the data folder (an item's `media`). */
export function NoteMedia({ path, ...rest }: { path: string; onDelete?: () => Promise<unknown>; actions?: ReactNode; size?: MediaSize; className?: string }) {
  return <Media src={fileUrl(path)} kind={kindOf(path).name === 'video' ? 'video' : 'image'} path={path} {...rest} />;
}
