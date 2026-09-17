/**
 * Bows, crossbows and arrows in flight.
 *
 * Arrows are simulated rather than hitscan: they travel, they can miss, and
 * they land on the ground where you can pick them up again. That last part is
 * what keeps ammunition from being a tax — a fight you win cleanly costs you
 * almost nothing, and a fight you flail through costs you a trip to the fen.
 *
 * Pure: given state and dt it moves arrows, damages things and nothing else.
 */
import { soundManager } from '../../../lib/SoundManager';
import { MOBS, enemyDrops } from './mobs';
import type { GameState, ItemType } from '../core/types';

export interface Launcher {
  /** Ammunition it fires. First match in the pack is used. */
  ammo: ItemType[];
  /** Added to the arrow's own damage. */
  power: number;
  /** World units per tick. */
  speed: number;
  /** Ticks between shots. */
  cooldown: number;
}

export const LAUNCHERS: Partial<Record<ItemType, Launcher>> = {
  // The bow is quick and cheap; the crossbow hits far harder but makes you
  // commit to the shot.
  bow: { ammo: ['iron_arrow', 'arrow'], power: 6, speed: 13, cooldown: 26 },
  crossbow: { ammo: ['iron_arrow', 'arrow'], power: 14, speed: 18, cooldown: 64 },
};

export const AMMO: Partial<Record<ItemType, { damage: number; recover: number }>> = {
  // `recover` is the chance the arrow survives to be picked up again.
  arrow: { damage: 5, recover: 0.6 },
  iron_arrow: { damage: 11, recover: 0.75 },
};

/** True when the held item shoots. */
export function isLauncher(type: ItemType): boolean {
  return type in LAUNCHERS;
}

/** How far an arrow flies before dropping, in ticks. */
const LIFETIME = 70;

/** Anything within this of an arrow's tip is hit. */
const HIT_RADIUS = 46;

export interface RangedDeps {
  countItem: (type: ItemType) => number;
  removeFromInventory: (type: ItemType, count: number) => void;
  spawnItem: (type: ItemType, x: number, y: number, count: number) => void;
}

/**
 * Fire the held launcher, if it is one and there is ammunition for it.
 *
 * Returns a reason rather than a boolean so the caller can say what went wrong;
 * "nothing happened when I pressed the button" is the worst possible feedback
 * for a weapon.
 */
export type ShootResult = 'ok' | 'not-a-launcher' | 'no-ammo' | 'cooling-down';

export function shoot(state: GameState, now: number, deps: RangedDeps): ShootResult {
  const held = state.player.inventory[state.player.selectedSlot];
  if (!held) return 'not-a-launcher';
  const launcher = LAUNCHERS[held.type];
  if (!launcher) return 'not-a-launcher';

  if (now - state.lastShotAt < launcher.cooldown * 16) return 'cooling-down';

  const round = launcher.ammo.find((a) => deps.countItem(a) > 0);
  if (!round) return 'no-ammo';

  deps.removeFromInventory(round, 1);
  state.lastShotAt = now;

  // Aim where the player faces. Mouse aiming would be better on desktop and
  // impossible on touch, and the game has to play the same on both.
  const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[state.player.facing] ?? [1, 0];

  state.projectiles.push({
    id: `arrow-${now}-${Math.random()}`,
    x: state.player.x + 64,
    y: state.player.y + 64,
    vx: dir[0] * launcher.speed,
    vy: dir[1] * launcher.speed,
    damage: (AMMO[round]?.damage ?? 4) + launcher.power,
    life: LIFETIME,
    type: round,
  });

  soundManager.playHit();
  return 'ok';
}

/**
 * Advance every arrow, hit what they reach, and drop the survivors.
 *
 * Enemies are checked before animals so a shot into a crowd kills the thing
 * trying to kill you rather than the cow behind it.
 */
export function updateProjectiles(state: GameState, dt: number, deps: RangedDeps): void {
  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const p = state.projectiles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    let consumed = false;

    // A mob's bolt looks for the player and ignores everything else; friendly
    // fire between a sentinel and a crawler would be funny once and then be a
    // fight the player never has to take part in.
    if (p.hostile) {
      const px = state.player.x + 64;
      const py = state.player.y + 64;
      if (Math.hypot(px - p.x, py - p.y) < HIT_RADIUS) {
        state.player.health -= Math.max(1, p.damage - state.player.defense);
        state.shake = 12;
        soundManager.playHit();
        consumed = true;
      }
      if (consumed || p.life <= 0) state.projectiles.splice(i, 1);
      continue;
    }

    for (let e = state.enemies.length - 1; e >= 0 && !consumed; e -= 1) {
      const enemy = state.enemies[e];
      if (Math.hypot(enemy.x - p.x, enemy.y - p.y) > HIT_RADIUS) continue;

      enemy.health -= p.damage;
      state.shake = 6;
      soundManager.playHit();
      consumed = true;

      if (enemy.health <= 0) {
        state.enemies.splice(e, 1);
        state.progress.mobsDefeated += 1;
        for (const drop of enemyDrops(enemy.type)) {
          deps.spawnItem(drop.type, enemy.x, enemy.y, drop.count);
        }
        if (enemy.type === 'warden') {
          state.progress.wardenDefeated = true;
          state.message = { text: `${MOBS.warden.name} falls.`, time: Date.now() + 4000 };
        }
      }
    }

    if (!consumed) {
      for (let a = state.animals.length - 1; a >= 0 && !consumed; a -= 1) {
        const animal = state.animals[a];
        if (Math.hypot(animal.x - p.x, animal.y - p.y) > HIT_RADIUS) continue;
        animal.health -= p.damage;
        animal.state = 'panic';
        animal.timer = 3000;
        consumed = true;
      }
    }

    if (consumed || p.life <= 0) {
      // A spent arrow is usually recoverable, whether it hit or fell short.
      const spec = AMMO[p.type];
      if (spec && Math.random() < spec.recover) {
        deps.spawnItem(p.type, p.x, p.y, 1);
      }
      state.projectiles.splice(i, 1);
    }
  }
}
