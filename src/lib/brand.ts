/**
 * The official Homesta logo files, served from public/brand/. Nothing else draws the
 * logo: the app shows these PNGs through <BrandLogo>, and every printed document or PDF
 * embeds them as base64 so they print without a network request.
 *
 * Each PNG carries its own clear space. The files are never recolored, filtered or
 * stretched; only their width and height are set, always at the file's ratio.
 * Team (HC.TEAM) has the same module, so both apps show the logo the same way.
 */

export type BrandAsset = 'icon' | 'wordmarkLight' | 'wordmarkDark';

export const BRAND_ALT = 'Homesta Cars';

/** Width over height of both wordmark files (4000 × 1086). The icon is square. */
export const WORDMARK_RATIO = 4000 / 1086;

const FILES: Record<BrandAsset, string> = {
  icon: 'homesta-icon.png',
  wordmarkLight: 'homesta-wordmark-light.png', // black text, for light surfaces
  wordmarkDark: 'homesta-wordmark-dark.png', // white text, for dark surfaces
};

/** Embedded copies are scaled down to this width: still sharp at print resolution, far smaller. */
const EMBED_MAX_WIDTH: Record<BrandAsset, number> = {
  icon: 512,
  wordmarkLight: 1200,
  wordmarkDark: 1200,
};

const ASSETS = Object.keys(FILES) as BrandAsset[];

/** The file's path on this app, for an <img> on the page. */
export function brandSrc(asset: BrandAsset): string {
  return `${process.env.PUBLIC_URL ?? ''}/brand/${FILES[asset]}`;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the logo file'));
    reader.readAsDataURL(blob);
  });
}

/** Scales the PNG down to `maxWidth` at its own ratio; the original when it's already smaller or a canvas isn't available. */
async function downscale(dataUrl: string, maxWidth: number): Promise<string> {
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    if (!image.naturalWidth || image.naturalWidth <= maxWidth) return dataUrl;
    const width = maxWidth;
    const height = Math.round((image.naturalHeight * maxWidth) / image.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return dataUrl;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    const scaled = canvas.toDataURL('image/png');
    return scaled.startsWith('data:image/png') ? scaled : dataUrl;
  } catch {
    return dataUrl;
  }
}

const cache = new Map<BrandAsset, Promise<string>>();

/** The logo file as a base64 PNG data URL, fetched once per session. Rejects when the file can't be loaded. */
export function brandDataUrl(asset: BrandAsset): Promise<string> {
  const cached = cache.get(asset);
  if (cached) return cached;
  const loading = (async () => {
    const response = await fetch(brandSrc(asset));
    if (!response.ok) throw new Error(`Could not load ${FILES[asset]} (${response.status})`);
    return downscale(await readAsDataUrl(await response.blob()), EMBED_MAX_WIDTH[asset]);
  })();
  cache.set(asset, loading);
  // A failed load is forgotten, so the next print tries again.
  loading.catch(() => cache.delete(asset));
  return loading;
}

function absoluteUrl(path: string): string {
  try {
    return new URL(path, window.location.origin).href;
  } catch {
    return path;
  }
}

/** Whether a standalone document shows any of the logo files. */
export function hasBrandAssets(html: string): boolean {
  return ASSETS.some((asset) => html.includes(brandSrc(asset)));
}

/**
 * Swaps every brandSrc() in a standalone HTML document for the embedded PNG, so the
 * document keeps its logo when printed, saved as PDF, or opened from a blob: URL.
 * Never throws: a file that can't be embedded falls back to its absolute URL.
 */
export async function inlineBrandAssets(html: string): Promise<string> {
  let result = html;
  for (const asset of ASSETS) {
    const src = brandSrc(asset);
    if (!result.includes(src)) continue;
    let replacement: string;
    try {
      replacement = await brandDataUrl(asset);
    } catch {
      replacement = absoluteUrl(src);
    }
    result = result.split(src).join(replacement);
  }
  return result;
}

/** An <img> for a standalone HTML document, `height` in CSS units with the width following the file's ratio. */
export function brandImgHtml(asset: BrandAsset, height: string, className = ''): string {
  const classAttr = className ? ` class="${className}"` : '';
  return `<img src="${brandSrc(asset)}" alt="${BRAND_ALT}"${classAttr} style="display:block;height:${height};width:auto;max-width:none;object-fit:contain;border-radius:0;box-shadow:none;filter:none" draggable="false">`;
}

/**
 * Writes a document into a window opened earlier (it has to be opened inside the click,
 * before any await, or the browser blocks it), with the logo embedded first. `onReady`
 * runs once its images have loaded, so a print shows the logo.
 */
export async function writeBrandedDocument(win: Window, html: string, onReady?: (win: Window) => void): Promise<void> {
  const ready = await inlineBrandAssets(html);
  if (win.closed) return;
  win.document.open();
  win.document.write(ready);
  win.document.close();
  if (!onReady) return;
  const images = Array.from(win.document.images);
  await Promise.all(images.map((image) => (image.complete ? Promise.resolve() : image.decode().catch(() => undefined))));
  onReady(win);
}
