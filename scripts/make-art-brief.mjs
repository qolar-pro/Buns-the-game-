#!/usr/bin/env node
/**
 * make-art-brief.mjs — generate docs/ART_BRIEF.md.
 *
 * The brief is GENERATED, not written, for the same reason frames.ts is: a
 * hand-maintained spec drifts from the code the moment either changes, and a
 * spec that lies about a sprite's size is worse than no spec, because someone
 * will draw to it.
 *
 * Sizes come from the files the generator actually produced. Descriptions come
 * from the catalogue. Ramps come from the palette module.
 *
 * Usage: node scripts/make-art-brief.mjs
 */
import sharp from 'sharp';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG } from './asset-catalog.mjs';

const BUILD = 'assets-build';
const RAMPS = JSON.parse(readFileSync('tools/hearthwood/ramps.json', 'utf8'));

/**
 * Strip the old pipeline's prompt boilerplate.
 *
 * The catalogue's descriptions were written as image-generation prompts, one
 * per facing, so most of them end in a paragraph of framing instructions
 * ("seen from the front, facing towards the viewer, single character,
 * centred"). That was addressed to a diffusion model; to someone drawing a
 * four-row sprite sheet it is just wrong, since three of the four rows are not
 * seen from the front. What is left is the subject, which is what a brief wants.
 */
const BOILERPLATE = [
  /,?\s*seen from[^,]*/gi,
  /,?\s*facing (towards|away)[^,]*/gi,
  /,?\s*full body visible/gi,
  /,?\s*standing upright/gi,
  /,?\s*single character/gi,
  /,?\s*centred/gi,
  /,?\s*viewed from directly above/gi,
  /,?\s*no (rows|grid|tiles|paths)/gi,
];
const clean = (p) => {
  let out = (p || '').replace(/\s+/g, ' ').trim();
  for (const re of BOILERPLATE) out = out.replace(re, '');
  out = out.replace(/\s*,\s*,/g, ',').replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim();
  return out ? out[0].toUpperCase() + out.slice(1) : '';
};

const sheetCols = new Map();
for (const a of CATALOG) if (a.sheet) sheetCols.set(a.sheet.id, a.sheet.cols);

/** One row per thing that can be drawn, with its REAL size. */
const rows = [];
const seen = new Set();
for (const a of CATALOG) {
  const id = a.sheet ? a.sheet.id : a.id;
  const atlas = a.sheet ? 'characters' : a.atlas;
  const key = `${atlas}/${id}`;
  if (seen.has(key)) continue;
  const file = join(BUILD, atlas, `${id}.png`);
  if (!existsSync(file)) continue;
  seen.add(key);
  const { width, height } = await sharp(file).metadata();
  rows.push({
    atlas, id, w: width, h: height,
    cols: sheetCols.get(id) ?? null,
    desc: clean(a.prompt),
  });
}

const byAtlas = {};
for (const r of rows) (byAtlas[r.atlas] ??= []).push(r);
for (const k of Object.keys(byAtlas)) byAtlas[k].sort((a, b) => a.id.localeCompare(b.id));

const ramp = (n) => (RAMPS[n] || []).map((h) => `\`${h}\``).join(' ');

const ATLAS_NOTE = {
  terrain: 'Ground textures. **Must tile seamlessly in both axes** — the left column continues into the right, the top row into the bottom. No outline, no directional features (the engine rotates these by world position, so a plank pattern would mirror against its neighbours). Fully opaque, no transparency.',
  world: 'Things standing in the world: trees, rocks, buildings, furniture. Transparent background. Drawn standing on the BOTTOM edge of the canvas — the bottom row is where the object meets the ground, and the engine plants it there.',
  items: 'Inventory icons. Transparent background, object centred with a couple of pixels of margin. These are shown small (about 28px) in the hotbar, so silhouette matters far more than detail.',
  ui: 'HUD icons — hearts, hunger, cursor. Transparent background. Very small; keep them to a few bold shapes.',
  characters: 'Sprite sheets. See the layout section below — these are the fiddliest and worth reading about before starting.',
};

let md = `# Art brief — Buns the Game

**This file is generated** by \`scripts/make-art-brief.mjs\`. Do not edit it by
hand; it is regenerated from the catalogue and from the art that actually
exists, so the sizes in it are always the real ones.

It is written to be handed to someone — or something — that is going to draw
these, and it assumes no knowledge of the codebase.

---

## The job

Replace any or all of the game's ${rows.length} sprites with hand-drawn pixel art.

**You do not have to do all of them.** Every file is optional and independent.
Draw one sprite, drop it in, and it appears in the game; everything you do not
draw keeps its generated version. A half-finished set is a working game.

## Where the files go

\`\`\`
assets-hand/<atlas>/<id>.png
\`\`\`

So the tree is \`assets-hand/world/tree.png\`, the bread icon is
\`assets-hand/items/bread.png\`, the player sheet is
\`assets-hand/characters/player.png\`.

**The filename is the contract.** It has to match the id in the tables below
exactly — lowercase, underscores, no spaces. A misspelled filename is silently
ignored, which is the worst outcome: the art looks delivered and nothing uses
it. The checker below catches this.

## Check your work before handing it over

\`\`\`bash
node scripts/check-hand-art.mjs
\`\`\`

It validates every file in \`assets-hand/\` and prints exactly what is wrong with
each one — wrong size, missing transparency, unknown id, anti-aliased edges.
It exits non-zero if anything is broken. **Run it and fix everything it reports
before saying you are done.**

Then \`npm run assets:pack\` puts them in the game.

---

## Hard rules

These are not style preferences. Breaking them produces visible defects.

1. **Exact canvas size.** Every sprite has one, listed in the tables below. If
   your art is a different size, change the *canvas* size and redraw — do not
   scale the image, which blurs every pixel.

2. **32-bit RGBA PNG.** Background fully transparent (alpha 0), object fully
   opaque (alpha 255). Terrain is the exception: fully opaque, no transparency.

3. **No anti-aliasing. No soft brushes. No feathering. No gradients tools.**
   Use a hard 1-pixel pencil. Every pixel is either fully on or fully off.
   Partly-transparent pixels become visible fringes when the game scales
   sprites, and soft edges are the single most common way pixel art is ruined.

4. **One light source, from the upper left.** Every sprite in the game is lit
   this way. Top and left surfaces are lighter, bottom and right darker. This is
   what makes a set of sprites look like one set.

5. **A dark outline**, \`#1c120b\`, around the outside of every object — except
   terrain tiles, and except things thinner than about three pixels (a grass
   blade outlined is a blade made of outline; give those a dark side and a light
   side instead).

6. **Few colours.** Aim for 5–9 shades per material, plus the outline. Not a
   rule you must count, but if a sprite has 200 colours in it, something soft
   got used. The checker warns above 64.

7. **World objects stand on the bottom edge** of their canvas. The engine
   plants the sprite's bottom row on the ground.

---

## Palette

Every material in the game is drawn from one of these ramps, dark to light.
You do not have to use these exact values, but a sprite drawn from them will
sit with the rest of the set automatically, and one drawn from the default
Windows colour picker will not.

`;

const SHOW = ['oak_wood', 'oak_bark', 'spruce_wood', 'dark_bark', 'stone', 'dirt',
  'path', 'pebble', 'moss', 'grass', 'leaf', 'iron', 'steel_dark', 'copper',
  'gold', 'cloth_red', 'cloth_blue', 'skin', 'parchment', 'ember', 'snow',
  'sand', 'marsh', 'cactus'];
md += '| Material | Ramp, darkest to lightest |\n|---|---|\n';
for (const n of SHOW) if (RAMPS[n]) md += `| \`${n}\` | ${ramp(n)} |\n`;
md += `\nOutline colour, used by everything: \`#1c120b\`. Never pure black, never\npure white — the palette floor is \`#1c120b\` and the ceiling \`#fff7e6\`.\n\n`;
md += `All ${Object.keys(RAMPS).length} ramps are in \`tools/hearthwood/palettes.py\` if you want the rest.\n\n---\n\n`;

md += `## Setting up the editor

The palette is exported as files so nothing has to be retyped:

| File | Load it in |
|---|---|
| \`docs/palette/hearthwood.gpl\` | Krita, LibreSprite, Aseprite, GIMP |
| \`docs/palette/hearthwood.hex\` | Piskel, Paint.NET, JASC-compatible tools |
| \`docs/palette/hearthwood.png\` | anything that imports a palette from an image |

Every row of the swatch image is one material, dark to light. The top row is the
outline colour.

### LibreSprite / Aseprite

1. **New file** at the exact canvas size from the tables below. Colour mode RGBA.
2. **Palette → Load Palette** → \`hearthwood.gpl\`.
3. Use the **pencil** (B), size **1**. Aseprite's pencil has no anti-aliasing,
   which is the point of using it.
4. Avoid the blur, smudge and gradient tools entirely. The paint bucket is fine
   — set **Tolerance 0** and turn **anti-aliasing off** in its tool bar.
5. Export: **File → Export**, PNG, **Resize 100%**. Do not "export scaled"; the
   game does its own scaling and wants the original pixels.

### Krita

1. **New file** at the exact size, **RGBA / 8-bit**, background **transparent**.
2. **Settings → Dockers → Palettes**, then import \`hearthwood.gpl\`.
3. Pick the **Pixel Art** brush preset, or any brush with **size 1**,
   **Hardness 100%**, **Opacity 100%**, **Flow 100%** and anti-aliasing off.
   Krita's default brushes are all soft — this step is not optional.
4. **View → Pixel Grid** on, and work zoomed in.
5. Export: **File → Export**, PNG, **alpha on**, no scaling.

### Piskel (browser or desktop)

1. **New sprite** at the exact size.
2. Palette panel → **Import** → \`hearthwood.hex\`.
3. The pencil is 1px and hard by default. Leave it alone.
4. Export → **PNG**, scale **1x**.

### Making GUI work reliable

Clicking individual pixels through a screenshot loop is the slowest and most
error-prone way to do this, so lean on the things that are not per-pixel:

- **Block out the silhouette first** with the rectangle and ellipse tools, in
  one mid-tone. Get the shape right before any shading. The silhouette is most
  of whether a sprite reads.
- **Then the outline**, then **two or three shade bands**, then details. Working
  light-to-dark in passes is far fewer actions than drawing finished pixels.
- **Use selections and fills** rather than painting areas by hand.
- **Mirror rather than redraw** for the left/right character rows — but flip the
  *shape* only and then repaint the light, which always comes from the upper
  left.
- **Zoom in.** At 8x or 16x a misplaced click is visible; at 100% it is not.
- **Save often**, and run \`node scripts/check-hand-art.mjs\` as you go rather
  than at the end. It catches wrong canvas sizes and soft edges immediately,
  and those are the two mistakes that require redrawing rather than patching.

---

`;

// Character sheets need their own explanation.
md += `## Sprite sheets (characters)

A character sheet is one image containing every frame of that character's
animation, in a grid.

- **4 rows**, always, in this order, top to bottom:
  1. facing **down** (toward the viewer)
  2. facing **left**
  3. facing **right**
  4. facing **up** (away from the viewer)
- **N columns**, one per walk frame, listed per character below. The character
  should look like it is walking as the frames advance, returning to the start.
- Every cell is the same size. Cell size = image width ÷ columns, image height ÷ 4.
- The character stands on the **bottom** of its cell and is **centred**
  horizontally in it.
- Keep the character the same size in every cell. A character that changes size
  between frames appears to pulse.

The left and right rows are the same character mirrored — but **only the shape
is mirrored, not the shading**. The sun does not move when a character turns
around, so both rows are lit from the upper left. If you flip the left row to
make the right row, flip the shape and then repaint the light.

---

`;

for (const atlas of ['characters', 'world', 'items', 'terrain', 'ui']) {
  const list = byAtlas[atlas] || [];
  if (!list.length) continue;
  md += `## \`${atlas}\` — ${list.length} sprites\n\n${ATLAS_NOTE[atlas]}\n\n`;
  md += atlas === 'characters'
    ? '| id | file | canvas | grid | cell | what it is |\n|---|---|---|---|---|---|\n'
    : '| id | file | canvas | what it is |\n|---|---|---|---|\n';
  for (const r of list) {
    const path = `assets-hand/${atlas}/${r.id}.png`;
    const desc = r.desc || '—';
    md += r.cols
      ? `| \`${r.id}\` | \`${path}\` | ${r.w}x${r.h} | ${r.cols}x4 | ${r.w / r.cols}x${r.h / 4} | ${desc} |\n`
      : `| \`${r.id}\` | \`${path}\` | ${r.w}x${r.h} | ${desc} |\n`;
  }
  md += '\n';
}

md += `---

## If you want to see the current art

\`docs/contact/hearthwood.png\` is every sprite in the game on one sheet, shown
at 8x. \`docs/screens/hearthwood-world.png\` shows them in the game. The existing
art is the thing being replaced, so treat it as a size and subject reference
rather than as a style to match.

The generated originals are in \`assets-build/<atlas>/<id>.png\` if you want to
open one and draw over it at the right size.
`;

mkdirSync('docs', { recursive: true });
writeFileSync('docs/ART_BRIEF.md', md);
console.log(`docs/ART_BRIEF.md — ${rows.length} sprites, ${md.split('\n').length} lines`);
