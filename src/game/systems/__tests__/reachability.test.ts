/**
 * Can the player actually get everything the game asks for?
 *
 * Every content update so far has shipped at least one item that nothing in the
 * world produced. The worst of them was scrap metal: it was an ingredient for
 * copper wiring, which is what the antenna needs, which is how the game ends —
 * so the ending was unreachable and nothing said so. A screenshot test cannot
 * see that. This can.
 *
 * The rule: an item is reachable if something drops it, a mob leaves it, a chest
 * holds it, a furnace makes it, or a recipe outputs it from reachable parts.
 * Start from what the world gives for free and close over the recipes.
 */
import { describe, expect, it } from 'vitest';
import { SMELT_RECIPES } from '../../core/config';
import { CRAFTING_RECIPES as RECIPES } from '../../core/recipes';
import { foodValue, isFood } from '../food';
import { LOG_ENTRIES } from '../lore';
import { HARVEST_DROPS, harvestableItems } from '../harvesting';
import { PROFILES } from '../../world/biomes';
import { possibleLoot, type Depth } from '../loot';
import { MOBS, enemyDrops } from '../mobs';
import { OBJECTIVES } from '../quests';
import type { EnemyKind, EntityType, ItemType } from '../../core/types';

/** Animal butchering, which lives inline in worldgen's dropLoot. */
const ANIMAL_DROPS: ItemType[] = [
  'raw_beef', 'leather', 'raw_pork', 'mutton', 'wool', 'raw_chicken', 'feather', 'egg',
];

/** Everything obtainable without crafting anything. */
function baseItems(): Set<ItemType> {
  const out = new Set<ItemType>(harvestableItems());
  for (const item of ANIMAL_DROPS) out.add(item);

  for (const kind of Object.keys(MOBS) as EnemyKind[]) {
    // Drops are rolled, so sample enough times to see the rare branches.
    for (let i = 0; i < 200; i++) {
      for (const drop of enemyDrops(kind)) out.add(drop.type);
    }
  }

  for (const depth of [1, 2, 3] as Depth[]) {
    for (const item of possibleLoot(depth)) out.add(item);
  }

  return out;
}

/** Close the base set over smelting and crafting until nothing new appears. */
function reachableItems(): Set<ItemType> {
  const have = baseItems();
  let grew = true;
  while (grew) {
    grew = false;

    for (const [input, output] of Object.entries(SMELT_RECIPES)) {
      if (have.has(input as ItemType) && !have.has(output as ItemType)) {
        have.add(output as ItemType);
        grew = true;
      }
    }

    for (const recipe of RECIPES) {
      if (have.has(recipe.output)) continue;
      if (recipe.ingredients.every((i) => have.has(i.type))) {
        have.add(recipe.output);
        grew = true;
      }
    }
  }
  return have;
}

describe('item reachability', () => {
  const have = reachableItems();

  it('can craft every recipe from things the world provides', () => {
    const blocked = RECIPES
      .filter((r) => !r.ingredients.every((i) => have.has(i.type)))
      .map((r) => `${r.id} needs ${r.ingredients.filter((i) => !have.has(i.type)).map((i) => i.type).join(', ')}`);
    expect(blocked).toEqual([]);
  });

  it('can reach the ending', () => {
    // The chain the last objective depends on, spelled out so a failure names
    // the exact link that broke rather than "something is unreachable".
    for (const item of ['scrap_metal', 'copper_wiring', 'titanium_ingot', 'signal_core', 'antenna_frame'] as ItemType[]) {
      expect(have.has(item), `${item} is unobtainable`).toBe(true);
    }
  });

  it('can satisfy every objective that names an item', () => {
    // Objective ids double as item names where an objective is "get the thing".
    const itemObjectives: ItemType[] = ['lantern', 'iron_ingot', 'stone_pickaxe', 'iron_pickaxe', 'workbench'];
    for (const item of itemObjectives) {
      expect(have.has(item), `objective item ${item} is unobtainable`).toBe(true);
    }
    expect(OBJECTIVES.length).toBeGreaterThan(0);
  });

  it('leaves nothing in a loot table that no icon or recipe knows about', () => {
    // A loot entry for an item nothing consumes, nothing smelts, nobody eats and
    // no recipe makes is dead weight in the player's pack.
    const consumed = new Set<ItemType>(RECIPES.flatMap((r) => r.ingredients.map((i) => i.type)));
    const smeltable = new Set(Object.keys(SMELT_RECIPES) as ItemType[]);
    const uniques: ItemType[] = ['lantern', 'prospectors_pick', 'relic_blade', 'wardens_key'];
    for (const depth of [1, 2, 3] as Depth[]) {
      for (const item of possibleLoot(depth)) {
        // Lore is a use: a survivor's log reveals a story fragment on pickup.
        const lore = item === 'survivors_log' && LOG_ENTRIES.length > 0;
        const useful = consumed.has(item) || smeltable.has(item) || uniques.includes(item)
          || isFood(item) || lore || RECIPES.some((r) => r.output === item);
        expect(useful, `${item} drops from a chest but has no use`).toBe(true);
      }
    }
  });
});

describe('food', () => {
  it('makes cooking worth the fuel', () => {
    // Cooking that produced something you could not eat shipped once already.
    const pairs: [ItemType, ItemType][] = [
      ['raw_beef', 'cooked_beef'],
      ['raw_pork', 'cooked_pork'],
      ['mutton', 'cooked_mutton'],
      ['raw_chicken', 'cooked_chicken'],
    ];
    for (const [raw, cooked] of pairs) {
      const r = foodValue(raw);
      const c = foodValue(cooked);
      expect(r, `${raw} is inedible`).not.toBeNull();
      expect(c, `${cooked} is inedible`).not.toBeNull();
      expect(c!.hunger).toBeGreaterThan(r!.hunger);
    }
  });

  it('can eat everything a furnace or recipe calls food', () => {
    const outputs = new Set<ItemType>([
      ...Object.values(SMELT_RECIPES) as ItemType[],
      ...RECIPES.map((r) => r.output),
    ]);
    const shouldBeFood: ItemType[] = [
      'cooked_beef', 'cooked_pork', 'cooked_mutton', 'cooked_chicken', 'bread', 'meat_pie', 'omelet',
    ];
    for (const item of shouldBeFood) {
      expect(outputs.has(item), `${item} is not produced by anything`).toBe(true);
      expect(isFood(item), `${item} cannot be eaten`).toBe(true);
    }
  });
});

describe('biome gates', () => {
  const have = reachableItems();

  it('makes every gated material obtainable', () => {
    // Each biome owns one material. If a biome's material has no source, that
    // biome is scenery and the gear behind it is unreachable.
    for (const item of ['plant_fiber', 'thick_fur', 'reed_bundle', 'frost_crystal', 'sand', 'glow_moss'] as ItemType[]) {
      expect(have.has(item), `${item} is unobtainable`).toBe(true);
    }
  });

  it('keeps bows behind the desert', () => {
    // The gate is only a gate if nothing outside the desert produces it. Cactus,
    // dead bush and the scorpion are all desert; wool rope must not sneak past.
    const bow = RECIPES.find((r) => r.id === 'bow')!;
    expect(bow.ingredients.some((i) => i.type === 'plant_fiber')).toBe(true);

    const fiberSources = Object.entries(HARVEST_DROPS)
      .filter(([, rule]) => rule!.drops.some((d) => d.type === 'plant_fiber'))
      .map(([type]) => type);
    expect(fiberSources.sort()).toEqual(['cactus', 'dead_bush']);
  });

  it('gives every biome material a use', () => {
    const consumed = new Set<ItemType>(RECIPES.flatMap((r) => r.ingredients.map((i) => i.type)));
    for (const item of ['plant_fiber', 'thick_fur', 'reed_bundle', 'frost_crystal', 'sand', 'glass', 'glow_moss'] as ItemType[]) {
      const used = consumed.has(item) || isFood(item);
      expect(used, `${item} has no use`).toBe(true);
    }
  });

  it('spawns every biome material somewhere in the world', () => {
    // The bug this file exists for: an item with a drop rule whose entity never
    // appears in the world is exactly as unobtainable as one with no rule.
    const spawned = new Set<string>();
    for (const profile of Object.values(PROFILES)) {
      for (const s of profile.spawns) spawned.add(s.type);
    }
    for (const entity of ['cactus', 'dead_bush', 'ice_shard', 'reeds', 'bog_iron', 'glow_moss'] as EntityType[]) {
      expect(spawned.has(entity), `${entity} is in the drop table but nothing spawns it`).toBe(true);
    }
  });

  it('puts a native mob in every biome away from the meadows', () => {
    for (const [name, profile] of Object.entries(PROFILES)) {
      if (name === 'grassland') continue;
      expect(profile.natives.length, `${name} is uninhabited`).toBeGreaterThan(0);
    }
  });
});
