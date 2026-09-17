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

  // --- Biome materials ----------------------------------------------------
  // A second rope recipe, cheaper than the wool one above. Rope itself is not
  // the desert's gate — wool already makes it — so the gate is plant fiber,
  // which only cactus and dead bush drop, and which every bow needs directly.
  { id: 'rope_fiber', output: 'rope', count: 2, ingredients: [{ type: 'plant_fiber', count: 3 }] },
  { id: 'glass', output: 'glass', count: 1, ingredients: [{ type: 'sand', count: 2 }], requiresWorkbench: true },

  // --- Ranged -------------------------------------------------------------
  { id: 'bow', output: 'bow', count: 1, ingredients: [{ type: 'wood', count: 4 }, { type: 'plant_fiber', count: 6 }], requiresWorkbench: true },
  { id: 'crossbow', output: 'crossbow', count: 1, ingredients: [{ type: 'wood', count: 4 }, { type: 'plant_fiber', count: 8 }, { type: 'iron_ingot', count: 3 }], requiresWorkbench: true },
  // Reeds make arrows four at a time; sticks make them one at a time. That gap
  // is the fen's reward, and the reason to carry a bow rather than hoard it.
  { id: 'arrow_reed', output: 'arrow', count: 8, ingredients: [{ type: 'reed_bundle', count: 1 }, { type: 'feather', count: 1 }, { type: 'stone', count: 1 }] },
  { id: 'arrow', output: 'arrow', count: 2, ingredients: [{ type: 'stick', count: 1 }, { type: 'feather', count: 1 }, { type: 'stone', count: 1 }] },
  { id: 'iron_arrow', output: 'iron_arrow', count: 4, ingredients: [{ type: 'reed_bundle', count: 1 }, { type: 'feather', count: 2 }, { type: 'iron_ingot', count: 1 }], requiresWorkbench: true },
  { id: 'quiver', output: 'quiver', count: 1, ingredients: [{ type: 'leather', count: 4 }, { type: 'plant_fiber', count: 3 }], requiresWorkbench: true },

  // --- Shields ------------------------------------------------------------
  { id: 'wooden_shield', output: 'wooden_shield', count: 1, ingredients: [{ type: 'wood', count: 8 }, { type: 'rope', count: 1 }], requiresWorkbench: true },
  { id: 'iron_shield', output: 'iron_shield', count: 1, ingredients: [{ type: 'iron_ingot', count: 5 }, { type: 'wood', count: 4 }], requiresWorkbench: true },
  { id: 'titanium_shield', output: 'titanium_shield', count: 1, ingredients: [{ type: 'titanium_ingot', count: 4 }, { type: 'frost_crystal', count: 2 }], requiresWorkbench: true },

  // --- Chainmail: the middle armour tier, between leather and titanium -----
  { id: 'chainmail_coif', output: 'chainmail_coif', count: 1, ingredients: [{ type: 'iron_ingot', count: 3 }], requiresWorkbench: true },
  { id: 'chainmail_hauberk', output: 'chainmail_hauberk', count: 1, ingredients: [{ type: 'iron_ingot', count: 6 }], requiresWorkbench: true },
  { id: 'chainmail_chausses', output: 'chainmail_chausses', count: 1, ingredients: [{ type: 'iron_ingot', count: 5 }], requiresWorkbench: true },
  { id: 'iron_boots', output: 'iron_boots', count: 1, ingredients: [{ type: 'iron_ingot', count: 3 }], requiresWorkbench: true },

  // --- Fur: the snow's gate. Warm, light, and the only set with a bonus that
  //     does not need titanium, so the White Waste is worth the walk early.
  { id: 'fur_cap', output: 'fur_cap', count: 1, ingredients: [{ type: 'thick_fur', count: 2 }], requiresWorkbench: true },
  { id: 'fur_coat', output: 'fur_coat', count: 1, ingredients: [{ type: 'thick_fur', count: 4 }, { type: 'leather', count: 2 }], requiresWorkbench: true },
  { id: 'fur_leggings', output: 'fur_leggings', count: 1, ingredients: [{ type: 'thick_fur', count: 3 }, { type: 'leather', count: 1 }], requiresWorkbench: true },
  { id: 'fur_boots', output: 'fur_boots', count: 1, ingredients: [{ type: 'thick_fur', count: 2 }, { type: 'leather', count: 1 }], requiresWorkbench: true },

  // --- Light --------------------------------------------------------------
  // A second lantern recipe: glow moss instead of copper, for a player who
  // found the fen before they found a metal district.
  { id: 'moss_lantern', output: 'lantern', count: 1, ingredients: [{ type: 'glow_moss', count: 3 }, { type: 'glass', count: 1 }, { type: 'stick', count: 1 }], requiresWorkbench: true },
];
