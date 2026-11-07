/**
 * Builds every favicon and app icon from the official mark, public/brand/homesta-icon.png.
 *   node scripts/generate-favicons.mjs [publicDir]
 * publicDir defaults to this app's public/. Team has no sharp, so it is built from
 * here: node scripts/generate-favicons.mjs ../HC.TEAM/public
 *
 * Browser-tab icons (favicon.ico 16/32/48, favicon-16x16, favicon-32x32) are the arch
 * alone on a transparent ground: the white is taken out by un-blending each pixel
 * against the arch blue, so the antialiased edge keeps its softness with no white
 * fringe. The arch is trimmed and centred with a small margin, as the old favicons
 * were, and at 16 and 32px its stroke is a touch heavier so it still reads.
 *
 * Home-screen icons (apple-touch-icon, android-chrome) keep the white square, which iOS
 * and Android need: a centred square cut of the official PNG, scaled down.
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(process.argv[2] ?? resolve(__dirname, '..', 'public'));
const ICON = resolve(PUBLIC, 'brand', 'homesta-icon.png');

/** Arch blue of the official file (#6EA4E7). */
const ARCH = { r: 110, g: 164, b: 231 };

/** Home-screen icons: share of the 1080px source each keeps; the arch is about 43% of its width. */
const ROOMY = 0.78;

const SQUARE_TARGETS = [
  { size: 180, out: 'apple-touch-icon.png' },
  { size: 192, out: 'android-chrome-192x192.png' },
  { size: 512, out: 'android-chrome-512x512.png' },
];

/**
 * Tab icons: transparent. `margin` is the space left on each side, as a share of the
 * icon (the old favicons drew the arch across 75% of it). `thicken` widens the stroke
 * by that many pixels of the finished icon on each side.
 */
const TAB_TARGETS = [
  { size: 16, margin: 0.125, thicken: 0.55, out: 'favicon-16x16.png' },
  { size: 32, margin: 0.125, thicken: 0.45, out: 'favicon-32x32.png' },
  { size: 48, margin: 0.125, thicken: 0, out: null /* ico only */ },
];

// Minimal ICO encoder: embeds the PNGs directly (supported by every modern OS).
function buildIco(entries) {
  const header = 6;
  const entrySize = 16;
  let dataOffset = header + entrySize * entries.length;
  const meta = entries.map(e => {
    const off = dataOffset;
    dataOffset += e.buf.length;
    return { ...e, off };
  });

  const ico = Buffer.alloc(dataOffset);
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(entries.length, 4);

  let pos = header;
  for (const m of meta) {
    ico.writeUInt8(m.size >= 256 ? 0 : m.size, pos);
    ico.writeUInt8(m.size >= 256 ? 0 : m.size, pos + 1);
    ico.writeUInt8(0, pos + 2);
    ico.writeUInt8(0, pos + 3);
    ico.writeUInt16LE(1, pos + 4);
    ico.writeUInt16LE(32, pos + 6);
    ico.writeUInt32LE(m.buf.length, pos + 8);
    ico.writeUInt32LE(m.off, pos + 12);
    pos += entrySize;
  }
  for (const m of meta) m.buf.copy(ico, m.off);
  return ico;
}

async function squareIcon(size) {
  const { width, height } = await sharp(ICON).metadata();
  const side = Math.round(Math.min(width, height) * ROOMY);
  return sharp(ICON)
    .extract({ left: Math.round((width - side) / 2), top: Math.round((height - side) / 2), width: side, height: side })
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

/** The arch's coverage, 0–1 per pixel: how far each pixel is from white toward the arch blue. */
async function archMask() {
  const { data, info } = await sharp(ICON).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Float32Array(info.width * info.height);
  for (let i = 0; i < mask.length; i += 1) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    // Red and green carry the contrast; blue is nearly the same on white and on the arch.
    const coverage = ((255 - r) / (255 - ARCH.r) + (255 - g) / (255 - ARCH.g)) / 2;
    mask[i] = coverage < 0.02 ? 0 : Math.min(1, coverage);
  }
  return { mask, width: info.width, height: info.height };
}

function bounds({ mask, width, height }) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Grey-scale dilation with a round brush: every pixel takes the strongest coverage within `radius`. */
function dilate({ mask, width, height }, radius) {
  if (radius <= 0) return { mask, width, height };
  const r = Math.ceil(radius);
  const offsets = [];
  for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy]);
  const out = new Float32Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let best = 0;
      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const value = mask[ny * width + nx];
        if (value > best) { best = value; if (best === 1) break; }
      }
      out[y * width + x] = best;
    }
  }
  return { mask: out, width, height };
}

/** The arch alone, trimmed and centred on a transparent square, `size` px. */
async function tabIcon(source, { size, margin, thicken }) {
  const box = bounds(source);
  // Work at the trimmed arch's own scale: one icon pixel is this many source pixels.
  const side = Math.ceil(Math.max(box.width, box.height) / (1 - 2 * margin));
  const scale = side / size;
  const pad = Math.ceil(thicken * scale) + 2;
  const width = box.width + pad * 2;
  const height = box.height + pad * 2;
  const cropped = new Float32Array(width * height);
  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      cropped[(y + pad) * width + x + pad] = source.mask[(box.top + y) * source.width + box.left + x];
    }
  }
  const heavier = dilate({ mask: cropped, width, height }, thicken * scale);
  const arch = bounds(heavier);
  const canvas = Math.ceil(Math.max(arch.width, arch.height) / (1 - 2 * margin));
  const rgba = Buffer.alloc(canvas * canvas * 4);
  const offsetX = Math.round((canvas - arch.width) / 2) - arch.left;
  const offsetY = Math.round((canvas - arch.height) / 2) - arch.top;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = heavier.mask[y * width + x];
      if (value === 0) continue;
      const cx = x + offsetX;
      const cy = y + offsetY;
      if (cx < 0 || cy < 0 || cx >= canvas || cy >= canvas) continue;
      const i = (cy * canvas + cx) * 4;
      rgba[i] = ARCH.r;
      rgba[i + 1] = ARCH.g;
      rgba[i + 2] = ARCH.b;
      rgba[i + 3] = Math.round(value * 255);
    }
  }
  return sharp(rgba, { raw: { width: canvas, height: canvas, channels: 4 } })
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

async function main() {
  for (const { size, out } of SQUARE_TARGETS) {
    writeFileSync(resolve(PUBLIC, out), await squareIcon(size));
    console.log(`  ✓  ${out}  (${size}×${size}, white square)`);
  }
  const source = await archMask();
  const tabs = {};
  for (const target of TAB_TARGETS) {
    tabs[target.size] = await tabIcon(source, target);
    if (target.out) {
      writeFileSync(resolve(PUBLIC, target.out), tabs[target.size]);
      console.log(`  ✓  ${target.out}  (${target.size}×${target.size}, transparent)`);
    }
  }
  writeFileSync(resolve(PUBLIC, 'favicon.ico'), buildIco(TAB_TARGETS.map(({ size }) => ({ size, buf: tabs[size] }))));
  console.log('  ✓  favicon.ico  (16 + 32 + 48, transparent)');
  console.log(`\nAll icons written to ${PUBLIC}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
