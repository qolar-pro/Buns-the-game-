#!/usr/bin/env node
/**
 * process-asset.mjs — turn raw generations into shippable sprites.
 *
 * Deterministic, in this order:
 *   background removal -> alpha trim -> resize to canonical size
 *   -> outline pass -> contact shadow -> PNG optimise
 * Terrain instead goes: resize -> seamless wrap-blend, with no trim, outline or
 * shadow, since a tile has no silhouette.
 *
 * Reads sizes from scripts/asset-catalog.mjs so the canonical size is authored
 * in one place and never derived from whatever pixels came back.
 *
 * Usage:
 *   node scripts/process-asset.mjs                # everything in assets-src
 *   node scripts/process-asset.mjs --only items
 *   node scripts/process-asset.mjs --id tree
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG } from './asset-catalog.mjs';
import {
  addContactShadow, addOutline, alphaBounds, loadRGBA,
  makeSeamless, removeChromaBackground, toSharp,
} from './lib/image.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const ONLY = flag('only', null);
const ID = flag('id', null);
const OUT_ROOT = 'assets-build';

/** Ink colour for outlines; falls back before the palette exists. */
let INK = [32, 24, 34];
if (existsSync('docs/palette.json')) {
  const pal = JSON.parse(readFileSync('docs/palette.json', 'utf8'));
  let darkest = pal[0];
  let bv = Infinity;
  for (const h of pal) {
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    const v = Math.max(r, g, b);
    if (v < bv) { bv = v; darkest = h; }
  }
  INK = [
    parseInt(darkest.slice(1, 3), 16),
    parseInt(darkest.slice(3, 5), 16),
    parseInt(darkest.slice(5, 7), 16),
  ];
}

let work = CATALOG;
if (ONLY) work = work.filter((a) => a.atlas === ONLY || a.cat === ONLY);
if (ID) work = work.filter((a) => a.id === ID);

let ok = 0;
const skipped = [];

for (const a of work) {
  const src = join('assets-src', a.atlas, `${a.id}.png`);
  if (!existsSync(src)) { skipped.push(`${a.atlas}/${a.id} (no source)`); continue; }

  const outDir = join(OUT_ROOT, a.atlas);
  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, `${a.id}.png`);

  if (a.cat === 'terrain') {
    // Square the texture, scale to the tile size, then wrap-blend so it tiles.
    const sized = await sharp(src)
      .resize(a.w, a.h, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const seamless = makeSeamless({ data: sized.data, width: a.w, height: a.h });
    await toSharp(seamless).png({ compressionLevel: 9, palette: true }).toFile(dest);
    ok += 1;
    console.log(`tile  ${a.atlas}/${a.id}  ${a.w}x${a.h}`);
    continue;
  }

  // 1. Background (and the baked shadow that shares its hue) removed.
  const raw = await loadRGBA(src);
  const cut = removeChromaBackground(raw);

  // 2. Trim to content.
  const box = alphaBounds(cut);
  if (!box) { skipped.push(`${a.atlas}/${a.id} (nothing left after keying)`); continue; }
  const trimmed = await toSharp(cut).extract(box).png().toBuffer();

  // 3. Fit into the canonical box, leaving room for outline and shadow.
  const isIcon = a.cat === 'item' || a.cat === 'ui';
  const pad = isIcon ? 0.86 : 0.94;
  const inner = await sharp(trimmed)
    .resize(Math.round(a.w * pad), Math.round(a.h * pad), {
      fit: 'inside', kernel: 'lanczos3', withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const meta = await sharp(inner).metadata();

  // Props sit on their base; icons are centred.
  const left = Math.round((a.w - meta.width) / 2);
  const top = isIcon
    ? Math.round((a.h - meta.height) / 2)
    : Math.max(0, a.h - meta.height - Math.round(a.h * 0.03));

  let buf = await sharp({
    create: { width: a.w, height: a.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: inner, left, top }]).png().toBuffer();

  // 4. Outline, so every object separates from the ground.
  const outlineR = a.w <= 64 ? 1 : 2;
  buf = await addOutline(buf, outlineR, INK);

  // 5. One uniform contact shadow (skipped for icons and effects, which float).
  if (a.cat === 'prop' || a.cat === 'detail') {
    buf = await addContactShadow(buf, a.w, a.h);
  }

  await sharp(buf).png({ compressionLevel: 9, palette: true }).toFile(dest);
  ok += 1;
  console.log(`sprite ${a.atlas}/${a.id}  ${a.w}x${a.h}  (trim ${box.width}x${box.height})`);
}

console.log(`\nprocessed ${ok}, skipped ${skipped.length}`);
for (const s of skipped) console.log('  skip ' + s);
