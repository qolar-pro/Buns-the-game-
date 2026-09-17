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

export interface PlaceDeps {
  getResourceDimensions: (type: EntityType, scale: number, stage: number) => { w: number; h: number };
  spawnResource: (type: EntityType, x: number, y: number) => boolean;
  removeFromInventory: (type: ItemType, count: number) => void;
  onPlaced: () => void;
}

/** How far in front of the player a piece lands. */
const REACH = 130;

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

  const { player } = state;
  let targetX = player.x + PLAYER_SIZE / 2;
  let targetY = player.y + PLAYER_SIZE / 2;
  if (player.facing === 'up') targetY -= REACH;
  else if (player.facing === 'down') targetY += REACH;
  else if (player.facing === 'left') targetX -= REACH;
  else if (player.facing === 'right') targetX += REACH;

  const entity = rule.entity ?? (held.type as EntityType);
  const dims = deps.getResourceDimensions(entity, 1, rule.stage);

  let placeX: number;
  let placeY: number;
  if (rule.snap) {
    // Snap the cell the target lands in, then centre the piece in that cell —
    // a 62-wide wall in a 128 cell still reads as a continuous run.
    const cellX = Math.floor(targetX / BUILD_GRID) * BUILD_GRID;
    const cellY = Math.floor(targetY / BUILD_GRID) * BUILD_GRID;
    placeX = cellX + (BUILD_GRID - dims.w) / 2;
    placeY = cellY + (BUILD_GRID - dims.h) / 2;
  } else {
    placeX = targetX - dims.w / 2;
    placeY = targetY - dims.h / 2;
  }

  if (!deps.spawnResource(entity, placeX, placeY)) return false;
  deps.removeFromInventory(held.type, 1);
  deps.onPlaced();
  return true;
}
