/**
 * Generates all favicon PNG sizes + favicon.ico from public/favicon.svg.
 * Run once: node scripts/generate-favicons.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC   = resolve(__dirname, '..', 'public');
const SVG_PATH = resolve(PUBLIC, 'favicon.svg');

const svgBuf = readFileSync(SVG_PATH);

// Size → output filename
const PNG_TARGETS = [
  { size: 16,  out: 'favicon-16x16.png'          },
  { size: 32,  out: 'favicon-32x32.png'           },
  { size: 48,  out: null /* ico only */           },
  { size: 180, out: 'apple-touch-icon.png'        },
  { size: 192, out: 'android-chrome-192x192.png'  },
  { size: 512, out: 'android-chrome-512x512.png'  },
];

// Minimal ICO encoder — embeds PNG chunks directly (supported by all modern OS).
function buildIco(entries) {
  // entries: [{ size, buf }]
  const count  = entries.length;
  const hdrSz  = 6;
  const entrySz = 16;

  let dataOffset = hdrSz + entrySz * count;
  const meta = entries.map(e => {
    const off = dataOffset;
    dataOffset += e.buf.length;
    return { ...e, off };
  });

  const ico = Buffer.alloc(dataOffset);

  // ICONDIR
  ico.writeUInt16LE(0, 0); // reserved
  ico.writeUInt16LE(1, 2); // type: ICO
  ico.writeUInt16LE(count, 4);

  // ICONDIRENTRY per image
  let pos = 6;
  for (const m of meta) {
    ico.writeUInt8(m.size >= 256 ? 0 : m.size, pos);
    ico.writeUInt8(m.size >= 256 ? 0 : m.size, pos + 1);
    ico.writeUInt8(0, pos + 2);       // color count (0 = true color)
    ico.writeUInt8(0, pos + 3);       // reserved
    ico.writeUInt16LE(1, pos + 4);    // color planes
    ico.writeUInt16LE(32, pos + 6);   // bits per pixel
    ico.writeUInt32LE(m.buf.length, pos + 8);
    ico.writeUInt32LE(m.off, pos + 12);
    pos += 16;
  }

  // Image data
  for (const m of meta) m.buf.copy(ico, m.off);

  return ico;
}

async function main() {
  const pngs = {};

  for (const { size } of PNG_TARGETS) {
    if (pngs[size]) continue;
    pngs[size] = await sharp(svgBuf)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  // Write named PNGs
  for (const { size, out } of PNG_TARGETS) {
    if (!out) continue;
    const dest = resolve(PUBLIC, out);
    writeFileSync(dest, pngs[size]);
    console.log(`  ✓  ${out}  (${size}×${size})`);
  }

  // Write favicon.ico  (16, 32, 48)
  const icoEntries = [16, 32, 48].map(size => ({ size, buf: pngs[size] }));
  const icoBuf = buildIco(icoEntries);
  writeFileSync(resolve(PUBLIC, 'favicon.ico'), icoBuf);
  console.log('  ✓  favicon.ico  (16 + 32 + 48)');

  console.log('\nAll favicon files written to public/');
}

main().catch(err => { console.error(err); process.exit(1); });
