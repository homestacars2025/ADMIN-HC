/**
 * Builds every favicon and app icon from the official mark, public/brand/homesta-icon.png.
 *   node scripts/generate-favicons.mjs [publicDir]
 * publicDir defaults to this app's public/. Team has no sharp, so it is built from
 * here: node scripts/generate-favicons.mjs ../HC.TEAM/public
 *
 * The mark is never redrawn or recolored: each icon is a centered square cut of the
 * official PNG (white ground, blue arch), scaled down. Small icons cut closer so the
 * arch still reads at 16px; large ones keep more of the file's clear space.
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(process.argv[2] ?? resolve(__dirname, '..', 'public'));
const ICON = resolve(PUBLIC, 'brand', 'homesta-icon.png');

/** Share of the 1080px source each size keeps: the arch is about 43% of the file's width. */
const TIGHT = 0.6;
const ROOMY = 0.78;

const PNG_TARGETS = [
  { size: 16, crop: TIGHT, out: 'favicon-16x16.png' },
  { size: 32, crop: TIGHT, out: 'favicon-32x32.png' },
  { size: 48, crop: TIGHT, out: null /* ico only */ },
  { size: 180, crop: ROOMY, out: 'apple-touch-icon.png' },
  { size: 192, crop: ROOMY, out: 'android-chrome-192x192.png' },
  { size: 512, crop: ROOMY, out: 'android-chrome-512x512.png' },
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

async function render(size, crop) {
  const { width, height } = await sharp(ICON).metadata();
  const side = Math.round(Math.min(width, height) * crop);
  return sharp(ICON)
    .extract({ left: Math.round((width - side) / 2), top: Math.round((height - side) / 2), width: side, height: side })
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

async function main() {
  const pngs = {};
  for (const { size, crop, out } of PNG_TARGETS) {
    pngs[size] = await render(size, crop);
    if (out) {
      writeFileSync(resolve(PUBLIC, out), pngs[size]);
      console.log(`  ✓  ${out}  (${size}×${size})`);
    }
  }
  writeFileSync(resolve(PUBLIC, 'favicon.ico'), buildIco([16, 32, 48].map(size => ({ size, buf: pngs[size] }))));
  console.log('  ✓  favicon.ico  (16 + 32 + 48)');
  console.log(`\nAll icons written to ${PUBLIC}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
