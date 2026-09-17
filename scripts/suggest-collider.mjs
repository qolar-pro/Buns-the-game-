#!/usr/bin/env node
/**
 * suggest-collider.mjs — propose collider numbers for an asset.
 *
 * This is the one-off dev tool that replaced runtime pixel tracing. It reads the
 * alpha channel and suggests an ellipse at the object's base, which a human
 * checks and pastes into src/game/assets/manifest.ts. Nothing here runs at
 * game time: colliders are authored data, so regenerating art cannot change
 * physics behind your back.
 *
 * Usage:
 *   node scripts/suggest-collider.mjs assets-build/world/tree.png
 *   node scripts/suggest-collider.mjs --all world
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { loadRGBA } from './lib/image.mjs';

/**
 * Footprint of the lowest band of the sprite.
 *
 * A collider should match what the object stands on, not its silhouette: a
 * tree's canopy is far wider than its trunk and must not block movement. So the
 * width is measured across the bottom `BAND` of opaque rows only.
 */
const BAND = 0.16;
const ALPHA = 24;

async function suggest(file) {
  const { data, width, height } = await loadRGBA(file);

  // Lowest opaque row.
  let bottom = -1;
  for (let y = height - 1; y >= 0 && bottom < 0; y--) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA) { bottom = y; break; }
    }
  }
  if (bottom < 0) return { file, error: 'fully transparent' };

  // Horizontal extent within the base band.
  const bandTop = Math.max(0, Math.round(bottom - height * BAND));
  let left = width, right = -1;
  for (let y = bandTop; y <= bottom; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < 0) return { file, error: 'no opaque pixels in the base band' };

  const cx = Math.round((left + right) / 2);
  const footprint = right - left + 1;
  // Perspective: a circular footprint seen from ~60° reads as an ellipse with
  // roughly half the vertical radius.
  const rx = Math.max(4, Math.round(footprint * 0.42));
  const ry = Math.max(3, Math.round(rx * 0.45));
  const cy = Math.max(0, bottom - ry);

  return { file, width, height, cx, cy, rx, ry };
}

const argv = process.argv.slice(2);
let files = [];
if (argv[0] === '--all') {
  const dir = join('assets-build', argv[1] || 'world');
  if (!existsSync(dir)) {
    console.error(`no such directory: ${dir}`);
    process.exit(1);
  }
  files = readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => join(dir, f));
} else {
  files = argv;
}

if (!files.length) {
  console.error('usage: suggest-collider.mjs <file.png> | --all <atlas>');
  process.exit(1);
}

console.log('// Suggested colliders — review, then paste into manifest.ts\n');
for (const f of files) {
  const r = await suggest(f);
  const id = basename(f, '.png');
  if (r.error) {
    console.log(`// ${id}: ${r.error}`);
    continue;
  }
  console.log(
    `'${id}': { worldSize: { w: ${r.width}, h: ${r.height} }, ` +
      `collider: { kind: 'ellipse', cx: ${r.cx}, cy: ${r.cy}, rx: ${r.rx}, ry: ${r.ry} } },`,
  );
}
