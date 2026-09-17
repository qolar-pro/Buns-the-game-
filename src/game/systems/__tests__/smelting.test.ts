import { describe, expect, it } from 'vitest';
import { SMELT_TIME } from '../../core/config';
import { FURNACE_FUEL, FURNACE_INPUT, FURNACE_OUTPUT, updateFurnace } from '../smelting';
import type { InventorySlot, Resource } from '../../core/types';

function furnace(inv: (InventorySlot | null)[] = [null, null, null]): Resource {
  return { id: 'f1', x: 0, y: 0, type: 'furnace', hits: 0, maxHits: 1, scale: 1, opacity: 1, inventory: inv } as Resource;
}

/** Run enough ticks to complete one smelt. */
function runSmelt(f: Resource, ticks = SMELT_TIME + 1) {
  for (let i = 0; i < ticks; i++) updateFurnace(f, 1);
}

describe('updateFurnace', () => {
  it('does nothing without fuel', () => {
    const f = furnace([{ type: 'iron_ore', count: 1 }, null, null]);
    runSmelt(f);
    expect(f.inventory![FURNACE_OUTPUT]).toBeNull();
    expect(f.inventory![FURNACE_INPUT]!.count).toBe(1);
  });

  it('burns fuel and smelts the input into the output slot', () => {
    const f = furnace([
      { type: 'iron_ore', count: 1 },
      { type: 'coal', count: 1 },
      null,
    ]);
    runSmelt(f);
    expect(f.inventory![FURNACE_INPUT]).toBeNull();
    expect(f.inventory![FURNACE_OUTPUT]).toMatchObject({ type: 'iron_ingot', count: 1 });
  });

  it('consumes one fuel item when it lights', () => {
    const f = furnace([
      { type: 'iron_ore', count: 2 },
      { type: 'coal', count: 2 },
      null,
    ]);
    updateFurnace(f, 1);
    expect(f.inventory![FURNACE_FUEL]!.count).toBe(1);
    expect(f.fuelTimer).toBeGreaterThan(0);
  });

  it('stacks a second smelt onto the existing output', () => {
    const f = furnace([
      { type: 'iron_ore', count: 2 },
      { type: 'coal', count: 4 },
      null,
    ]);
    runSmelt(f);
    runSmelt(f);
    expect(f.inventory![FURNACE_OUTPUT]!.count).toBe(2);
  });

  it('resets progress when the input is removed mid-smelt', () => {
    const f = furnace([
      { type: 'iron_ore', count: 1 },
      { type: 'coal', count: 1 },
      null,
    ]);
    for (let i = 0; i < 100; i++) updateFurnace(f, 1);
    expect(f.smeltTimer).toBeGreaterThan(0);

    f.inventory![FURNACE_INPUT] = null;
    updateFurnace(f, 1);
    expect(f.smeltTimer).toBe(0);
  });

  it('stalls when the output slot holds a different item', () => {
    const f = furnace([
      { type: 'iron_ore', count: 1 },
      { type: 'coal', count: 1 },
      { type: 'wood', count: 1 },
    ]);
    runSmelt(f);
    expect(f.smeltTimer).toBe(0);
    expect(f.inventory![FURNACE_INPUT]!.count).toBe(1);
  });

  it('ignores non-furnace resources', () => {
    const rock = { id: 'r', x: 0, y: 0, type: 'rock', hits: 0, maxHits: 3, scale: 1, opacity: 1 } as Resource;
    expect(() => updateFurnace(rock, 1)).not.toThrow();
  });
});
