import { Maximize2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { MediaPreview } from '@/dumb/MediaPreview';
import { MediaModal } from './MediaModal';

/**
 * An image or video inline, at most a third of the screen high (with `fill`, as
 * wide as its box), enlarged into a MediaModal by its corner button or, for an
 * image, a click. `path` and `onDelete` go to the modal; `actions` are more corner buttons.
 */
export function Media({ src, kind, path, onDelete, actions, fill = false, className = '' }: {
  src: string;
  kind: 'image' | 'video';
  path?: string;
  onDelete?: () => Promise<unknown>;
  actions?: ReactNode;
  fill?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  if (failed) return <p className="text-error text-sm">Can't show {path ?? src}</p>;
  return (
    <div className={`relative ${fill ? 'w-full' : 'w-fit max-w-full'} ${className}`}>
      <MediaPreview src={src} kind={kind} onError={() => setFailed(true)} onClick={kind === 'image' ? () => setFull(true) : undefined}
                    className={`${fill ? 'h-auto w-full' : 'max-h-[33vh] max-w-full rounded-box object-contain'} ${kind === 'image' ? 'cursor-zoom-in' : ''}`} />
      <div className="absolute right-1.5 top-1.5 flex gap-1">
        <button type="button" className="btn btn-ghost btn-xs rounded-full bg-base-100/90" onClick={() => setFull(true)} title="Enlarge">
          <Maximize2 className="size-3.5" />
        </button>
        {actions}
      </div>
      {full && <MediaModal src={src} kind={kind} path={path} onDelete={onDelete} onClose={() => setFull(false)} />}
    </div>
  );
}
