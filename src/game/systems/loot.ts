/**
 * Dungeon loot tables.
 *
 * Weighted rolls per depth, so going deeper is always worth it but never
 * guaranteed. Kept pure and data-driven: a table is a list, not a switch, so
 * balancing is editing numbers rather than editing logic — and it is testable
 * without a browser.
 */
import type { ItemType } from '../core/types';

export interface LootEntry {
  type: ItemType;
  /** Relative weight within its table. */
  weight: number;
  min: number;
  max: number;
  /** One per run: once taken, never rolled again. */
  unique?: boolean;
}

export type Depth = 1 | 2 | 3;

/**
 * Depth 1 — Ruins. Materials and a first taste of gear; nothing here is
 * exciting on its own, but it pays for the trip down.
 */
const DEPTH_1: LootEntry[] = [
  { type: 'scrap_metal', weight: 30, min: 2, max: 5 },
  { type: 'coal', weight: 20, min: 2, max: 4 },
  { type: 'copper_ore', weight: 18, min: 1, max: 3 },
  { type: 'bandage', weight: 12, min: 1, max: 2 },
  { type: 'ration', weight: 10, min: 1, max: 2 },
  { type: 'rope', weight: 8, min: 1, max: 2 },
  { type: 'iron_ingot', weight: 6, min: 1, max: 2 },
  { type: 'leather_cap', weight: 4, min: 1, max: 1 },
  { type: 'throwing_knife', weight: 6, min: 2, max: 4 },
  { type: 'lantern', weight: 3, min: 1, max: 1, unique: true },
];

/** Depth 2 — Deep ruins. Where the real gear starts. */
const DEPTH_2: LootEntry[] = [
  { type: 'scrap_metal', weight: 20, min: 3, max: 7 },
  { type: 'iron_ingot', weight: 18, min: 2, max: 4 },
  { type: 'copper_ingot', weight: 14, min: 2, max: 4 },
  { type: 'titanium_ore', weight: 12, min: 1, max: 3 },
  { type: 'bandage', weight: 10, min: 2, max: 3 },
  { type: 'leather_tunic', weight: 6, min: 1, max: 1 },
  { type: 'leather_boots', weight: 6, min: 1, max: 1 },
  { type: 'throwing_knife', weight: 8, min: 4, max: 8 },
  { type: 'lantern', weight: 5, min: 1, max: 1, unique: true },
  { type: 'prospectors_pick', weight: 3, min: 1, max: 1, unique: true },
  { type: 'survivors_log', weight: 6, min: 1, max: 1 },
];

/** Depth 3 — The Vault. Uniques, and the parts nothing else provides. */
const DEPTH_3: LootEntry[] = [
  { type: 'titanium_ingot', weight: 22, min: 2, max: 5 },
  { type: 'titanium_ore', weight: 16, min: 3, max: 6 },
  { type: 'iron_ingot', weight: 12, min: 4, max: 8 },
  { type: 'bandage', weight: 8, min: 3, max: 5 },
  { type: 'relic_blade', weight: 6, min: 1, max: 1, unique: true },
  { type: 'prospectors_pick', weight: 6, min: 1, max: 1, unique: true },
  { type: 'wardens_key', weight: 10, min: 1, max: 1, unique: true },
  { type: 'survivors_log', weight: 10, min: 1, max: 1 },
  { type: 'copper_wiring', weight: 14, min: 3, max: 6 },
];

const TABLES: Record<Depth, LootEntry[]> = { 1: DEPTH_1, 2: DEPTH_2, 3: DEPTH_3 };

/** How many stacks a chest holds, by depth. */
const ROLLS: Record<Depth, [number, number]> = { 1: [1, 2], 2: [2, 3], 3: [3, 4] };

export interface RolledLoot {
  type: ItemType;
  count: number;
}

/**
 * Roll a chest's contents.
 *
 * `taken` carries the uniques already claimed this run, so a second lantern
 * never drops. The caller owns that set, which keeps this function pure.
 */
export function rollChest(
  depth: Depth,
  taken: Set<ItemType>,
  random: () => number = Math.random,
): RolledLoot[] {
  const table = TABLES[depth].filter((e) => !(e.unique && taken.has(e.type)));
  if (!table.length) return [];

  const [minRolls, maxRolls] = ROLLS[depth];
  const rolls = minRolls + Math.floor(random() * (maxRolls - minRolls + 1));
  const out: RolledLoot[] = [];

  for (let i = 0; i < rolls; i++) {
    const available = table.filter((e) => !(e.unique && taken.has(e.type)));
    if (!available.length) break;

    const total = available.reduce((n, e) => n + e.weight, 0);
    let pick = random() * total;
    let chosen = available[available.length - 1];
    for (const entry of available) {
      pick -= entry.weight;
      if (pick <= 0) {
        chosen = entry;
        break;
      }
    }

    if (chosen.unique) taken.add(chosen.type);
    const count = chosen.min + Math.floor(random() * (chosen.max - chosen.min + 1));
    out.push({ type: chosen.type, count });
  }

  return out;
}

/** Everything a table can yield, for tests and for the quest log's hints. */
export function possibleLoot(depth: Depth): ItemType[] {
  return TABLES[depth].map((e) => e.type);
}
