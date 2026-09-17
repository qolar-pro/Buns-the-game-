/**
 * People.
 *
 * Villagers drift around their own doorstep rather than wandering off: a
 * villager who walks into the wilderness and gets eaten by a wolf is a village
 * that empties out while the player is away, which reads as a bug however
 * simulationist it is. They are tethered to where they spawned.
 */
import { VILLAGE_RADIUS } from '../world/village';
import type { GameState, Npc } from '../core/types';

/** How far from home they will drift. */
const LEASH = 260;

const WALK_SPEED = 1.3;

/** Advance every person by `dt` ticks. */
export function updateNpcs(state: GameState, dt: number): void {
  for (const npc of state.npcs) {
    npc.timer -= dt;

    if (npc.timer <= 0) {
      if (npc.state === 'wander') {
        npc.state = 'idle';
        npc.timer = 120 + Math.random() * 300;
      } else {
        npc.state = 'wander';
        npc.timer = 120 + Math.random() * 240;
        const angle = Math.random() * Math.PI * 2;
        const reach = Math.random() * LEASH;
        npc.targetX = npc.homeX + Math.cos(angle) * reach;
        npc.targetY = npc.homeY + Math.sin(angle) * reach;
      }
    }

    npc.isMoving = false;
    if (npc.state === 'wander') {
      const dx = npc.targetX - npc.x;
      const dy = npc.targetY - npc.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 6) {
        npc.x += (dx / dist) * WALK_SPEED * dt;
        npc.y += (dy / dist) * WALK_SPEED * dt;
        npc.facing = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up');
        npc.isMoving = true;
      } else {
        npc.state = 'idle';
        npc.timer = 120 + Math.random() * 300;
      }
    }

    npc.animFrame = npc.isMoving ? (npc.animFrame + 0.12 * dt) % 4 : 0;
  }
}

/** The person nearest the player within `reach`, or null. */
export function nearestNpc(state: GameState, reach = 110): Npc | null {
  const px = state.player.x + 64;
  const py = state.player.y + 64;
  let best: Npc | null = null;
  let bestDist = reach;
  for (const npc of state.npcs) {
    const d = Math.hypot(px - npc.x, py - npc.y);
    if (d < bestDist) {
      best = npc;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Is the player standing in a settlement?
 *
 * Used for the safe haven: nothing hostile spawns here, and a bed only works
 * somewhere you would actually dare to close your eyes.
 */
export function inVillage(state: GameState): boolean {
  if (state.level.kind !== 'surface') return false;
  const px = state.player.x + 64;
  const py = state.player.y + 64;
  for (const npc of state.npcs) {
    if (Math.hypot(px - npc.homeX, py - npc.homeY) < VILLAGE_RADIUS) return true;
  }
  return false;
}
