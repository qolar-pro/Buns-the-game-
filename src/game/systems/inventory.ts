/**
 * Inventory manipulation.
 *
 * Pure: given state it mutates state and nothing else. No React, no DOM, no
 * canvas. Moved out of components/Game.tsx unchanged apart from taking the
 * player's inventory explicitly instead of closing over it.
 */
import { INVENTORY_SLOTS } from '../core/config';
import type { GameState, Ingredient, InventorySlot, ItemType } from '../core/types';

type Inventory = (InventorySlot | null)[];

/**
 * Add `count` of `type`, stacking onto an existing stack if there is one.
 * Returns false when the inventory is full and nothing was added.
 */
export function addToInventory(state: GameState, type: ItemType, count: number): boolean {
  const { inventory }: { inventory: Inventory } = state.player;

  // Try to stack
  for (let i = 0; i < INVENTORY_SLOTS; i++) {
    if (inventory[i] && inventory[i]!.type === type) {
      inventory[i]!.count += count;
      return true;
    }
  }

  // Find empty slot
  for (let i = 0; i < INVENTORY_SLOTS; i++) {
    if (!inventory[i]) {
      inventory[i] = { type, count };
      return true;
    }
  }

  return false; // Inventory full
}

/**
 * Remove `count` of `type`, draining stacks in slot order.
 * Returns false if there was not enough; note that, as in the original, a
 * partial removal is not rolled back.
 */
export function removeFromInventory(state: GameState, type: ItemType, count: number): boolean {
  const { inventory }: { inventory: Inventory } = state.player;
  let remaining = count;

  // First pass: exact matches or stacks
  for (let i = 0; i < INVENTORY_SLOTS; i++) {
    if (inventory[i] && inventory[i]!.type === type) {
      const take = Math.min(inventory[i]!.count, remaining);
      inventory[i]!.count -= take;
      remaining -= take;
      if (inventory[i]!.count <= 0) inventory[i] = null;
      if (remaining <= 0) return true;
    }
  }
  return false;
}

/** True when the inventory holds at least every listed ingredient. */
export function hasIngredients(state: GameState, ingredients: Ingredient[]): boolean {
  const { inventory }: { inventory: Inventory } = state.player;
  const counts: Record<string, number> = {};

  for (const slot of inventory) {
    if (slot) {
      counts[slot.type] = (counts[slot.type] || 0) + slot.count;
    }
  }

  for (const ing of ingredients) {
    if ((counts[ing.type] || 0) < ing.count) return false;
  }
  return true;
}

/** Total number of a given item across all stacks. */
export function countItem(state: GameState, type: ItemType): number {
  return state.player.inventory.reduce(
    (n, slot) => n + (slot?.type === type ? slot.count : 0),
    0,
  );
}
