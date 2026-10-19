import { useCallback, useEffect, useState } from 'react';
import { compressImage, MAX_VIDEO_ATTACHMENT_BYTES } from '@/entities/item/media';

/**
 * One attached image or video, one per note, alternative not additive. `existing`
 * carries the filename already on disk (unchanged); `new` carries freshly
 * pasted bytes not yet written (compressed, for an image; verbatim, for a
 * video) and an object URL previewing them; `null` means "no attachment" (a removal, in
 * edit mode). Persisting it is the save handler's job.
 */
export type MediaAttachment =
  | { status: 'existing'; filename: string }
  | { status: 'new'; kind: 'image' | 'video'; blob: Blob; url: string }
  | null;

/** Stages one attachment and owns the lifetime of its local preview URL. */
export function useMediaAttachment(initial: string | null) {
  const [attachment, setAttachment] = useState<MediaAttachment>(initial ? { status: 'existing', filename: initial } : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (attachment?.status !== 'new') return;
    return () => URL.revokeObjectURL(attachment.url);
  }, [attachment]);

  const attachFile = async (file: File) => {
    setError(null);
    try {
      if (file.type.startsWith('video/')) {
        if (file.size > MAX_VIDEO_ATTACHMENT_BYTES) {
          throw new Error(`Video is too large; keep clips under ${Math.round(MAX_VIDEO_ATTACHMENT_BYTES / (1024 * 1024))}MB.`);
        }
        const next: MediaAttachment = { status: 'new', kind: 'video', blob: file, url: URL.createObjectURL(file) };
        setAttachment(next);
        return next;
      } else if (file.type.startsWith('image/')) {
        const blob = await compressImage(file);
        const next: MediaAttachment = { status: 'new', kind: 'image', blob, url: URL.createObjectURL(blob) };
        setAttachment(next);
        return next;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    return null;
  };

  const resetAttachment = useCallback((filename: string | null) => {
    setAttachment(filename ? { status: 'existing', filename } : null);
    setError(null);
  }, []);

  return { attachment, setAttachment, attachFile, resetAttachment, error };
}
