#!/usr/bin/env node
/**
 * build-sheets.mjs — compose character sprite sheets from directional sprites.
 *
 * Diffusion cannot hold one character consistent across the cells of a grid, so
 * the walk frames are composed here instead: one generated sprite per facing
 * direction, and the frames within a row are deterministic transforms of it —
 * a vertical bob, a slight lean, and a squash on contact. Every frame is
 * therefore unmistakably the same character, which a generated grid never was.
 *
 * Layout matches the engine's existing convention:
 *   player  8 columns x 4 rows   (down, left, right, up)
 *   animals 3 columns x 4 rows
 *
 * Usage: node scripts/build-sheets.mjs
 */
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG } from './asset-catalog.mjs';

const OUT = 'assets-build/characters';
const SRC = 'assets-build/characters';
const DIR_ORDER = ['down', 'left', 'right', 'up'];

/** Group catalogue entries back into their sheets. */
const sheets = new Map();
for (const a of CATALOG) {
  if (!a.sheet) continue;
  if (!sheets.has(a.sheet.id)) sheets.set(a.sheet.id, { id: a.sheet.id, cols: a.sheet.cols, cell: { w: a.w, h: a.h }, dirs: {} });
  sheets.get(a.sheet.id).dirs[a.sheet.dir] = a.id;
}

/**
 * Walk-cycle offsets for frame `i` of `cols`.
 * A two-beat gait: the body rises and falls twice per cycle and leans into each
 * step, which reads as walking at these sizes without needing per-limb art.
 */
function gait(i, cols) {
  const phase = (i / cols) * Math.PI * 2;
  return {
    bob: -Math.round(Math.abs(Math.sin(phase)) * 2),     // up on mid-step
    lean: Math.sin(phase) * 2.2,                          // degrees
    squash: 1 + Math.cos(phase * 2) * 0.03,               // contact compression
  };
}

mkdirSync(OUT, { recursive: true });

for (const sheet of sheets.values()) {
  const { cols, cell } = sheet;
  const rows = DIR_ORDER.length;
  const W = cols * cell.w;
  const H = rows * cell.h;
  const composites = [];
  let missing = 0;

  for (let r = 0; r < rows; r++) {
    const dir = DIR_ORDER[r];
    const srcFile = join(SRC, `${sheet.dirs[dir]}.png`);
    if (!existsSync(srcFile)) { missing += 1; continue; }

    for (let c = 0; c < cols; c++) {
      const { bob, lean, squash } = gait(c, cols);
      const fw = Math.max(1, Math.round(cell.w * squash));
      const fh = Math.max(1, Math.round(cell.h / squash));

      let frame = await sharp(srcFile)
        .resize(fw, fh, { fit: 'inside', kernel: 'lanczos3' })
        .rotate(lean, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

      // Re-fit into the cell and anchor at the bottom so feet stay on the ground.
      frame = await sharp(frame)
        .resize(cell.w, cell.h, { fit: 'inside', kernel: 'lanczos3' })
        .toBuffer();
      const m = await sharp(frame).metadata();

      composites.push({
        input: frame,
        left: c * cell.w + Math.round((cell.w - m.width) / 2),
        top: r * cell.h + Math.max(0, cell.h - m.height + bob),
      });
    }
  }

  if (missing === rows) { console.log(`skip ${sheet.id} (no directional sprites yet)`); continue; }

  const dest = join(OUT, `${sheet.id}.png`);
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(dest);
  console.log(`sheet ${sheet.id}  ${W}x${H}  (${cols}x${rows} of ${cell.w}x${cell.h})${missing ? `  [${missing} direction(s) missing]` : ''}`);
}
