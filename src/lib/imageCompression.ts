const MAX_SIDE = 2000;
const QUALITY = 0.82;
/** Below this a phone photo has nothing worth squeezing. */
const SKIP_BELOW_BYTES = 400 * 1024;

export function scaledSize(width: number, height: number, maxSide: number = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export interface CompressOptions {
  maxSide?: number;
  quality?: number;
  /** Smaller files go up untouched. */
  skipBelowBytes?: number;
}

export const canCompress = (file: Pick<File, 'type' | 'size'>, skipBelowBytes: number = SKIP_BELOW_BYTES): boolean =>
  file.type.startsWith('image/')
  && file.type !== 'image/gif'
  && file.type !== 'image/svg+xml'
  && file.size >= skipBelowBytes;

/**
 * A smaller JPEG of a photo. Anything it can't improve goes back untouched, so a
 * format the browser can't read, like HEIC on desktop, still uploads as it came.
 */
export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const { maxSide = MAX_SIDE, quality = QUALITY, skipBelowBytes = SKIP_BELOW_BYTES } = options;
  if (!canCompress(file, skipBelowBytes)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const oversized = Math.max(bitmap.width, bitmap.height) > maxSide;
    const { width, height } = scaledSize(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    // A photo over the size limit is always scaled down, even if the JPEG comes out larger.
    if (!blob || (blob.size >= file.size && !oversized)) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
