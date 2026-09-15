/** The crafting table. Moved verbatim out of components/Game.tsx. */
import type { Recipe } from './types';

export const CRAFTING_RECIPES: Recipe[] = [
  { id: 'stick', output: 'stick', count: 4, ingredients: [{ type: 'wood', count: 1 }] },
  { id: 'workbench', output: 'workbench', count: 1, ingredients: [{ type: 'wood', count: 10 }] },
  { id: 'furnace', output: 'furnace', count: 1, ingredients: [{ type: 'stone', count: 15 }] },
  { id: 'chest', output: 'chest', count: 1, ingredients: [{ type: 'wood', count: 12 }] },
  { id: 'torch', output: 'torch', count: 4, ingredients: [{ type: 'stick', count: 1 }, { type: 'coal', count: 1 }] },
  { id: 'bed', output: 'bed', count: 1, ingredients: [{ type: 'wood', count: 10 }, { type: 'wool', count: 3 }] },
  { id: 'fence', output: 'fence', count: 4, ingredients: [{ type: 'wood', count: 4 }] },
  { id: 'antenna', output: 'antenna', count: 1, ingredients: [{ type: 'iron_ingot', count: 10 }, { type: 'copper_wiring', count: 5 }], requiresWorkbench: true },
  
  // Tools
  { id: 'wooden_axe', output: 'wooden_axe', count: 1, ingredients: [{ type: 'wood', count: 3 }, { type: 'stick', count: 2 }] },
  { id: 'wooden_pickaxe', output: 'wooden_pickaxe', count: 1, ingredients: [{ type: 'wood', count: 3 }, { type: 'stick', count: 2 }] },
  { id: 'wooden_sword', output: 'wooden_sword', count: 1, ingredients: [{ type: 'wood', count: 2 }, { type: 'stick', count: 1 }] },
  
  { id: 'stone_axe', output: 'stone_axe', count: 1, ingredients: [{ type: 'stone', count: 3 }, { type: 'stick', count: 2 }], requiresWorkbench: true },
  { id: 'stone_pickaxe', output: 'stone_pickaxe', count: 1, ingredients: [{ type: 'stone', count: 3 }, { type: 'stick', count: 2 }], requiresWorkbench: true },
  { id: 'stone_sword', output: 'stone_sword', count: 1, ingredients: [{ type: 'stone', count: 2 }, { type: 'stick', count: 1 }], requiresWorkbench: true },
  
  { id: 'iron_axe', output: 'iron_axe', count: 1, ingredients: [{ type: 'iron_ingot', count: 3 }, { type: 'stick', count: 2 }], requiresWorkbench: true },
  { id: 'iron_pickaxe', output: 'iron_pickaxe', count: 1, ingredients: [{ type: 'iron_ingot', count: 3 }, { type: 'stick', count: 2 }], requiresWorkbench: true },
  { id: 'iron_sword', output: 'iron_sword', count: 1, ingredients: [{ type: 'iron_ingot', count: 2 }, { type: 'stick', count: 1 }], requiresWorkbench: true },

  // Armor
  { id: 'leather_cap', output: 'leather_cap', count: 1, ingredients: [{ type: 'leather', count: 5 }], requiresWorkbench: true },
  { id: 'leather_tunic', output: 'leather_tunic', count: 1, ingredients: [{ type: 'leather', count: 8 }], requiresWorkbench: true },
  { id: 'leather_pants', output: 'leather_pants', count: 1, ingredients: [{ type: 'leather', count: 7 }], requiresWorkbench: true },
  { id: 'leather_boots', output: 'leather_boots', count: 1, ingredients: [{ type: 'leather', count: 4 }], requiresWorkbench: true },
  { id: 'leather_backpack', output: 'leather_backpack', count: 1, ingredients: [{ type: 'leather', count: 10 }, { type: 'wool', count: 2 }], requiresWorkbench: true },

  // Food
  { id: 'bread', output: 'bread', count: 1, ingredients: [{ type: 'wheat', count: 3 }] },
  { id: 'meat_pie', output: 'meat_pie', count: 1, ingredients: [{ type: 'cooked_beef', count: 1 }, { type: 'wheat', count: 2 }], requiresWorkbench: true },
  { id: 'omelet', output: 'omelet', count: 1, ingredients: [{ type: 'egg', count: 2 }], requiresWorkbench: true },

  // --- content update -------------------------------------------------------
  // Light. The practical key to dungeons: without one you cannot see far enough
  // underground to fight or find anything.
  { id: 'lantern', output: 'lantern', count: 1, ingredients: [{ type: 'copper_ingot', count: 2 }, { type: 'coal', count: 1 }, { type: 'stick', count: 1 }], requiresWorkbench: true },
  { id: 'torch_bundle', output: 'torch_bundle', count: 1, ingredients: [{ type: 'torch', count: 4 }, { type: 'rope', count: 1 }] },
  { id: 'rope', output: 'rope', count: 1, ingredients: [{ type: 'wool', count: 2 }] },

  // Copper wiring can also be drawn from ingots, so a player who finds copper
  // before scrap is not stuck.
  { id: 'copper_wiring', output: 'copper_wiring', count: 2, ingredients: [{ type: 'copper_ingot', count: 1 }], requiresWorkbench: true },

  // Titanium tier. Needs an anvil, which needs iron — the last crafting gate.
  { id: 'anvil', output: 'anvil', count: 1, ingredients: [{ type: 'iron_ingot', count: 6 }, { type: 'stone', count: 10 }], requiresWorkbench: true },
  { id: 'titanium_axe', output: 'titanium_axe', count: 1, ingredients: [{ type: 'titanium_ingot', count: 3 }, { type: 'stick', count: 2 }], requiresWorkbench: true },
  { id: 'titanium_pickaxe', output: 'titanium_pickaxe', count: 1, ingredients: [{ type: 'titanium_ingot', count: 3 }, { type: 'stick', count: 2 }], requiresWorkbench: true },
  { id: 'titanium_sword', output: 'titanium_sword', count: 1, ingredients: [{ type: 'titanium_ingot', count: 2 }, { type: 'stick', count: 1 }], requiresWorkbench: true },
  { id: 'titanium_helm', output: 'titanium_helm', count: 1, ingredients: [{ type: 'titanium_ingot', count: 4 }], requiresWorkbench: true },
  { id: 'titanium_chestplate', output: 'titanium_chestplate', count: 1, ingredients: [{ type: 'titanium_ingot', count: 7 }], requiresWorkbench: true },
  { id: 'titanium_greaves', output: 'titanium_greaves', count: 1, ingredients: [{ type: 'titanium_ingot', count: 6 }], requiresWorkbench: true },
  { id: 'titanium_boots', output: 'titanium_boots', count: 1, ingredients: [{ type: 'titanium_ingot', count: 3 }], requiresWorkbench: true },

  // Building.
  { id: 'wall', output: 'wall', count: 4, ingredients: [{ type: 'wood', count: 4 }] },
  { id: 'floor', output: 'floor', count: 4, ingredients: [{ type: 'wood', count: 2 }] },
  { id: 'door', output: 'door', count: 1, ingredients: [{ type: 'wood', count: 6 }] },

  // Consumables.
  { id: 'bandage', output: 'bandage', count: 2, ingredients: [{ type: 'wool', count: 1 }] },
  { id: 'throwing_knife', output: 'throwing_knife', count: 4, ingredients: [{ type: 'iron_ingot', count: 1 }, { type: 'stick', count: 1 }] },

  // The endgame. The frame replaces the old one-step antenna: it is placed, then
  // restored with wiring, then powered with the Warden's signal core.
  { id: 'antenna_frame', output: 'antenna_frame', count: 1, ingredients: [{ type: 'titanium_ingot', count: 5 }, { type: 'iron_ingot', count: 10 }], requiresWorkbench: true },
];
