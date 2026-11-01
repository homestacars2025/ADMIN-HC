const MAX_SIDE = 2000;
const QUALITY = 0.82;
/** Below this a phone photo has nothing worth squeezing. */
const SKIP_BELOW_BYTES = 400 * 1024;

export function scaledSize(width: number, height: number, maxSide: number = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export const canCompress = (file: Pick<File, 'type' | 'size'>): boolean =>
  file.type.startsWith('image/')
  && file.type !== 'image/gif'
  && file.type !== 'image/svg+xml'
  && file.size >= SKIP_BELOW_BYTES;

/**
 * A smaller JPEG of a photo. Anything it can't improve goes back untouched, so a
 * format the browser can't read, like HEIC on desktop, still uploads as it came.
 */
export async function compressImage(file: File): Promise<File> {
  if (!canCompress(file)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
