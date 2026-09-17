/**
 * Tool requirements and harvest damage.
 *
 * This was a chain of `else if (res.type === ...)` blocks that each repeated the
 * same shape: check the held item against a list, pick a damage number. Adding
 * an ore meant adding a branch. It is a table now, so a new material is a row.
 */
import type { EntityType, ItemType } from '../core/types';

export type ToolFamily = 'axe' | 'pickaxe' | 'sword';

/**
 * Tool tiers. Higher is better, and a gate is "tier N or above", so a titanium
 * pickaxe opens everything a stone one does without being listed each time.
 */
export const TOOL_TIER: Partial<Record<ItemType, { family: ToolFamily; tier: number }>> = {
  wooden_axe: { family: 'axe', tier: 1 },
  stone_axe: { family: 'axe', tier: 2 },
  iron_axe: { family: 'axe', tier: 3 },
  titanium_axe: { family: 'axe', tier: 4 },

  wooden_pickaxe: { family: 'pickaxe', tier: 1 },
  stone_pickaxe: { family: 'pickaxe', tier: 2 },
  iron_pickaxe: { family: 'pickaxe', tier: 3 },
  titanium_pickaxe: { family: 'pickaxe', tier: 4 },
  // The prospector's pick is the point of the unique: it beats the crafting tree.
  prospectors_pick: { family: 'pickaxe', tier: 5 },

  wooden_sword: { family: 'sword', tier: 1 },
  stone_sword: { family: 'sword', tier: 2 },
  iron_sword: { family: 'sword', tier: 3 },
  titanium_sword: { family: 'sword', tier: 4 },
  relic_blade: { family: 'sword', tier: 5 },
};

export interface Gate {
  family: ToolFamily;
  /** Minimum tier that can break this at all. */
  minTier: number;
  /** Damage per hit by tool tier, indexed from minTier upward. */
  damage: number[];
  /** Shown when the player lacks the tool. */
  refusal: string;
}

const PICK_REFUSAL = (tier: string) => `Requires ${tier} Pickaxe or better`;

/**
 * What each material needs. Anything absent from this table is breakable by
 * hand — bushes, saplings, placed furniture.
 */
export const GATES: Partial<Record<EntityType, Gate>> = {
  tree: { family: 'axe', minTier: 1, damage: [3, 4.5, 8, 12], refusal: 'Requires an Axe' },
  rock: { family: 'pickaxe', minTier: 1, damage: [3, 4.5, 8, 12, 99], refusal: 'Requires a Pickaxe' },

  coal_ore: { family: 'pickaxe', minTier: 2, damage: [4.5, 8, 12, 99], refusal: PICK_REFUSAL('a Stone') },
  copper_ore: { family: 'pickaxe', minTier: 2, damage: [4, 7, 11, 99], refusal: PICK_REFUSAL('a Stone') },
  iron_ore: { family: 'pickaxe', minTier: 2, damage: [3, 6, 10, 99], refusal: PICK_REFUSAL('a Stone') },
  titanium_ore: { family: 'pickaxe', minTier: 3, damage: [4, 9, 99], refusal: PICK_REFUSAL('an Iron') },

  // Biome materials. Bog iron is the fen's reward for getting there early: a
  // stone pickaxe opens it, where surface iron ore wants the same but is rarer.
  bog_iron: { family: 'pickaxe', minTier: 2, damage: [4, 7, 11, 99], refusal: PICK_REFUSAL('a Stone') },
  desert_rock: { family: 'pickaxe', minTier: 1, damage: [3, 4.5, 8, 12, 99], refusal: 'Requires a Pickaxe' },
  snow_rock: { family: 'pickaxe', minTier: 1, damage: [3, 4.5, 8, 12, 99], refusal: 'Requires a Pickaxe' },
  ice_shard: { family: 'pickaxe', minTier: 1, damage: [4, 6, 10, 14, 99], refusal: 'Requires a Pickaxe' },
  pine_tree: { family: 'axe', minTier: 1, damage: [3, 4.5, 8, 12], refusal: 'Requires an Axe' },
  swamp_tree: { family: 'axe', minTier: 1, damage: [3, 4.5, 8, 12], refusal: 'Requires an Axe' },
  palm_tree: { family: 'axe', minTier: 1, damage: [3, 4.5, 8, 12], refusal: 'Requires an Axe' },

  // The dungeon gate. Rubble is what seals a collapsed shaft, and iron is the
  // tier that opens the game up.
  rubble: { family: 'pickaxe', minTier: 3, damage: [6, 10, 99], refusal: PICK_REFUSAL('an Iron') },
  dungeon_entrance: { family: 'pickaxe', minTier: 3, damage: [5, 9, 99], refusal: PICK_REFUSAL('an Iron') },
};

export interface HarvestCheck {
  canBreak: boolean;
  damage: number;
  message: string;
}

/**
 * Can the held item break this, and for how much?
 *
 * Materials with no gate are breakable by hand for 1, with a bonus for holding
 * a sensible tool — the behaviour the old chain had for bushes and furniture.
 */
export function checkHarvest(type: EntityType, held: ItemType | null): HarvestCheck {
  const gate = GATES[type];
  const tool = held ? TOOL_TIER[held] : undefined;

  if (!gate) {
    let damage = 1;
    if (tool && (tool.family === 'axe' || tool.family === 'sword')) damage = 1 + tool.tier;
    return { canBreak: true, damage, message: '' };
  }

  if (!tool || tool.family !== gate.family || tool.tier < gate.minTier) {
    return { canBreak: false, damage: 0, message: gate.refusal };
  }

  const index = Math.min(tool.tier - gate.minTier, gate.damage.length - 1);
  return { canBreak: true, damage: gate.damage[index], message: '' };
}

/** Melee damage for the held item. Used against animals and hostiles. */
export function attackDamage(held: ItemType | null): number {
  const tool = held ? TOOL_TIER[held] : undefined;
  if (!tool) return 1;
  if (tool.family === 'sword') return [0, 5, 9, 14, 20, 32][tool.tier] ?? 5;
  // Axes and picks are worse weapons than swords, but better than fists.
  return [0, 2, 3.5, 5, 7, 9][tool.tier] ?? 2;
}

/** One roll of what breaking a thing leaves behind. */
export interface DropRule {
  /** Weighted choice of item. A single entry is the common case. */
  drops: { type: ItemType; weight: number }[];
  /** Count range, inclusive. */
  min: number;
  max: number;
  /** Count is `floor(perScale * scale)` instead, for resources that vary in size. */
  perScale?: number;
  /** Chance of yielding anything at all. */
  chance?: number;
  /** What you get for digging it up before it is ready. */
  unripe?: DropRule;
}

const one = (type: ItemType, min = 1, max = min): DropRule => ({
  drops: [{ type, weight: 1 }],
  min,
  max,
});

/**
 * What each world entity drops when broken.
 *
 * Extracted from the twenty-branch `else if` chain in interaction.ts for the
 * same reason as the gates above, and for one more: with the drops in a table,
 * a test can walk every source in the game and prove that each crafting
 * ingredient is actually obtainable. That check is what caught scrap metal
 * having no source at all, which made the antenna — the ending — unbuildable.
 */
export const HARVEST_DROPS: Partial<Record<EntityType, DropRule>> = {
  rock: { drops: [{ type: 'stone', weight: 1 }], min: 1, max: 1, perScale: 3 },
  trunk: { drops: [{ type: 'wood', weight: 1 }], min: 1, max: 1, perScale: 4 },
  coal_ore: one('coal', 1, 3),
  iron_ore: one('iron_ore', 1, 2),
  copper_ore: one('copper_ore', 1, 3),
  titanium_ore: one('titanium_ore', 1, 2),

  // Clearing rubble yields the stone it was made of, and sometimes salvage —
  // a small reason to dig out side passages rather than run straight down.
  rubble: { drops: [{ type: 'scrap_metal', weight: 1 }, { type: 'stone', weight: 3 }], min: 1, max: 2 },
  dungeon_entrance: { drops: [{ type: 'scrap_metal', weight: 1 }, { type: 'stone', weight: 3 }], min: 1, max: 2 },

  sapling: one('sapling'),
  bush: one('wood', 2),
  branch: one('wood'),
  small_rock: one('stone'),
  grass: { drops: [{ type: 'wheat_seeds', weight: 1 }], min: 1, max: 1, chance: 0.2 },

  // Ripe wheat pays for the wait; pulling it early only returns the seed.
  wheat_crop: {
    drops: [{ type: 'wheat', weight: 3 }, { type: 'wheat_seeds', weight: 1 }],
    min: 2,
    max: 3,
    unripe: { drops: [{ type: 'wheat_seeds', weight: 1 }], min: 1, max: 1 },
  },

  // --- biome materials --------------------------------------------------
  // The desert's gate: fiber is the only route to rope, and rope is the only
  // bowstring in the game.
  cactus: { drops: [{ type: 'plant_fiber', weight: 3 }, { type: 'cactus_flesh', weight: 2 }], min: 1, max: 3 },
  dead_bush: one('plant_fiber', 1, 2),
  desert_rock: { drops: [{ type: 'stone', weight: 3 }, { type: 'sand', weight: 2 }], min: 1, max: 3 },
  palm_tree: { drops: [{ type: 'wood', weight: 1 }], min: 1, max: 1, perScale: 4 },

  pine_tree: { drops: [{ type: 'wood', weight: 1 }], min: 1, max: 1, perScale: 5 },
  snow_rock: one('stone', 2, 3),
  // Frost crystals are the fur set's bonus material.
  ice_shard: { drops: [{ type: 'frost_crystal', weight: 2 }, { type: 'stone', weight: 1 }], min: 1, max: 2 },
  frost_flower: one('frost_crystal', 1, 1),

  // The fen: reeds are arrows in bulk, bog iron is a second route to metal.
  reeds: one('reed_bundle', 1, 3),
  swamp_tree: { drops: [{ type: 'wood', weight: 1 }], min: 1, max: 1, perScale: 3 },
  lily_pad: one('glow_moss', 1, 1),
  bog_iron: one('iron_ore', 2, 3),
  glow_moss: one('glow_moss', 1, 2),

  // Placed things come back, so a misplaced wall is not a wasted wall.
  torch: one('torch'),
  workbench: one('workbench'),
  campfire: one('campfire'),
  bed: one('bed'),
  chest: one('chest'),
  furnace: one('furnace'),
  anvil: one('anvil'),
  wall: one('wall'),
  floor: one('floor'),
  door: one('door'),
};

/**
 * Roll the drop for one broken entity, or null for nothing.
 *
 * `random` is injectable so the tests can pin the roll.
 */
export function rollDrop(
  type: EntityType,
  scale = 1,
  growthStage = 2,
  random: () => number = Math.random,
): { type: ItemType; count: number } | null {
  const base = HARVEST_DROPS[type];
  if (!base) return null;
  const rule = growthStage < 2 && base.unripe ? base.unripe : base;
  if (rule.chance !== undefined && random() >= rule.chance) return null;

  const total = rule.drops.reduce((n, d) => n + d.weight, 0);
  let roll = random() * total;
  let picked = rule.drops[rule.drops.length - 1].type;
  for (const d of rule.drops) {
    roll -= d.weight;
    if (roll < 0) {
      picked = d.type;
      break;
    }
  }

  const count = rule.perScale !== undefined
    ? Math.floor(rule.perScale * scale)
    : rule.min + Math.floor(random() * (rule.max - rule.min + 1));

  return count > 0 ? { type: picked, count } : null;
}

/** Every item obtainable by breaking something. Used by the reachability test. */
export function harvestableItems(): ItemType[] {
  const out = new Set<ItemType>();
  for (const rule of Object.values(HARVEST_DROPS)) {
    for (const d of rule.drops) out.add(d.type);
    for (const d of rule.unripe?.drops ?? []) out.add(d.type);
  }
  return [...out];
}

/**
 * Hits to break each entity.
 *
 * Was a four-deep nested ternary in worldgen; a table both reads better and is
 * the only place a new material's toughness has to be set.
 */
const HITS: Partial<Record<EntityType, number>> = {
  rock: 3,
  trunk: 3,
  coal_ore: 3,
  copper_ore: 4,
  iron_ore: 5,
  titanium_ore: 7,
  rubble: 4,
  dungeon_entrance: 6,
  bush: 2,
  torch: 1,
  workbench: 1,
  campfire: 1,
  branch: 1,
  small_rock: 1,
  grass: 1,
  chest: 1,
  furnace: 1,
  anvil: 2,
  wall: 2,
  floor: 1,
  door: 2,
  loot_chest: 1,
  wheat_crop: 1,
  cactus: 3,
  dead_bush: 1,
  desert_rock: 3,
  palm_tree: 6,
  pine_tree: 8,
  snow_rock: 3,
  ice_shard: 2,
  frost_flower: 1,
  reeds: 1,
  lily_pad: 1,
  swamp_tree: 6,
  bog_iron: 4,
  glow_moss: 1,
};

/**
 * How much punishment a freshly spawned entity takes.
 *
 * Things that grow are the exception: a sapling is weaker than the tree it
 * becomes, so those scale with the stage instead of using a fixed number.
 */
export function hitsToBreak(type: EntityType, growthStage = 2): number {
  return HITS[type] ?? (growthStage + 1) * 3;
}
