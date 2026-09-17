import { describe, expect, it } from 'vitest';
import { craftItem, findRecipe } from '../crafting';
import { makeState, summarise } from './helpers';

describe('craftItem', () => {
  it('consumes the ingredients and yields the output', () => {
    const s = makeState([{ type: 'wood', count: 1 }]);
    expect(craftItem(s, 'stick')).toBe('ok');
    // stick: 1 wood -> 4 sticks
    expect(summarise(s)).toEqual({ stick: 4 });
  });

  it('refuses when ingredients are missing and changes nothing', () => {
    const s = makeState([{ type: 'wood', count: 1 }]);
    expect(craftItem(s, 'workbench')).toBe('missing-ingredients'); // needs 10 wood
    expect(summarise(s)).toEqual({ wood: 1 });
  });

  it('refuses workbench recipes unless a workbench is open', () => {
    const s = makeState([
      { type: 'stone', count: 10 },
      { type: 'stick', count: 10 },
    ]);
    expect(craftItem(s, 'stone_axe')).toBe('requires-workbench');
    expect(summarise(s)).toEqual({ stone: 10, stick: 10 });

    s.isWorkbenchOpen = true;
    expect(craftItem(s, 'stone_axe')).toBe('ok');
    expect(summarise(s)).toMatchObject({ stone_axe: 1 });
  });

  it('reports an unknown recipe id rather than throwing', () => {
    expect(craftItem(makeState(), 'not_a_recipe')).toBe('unknown-recipe');
  });

  it('does not partially consume when an ingredient is short', () => {
    // wooden_axe needs 3 wood + 2 stick; supply the wood but not the sticks.
    const s = makeState([{ type: 'wood', count: 3 }, { type: 'stick', count: 1 }]);
    expect(craftItem(s, 'wooden_axe')).toBe('missing-ingredients');
    expect(summarise(s)).toEqual({ wood: 3, stick: 1 });
  });

  it('exposes recipes by id', () => {
    expect(findRecipe('stick')?.output).toBe('stick');
    expect(findRecipe('nope')).toBeUndefined();
  });
});
