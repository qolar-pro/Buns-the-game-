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
  'world/tree': solid(170, 255, 24, 12),
  'world/small_tree': solid(110, 110, 16, 8),
  'world/trunk': solid(95, 95, 26, 13),
  'world/workbench': solid(115, 130, 40, 15),
  'world/furnace': solid(115, 140, 36, 14),
  'world/furnace_lit': solid(115, 140, 36, 14),
  'world/chest': solid(100, 110, 34, 13),
  'world/chest_open': solid(100, 110, 34, 13),
  'world/bed': solid(130, 140, 48, 20),
  'world/antenna': solid(130, 210, 28, 12),
  'world/fence': solid(115, 90, 48, 10),
  'world/campfire_1': solid(95, 95, 28, 12),
  'world/campfire_2': solid(95, 95, 28, 12),
  'world/torch': solid(60, 110, 10, 6),
  'world/coal_ore': solid(110, 110, 36, 17),
  'world/iron_ore': solid(110, 110, 36, 17),

  // --- content update ------------------------------------------------------
  'world/copper_ore': solid(110, 110, 36, 17),
  'world/titanium_ore': solid(110, 110, 36, 17),
  'world/rubble': solid(120, 120, 46, 22),
  'world/dungeon_entrance': solid(150, 150, 52, 24),
  'world/dungeon_exit': solid(100, 130, 22, 11),
  'world/stairs_down': solid(120, 120, 40, 18),
  'world/loot_chest': solid(110, 120, 34, 14),
  'world/brazier': solid(80, 120, 18, 9),
  'world/wall': solid(128, 150, 62, 26),
  'world/floor': { anchor: { x: 0.5, y: 1 }, worldSize: { w: 128, h: 128 }, collider: { kind: 'none' }, layer: 'NONE' },
  'world/door': solid(110, 150, 52, 20),
  'world/anvil': solid(110, 110, 38, 16),
  // Crops are walked through, not around.
  'world/crop_seedling': pickup(55, 55, 10, 5),
  'world/crop_growing': pickup(86, 86, 18, 9),
  'world/crop_wheat': pickup(100, 100, 22, 11),

  // --- gatherable, walk-through --------------------------------------------
  'world/bush': pickup(105, 105, 28, 13),
  'world/rock_a': pickup(92, 92, 26, 12),
  'world/rock_b': pickup(92, 92, 26, 12),
  'world/rock_c': pickup(92, 92, 26, 12),
  'world/sapling': pickup(55, 55, 10, 5),

  // --- ground detail, never collides ---------------------------------------
  'world/tall_grass': decoration(70, 70),
  'world/flowers_a': decoration(64, 64),
  'world/flowers_b': decoration(64, 64),
  'world/pebbles': decoration(64, 64),
  'world/twigs': decoration(48, 48),
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
