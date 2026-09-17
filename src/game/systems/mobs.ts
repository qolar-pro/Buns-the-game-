/**
 * Hostile behaviour data.
 *
 * Kept as tables rather than branches for the same reason as the tool gates:
 * adding a mob should be a row, not a new `else if` in three separate files.
 */
import type { EnemyKind, ItemType } from '../core/types';

export interface MobProfile {
  /** Shown in the message when it kills you. */
  name: string;
  health: number;
  damage: number;
  speed: number;
  /** How far it notices the player. */
  aggroRange: number;
  /** Surface mobs only come out at night. */
  nocturnal: boolean;
  /**
   * Shoots instead of closing. A ranged mob keeps its distance, which is what
   * makes cover and a bow of your own worth having.
   */
  ranged?: { damage: number; speed: number; cooldown: number; keepAway: number };
}

export const MOBS: Record<EnemyKind, MobProfile> = {
  // Predates the content update; kept as it was.
  static: { name: 'Shade', health: 20, damage: 5, speed: 0, aggroRange: 0, nocturnal: true },
  wolf: { name: 'Wolf', health: 30, damage: 8, speed: 3.2, aggroRange: 420, nocturnal: true },

  husk: { name: 'Husk', health: 55, damage: 10, speed: 1.4, aggroRange: 360, nocturnal: true },
  crawler: { name: 'Crawler', health: 16, damage: 5, speed: 2.8, aggroRange: 460, nocturnal: false },
  // The one mob that fights at range. It was designed that way and shipped as
  // a slow melee mob, which made it strictly worse than a crawler.
  sentinel: {
    name: 'Sentinel', health: 45, damage: 10, speed: 1.2, aggroRange: 520, nocturnal: false,
    ranged: { damage: 9, speed: 7, cooldown: 1800, keepAway: 260 },
  },
  warden: { name: 'The Warden', health: 260, damage: 18, speed: 1.5, aggroRange: 700, nocturnal: false },

  // Biome natives. Each is out during the day, because a biome you can only
  // meet at night is a biome most players never meet at all.
  scorpion: { name: 'Sand Scorpion', health: 28, damage: 9, speed: 2.4, aggroRange: 340, nocturnal: false },
  frost_wolf: { name: 'Frost Wolf', health: 46, damage: 12, speed: 3.4, aggroRange: 480, nocturnal: false },
  bog_lurker: { name: 'Bog Lurker', health: 70, damage: 11, speed: 1.3, aggroRange: 300, nocturnal: false },
};

export interface MobDrop {
  type: ItemType;
  count: number;
}

/**
 * What a mob leaves behind.
 *
 * The Warden's signal core is the only one that gates progress — everything
 * else is a material. Rolled per kill, so a run that fights more is richer.
 */
export function enemyDrops(kind: EnemyKind): MobDrop[] {
  const roll = Math.random();
  switch (kind) {
    case 'wolf':
      return [{ type: 'leather', count: 1 + Math.floor(roll * 2) }];
    case 'husk':
      return [
        { type: 'scrap_metal', count: 1 + Math.floor(roll * 3) },
        ...(roll < 0.3 ? [{ type: 'copper_ore' as ItemType, count: 1 }] : []),
      ];
    case 'crawler':
      return roll < 0.5 ? [{ type: 'scrap_metal', count: 1 }] : [];
    case 'sentinel':
      return [
        { type: 'scrap_metal', count: 2 + Math.floor(roll * 3) },
        ...(roll < 0.35 ? [{ type: 'iron_ingot' as ItemType, count: 1 }] : []),
      ];
    case 'scorpion':
      return [
        { type: 'plant_fiber', count: 1 },
        ...(roll < 0.4 ? [{ type: 'cactus_flesh' as ItemType, count: 1 }] : []),
      ];
    case 'frost_wolf':
      // The only source of thick fur, and therefore of the warmest armour set.
      return [
        { type: 'thick_fur', count: 1 + Math.floor(roll * 2) },
        { type: 'leather', count: 1 },
      ];
    case 'bog_lurker':
      return [
        { type: 'reed_bundle', count: 1 + Math.floor(roll * 2) },
        ...(roll < 0.25 ? [{ type: 'glow_moss' as ItemType, count: 1 }] : []),
      ];
    case 'warden':
      return [
        { type: 'signal_core', count: 1 },
        { type: 'titanium_ingot', count: 4 },
        { type: 'wardens_key', count: 1 },
      ];
    case 'static':
    default:
      return [];
  }
}

/** True when this kind should only spawn on the surface after dark. */
export function isNocturnal(kind: EnemyKind): boolean {
  return MOBS[kind].nocturnal;
}
