import { useState, type ReactNode } from 'react';
import { Media } from './Media';
import { MediaModal, type ShownMedia } from './MediaModal';

/** One of a gallery's images and videos; `actions` are its corner buttons besides Enlarge. */
export type GalleryMedia = ShownMedia & { key: string; actions?: ReactNode };

/**
 * A note's images and videos, each enlarged into one MediaModal stepping
 * through all of them: one as Media `inline`; more in a row of equal height,
 * scrolled sideways (swiped on touch), or `stacked` as wide as their box.
 */
export function MediaGallery({ media, stacked = false }: { media: GalleryMedia[]; stacked?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!media.length) return null;
  const modal = open !== null && <MediaModal media={media} start={open} onClose={() => setOpen(null)} />;
  const shown = (m: GalleryMedia, i: number, size: 'inline' | 'fill' | 'strip') => (
    <Media src={m.src} kind={m.kind} path={m.path} actions={m.actions} size={size} onEnlarge={() => setOpen(i)} />
  );

  if (media.length === 1 || stacked) {
    return (
      <div className="flex flex-col gap-2">
        {media.map((m, i) => <div key={m.key}>{shown(m, i, stacked ? 'fill' : 'inline')}</div>)}
        {modal}
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="carousel w-full gap-2 rounded-box">
        {media.map((m, i) => <div key={m.key} className="carousel-item">{shown(m, i, 'strip')}</div>)}
      </div>
      <span className="badge badge-sm pointer-events-none absolute bottom-1.5 left-1.5 border-none bg-base-100/90">{media.length}</span>
      {modal}
    </div>
  );
}
