#!/usr/bin/env node
/**
 * make-palette-files.mjs — export the game's palette in the formats paint
 * programs can actually load.
 *
 * A palette printed in a document is a palette somebody has to retype. These
 * are files an editor opens: load one and every colour in the game is on the
 * swatch bar, which is the difference between "match these hexes" and "use
 * these swatches" — and the second is the one that produces a cohesive set.
 *
 * Writes:
 *   docs/palette/hearthwood.gpl   GIMP palette — Krita, LibreSprite, Aseprite, GIMP
 *   docs/palette/hearthwood.hex   plain hex, one per line — Piskel, Paint.NET, misc
 *   docs/palette/hearthwood.png   swatch image — editors that import from an image
 *
 * Usage: node scripts/make-palette-files.mjs
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const RAMPS = JSON.parse(readFileSync('tools/hearthwood/ramps.json', 'utf8'));
const OUT = 'docs/palette';
mkdirSync(OUT, { recursive: true });

const OUTLINE = '#1c120b';

/** Ramps in a deliberate order, so the swatch bar reads as a set of materials. */
const ORDER = [
  'oak_wood', 'oak_bark', 'spruce_wood', 'dark_bark', 'dead_plant',
  'grass', 'leaf', 'moss', 'pine', 'cactus',
  'stone', 'pebble', 'dirt', 'path', 'sand', 'sandstone', 'marsh', 'snow', 'bog',
  'iron', 'steel_dark', 'copper', 'gold', 'titanium', 'coal',
  'cloth_red', 'cloth_blue', 'cloth_green', 'cloth_cream', 'leather',
  'skin', 'fur_white', 'fur_brown', 'hide_pink', 'parchment', 'wheat',
  'ember', 'smoke', 'blood', 'frost', 'glow',
];
const names = [...ORDER.filter((n) => RAMPS[n]),
  ...Object.keys(RAMPS).filter((n) => !ORDER.includes(n)).sort()];

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// --- .gpl -------------------------------------------------------------------
let gpl = 'GIMP Palette\nName: Hearthwood — Buns the Game\nColumns: 9\n#\n';
gpl += `${hexToRgb(OUTLINE).map((v) => String(v).padStart(3)).join(' ')}\tOUTLINE\n`;
for (const n of names) {
  for (const [i, hex] of RAMPS[n].entries()) {
    const [r, g, b] = hexToRgb(hex);
    gpl += `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${n} ${i}\n`;
  }
}
writeFileSync(`${OUT}/hearthwood.gpl`, gpl);

// --- .hex -------------------------------------------------------------------
const flat = [OUTLINE, ...names.flatMap((n) => RAMPS[n])];
writeFileSync(`${OUT}/hearthwood.hex`, flat.map((h) => h.slice(1)).join('\n') + '\n');

// --- .png swatch ------------------------------------------------------------
// One row per material, one cell per step, so it doubles as a reference sheet.
const CELL = 16;
const cols = Math.max(...names.map((n) => RAMPS[n].length));
const rows = names.length + 1;
const W = cols * CELL, H = rows * CELL;
const buf = Buffer.alloc(W * H * 4, 0);
const put = (cx, cy, hex) => {
  const [r, g, b] = hexToRgb(hex);
  for (let y = cy * CELL; y < (cy + 1) * CELL; y++) {
    for (let x = cx * CELL; x < (cx + 1) * CELL; x++) {
      const i = (y * W + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
};
for (let c = 0; c < cols; c++) put(c, 0, OUTLINE);
names.forEach((n, ri) => RAMPS[n].forEach((hex, ci) => put(ci, ri + 1, hex)));
await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
  .png({ compressionLevel: 9, palette: false })
  .toFile(`${OUT}/hearthwood.png`);

console.log(`${OUT}/hearthwood.gpl   ${flat.length} colours across ${names.length} materials`);
console.log(`${OUT}/hearthwood.hex`);
console.log(`${OUT}/hearthwood.png   ${W}x${H}`);
