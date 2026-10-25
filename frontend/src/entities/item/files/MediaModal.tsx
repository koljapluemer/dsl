import { ChevronLeft, ChevronRight, Clipboard, Copy, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '@/dumb/Modal';
import { filePath } from '../mutations';
import { imageUrlToPngBlob } from './kinds/image';

/** An image or video the modal shows: `path` is the file's in the data folder, `onDelete` deletes it. */
export type ShownMedia = { src: string; kind: 'image' | 'video'; path?: string; onDelete?: () => Promise<unknown> };

/**
 * Images and videos as large as the screen allows, one at a time from `start`,
 * stepped through by the arrow buttons and keys, with Copy (images), Copy Path
 * (given its `path`) and Delete (given its `onDelete`) for the one shown.
 */
export function MediaModal({ media, start = 0, onClose }: { media: ShownMedia[]; start?: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = media.length;
  const shown = media[Math.min(index, count - 1)];
  const step = (by: number) => { setIndex((i) => (i + by + count) % count); setError(null); };

  useEffect(() => {
    if (count < 2) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });

  if (!shown) return null;
  const { src, kind, path, onDelete } = shown;

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

  const arrow = 'btn btn-circle absolute top-1/2 -translate-y-1/2 border-none bg-base-100/80 hover:bg-base-100';
  return (
    <Modal onClose={onClose} box="flex h-[90vh] w-11/12 max-w-6xl flex-col p-4">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-end gap-1">
        {count > 1 && <span className="mr-auto text-sm tabular-nums ov-muted">{index + 1} / {count}</span>}
        {kind === 'image' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void run(copyImage)}>
            <Clipboard className="size-4" /> Copy
          </button>
        )}
        {path && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void run(async () => navigator.clipboard.writeText(await filePath(path)))}>
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
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-base-200">
        {kind === 'image'
          ? <img key={src} src={src} alt="" className="max-h-full max-w-full object-contain" />
          : <video key={src} src={src} controls autoPlay playsInline className="max-h-full max-w-full" />}
        {count > 1 && <>
          <button type="button" className={`${arrow} left-2`} onClick={() => step(-1)} title="previous (←)"><ChevronLeft className="size-5" /></button>
          <button type="button" className={`${arrow} right-2`} onClick={() => step(1)} title="next (→)"><ChevronRight className="size-5" /></button>
        </>}
      </div>
    </Modal>
  );
}
