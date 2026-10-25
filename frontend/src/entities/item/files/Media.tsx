import { Maximize2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { MediaPreview } from '@/dumb/MediaPreview';
import { MediaModal } from './MediaModal';
import { fileUrl, mediaKind } from './files';

/**
 * How an image or video is shown: `inline` at most a third of the screen high,
 * `fill` as wide as its box, `strip` a fixed height (one of a row, see MediaGallery),
 * `thumb` a small square that only enlarges.
 */
export type MediaSize = 'inline' | 'fill' | 'strip' | 'thumb';

const SHOWN: Record<Exclude<MediaSize, 'thumb'>, string> = {
  inline: 'max-h-[33vh] max-w-full rounded-box object-contain',
  fill: 'h-auto w-full',
  strip: 'h-48 max-h-[33vh] w-auto max-w-none rounded-box object-contain',
};

/**
 * An image or video, enlarged by its corner button or, for an image (any
 * thumbnail), a click: into its own MediaModal (given `path` and `onDelete`),
 * or by `onEnlarge` instead. `actions` are more corner buttons.
 */
export function Media({ src, kind, path, onDelete, onEnlarge, actions, size = 'inline', className = '' }: {
  src: string;
  kind: 'image' | 'video';
  path?: string;
  onDelete?: () => Promise<unknown>;
  onEnlarge?: () => void;
  actions?: ReactNode;
  size?: MediaSize;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  if (failed) return <p className="text-error text-sm">Can't show {path ?? src}</p>;
  const enlarge = onEnlarge ?? (() => setFull(true));
  const modal = full && <MediaModal media={[{ src, kind, path, onDelete }]} onClose={() => setFull(false)} />;
  if (size === 'thumb') {
    // the modal beside the button, not in it: clicks in it would bubble to the button (through the portal)
    return (
      <>
        <button type="button" className={`size-10 shrink-0 cursor-zoom-in overflow-hidden rounded ${className}`} title="Enlarge"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); enlarge(); }}>
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
      <MediaPreview src={src} kind={kind} onError={() => setFailed(true)} onClick={kind === 'image' ? enlarge : undefined}
                    videoClassName={size === 'strip' ? 'h-full w-auto max-w-none' : undefined}
                    className={`${SHOWN[size]} ${kind === 'image' ? 'cursor-zoom-in' : ''}`} />
      <div className="absolute right-1.5 top-1.5 flex gap-1">
        <button type="button" className="btn btn-ghost btn-xs rounded-full bg-base-100/90" onClick={enlarge} title="Enlarge">
          <Maximize2 className="size-3.5" />
        </button>
        {actions}
      </div>
      {modal}
    </div>
  );
}

/** The image or video at `path` in the data folder (one an item's `media` clauses name). */
export function NoteMedia({ path, ...rest }: { path: string; onDelete?: () => Promise<unknown>; actions?: ReactNode; size?: MediaSize; className?: string }) {
  return <Media src={fileUrl(path)} kind={mediaKind(path)} path={path} {...rest} />;
}
