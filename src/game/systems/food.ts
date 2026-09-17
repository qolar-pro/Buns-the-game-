/**
 * What can be eaten, and what it is worth.
 *
 * This was a literal array of six raw ingredients inside the survival tick, with
 * the values picked out by two `else if`s. Everything the furnace produced was
 * missing from it, which meant cooking meat made it *inedible* — the whole
 * cooking branch of the game was a dead end and nothing said so. It is a table
 * now, and `reachability.test.ts` walks it.
 *
 * Cooked beats raw, and prepared beats cooked: that gradient is the only reason
 * to spend fuel.
 */
import type { ItemType } from '../core/types';

export interface FoodValue {
  health: number;
  hunger: number;
}

export const FOODS: Partial<Record<ItemType, FoodValue>> = {
  // Foraged.
  wheat_seeds: { health: 1, hunger: 2 },
  egg: { health: 2, hunger: 5 },

  // Raw meat. Edible in a pinch, worth little.
  raw_beef: { health: 2, hunger: 8 },
  raw_pork: { health: 2, hunger: 8 },
  mutton: { health: 2, hunger: 8 },
  raw_chicken: { health: 1, hunger: 6 },

  // Cooked. Roughly double the hunger, and actually heals.
  cooked_beef: { health: 8, hunger: 22 },
  cooked_pork: { health: 8, hunger: 20 },
  cooked_mutton: { health: 7, hunger: 18 },
  cooked_chicken: { health: 6, hunger: 16 },

  // Prepared. The reason to farm.
  bread: { health: 6, hunger: 20 },
  omelet: { health: 8, hunger: 24 },
  meat_pie: { health: 20, hunger: 40 },

  // Dungeon salvage: old but sealed. The reason a chest full of them is a find
  // rather than a disappointment.
  ration: { health: 10, hunger: 30 },
};

/** True when the item can be eaten. */
export function isFood(type: ItemType): boolean {
  return type in FOODS;
}

/** What eating it restores, or null when it is not food. */
export function foodValue(type: ItemType): FoodValue | null {
  return FOODS[type] ?? null;
}
