const MAX_DIMENSION = 1600;
const QUALITY = 0.82;

/**
 * Downscales and re-encodes a pasted/picked image file entirely client-side, so a
 * multi-megabyte screenshot never gets written to the (synced) media folder as-is.
 * WebP where the browser can encode it; otherwise whatever toBlob falls back to (PNG).
 */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))), 'image/webp', QUALITY));
  } finally {
    bitmap.close();
  }
}
