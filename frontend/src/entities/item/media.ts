/** Recognised video file extensions, as views.VIDEO_EXTENSIONS. */
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);

export const MAX_VIDEO_ATTACHMENT_BYTES = 250 * 1024 * 1024;

export const isVideoFilename = (path: string) => VIDEO_EXTENSIONS.has(path.split('.').pop()?.toLowerCase() ?? '');

export const mediaUrl = (path: string) => `/api/media/${path.split('/').map(encodeURIComponent).join('/')}`;

export const pastedMedia = (data: DataTransfer | null) =>
  Array.from(data?.files ?? []).find((item) => item.type.startsWith('image/') || item.type.startsWith('video/'));

const MAX_EDGE = 1920;
const QUALITY = 0.82;

/** Downscales and re-encodes an image before it reaches the synced media folder. */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))), 'image/webp', QUALITY);
  });
}

/** Decodes an image and re-encodes it as the PNG required by the clipboard API. */
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
