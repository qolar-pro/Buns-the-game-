import { describe, expect, it } from 'vitest';
import { INVENTORY_SLOTS } from '../../core/config';
import { addToInventory, countItem, hasIngredients, removeFromInventory } from '../inventory';
import { makeState, summarise } from './helpers';

describe('addToInventory', () => {
  it('fills an empty slot', () => {
    const s = makeState();
    expect(addToInventory(s, 'wood', 3)).toBe(true);
    expect(summarise(s)).toEqual({ wood: 3 });
  });

  it('stacks onto an existing stack rather than using a new slot', () => {
    const s = makeState([{ type: 'wood', count: 2 }]);
    addToInventory(s, 'wood', 5);
    expect(summarise(s)).toEqual({ wood: 7 });
    expect(s.player.inventory.filter(Boolean)).toHaveLength(1);
  });

  it('returns false and changes nothing when every slot is taken', () => {
    const full = Array.from({ length: INVENTORY_SLOTS }, (_, i) => ({
      type: i % 2 ? ('stone' as const) : ('coal' as const),
      count: 1,
    }));
    const s = makeState(full);
    const before = summarise(s);
    expect(addToInventory(s, 'wood', 1)).toBe(false);
    expect(summarise(s)).toEqual(before);
  });
});

describe('removeFromInventory', () => {
  it('removes from a single stack and clears the slot when it empties', () => {
    const s = makeState([{ type: 'wood', count: 4 }]);
    expect(removeFromInventory(s, 'wood', 4)).toBe(true);
    expect(s.player.inventory[0]).toBeNull();
  });

  it('drains across several stacks of the same item', () => {
    const s = makeState([
      { type: 'wood', count: 3 },
      { type: 'stone', count: 1 },
      { type: 'wood', count: 5 },
    ]);
    expect(removeFromInventory(s, 'wood', 7)).toBe(true);
    expect(summarise(s)).toEqual({ wood: 1, stone: 1 });
  });

  it('reports failure when there is not enough', () => {
    const s = makeState([{ type: 'wood', count: 1 }]);
    expect(removeFromInventory(s, 'wood', 5)).toBe(false);
  });

  it('leaves unrelated items untouched', () => {
    const s = makeState([{ type: 'stone', count: 9 }, { type: 'wood', count: 2 }]);
    removeFromInventory(s, 'wood', 2);
    expect(summarise(s)).toEqual({ stone: 9 });
  });
});

describe('hasIngredients', () => {
  it('sums counts across split stacks', () => {
    const s = makeState([
      { type: 'wood', count: 1 },
      { type: 'wood', count: 2 },
    ]);
    expect(hasIngredients(s, [{ type: 'wood', count: 3 }])).toBe(true);
    expect(hasIngredients(s, [{ type: 'wood', count: 4 }])).toBe(false);
  });

  it('requires every ingredient, not just one', () => {
    const s = makeState([{ type: 'wood', count: 10 }]);
    expect(hasIngredients(s, [
      { type: 'wood', count: 1 },
      { type: 'stone', count: 1 },
    ])).toBe(false);
  });

  it('is satisfied by an empty requirement list', () => {
    expect(hasIngredients(makeState(), [])).toBe(true);
  });
});

describe('countItem', () => {
  it('totals a split stack', () => {
    const s = makeState([
      { type: 'coal', count: 4 },
      { type: 'wood', count: 1 },
      { type: 'coal', count: 6 },
    ]);
    expect(countItem(s, 'coal')).toBe(10);
    expect(countItem(s, 'iron_ingot')).toBe(0);
  });
});
