import { useState } from 'react';
import { Modal } from './Modal';

const VIDEO = /\.(mp4|webm|mov)$/i;

/** An image or video inline, at most a third of the screen high: a video plays in place, an image opens full-size on click. */
export function Media({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  if (failed) return <p className="text-error text-sm">Can't show {src}</p>;
  if (VIDEO.test(src)) return <video src={src} controls className="max-h-[33vh] rounded-box" onError={() => setFailed(true)} />;
  return (
    <>
      <img src={src} alt="" className="max-h-[33vh] rounded-box cursor-zoom-in" onClick={() => setFull(true)} onError={() => setFailed(true)} />
      {full && (
        <Modal wide onClose={() => setFull(false)}>
          <img src={src} alt="" className="w-full" onClick={() => setFull(false)} />
        </Modal>
      )}
    </>
  );
}
