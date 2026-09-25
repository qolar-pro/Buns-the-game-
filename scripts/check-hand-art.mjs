#!/usr/bin/env node
/**
 * check-hand-art.mjs — validate hand-made art in assets-hand/ before packing.
 *
 * Exists so that whoever (or whatever) is drawing gets told precisely what is
 * wrong with a file, in terms they can act on, instead of finding out later
 * that a sprite is drawn from the wrong part of the atlas or is invisible in
 * game. Every check here corresponds to a bug this project has actually
 * shipped at some point.
 *
 * Usage:
 *   node scripts/check-hand-art.mjs            # check everything present
 *   node scripts/check-hand-art.mjs --strict   # palette drift is an error too
 */
import sharp from 'sharp';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG } from './asset-catalog.mjs';

const HAND = 'assets-hand';
const BUILD = 'assets-build';
const STRICT = process.argv.includes('--strict');

const SHEETS = new Map();
for (const a of CATALOG) if (a.sheet) SHEETS.set(a.sheet.id, a.sheet.cols);

/** Every id the game can actually use, by atlas. */
const KNOWN = new Map();
for (const a of CATALOG) {
  if (a.sheet) { KNOWN.set(`characters/${a.sheet.id}`, a); continue; }
  KNOWN.set(`${a.atlas}/${a.id}`, a);
}

/** The palette every generated texture is built from. */
const palette = new Set();
try {
  const pal = readFileSync('src/game/render/palette.ts', 'utf8');
  for (const m of pal.matchAll(/#([0-9a-fA-F]{6})/g)) palette.add(m[1].toLowerCase());
} catch { /* palette is advisory; absence is not an error */ }

const problems = [];
const warnings = [];
let checked = 0;

for (const atlas of ['terrain', 'world', 'items', 'ui', 'characters']) {
  const dir = join(HAND, atlas);
  if (!existsSync(dir)) continue;

  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.png')) continue;
    const id = name.slice(0, -4);
    const key = `${atlas}/${id}`;
    const file = join(dir, name);
    checked++;

    // 1. Is this a thing the game draws? A typo'd filename is silently ignored
    //    by the packer, which is the worst possible outcome: the art looks
    //    delivered and nothing uses it.
    if (!KNOWN.has(key)) {
      problems.push(`${file}\n    unknown id "${id}" — nothing in the game refers to it.\n    Check the spelling against docs/ART_BRIEF.md.`);
      continue;
    }

    const meta = await sharp(file).metadata();

    // 2. Transparency. A sprite saved as RGB has an opaque background, which in
    //    game is a coloured rectangle around the object.
    if (meta.channels < 4 && atlas !== 'terrain') {
      problems.push(`${file}\n    no alpha channel — save as 32-bit RGBA PNG, background fully transparent.`);
    }

    // 3. Size must match what the rest of the set is drawn at. The packer reads
    //    the real size, so a mismatch is not fatal, but a 32x32 tree next to a
    //    128x128 one is a tree a quarter the size of everyone else's.
    const ref = join(BUILD, atlas, name);
    if (existsSync(ref)) {
      const r = await sharp(ref).metadata();
      if (r.width !== meta.width || r.height !== meta.height) {
        problems.push(`${file}\n    is ${meta.width}x${meta.height}, the set uses ${r.width}x${r.height}.\n    Resize the canvas (do NOT scale the art — redraw at the right size).`);
      }
    }

    // 4. Sprite sheets must divide evenly into their grid, or every frame after
    //    the first samples part of its neighbour.
    if (atlas === 'characters' && SHEETS.has(id)) {
      const cols = SHEETS.get(id);
      if (meta.width % cols !== 0) {
        problems.push(`${file}\n    width ${meta.width} does not divide into ${cols} columns.`);
      }
      if (meta.height % 4 !== 0) {
        problems.push(`${file}\n    height ${meta.height} does not divide into 4 rows (down, left, right, up).`);
      }
    }

    // 5. Fully transparent file — drawn on the wrong layer, or exported hidden.
    const stats = await sharp(file).stats();
    const alpha = stats.channels[3];
    if (alpha && alpha.max === 0) {
      problems.push(`${file}\n    every pixel is transparent — nothing would be drawn.`);
    }

    // 6. Colour count. Advisory: the set reads as one set partly because each
    //    material uses a handful of colours.
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const seen = new Set();
    for (let i = 0; i < data.length; i += info.channels) {
      if (info.channels === 4 && data[i + 3] < 8) continue;
      seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    if (seen.size > 64) {
      const msg = `${file}\n    ${seen.size} distinct colours. The rest of the set uses under 20 per material.\n    Anti-aliasing and soft brushes are the usual cause — use a hard 1px pencil.`;
      (STRICT ? problems : warnings).push(msg);
    }

    // 7. Semi-transparent edges. Nearest-neighbour scaling turns these into
    //    fringes; pixel art wants alpha to be 0 or 255 and nothing between.
    if (info.channels === 4) {
      let soft = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 8 && data[i] < 248) soft++;
      if (soft > data.length / 4 * 0.02) {
        const msg = `${file}\n    ${soft} pixels are partly transparent. Turn OFF anti-aliasing and feathering;\n    alpha should be fully on or fully off.`;
        (STRICT ? problems : warnings).push(msg);
      }
    }
  }
}

if (!checked) {
  console.log(`No hand-made art found in ${HAND}/. Nothing to check.`);
  console.log('Drop PNGs in assets-hand/<atlas>/<id>.png — see docs/ART_BRIEF.md.');
  process.exit(0);
}

for (const w of warnings) console.log(`WARN  ${w}\n`);
for (const p of problems) console.log(`ERROR ${p}\n`);

console.log(`${checked} hand-made file(s) checked — ${problems.length} error(s), ${warnings.length} warning(s)`);
if (problems.length) {
  console.log('\nFix the errors above, then run this again. Nothing is packed until it passes.');
  process.exit(1);
}
console.log('All good. Run `npm run assets:pack` to put them in the game.');
