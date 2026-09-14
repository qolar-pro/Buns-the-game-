/**
 * The single source of truth for every asset.
 *
 * Frame rectangles are generated into frames.ts by the packer. Everything here
 * is *authored*: anchors, world sizes and colliders are decided by a human and
 * never derived from pixels, so regenerating art cannot silently change physics
 * or where an object sits relative to the ground.
 */
import { FRAMES, type Frame } from './frames';

/** How an object interacts with the player. */
export type CollisionLayerName = 'NONE' | 'SOLID' | 'INTERACTABLE';

export type Collider =
  | { kind: 'none' }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'box'; x: number; y: number; w: number; h: number };

export interface AssetMeta {
  /** Where the sprite's origin sits in its frame: 0.5/1.0 means bottom-centre. */
  anchor: { x: number; y: number };
  /** Authored draw size in world units. Never read back from the image. */
  worldSize: { w: number; h: number };
  collider: Collider;
  layer: CollisionLayerName;
}

const BASE_ANCHOR = { x: 0.5, y: 1.0 };
const CENTRE_ANCHOR = { x: 0.5, y: 0.5 };

/**
 * Colliders are ellipses at the base of an object, sized to its footprint
 * rather than its silhouette — the canopy of a tree should not block movement,
 * only its trunk. Numbers are in frame pixels; `scripts/suggest-collider.mjs`
 * proposes starting values from the alpha channel for a new asset.
 */
function solid(w: number, h: number, rx: number, ry: number, cyFrac = 0.92): AssetMeta {
  return {
    anchor: BASE_ANCHOR,
    worldSize: { w, h },
    collider: { kind: 'ellipse', cx: w / 2, cy: Math.round(h * cyFrac), rx, ry },
    layer: 'SOLID',
  };
}

function pickup(w: number, h: number, rx: number, ry: number): AssetMeta {
  return {
    anchor: BASE_ANCHOR,
    worldSize: { w, h },
    collider: { kind: 'ellipse', cx: w / 2, cy: Math.round(h * 0.9), rx, ry },
    layer: 'INTERACTABLE',
  };
}

function decoration(w: number, h: number): AssetMeta {
  return { anchor: BASE_ANCHOR, worldSize: { w, h }, collider: { kind: 'none' }, layer: 'NONE' };
}

function icon(size = 64): AssetMeta {
  return { anchor: CENTRE_ANCHOR, worldSize: { w: size, h: size }, collider: { kind: 'none' }, layer: 'NONE' };
}

export const META: Record<string, AssetMeta> = {
  // --- large props: only the base blocks movement ---------------------------
  'world/tree': solid(128, 192, 18, 9),
  'world/small_tree': solid(128, 128, 14, 7),
  'world/trunk': solid(128, 128, 22, 11),
  'world/workbench': solid(128, 192, 40, 14),
  'world/furnace': solid(128, 192, 34, 13),
  'world/furnace_lit': solid(128, 192, 34, 13),
  'world/chest': solid(128, 192, 34, 13),
  'world/chest_open': solid(128, 192, 34, 13),
  'world/bed': solid(128, 192, 44, 18),
  'world/antenna': solid(128, 192, 26, 11),
  'world/fence': solid(128, 128, 46, 9),
  'world/campfire_1': solid(128, 128, 26, 11),
  'world/campfire_2': solid(128, 128, 26, 11),
  'world/torch': solid(128, 128, 9, 5),
  'world/coal_ore': solid(128, 128, 34, 16),
  'world/iron_ore': solid(128, 128, 34, 16),

  // --- gatherable, walk-through --------------------------------------------
  'world/bush': pickup(128, 128, 26, 12),
  'world/rock_a': pickup(64, 64, 18, 8),
  'world/rock_b': pickup(64, 64, 18, 8),
  'world/rock_c': pickup(64, 64, 18, 8),
  'world/sapling': pickup(64, 64, 9, 5),

  // --- ground detail, never collides ---------------------------------------
  'world/tall_grass': decoration(64, 64),
  'world/flowers_a': decoration(64, 64),
  'world/flowers_b': decoration(64, 64),
  'world/pebbles': decoration(64, 64),
  'world/twigs': decoration(64, 64),
  'world/mushroom': decoration(64, 64),

  // --- effects --------------------------------------------------------------
  'world/hit_spark': { anchor: CENTRE_ANCHOR, worldSize: { w: 64, h: 64 }, collider: { kind: 'none' }, layer: 'NONE' },
  'world/leaf_burst': { anchor: CENTRE_ANCHOR, worldSize: { w: 64, h: 64 }, collider: { kind: 'none' }, layer: 'NONE' },
  'world/stone_chip': { anchor: CENTRE_ANCHOR, worldSize: { w: 64, h: 64 }, collider: { kind: 'none' }, layer: 'NONE' },
  'world/smoke_puff': { anchor: CENTRE_ANCHOR, worldSize: { w: 64, h: 64 }, collider: { kind: 'none' }, layer: 'NONE' },
  'world/water_splash': { anchor: CENTRE_ANCHOR, worldSize: { w: 64, h: 64 }, collider: { kind: 'none' }, layer: 'NONE' },
  'world/sleep_z': { anchor: CENTRE_ANCHOR, worldSize: { w: 64, h: 64 }, collider: { kind: 'none' }, layer: 'NONE' },
};

/** Item icons and UI icons are uniform; fill them in rather than listing each. */
for (const key of Object.keys(FRAMES)) {
  if (META[key]) continue;
  if (key.startsWith('items/') || key.startsWith('ui/')) META[key] = icon();
  else if (key.startsWith('terrain/')) {
    META[key] = { anchor: { x: 0, y: 0 }, worldSize: { w: 128, h: 128 }, collider: { kind: 'none' }, layer: 'NONE' };
  } else if (key.startsWith('characters/')) {
    META[key] = { anchor: BASE_ANCHOR, worldSize: { w: 64, h: 64 }, collider: { kind: 'ellipse', cx: 32, cy: 58, rx: 14, ry: 7 }, layer: 'NONE' };
  }
}

export function metaFor(id: string): AssetMeta | null {
  return META[id] ?? null;
}

export function frameFor(id: string): Frame | null {
  return (FRAMES as Record<string, Frame>)[id] ?? null;
}

/** Every declared asset id. */
export const ASSET_IDS = Object.keys(FRAMES);
