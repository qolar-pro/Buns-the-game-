/**
 * Chunk terrain rendering.
 *
 * Extracted from the draw loop in components/Game.tsx. The original blitted two
 * very large, non-seamless textures as rotated, fractionally-scaled canvas
 * patterns — the rotation and the odd scales existed to disguise the fact that
 * the source images did not tile. The atlas tiles are genuinely seamless now, so
 * they are drawn on a plain world-aligned grid instead: no rotation, no
 * fractional scaling, and neighbouring chunks line up exactly.
 *
 * Each chunk is rasterised once into an offscreen canvas and cached.
 */
import { CHUNK_SIZE } from '../core/config';
import { fbm } from '../world/noise';
import { PROFILES, biomeAt } from '../world/biomes';

export type Tile = CanvasImageSource & { width: number; height: number };

/**
 * Loaded ground tiles, keyed by their atlas id (`terrain/snow`, …).
 *
 * A map rather than named fields: biomes name their tiles in `PROFILES`, and a
 * fixed set of fields would mean editing this file to add a biome.
 */
export type TerrainTiles = Record<string, Tile | null>;

/** Size of one terrain tile in world units. */
export const TILE = 128;

/** Resolution of the dirt blend mask; upscaled smoothly over the chunk. */
const MASK_RES = CHUNK_SIZE / 16;

/** Above this fbm value, ground turns to dirt. */
// Raised from 0.35: at that value most worlds generated as bare dirt with only
// occasional grass, which reads as a wasteland rather than a meadow.
const DIRT_THRESHOLD = 0.55;
const DIRT_RAMP = 0.1;

/** Above this, the chunk is "blighted" and gets a dark overlay. */
const BLIGHT_THRESHOLD = 0.6;

/**
 * Fill `ctx` with `tile`, aligned to world space so chunks abut seamlessly.
 *
 * Each placement is flipped horizontally, vertically or both, chosen by hashing
 * the tile's world position. A 32px tile drawn at 128 world units repeats every
 * 128 units, and at that scale the eye finds the period immediately — the
 * ground reads as wallpaper. Four orientations from one seamless tile break the
 * grid for free: the tile still wraps on every edge, so the joins stay
 * invisible, but no two neighbouring tiles look alike.
 *
 * The hash is of world position, not of draw order, so the same patch of ground
 * looks the same every time it is rasterised.
 */
function fillTiled(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  chunkX: number,
  chunkY: number,
  vary = true,
): void {
  // Offset within the tile grid, so the pattern is continuous across chunks.
  const ox = ((chunkX % TILE) + TILE) % TILE;
  const oy = ((chunkY % TILE) + TILE) % TILE;

  for (let y = -oy; y < CHUNK_SIZE; y += TILE) {
    for (let x = -ox; x < CHUNK_SIZE; x += TILE) {
      if (!vary) {
        ctx.drawImage(tile, x, y, TILE, TILE);
        continue;
      }

      // A cheap integer hash of this tile's world coordinates.
      const wx = Math.round((chunkX + x) / TILE);
      const wy = Math.round((chunkY + y) / TILE);
      let h = (wx * 374761393 + wy * 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h = (h ^ (h >>> 16)) >>> 0;

      const flipX = (h & 1) === 1;
      const flipY = (h & 2) === 2;
      if (!flipX && !flipY) {
        ctx.drawImage(tile, x, y, TILE, TILE);
        continue;
      }

      ctx.save();
      ctx.translate(x + (flipX ? TILE : 0), y + (flipY ? TILE : 0));
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.drawImage(tile, 0, 0, TILE, TILE);
      ctx.restore();
    }
  }
}

/**
 * Rasterise one chunk's ground. Returns null while tiles are still loading.
 */
export function renderChunkTerrain(cx: number, cy: number, tiles: TerrainTiles): HTMLCanvasElement | null {
  const biome = biomeAt(cx, cy);
  const profile = PROFILES[biome];
  const grass = tiles[profile.ground] ?? tiles['terrain/grass'];
  const grassVariant = tiles[profile.accent] ?? null;
  const dirt = tiles['terrain/dirt'];
  if (!grass || !dirt) return null;

  const canvas = document.createElement('canvas');
  canvas.width = CHUNK_SIZE;
  canvas.height = CHUNK_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  const chunkX = cx * CHUNK_SIZE;
  const chunkY = cy * CHUNK_SIZE;

  // 1. Grass base.
  // Structured surfaces keep their orientation: a mirrored plank is lit from
  // the wrong side, and the whole set shares one light.
  const structured = profile.ground === 'terrain/wood_floor'
    || profile.ground === 'terrain/stone_floor';
  fillTiled(ctx, grass, chunkX, chunkY, !structured);

  // 2. Patches of the grass variant, to break up the repeat without rotation.
  if (grassVariant) {
    const variant = document.createElement('canvas');
    variant.width = CHUNK_SIZE;
    variant.height = CHUNK_SIZE;
    const vctx = variant.getContext('2d');
    if (vctx) {
      vctx.imageSmoothingEnabled = false;
      fillTiled(vctx, grassVariant, chunkX + TILE / 2, chunkY + TILE / 2, !structured);
      vctx.globalCompositeOperation = 'destination-in';
      vctx.drawImage(buildMask(chunkX, chunkY, 0.55, 0.12, 4173), 0, 0, MASK_RES, MASK_RES, 0, 0, CHUNK_SIZE, CHUNK_SIZE);
      ctx.drawImage(variant, 0, 0);
    }
  }

  // 3. Dirt, masked by the same noise field the original used. Only in the
  //    meadows: a dirt patch in snow reads as a hole, and the desert already is
  //    dirt. Both draw their accent tile in step 2 instead.
  if (biome !== 'grassland') return canvas;

  const dirtLayer = document.createElement('canvas');
  dirtLayer.width = CHUNK_SIZE;
  dirtLayer.height = CHUNK_SIZE;
  const dctx = dirtLayer.getContext('2d');
  if (dctx) {
    dctx.imageSmoothingEnabled = false;
    fillTiled(dctx, dirt, chunkX, chunkY);
    dctx.globalCompositeOperation = 'destination-in';
    dctx.imageSmoothingEnabled = true;
    dctx.drawImage(buildMask(chunkX, chunkY, DIRT_THRESHOLD, DIRT_RAMP, 0, 1, true), 0, 0, MASK_RES, MASK_RES, 0, 0, CHUNK_SIZE, CHUNK_SIZE);
    ctx.drawImage(dirtLayer, 0, 0);
  }

  // 4. Blight. The original decided this per chunk and tinted the whole square,
  //    which drew a hard straight edge across the world wherever the flag
  //    flipped between neighbouring chunks. It is sampled per pixel from the
  //    same noise field now, so blighted ground fades in and out.
  const blight = document.createElement('canvas');
  blight.width = CHUNK_SIZE;
  blight.height = CHUNK_SIZE;
  const bctx = blight.getContext('2d');
  if (bctx) {
    bctx.fillStyle = 'rgb(20, 10, 30)';
    bctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
    bctx.globalCompositeOperation = 'destination-in';
    bctx.imageSmoothingEnabled = true;
    bctx.drawImage(
      buildMask(chunkX, chunkY, BLIGHT_THRESHOLD, 0.18, 8821, 0.6, true),
      0, 0, MASK_RES, MASK_RES, 0, 0, CHUNK_SIZE, CHUNK_SIZE,
    );
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(blight, 0, 0);
    ctx.restore();
  }

  return canvas;
}

/**
 * How far from spawn the ground is kept clear of dirt and blight, in world
 * units, and how far the clearing takes to fade out.
 *
 * The dirt field varies over roughly 2,000 units and the opening screen is
 * 1,280 across, so spawn was effectively all-or-nothing: either inside a dirt
 * blob or outside one. Measured over 500 seeds, **32% of new games opened on
 * more dirt than grass and 20% on ground more than 80% bare** — the first
 * thing the player ever sees, in the biome the game calls the Meadows, one run
 * in five a mud flat. Blight is worse when it lands there: a dark overlay on
 * the starting screen reads as damage rather than as somewhere to leave.
 *
 * `worldgen.ts` already keeps resources off the spawn point for the same kind
 * of reason. This is the same idea for the ground under them.
 */
const SPAWN_CLEAR = 760;
const SPAWN_CLEAR_FADE = 900;

/**
 * Soft alpha mask from the world noise field.
 *
 * `clearSpawn` raises the threshold near spawn rather than scaling the alpha
 * down. Scaling alpha would leave half-transparent dirt smeared over the grass;
 * raising the threshold makes the dirt *retreat*, and because the noise
 * contours do the shaping, what retreats is still an organic edge and not a
 * circle.
 */
function buildMask(
  chunkX: number, chunkY: number, threshold: number, ramp: number, salt: number, maxAlpha = 1,
  clearSpawn = false,
): HTMLCanvasElement {
  const mask = document.createElement('canvas');
  mask.width = MASK_RES;
  mask.height = MASK_RES;
  const mctx = mask.getContext('2d')!;
  const image = mctx.createImageData(MASK_RES, MASK_RES);
  const data = image.data;

  for (let y = 0; y < MASK_RES; y++) {
    for (let x = 0; x < MASK_RES; x++) {
      const worldX = chunkX + x * 16 + salt;
      const worldY = chunkY + y * 16 + salt;
      const noise = fbm(worldX * 0.0005, worldY * 0.0005, 4);

      let limit = threshold;
      if (clearSpawn) {
        // Distance from spawn, without the salt: the salt offsets the noise
        // lookup, not the world.
        const d = Math.hypot(chunkX + x * 16, chunkY + y * 16);
        if (d < SPAWN_CLEAR + SPAWN_CLEAR_FADE) {
          // 1 at spawn, 0 once past the fade, smoothstepped so the boundary is
          // not a visible ring.
          const t = Math.max(0, Math.min(1, (d - SPAWN_CLEAR) / SPAWN_CLEAR_FADE));
          const clear = 1 - t * t * (3 - 2 * t);
          limit = threshold + clear; // fbm maxes out below 1, so this clears it
        }
      }

      const alpha = noise > limit
        ? Math.floor(Math.min(1, (noise - limit) / ramp) * maxAlpha * 255)
        : 0;
      const idx = (y * MASK_RES + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = alpha;
    }
  }
  mctx.putImageData(image, 0, 0);
  return mask;
}

/** How much darker each depth reads. Depth 3 is nearly black without a light. */
const DEPTH_DIM = [0, 0.18, 0.3, 0.42];

/**
 * Rasterise one chunk of dungeon floor.
 *
 * Deliberately not the same function as the surface one: underground there is
 * no grass, no dirt blend and no blight, and threading three unused flags
 * through `renderChunkTerrain` would be harder to read than a second pass that
 * does one thing. Falls back to dirt while the stone tile is still loading, so
 * a dungeon is never an empty void.
 */
export function renderDungeonTerrain(
  cx: number,
  cy: number,
  tiles: TerrainTiles,
  depth: number,
): HTMLCanvasElement | null {
  const tile = tiles['terrain/stone_floor'] ?? tiles['terrain/dirt'];
  if (!tile) return null;

  const canvas = document.createElement('canvas');
  canvas.width = CHUNK_SIZE;
  canvas.height = CHUNK_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  fillTiled(ctx, tile, cx * CHUNK_SIZE, cy * CHUNK_SIZE);

  // Rock rather than daylight: the ambient tint is baked into the chunk so the
  // lighting pass only has to handle torches and the lantern.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(120, 118, 132)';
  ctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
  ctx.restore();

  const dim = DEPTH_DIM[Math.min(depth, DEPTH_DIM.length - 1)] ?? 0;
  if (dim > 0) {
    ctx.fillStyle = `rgba(6, 4, 12, ${dim})`;
    ctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
  }

  return canvas;
}
