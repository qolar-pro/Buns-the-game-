/**
 * Choosing what the player is about to act on.
 *
 * On desktop the target is whatever the mouse is over — `selectedResourceId` is
 * set by the hover handler. Touch has no hover, so the action button had nothing
 * selected and did nothing: harvesting was impossible on a phone even though the
 * button was there. This picks the nearest valid target instead, which is the
 * "tap-to-interact on the nearest valid target" the touch layer needs.
 */
import { PLAYER_SIZE } from '../core/config';
import type { GameState } from '../core/types';

/** How far the player can reach, in world units. */
export const REACH = 170;

/**
 * Select the nearest resource or animal within reach.
 *
 * Resources win ties against animals at equal distance: gathering is the common
 * case, and accidentally hitting a cow while chopping a tree is worse than the
 * reverse.
 */
export function selectNearestTarget(state: GameState): boolean {
  const px = state.player.x + PLAYER_SIZE / 2;
  const py = state.player.y + PLAYER_SIZE / 2;

  let bestResource: string | null = null;
  let bestResourceDist = REACH;

  for (const [, chunk] of state.resources) {
    for (const res of chunk) {
      const d = Math.hypot(res.x - px, res.y - py);
      if (d < bestResourceDist) {
        bestResourceDist = d;
        bestResource = res.id;
      }
    }
  }

  let bestAnimal: string | null = null;
  let bestAnimalDist = REACH;
  for (const animal of state.animals) {
    const d = Math.hypot(animal.x - px, animal.y - py);
    if (d < bestAnimalDist) {
      bestAnimalDist = d;
      bestAnimal = animal.id;
    }
  }

  if (bestResource && bestResourceDist <= bestAnimalDist) {
    state.selectedResourceId = bestResource;
    state.selectedAnimalId = null;
    return true;
  }
  if (bestAnimal) {
    state.selectedAnimalId = bestAnimal;
    state.selectedResourceId = null;
    return true;
  }
  return false;
}
