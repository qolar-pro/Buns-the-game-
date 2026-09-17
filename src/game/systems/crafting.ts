/**
 * Crafting.
 *
 * Pure: consumes ingredients from state and produces the output. The caller is
 * responsible for any sound or UI feedback, which keeps this testable.
 */
import { CRAFTING_RECIPES } from '../core/recipes';
import { addToInventory, hasIngredients, removeFromInventory } from './inventory';
import type { GameState, Recipe } from '../core/types';

export type CraftResult = 'ok' | 'unknown-recipe' | 'requires-workbench' | 'missing-ingredients';

export function findRecipe(recipeId: string): Recipe | undefined {
  return CRAFTING_RECIPES.find((r) => r.id === recipeId);
}

/**
 * Attempt to craft `recipeId`. Mutates the inventory only on success, and
 * reports why it failed otherwise so the caller can show the right message.
 */
export function craftItem(state: GameState, recipeId: string): CraftResult {
  const recipe = findRecipe(recipeId);
  if (!recipe) return 'unknown-recipe';

  // Check if workbench is required and if it's open
  if (recipe.requiresWorkbench && !state.isWorkbenchOpen) {
    return 'requires-workbench';
  }

  if (!hasIngredients(state, recipe.ingredients)) return 'missing-ingredients';

  for (const ing of recipe.ingredients) {
    removeFromInventory(state, ing.type, ing.count);
  }
  addToInventory(state, recipe.output, recipe.count);
  state.progress.itemsCrafted += 1;
  return 'ok';
}
