#!/usr/bin/env node
/**
 * contact-sheet.mjs — tile a directory of generated PNGs into one sheet for review.
 *
 * Reviewing 101 assets one file at a time hides exactly the problem this pass is
 * meant to catch: inconsistency between assets. A contact sheet shows them side
 * by side, where a wrong view angle or a mismatched light direction is obvious.
 *
 * Usage: node scripts/contact-sheet.mjs <dir> [out.png] [cellSize] [cols]
 */
import sharp from 'sharp';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const dir = process.argv[2];
const out = process.argv[3] || `docs/contact/${basename(dir)}.png`;
const CELL = Number(process.argv[4] || 192);
const COLS = Number(process.argv[5] || 8);
const LABEL = 18;

if (!dir) {
  console.error('usage: contact-sheet.mjs <dir> [out.png] [cellSize] [cols]');
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const rows = Math.ceil(files.length / COLS);
const W = COLS * CELL;
const H = rows * (CELL + LABEL);

const composites = [];
for (let i = 0; i < files.length; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = col * CELL;
  const y = row * (CELL + LABEL);

  const buf = await sharp(join(dir, files[i]))
    .resize(CELL - 8, CELL - 8, { fit: 'contain', background: { r: 20, g: 20, b: 24, alpha: 1 } })
    .toBuffer();
  composites.push({ input: buf, left: x + 4, top: y + 4 });

  const name = basename(files[i], '.png');
  const svg = `<svg width="${CELL}" height="${LABEL}">
    <rect width="100%" height="100%" fill="#111"/>
    <text x="${CELL / 2}" y="${LABEL - 5}" font-family="monospace" font-size="12"
          fill="#9ad" text-anchor="middle">${name.replace(/&/g, '&amp;').slice(0, 24)}</text>
  </svg>`;
  composites.push({ input: Buffer.from(svg), left: x, top: y + CELL });
}

mkdirSync(dirname(out), { recursive: true });
await sharp({ create: { width: W, height: H, channels: 3, background: { r: 17, g: 17, b: 20 } } })
  .composite(composites)
  .png()
  .toFile(out);

console.log(`${out}  (${files.length} assets, ${COLS}x${rows})`);
