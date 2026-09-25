/**
 * Can a new game actually be started?
 *
 * `systems/__tests__/reachability.test.ts` asks whether every item is
 * obtainable *somewhere in the world*, closing over every biome at once. That
 * is the right question for "is the ending reachable" and the wrong one for
 * "can the player do anything at all in their first minute", because it never
 * asks where the player is standing.
 *
 * It therefore passed while 71% of new worlds opened in a biome with no
 * bare-hands route to wood, and every tool in the game costs wood. The player
 * spawned in the White Waste holding nothing, next to pine trees that answer
 * "Requires an Axe" and rock that answers "Requires a Pickaxe", with no map and
 * no reason to think the fix was to walk.
 *
 * So this asks the local question: standing where the game puts you, with
 * nothing in your hands, can you reach the first tool?
 */
import { describe, expect, it } from 'vitest';
import { reseedNoise } from '../noise';
import { biomeAt, biomeStrength, PROFILES, type Biome } from '../biomes';
import { CRAFTING_RECIPES as RECIPES } from '../../core/recipes';
import { GATES, HARVEST_DROPS } from '../../systems/harvesting';
import type { EntityType, ItemType } from '../../core/types';

/** Seeds to check. Fixed, so a failure is reproducible. */
const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);

/** What grassland scatters in every chunk, unconditionally (worldgen step 5). */
const MEADOW_SCATTER: EntityType[] = ['branch', 'small_rock', 'grass'];

/** Anything not in GATES is breakable by hand. */
const bareHanded = (type: EntityType) => !(type in GATES);

/** Every item the given entity types yield to bare hands. */
function freeItems(types: EntityType[]): Set<ItemType> {
  const out = new Set<ItemType>();
  for (const type of types) {
    if (!bareHanded(type)) continue;
    const rule = HARVEST_DROPS[type];
    if (!rule) continue;
    for (const d of rule.drops) out.add(d.type);
    for (const d of rule.unripe?.drops ?? []) out.add(d.type);
  }
  return out;
}

/** Close the crafting recipes over a starting set. */
function craftClosure(start: Set<ItemType>): Set<ItemType> {
  const have = new Set(start);
  for (let pass = 0; pass < 12; pass++) {
    let grew = false;
    for (const r of RECIPES) {
      if (have.has(r.output)) continue;
      if (r.ingredients.every((i) => have.has(i.type))) {
        have.add(r.output);
        grew = true;
      }
    }
    if (!grew) break;
  }
  return have;
}

describe('a new game can be started', () => {
  it('spawns the player in the meadows on every seed', () => {
    const wrong: { seed: number; biome: Biome }[] = [];
    for (const seed of SEEDS) {
      reseedNoise(seed);
      const biome = biomeAt(0, 0);
      if (biome !== 'grassland') wrong.push({ seed, biome });
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('puts no biome border inside the starting chunk', () => {
    // A spawn one chunk from the Dust Flats is a spawn where half the starting
    // area grows cactus. The whole 3x3 should be meadow.
    const bad: number[] = [];
    for (const seed of SEEDS) {
      reseedNoise(seed);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (biomeAt(dx, dy) !== 'grassland') bad.push(seed);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    // And it should be properly inside the region, not scraping the threshold.
    for (const seed of SEEDS.slice(0, 50)) {
      reseedNoise(seed);
      expect(biomeStrength(0, 0)).toBe(1);
    }
  });

  it('reaches the first tool from bare hands at spawn', () => {
    // Grassland's scatter is unconditional: branches and loose rock in every
    // chunk. That is the bootstrap, and it must survive the recipe closure.
    const reachable = craftClosure(freeItems(MEADOW_SCATTER));
    expect(reachable).toContain('wood');
    expect(reachable).toContain('stone');
    expect(reachable).toContain('wooden_axe');
    expect(reachable).toContain('wooden_pickaxe');
    expect(reachable).toContain('workbench');
  });

  it('documents that the other three biomes cannot bootstrap alone', () => {
    // Not a defect — it is why spawn is pinned to the meadows. If a future
    // change gives one of these a bare-hands wood source, this test will fail
    // and the spawn pin can be reconsidered rather than silently kept.
    for (const biome of ['desert', 'snow', 'swamp'] as const) {
      const types = PROFILES[biome].spawns.map((s) => s.type);
      // Ground cover the biome branch also scatters.
      types.push(biome === 'snow' ? 'small_rock' : 'grass');
      const reachable = craftClosure(freeItems(types));
      expect(reachable.has('wooden_axe')).toBe(false);
    }
  });
});
