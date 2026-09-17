import { INVENTORY_SLOTS } from '../../core/config';
import type { GameState, InventorySlot } from '../../core/types';

/**
 * Minimal GameState for exercising the pure systems. Only the fields the
 * systems under test read are populated; the cast keeps the fixture small
 * rather than rebuilding the whole engine state for every assertion.
 */
export function makeState(slots: (InventorySlot | null)[] = []): GameState {
  const inventory: (InventorySlot | null)[] = Array.from(
    { length: INVENTORY_SLOTS },
    (_, i) => slots[i] ?? null,
  );
  return {
    player: { inventory, equipment: {} },
    isWorkbenchOpen: false,
    resources: new Map(),
    level: { kind: 'surface' },
    questsDone: [],
    progress: {
      daysSurvived: 0,
      deepestDepth: 0,
      mobsDefeated: 0,
      chestsLooted: 0,
      logsRead: 0,
      itemsCrafted: 0,
      uniquesTaken: [],
      wardenDefeated: false,
      broadcast: false,
    },
  } as unknown as GameState;
}

/** Compact view of an inventory for readable assertions. */
export function summarise(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const slot of state.player.inventory) {
    if (slot) out[slot.type] = (out[slot.type] || 0) + slot.count;
  }
  return out;
}
