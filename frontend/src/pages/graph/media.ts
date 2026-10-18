/** Recognised video file extensions, as views.VIDEO_EXTENSIONS. */
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);

/** Upper bound on an attached video's size, as graph.MAX_VIDEO_BYTES; unlike an image, a video isn't re-encoded before it's written. */
export const MAX_VIDEO_ATTACHMENT_BYTES = 250 * 1024 * 1024;

/** Whether a media path's extension makes it a video rather than an image. */
export const isVideoFilename = (path: string) => VIDEO_EXTENSIONS.has(path.split('.').pop()?.toLowerCase() ?? '');

/** Where the server serves a note's media path (relative to the data folder) from. */
export const mediaUrl = (path: string) => `/api/media/${path.split('/').map(encodeURIComponent).join('/')}`;

/** Decodes any image the browser supports and re-encodes it as PNG, the one image type the clipboard takes. */
export function imageUrlToPngBlob(src: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas 2D context is unavailable.'));
        return;
      }
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded as PNG.'))), 'image/png');
    };
    image.onerror = () => reject(new Error('The browser could not decode the image.'));
    image.src = src;
  });
}
