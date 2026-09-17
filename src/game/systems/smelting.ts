/**
 * Furnace smelting.
 *
 * Pure: advances furnace timers and moves items between the furnace's three
 * slots (input, fuel, output). Moved out of the update loop in
 * components/Game.tsx with the logic unchanged.
 */
import { FUEL_VALUES, SMELT_RECIPES, SMELT_TIME } from '../core/config';
import type { GameState, ItemType, Resource } from '../core/types';

/** Slot layout of a furnace's inventory. */
export const FURNACE_INPUT = 0;
export const FURNACE_FUEL = 1;
export const FURNACE_OUTPUT = 2;

/** Largest stack the output slot will accumulate before smelting stalls. */
export const MAX_OUTPUT_STACK = 64;

/** Advance a single furnace by `dt` ticks. */
export function updateFurnace(res: Resource, dt: number): void {
  if (res.type !== 'furnace' || !res.inventory) return;

  const input = res.inventory[FURNACE_INPUT];
  const fuel = res.inventory[FURNACE_FUEL];
  const output = res.inventory[FURNACE_OUTPUT];

  if (res.fuelTimer && res.fuelTimer > 0) {
    res.fuelTimer -= dt;
  }

  if (input && SMELT_RECIPES[input.type]) {
    const outputType = SMELT_RECIPES[input.type];

    // Check if we can output
    if (!output || (output.type === outputType && output.count < MAX_OUTPUT_STACK)) {
      // Need fuel?
      if ((!res.fuelTimer || res.fuelTimer <= 0) && fuel && FUEL_VALUES[fuel.type]) {
        res.fuelTimer = FUEL_VALUES[fuel.type];
        res.maxFuelTimer = res.fuelTimer;
        fuel.count--;
        if (fuel.count <= 0) res.inventory[FURNACE_FUEL] = null;
      }

      if (res.fuelTimer && res.fuelTimer > 0) {
        res.smeltTimer = (res.smeltTimer || 0) + dt;
        if (res.smeltTimer >= SMELT_TIME) {
          res.smeltTimer = 0;
          input.count--;
          if (input.count <= 0) res.inventory[FURNACE_INPUT] = null;

          if (output) {
            output.count++;
          } else {
            res.inventory[FURNACE_OUTPUT] = { type: outputType as ItemType, count: 1 };
          }
        }
      } else {
        res.smeltTimer = 0;
      }
    } else {
      res.smeltTimer = 0;
    }
  } else {
    res.smeltTimer = 0;
  }
}

/** Advance every furnace in the loaded world. */
export function updateSmelting(state: GameState, dt: number): void {
  state.resources.forEach((chunk) => {
    chunk.forEach((res) => updateFurnace(res, dt));
  });
}
