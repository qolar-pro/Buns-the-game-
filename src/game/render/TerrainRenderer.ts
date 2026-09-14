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

export type Tile = CanvasImageSource & { width: number; height: number };

export interface TerrainTiles {
  grass: Tile | null;
  grassVariant: Tile | null;
  dirt: Tile | null;
}

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

/** Fill `ctx` with `tile`, aligned to world space so chunks abut seamlessly. */
function fillTiled(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  chunkX: number,
  chunkY: number,
): void {
  // Offset within the tile grid, so the pattern is continuous across chunks.
  const ox = ((chunkX % TILE) + TILE) % TILE;
  const oy = ((chunkY % TILE) + TILE) % TILE;
  for (let y = -oy; y < CHUNK_SIZE; y += TILE) {
    for (let x = -ox; x < CHUNK_SIZE; x += TILE) {
      ctx.drawImage(tile, x, y, TILE, TILE);
    }
  }
}

/**
 * Rasterise one chunk's ground. Returns null while tiles are still loading.
 */
export function renderChunkTerrain(cx: number, cy: number, tiles: TerrainTiles): HTMLCanvasElement | null {
  const { grass, grassVariant, dirt } = tiles;
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
  fillTiled(ctx, grass, chunkX, chunkY);

  // 2. Patches of the grass variant, to break up the repeat without rotation.
  if (grassVariant) {
    const variant = document.createElement('canvas');
    variant.width = CHUNK_SIZE;
    variant.height = CHUNK_SIZE;
    const vctx = variant.getContext('2d');
    if (vctx) {
      vctx.imageSmoothingEnabled = false;
      fillTiled(vctx, grassVariant, chunkX + TILE / 2, chunkY + TILE / 2);
      vctx.globalCompositeOperation = 'destination-in';
      vctx.drawImage(buildMask(chunkX, chunkY, 0.55, 0.12, 4173), 0, 0, MASK_RES, MASK_RES, 0, 0, CHUNK_SIZE, CHUNK_SIZE);
      ctx.drawImage(variant, 0, 0);
    }
  }

  // 3. Dirt, masked by the same noise field the original used.
  const dirtLayer = document.createElement('canvas');
  dirtLayer.width = CHUNK_SIZE;
  dirtLayer.height = CHUNK_SIZE;
  const dctx = dirtLayer.getContext('2d');
  if (dctx) {
    dctx.imageSmoothingEnabled = false;
    fillTiled(dctx, dirt, chunkX, chunkY);
    dctx.globalCompositeOperation = 'destination-in';
    dctx.imageSmoothingEnabled = true;
    dctx.drawImage(buildMask(chunkX, chunkY, DIRT_THRESHOLD, DIRT_RAMP, 0), 0, 0, MASK_RES, MASK_RES, 0, 0, CHUNK_SIZE, CHUNK_SIZE);
    ctx.drawImage(dirtLayer, 0, 0);
  }

  // 4. Blight overlay, unchanged in behaviour from the original.
  const blighted = fbm(cx * CHUNK_SIZE * 0.001, cy * CHUNK_SIZE * 0.001, 2) > BLIGHT_THRESHOLD;
  if (blighted) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(20, 10, 30, 0.6)';
    ctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
    ctx.restore();
  }

  return canvas;
}

/** Soft alpha mask from the world noise field. */
function buildMask(chunkX: number, chunkY: number, threshold: number, ramp: number, salt: number): HTMLCanvasElement {
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
      const alpha = noise > threshold
        ? Math.floor(Math.min(1, (noise - threshold) / ramp) * 255)
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
