import { ImageOff, Upload } from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';
import { MediaPreview } from '@/dumb/MediaPreview';
import { isVideoFilename, mediaUrl } from '@/entities/item/media';
import type { MediaAttachment } from './useMediaAttachment';

type Props = {
  attachment: MediaAttachment;
  onAttach: (file: File) => void;
  onRemove: () => void;
  compact?: boolean;
};

/** Picker, preview and removal control for a staged item attachment. */
export function MediaAttachmentField({ attachment, onAttach, onRemove, compact = false }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const src = attachment?.status === 'existing' ? mediaUrl(attachment.filename) : (attachment?.url ?? null);
  const kind = attachment?.status === 'existing' ? (isVideoFilename(attachment.filename) ? 'video' : 'image') : attachment?.kind;
  const changed = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onAttach(file);
  };

  return (
    <div className={compact ? '' : 'mb-4'}>
      <input ref={input} type="file" accept="image/*,video/*" className="hidden" onChange={changed} />
      {!src ? (
        <button type="button" className={compact ? 'btn btn-ghost btn-xs rounded-full' : 'btn btn-sm'}
                onClick={() => input.current?.click()} title="Attach an image or video">
          <Upload className={compact ? 'size-3.5' : 'size-4'} />{compact ? null : 'Attach media'}
        </button>
      ) : kind ? (
        <div className="relative">
          <MediaPreview src={src} kind={kind} className={compact ? 'h-auto w-full' : 'max-h-[33vh] max-w-full rounded-box object-contain'} />
          <button type="button" className="btn btn-ghost btn-xs absolute right-1.5 top-1.5 rounded-full bg-base-100/90 hover:bg-error/10 hover:text-error"
                  onClick={onRemove} title="Remove attachment">
            <ImageOff className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
