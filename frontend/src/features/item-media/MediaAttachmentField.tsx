import { Camera, ImageOff, Upload } from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';
import { Media } from '@/entities/item/Media';
import { isVideoFilename, mediaUrl } from '@/entities/item/media';
import type { MediaAttachment } from './useMediaAttachment';

/** Upload and (touch-only) camera buttons; compact is icon-only. */
export function MediaPicker({ onAttach, compact = false }: { onAttach: (file: File) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const changed = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // reset so picking the same file again still fires a change event
    event.target.value = '';
    if (file) onAttach(file);
  };
  const button = compact ? 'btn btn-ghost btn-xs rounded-full' : 'btn btn-sm';
  const icon = compact ? 'size-3.5' : 'size-4';

  return (
    <div className={compact ? 'flex gap-1' : 'flex gap-2'}>
      <input ref={input} type="file" accept="image/*,video/*" className="hidden" onChange={changed} />
      {/* `capture` opens the camera app directly on phones; desktops ignore it, hence touch-only */}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={changed} />
      <button type="button" className={button} onClick={() => input.current?.click()} title="Attach an image or video">
        <Upload className={icon} />{compact ? null : 'Attach media'}
      </button>
      <button type="button" className={`${button} hidden pointer-coarse:inline-flex`} onClick={() => camera.current?.click()} title="Take a photo">
        <Camera className={icon} />{compact ? null : 'Camera'}
      </button>
    </div>
  );
}

/** Preview of a staged attachment, enlargeable, with its remove button; nothing when there is none. */
export function MediaAttachmentPreview({ attachment, onRemove, compact = false }: {
  attachment: MediaAttachment;
  onRemove: () => void;
  compact?: boolean;
}) {
  if (!attachment) return null;
  const src = attachment.status === 'existing' ? mediaUrl(attachment.filename) : attachment.url;
  const kind = attachment.status === 'existing' ? (isVideoFilename(attachment.filename) ? 'video' : 'image') : attachment.kind;
  return (
    <Media src={src} kind={kind} path={attachment.status === 'existing' ? attachment.filename : undefined} fill={compact} actions={
      <button type="button" className="btn btn-ghost btn-xs rounded-full bg-base-100/90 hover:bg-error/10 hover:text-error"
              onClick={onRemove} title="Remove attachment">
        <ImageOff className="size-3.5" />
      </button>
    } />
  );
}

/** Picker, preview and removal control for a staged item attachment. */
export function MediaAttachmentField({ attachment, onAttach, onRemove }: {
  attachment: MediaAttachment;
  onAttach: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="mb-4">
      {attachment ? <MediaAttachmentPreview attachment={attachment} onRemove={onRemove} /> : <MediaPicker onAttach={onAttach} />}
    </div>
  );
}
