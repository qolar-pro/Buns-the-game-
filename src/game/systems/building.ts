/**
 * Placing things in the world.
 *
 * This used to be a literal list inside the right-click handler, which meant a
 * new placeable had to be added in one place and remembered in three. It is a
 * table now, and it carries the one thing the old branch could not express:
 * whether a piece snaps to the grid.
 *
 * Snapping matters. Free-placed walls never line up, so a "base" built from
 * them is a row of slightly crooked planks with gaps a wolf walks through.
 * Structural pieces snap; props stay where you drop them.
 */
import { PLAYER_SIZE } from '../core/config';
import type { EntityType, GameState, ItemType } from '../core/types';

/** Grid pitch for structural pieces. Matches the terrain tile. */
export const BUILD_GRID = 128;

export interface PlaceRule {
  /** Snap to `BUILD_GRID` so adjacent pieces touch exactly. */
  snap: boolean;
  /** Growth stage to spawn at, for things that have one. */
  stage: number;
  /** World entity to spawn, when it is not just the item itself. */
  entity?: EntityType;
}

const prop = (stage = 2): PlaceRule => ({ snap: false, stage });
const structure = (): PlaceRule => ({ snap: true, stage: 2 });

/** Every item that can be put down, and how. */
export const PLACEABLE: Partial<Record<ItemType, PlaceRule>> = {
  torch: prop(),
  workbench: prop(),
  campfire: prop(),
  sapling: prop(0),
  // Planting. Seeds become a crop, which is why a rule needs to be able to name
  // an entity that is not the item's own name.
  wheat_seeds: { snap: false, stage: 0, entity: 'wheat_crop' },
  bed: prop(),
  chest: prop(),
  furnace: prop(),
  anvil: prop(),
  wall: structure(),
  floor: structure(),
  door: structure(),
};

/** True when the held item is something the player can put down. */
export function isPlaceable(type: ItemType): boolean {
  return type in PLACEABLE;
}

export interface GhostTarget {
  /** Top-left of where the sprite would be drawn. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Centre of the cell the piece snaps to, for the grid square. */
  cellX: number;
  cellY: number;
  cellSize: number;
  /** What would be placed, so the ghost can draw the actual sprite. */
  entity: EntityType;
  /** False when something is already there. Drawn red rather than not drawn. */
  valid: boolean;
  /** True for structural pieces, which show their grid cell. */
  snapped: boolean;
}

export interface PlaceDeps {
  getResourceDimensions: (type: EntityType, scale: number, stage: number) => { w: number; h: number };
  spawnResource: (type: EntityType, x: number, y: number) => boolean;
  removeFromInventory: (type: ItemType, count: number) => void;
  onPlaced: () => void;
}

/** How far in front of the player a piece lands. */
const REACH = 130;

/**
 * Where the held item would go if the player placed it now.
 *
 * Returned rather than drawn, so the same arithmetic decides the preview and
 * the placement. Computing the position twice — once for the ghost, once for
 * the real thing — is how a preview ends up lying about where the block lands.
 */
export function ghostTarget(
  state: GameState,
  getResourceDimensions: (t: EntityType, scale: number, stage: number) => { w: number; h: number },
  isBlocked: (x: number, y: number, w: number, h: number) => boolean,
): GhostTarget | null {
  const held = state.player.inventory[state.player.selectedSlot];
  if (!held) return null;
  const rule = PLACEABLE[held.type];
  if (!rule) return null;

  const spot = targetSpot(state);
  const entity = rule.entity ?? (held.type as EntityType);
  const dims = getResourceDimensions(entity, 1, rule.stage);
  const { x, y } = snapTo(rule, spot, dims);

  const cellX = rule.snap ? Math.floor(spot.x / BUILD_GRID) * BUILD_GRID : spot.x - BUILD_GRID / 2;
  const cellY = rule.snap ? Math.floor(spot.y / BUILD_GRID) * BUILD_GRID : spot.y - BUILD_GRID / 2;

  return {
    x, y, w: dims.w, h: dims.h,
    cellX, cellY, cellSize: BUILD_GRID,
    entity,
    valid: !isBlocked(x, y, dims.w, dims.h),
    snapped: rule.snap,
  };
}

/** The point in front of the player that a placement aims at. */
function targetSpot(state: GameState): { x: number; y: number } {
  const { player } = state;
  let x = player.x + PLAYER_SIZE / 2;
  let y = player.y + PLAYER_SIZE / 2;
  if (player.facing === 'up') y -= REACH;
  else if (player.facing === 'down') y += REACH;
  else if (player.facing === 'left') x -= REACH;
  else if (player.facing === 'right') x += REACH;
  return { x, y };
}

/** Turn an aim point into a draw position, snapping if the rule says to. */
function snapTo(rule: PlaceRule, spot: { x: number; y: number },
                dims: { w: number; h: number }): { x: number; y: number } {
  if (!rule.snap) {
    return { x: spot.x - dims.w / 2, y: spot.y - dims.h / 2 };
  }
  const cellX = Math.floor(spot.x / BUILD_GRID) * BUILD_GRID;
  const cellY = Math.floor(spot.y / BUILD_GRID) * BUILD_GRID;
  return {
    x: cellX + (BUILD_GRID - dims.w) / 2,
    y: cellY + (BUILD_GRID - dims.h) / 2,
  };
}

/**
 * Put down whatever is in the selected slot.
 *
 * Returns false when the held item is not placeable or there is no room, so the
 * caller can stay silent rather than reporting a failure the player caused by
 * holding a carrot.
 */
export function placeHeld(state: GameState, deps: PlaceDeps): boolean {
  const held = state.player.inventory[state.player.selectedSlot];
  if (!held) return false;
  const rule = PLACEABLE[held.type];
  if (!rule) return false;

  const entity = rule.entity ?? (held.type as EntityType);
  const dims = deps.getResourceDimensions(entity, 1, rule.stage);
  // Exactly the position the ghost previewed: one function, one answer.
  const { x, y } = snapTo(rule, targetSpot(state), dims);

  if (!deps.spawnResource(entity, x, y)) return false;
  deps.removeFromInventory(held.type, 1);
  deps.onPlaced();
  return true;
}
