/**
 * Every tunable constant in the game.
 *
 * Moved verbatim out of components/Game.tsx so draw and update code references a
 * named constant instead of a magic number.
 */
export const PLAYER_SIZE = 128;
export const PLAYER_SPEED = 5.0;

// Colors
export const TREE_TRUNK = '#3e2723';
export const ROCK_COLOR = '#5a5a5a';
export const ROCK_SIZE = 64;
export const GLOBAL_ASSET_SCALE = 1.0;
export const CHUNK_SIZE = 1024;
export const INVENTORY_SLOTS = 36;
export const HOTBAR_SLOTS = 9;
export const MAIN_INV_ROWS = 3;
export const MAIN_INV_COLS = 9;
export const SLOT_SIZE = 50;
export const SLOT_MARGIN = 10;
export const MAX_HUNGER = 10;

export const SMELT_RECIPES: Record<string, string> = {
  'raw_beef': 'cooked_beef',
  'raw_pork': 'cooked_pork',
  'mutton': 'cooked_mutton',
  'raw_chicken': 'cooked_chicken',
  'iron_ore': 'iron_ingot',
  'copper_ore': 'copper_ingot',
  'titanium_ore': 'titanium_ingot',
  // Salvage, not ore: scrap is looted from dungeon ruins. This is the step that
  // makes going underground mandatory rather than optional, since copper wiring
  // is what the antenna needs most of.
  'scrap_metal': 'copper_wiring',
};

export const FUEL_VALUES: Record<string, number> = {
  'wood': 900, // 15 seconds at 60fps
  'coal': 3600, // 60 seconds
  'stick': 300 // 5 seconds
};

export const SMELT_TIME = 600; // 10 seconds to smelt
