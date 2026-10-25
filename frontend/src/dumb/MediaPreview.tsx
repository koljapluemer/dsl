import { Pause, Play } from 'lucide-react';
import { useRef, useState } from 'react';

/** An image, or a muted looping video with one play/pause control. `onClick` is the image's; `videoClassName` sizes the video in its box. */
export function MediaPreview({ src, kind, className, videoClassName = 'h-auto w-full', onClick, onError }: {
  src: string;
  kind: 'image' | 'video';
  className?: string;
  videoClassName?: string;
  onClick?: () => void;
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  if (kind === 'image') return <img src={src} alt="" className={className} onClick={onClick} onError={onError} />;

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play(); else video.pause();
  };
  return (
    <div className={`relative ${className ?? ''}`}>
      <video ref={videoRef} src={src} className={videoClassName} muted playsInline loop
             onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={onError} />
      <button type="button" className="btn btn-circle btn-sm absolute inset-0 m-auto border-none bg-base-100/70 hover:bg-base-100/90"
              onClick={toggle} title={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4 pl-0.5" />}
      </button>
    </div>
  );
}
