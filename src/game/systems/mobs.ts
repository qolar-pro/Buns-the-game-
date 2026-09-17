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
}

export const MOBS: Record<EnemyKind, MobProfile> = {
  // Predates the content update; kept as it was.
  static: { name: 'Shade', health: 20, damage: 5, speed: 0, aggroRange: 0, nocturnal: true },
  wolf: { name: 'Wolf', health: 30, damage: 8, speed: 3.2, aggroRange: 420, nocturnal: true },

  husk: { name: 'Husk', health: 55, damage: 10, speed: 1.4, aggroRange: 360, nocturnal: true },
  crawler: { name: 'Crawler', health: 16, damage: 5, speed: 2.8, aggroRange: 460, nocturnal: false },
  sentinel: { name: 'Sentinel', health: 45, damage: 10, speed: 1.2, aggroRange: 520, nocturnal: false },
  warden: { name: 'The Warden', health: 260, damage: 18, speed: 1.5, aggroRange: 700, nocturnal: false },
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
