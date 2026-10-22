import { Camera, ImageOff, Upload } from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';
import { fileUrl, kindOf } from '@/entities/item/files/files';
import { Media, type MediaSize } from '@/entities/item/files/Media';
import type { MediaAttachment } from './useMediaAttachment';

/** Icon buttons attaching an image or video: upload, and (touch only) the camera. */
export function MediaPicker({ onAttach, className }: { onAttach: (file: File) => void; className: string }) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const changed = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // reset so picking the same file again still fires a change event
    event.target.value = '';
    if (file) onAttach(file);
  };

  return (
    <>
      <input ref={input} type="file" accept="image/*,video/*" className="hidden" onChange={changed} />
      {/* `capture` opens the camera app directly on phones; desktops ignore it, hence touch-only */}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={changed} />
      <button type="button" className={className} onClick={() => input.current?.click()} title="attach an image or video">
        <Upload size={14} />
      </button>
      <button type="button" className={`${className} hidden pointer-coarse:inline-flex`} onClick={() => camera.current?.click()} title="take a photo">
        <Camera size={14} />
      </button>
    </>
  );
}

/** A staged attachment, enlargeable, with its remove button; nothing when there is none. */
export function MediaAttachmentPreview({ attachment, onRemove, size }: { attachment: MediaAttachment; onRemove: () => void; size?: MediaSize }) {
  if (!attachment) return null;
  const src = attachment.status === 'existing' ? fileUrl(attachment.filename) : attachment.url;
  const kind = attachment.status === 'existing' ? (kindOf(attachment.filename).name === 'video' ? 'video' : 'image') : attachment.kind;
  return (
    <Media src={src} kind={kind} path={attachment.status === 'existing' ? attachment.filename : undefined} size={size} actions={
      <button type="button" className="btn btn-ghost btn-xs rounded-full bg-base-100/90 hover:bg-error/10 hover:text-error"
              onClick={onRemove} title="remove attachment">
        <ImageOff className="size-3.5" />
      </button>
    } />
  );
}
