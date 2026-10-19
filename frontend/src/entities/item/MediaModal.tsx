import { Clipboard, Copy, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/dumb/Modal';
import { imageUrlToPngBlob } from './media';
import { mediaPath } from './mutations';

/**
 * An image or video as large as the screen allows, with Copy (images), Copy
 * Path (given the file's `path` in the media folder) and Delete (given `onDelete`).
 */
export function MediaModal({ src, kind, path, onDelete, onClose }: {
  src: string;
  kind: 'image' | 'video';
  path?: string;
  onDelete?: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyImage = async () => {
    const png = await imageUrlToPngBlob(src);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  };

  return (
    <Modal onClose={onClose} box="flex h-[90vh] w-11/12 max-w-6xl flex-col p-4">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-end gap-1">
        {kind === 'image' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void run(copyImage)}>
            <Clipboard className="size-4" /> Copy
          </button>
        )}
        {path && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void run(async () => navigator.clipboard.writeText(await mediaPath(path)))}>
            <Copy className="size-4" /> Copy Path
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn btn-ghost btn-sm text-error hover:bg-error/10" disabled={busy}
                  onClick={() => void run(async () => { await onDelete(); onClose(); })}>
            <Trash2 className="size-4" /> Delete Media
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          <X className="size-4" /> Close
        </button>
      </div>
      {error && <p className="mb-2 shrink-0 text-sm text-error">{error}</p>}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-base-200">
        {kind === 'image'
          ? <img src={src} alt="" className="max-h-full max-w-full object-contain" />
          : <video src={src} controls autoPlay playsInline className="max-h-full max-w-full" />}
      </div>
    </Modal>
  );
}
