import { Camera, ImageOff, Upload } from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';
import { fileUrl, mediaFiles, mediaKind } from '@/entities/item/files/files';
import type { GalleryMedia } from '@/entities/item/files/MediaGallery';
import type { MediaEntry } from './useMediaAttachments';

/** Icon buttons attaching images and videos: upload (any number), and (touch only) the camera. */
export function MediaPicker({ onAttach, className }: { onAttach: (files: File[]) => void; className: string }) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const changed = (event: ChangeEvent<HTMLInputElement>) => {
    const files = mediaFiles(event.target.files);
    // reset so picking the same file again still fires a change event
    event.target.value = '';
    if (files.length) onAttach(files);
  };

  return (
    <>
      <input ref={input} type="file" accept="image/*,video/*" multiple className="hidden" onChange={changed} />
      {/* `capture` opens the camera app directly on phones; desktops ignore it, hence touch-only */}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={changed} />
      <button type="button" className={className} onClick={() => input.current?.click()} title="attach images or videos">
        <Upload size={14} />
      </button>
      <button type="button" className={`${className} hidden pointer-coarse:inline-flex`} onClick={() => camera.current?.click()} title="take a photo">
        <Camera size={14} />
      </button>
    </>
  );
}

/** Staged images and videos for a MediaGallery, each with its remove button. */
export function stagedMedia(entries: MediaEntry[], onRemove: (entry: MediaEntry) => void): GalleryMedia[] {
  return entries.map((entry) => {
    const actions = (
      <button type="button" className="btn btn-ghost btn-xs rounded-full bg-base-100/90 hover:bg-error/10 hover:text-error"
              onClick={() => onRemove(entry)} title="remove">
        <ImageOff className="size-3.5" />
      </button>
    );
    return entry.status === 'existing'
      ? { key: entry.path, src: fileUrl(entry.path), kind: mediaKind(entry.path), path: entry.path, actions }
      : { key: entry.url, src: entry.url, kind: entry.kind, actions };
  });
}
