/**
 * Authored collider data.
 *
 * Colliders used to be produced at runtime by reading sprite pixels. That was
 * slow, non-deterministic, and it meant regenerating art silently changed
 * physics. They are authored in manifest.ts now, and this module turns that data
 * into the polygon shape the collision code already consumes.
 *
 * `scripts/suggest-collider.mjs` proposes numbers for a new asset from its alpha
 * channel; a human pastes them into the manifest. Generation never feeds physics.
 */
import { CollisionLayer, type ColliderShape, type Point } from '../../../lib/SpriteCollider';
import { META, type AssetMeta, type Collider } from './manifest';

/** Approximate an ellipse with a polygon the collision code can use. */
function ellipsePoints(cx: number, cy: number, rx: number, ry: number, segments = 16): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
  }
  return pts;
}

function colliderPoints(c: Collider, meta: AssetMeta): Point[] {
  switch (c.kind) {
    case 'ellipse':
      return ellipsePoints(c.cx, c.cy, c.rx, c.ry);
    case 'box':
      return [
        { x: c.x, y: c.y },
        { x: c.x + c.w, y: c.y },
        { x: c.x + c.w, y: c.y + c.h },
        { x: c.x, y: c.y + c.h },
      ];
    case 'none':
    default: {
      // No collider: a degenerate shape at the base keeps selection working
      // without blocking movement.
      const { w, h } = meta.worldSize;
      return ellipsePoints(w / 2, h * 0.92, w * 0.18, h * 0.05, 8);
    }
  }
}

const LAYER: Record<AssetMeta['layer'], CollisionLayer> = {
  SOLID: CollisionLayer.SOLID,
  INTERACTABLE: CollisionLayer.ITEM,
  NONE: CollisionLayer.ANIMAL,
};

export function shapeFor(id: string): ColliderShape | null {
  const meta = META[id];
  if (!meta) return null;
  const points = colliderPoints(meta.collider, meta);
  return {
    points,
    physicsPoints: points,
    layer: LAYER[meta.layer],
    isTrigger: meta.layer !== 'SOLID',
    originalWidth: meta.worldSize.w,
    originalHeight: meta.worldSize.h,
  };
}

/**
 * Every authored collider, keyed by the legacy image path the engine still uses
 * to look them up. Built once at startup instead of per image load.
 */
export function buildColliders(): Map<string, ColliderShape> {
  const map = new Map<string, ColliderShape>();
  for (const id of Object.keys(META)) {
    const shape = shapeFor(id);
    if (shape) map.set(id, shape);
  }
  return map;
}

/**
 * Sprite id for a world entity.
 *
 * The draw and physics code used to build a filename here and look colliders up
 * by it. Going through ids instead means there is exactly one place that decides
 * which art an entity uses, and no code path depends on a file being called
 * anything in particular.
 */
export function idForEntity(
  type: string,
  opts: { growthStage?: number; rockIndex?: number; lit?: boolean; open?: boolean } = {},
): string {
  switch (type) {
    case 'tree':
      return opts.growthStage === 1 ? 'world/small_tree' : 'world/tree';
    case 'rock':
    case 'small_rock':
      return `world/rock_${'abc'[(opts.rockIndex ?? 0) % 3]}`;
    case 'coal_ore':
      return 'world/coal_ore';
    case 'iron_ore':
      return 'world/iron_ore';
    case 'trunk':
      return 'world/trunk';
    case 'sapling':
      return 'world/sapling';
    case 'bush':
      return 'world/bush';
    case 'torch':
      return 'world/torch';
    case 'workbench':
      return 'world/workbench';
    case 'campfire':
      return opts.lit ? 'world/campfire_2' : 'world/campfire_1';
    case 'chest':
      return opts.open ? 'world/chest_open' : 'world/chest';
    case 'furnace':
      return opts.lit ? 'world/furnace_lit' : 'world/furnace';
    case 'bed':
      return 'world/bed';
    case 'antenna':
      return 'world/antenna';
    case 'fence':
      return 'world/fence';
    case 'branch':
      return 'world/twigs';
    case 'grass':
      return 'world/tall_grass';
    default:
      return `world/${type}`;
  }
}
