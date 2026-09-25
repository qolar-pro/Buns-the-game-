#!/usr/bin/env node
/**
 * pack-atlases.mjs — pack processed sprites into atlases and emit the manifest.
 *
 * Shelf packing sorted by descending height: simple, deterministic, and close
 * enough to optimal for a few hundred fixed-size sprites. Determinism matters
 * more than density here — a stable layout means a regenerated atlas produces a
 * readable manifest diff instead of a reshuffle.
 *
 * Outputs:
 *   public/sprites/<atlas>.png
 *   src/game/assets/frames.ts   (generated frame rectangles)
 *
 * Usage: node scripts/pack-atlases.mjs
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG } from './asset-catalog.mjs';

const BUILD = 'assets-build';
/**
 * Hand-made art, which beats anything the generator made.
 *
 * Drop `assets-hand/<atlas>/<id>.png` in and it is packed instead of
 * `assets-build/<atlas>/<id>.png`. Nothing else has to change: the id is the
 * manifest key, the packer reads the real pixel size off the file, and the
 * generator can keep producing the rest. That means the set can be replaced one
 * sprite at a time rather than all at once, and a half-finished hand-drawn set
 * still gives a game that runs.
 *
 * `assets-hand/` is committed. It is the only art in the repo a human made, so
 * losing it would mean losing the one thing that cannot be regenerated.
 */
const HAND = 'assets-hand';
const OUT_DIR = 'public/sprites';

/** Hand-made file if there is one, else the generated one. */
const pick = (atlas, id) => {
  const hand = join(HAND, atlas, `${id}.png`);
  return existsSync(hand) ? { file: hand, hand: true } : { file: join(BUILD, atlas, `${id}.png`), hand: false };
};
const PAD = 2; // transparent gutter, so bilinear sampling never bleeds neighbours
const MAX_W = 2048;

/** Sprite sheets replace their per-direction sources in the atlas. */
const SHEET_IDS = new Set(CATALOG.filter((a) => a.sheet).map((a) => a.sheet.id));
const SHEET_META = new Map();
for (const a of CATALOG) {
  if (a.sheet && !SHEET_META.has(a.sheet.id)) {
    SHEET_META.set(a.sheet.id, { cols: a.sheet.cols, rows: 4, cellW: a.w, cellH: a.h });
  }
}

/** Build the list of images that actually go into each atlas. */
const byAtlas = new Map();
const add = (atlas, entry) => {
  if (!byAtlas.has(atlas)) byAtlas.set(atlas, []);
  byAtlas.get(atlas).push(entry);
};

/**
 * Pixel size comes from the FILE, not from the catalogue.
 *
 * The catalogue used to be the authority, because generation needed to be told
 * what to ask for. The generator is deterministic now and writes exactly the
 * size it means, so trusting the catalogue only creates a second number that
 * can disagree with the art — and a frame rectangle that disagrees with its
 * image is a sprite drawn from the wrong part of the atlas.
 */
const sizeOf = async (file) => {
  const meta = await sharp(file).metadata();
  return { w: meta.width, h: meta.height };
};

let handCount = 0;
for (const a of CATALOG) {
  if (a.sheet) continue; // handled below, as one packed sheet
  const { file, hand } = pick(a.atlas, a.id);
  if (!existsSync(file)) continue;
  if (hand) handCount++;
  const { w, h } = await sizeOf(file);
  add(a.atlas, { id: a.id, file, w, h, cat: a.cat });
}
for (const id of SHEET_IDS) {
  const { file, hand } = pick('characters', id);
  if (!existsSync(file)) continue;
  if (hand) handCount++;
  const m = SHEET_META.get(id);
  const { w, h } = await sizeOf(file);
  // Rows are the four facings; the cell size falls out of the sheet.
  const rows = m.rows;
  add('characters', {
    id, file, w, h, cat: 'sheet',
    grid: { cols: m.cols, rows, cellW: Math.round(w / m.cols), cellH: Math.round(h / rows) },
  });
}

mkdirSync(OUT_DIR, { recursive: true });
const manifest = {};
let totalBytes = 0;

for (const [atlas, entries] of byAtlas) {
  // Deterministic order: tallest first, then by id.
  entries.sort((a, b) => b.h - a.h || a.id.localeCompare(b.id));

  // Shelf pack.
  let x = PAD, y = PAD, shelfH = 0, width = 0;
  for (const e of entries) {
    if (x + e.w + PAD > MAX_W) { x = PAD; y += shelfH + PAD; shelfH = 0; }
    e.x = x; e.y = y;
    x += e.w + PAD;
    shelfH = Math.max(shelfH, e.h);
    width = Math.max(width, x);
  }
  const height = y + shelfH + PAD;

  const composites = entries.map((e) => ({ input: e.file, left: e.x, top: e.y }));
  const dest = join(OUT_DIR, `${atlas}.png`);
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    // `palette: false` is explicit and load-bearing. sharp turns on palette
    // quantisation as soon as any of its palette-only options (`effort`,
    // `colours`, `dither`) is present, and a quantised character atlas shifts
    // 3.5% of its opaque pixels by more than 24/255 — visible banding across
    // every sprite's shading. Measured, not assumed: the same encode with
    // palette off changes 0.00% of pixels.
    .png({ compressionLevel: 9, palette: false })
    .toFile(dest);

  const bytes = statSync(dest).size;
  totalBytes += bytes;
  console.log(`${dest}  ${width}x${height}  ${entries.length} frames  ${(bytes / 1024).toFixed(0)} KB`);

  for (const e of entries) {
    manifest[`${atlas}/${e.id}`] = {
      atlas, id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, cat: e.cat,
      ...(e.grid ? { grid: e.grid } : {}),
    };
  }
}

// --- emit frames.ts ---------------------------------------------------------
const lines = Object.entries(manifest)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, f]) => {
    const grid = f.grid
      ? `, grid: { cols: ${f.grid.cols}, rows: ${f.grid.rows}, cellW: ${f.grid.cellW}, cellH: ${f.grid.cellH} }`
      : '';
    return `  '${key}': { atlas: '${f.atlas}', x: ${f.x}, y: ${f.y}, w: ${f.w}, h: ${f.h}${grid} },`;
  });

mkdirSync('src/game/assets', { recursive: true });
writeFileSync('src/game/assets/frames.ts', `/**
 * Atlas frame rectangles.
 *
 * GENERATED by scripts/pack-atlases.mjs — do not edit by hand. Regenerate with
 * \`npm run assets:pack\`. Authored data (anchors, world sizes, colliders) lives
 * in manifest.ts and is keyed by these same ids.
 */
export interface Frame {
  atlas: string;
  x: number;
  y: number;
  w: number;
  h: number;
  grid?: { cols: number; rows: number; cellW: number; cellH: number };
}

export const FRAMES = {
${lines.join('\n')}
} as const satisfies Record<string, Frame>;

export type FrameId = keyof typeof FRAMES;

export const ATLASES = [${[...byAtlas.keys()].map((a) => `'${a}'`).join(', ')}] as const;
export type AtlasName = (typeof ATLASES)[number];
`);

console.log(`\n${Object.keys(manifest).length} frames across ${byAtlas.size} atlases`);
if (handCount) console.log(`${handCount} of them hand-made (from ${HAND}/)`);
/**
 * Art payload ceiling.
 *
 * Was 2.50 MB, set when the game had 113 assets. It has 248 now — biomes,
 * villages, ranged combat and two endings — so the per-asset cost has roughly
 * halved while the total has grown. Raised rather than met by quantising:
 * palette encoding does get the whole set under 0.9 MB, but it shifts 3.5% of
 * the character atlas's pixels by more than 24/255, which is visible banding on
 * every sprite. Cheaper art is not the same thing as smaller art.
 */
const BUDGET_MB = 3.5;
const totalMb = totalBytes / 1024 / 1024;
console.log(`total: ${totalMb.toFixed(2)} MB  (budget ${BUDGET_MB.toFixed(2)} MB, ${(totalBytes / Object.keys(manifest).length / 1024).toFixed(1)} KB/frame) — ${totalMb <= BUDGET_MB ? 'PASS' : 'FAIL'}`);
