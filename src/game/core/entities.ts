/**
 * Every entity type, as a value rather than only a type.
 *
 * `EntityType` is a union, which vanishes at runtime — so nothing could ever
 * iterate it, and the checks that would have caught a whole content update
 * going unrendered were impossible to write. This list is the runtime twin, and
 * `entities.test.ts` fails if the two drift apart.
 */
import type { EntityType } from './types';

export const ENTITY_TYPES: EntityType[] = [
  // surface
  'tree', 'rock', 'bush', 'sapling', 'trunk', 'branch', 'small_rock', 'grass',
  // ores
  'coal_ore', 'iron_ore', 'copper_ore', 'titanium_ore',
  // placeables
  'torch', 'workbench', 'campfire', 'bed', 'chest', 'furnace', 'antenna', 'fence',
  'wall', 'floor', 'door', 'anvil', 'wheat_crop',
  // dungeon
  'dungeon_entrance', 'dungeon_exit', 'stairs_down', 'rubble', 'loot_chest', 'brazier',
  // desert
  'cactus', 'dead_bush', 'desert_rock', 'palm_tree',
  // snow
  'pine_tree', 'snow_rock', 'ice_shard', 'frost_flower',
  // swamp
  'reeds', 'lily_pad', 'swamp_tree', 'bog_iron', 'glow_moss',
  // villages
  'village_house', 'village_hall', 'well', 'market_stall', 'signpost', 'lamppost',
  'crate', 'barrel',
];
