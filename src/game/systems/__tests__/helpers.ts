import { INVENTORY_SLOTS } from '../../core/config';
import type { GameState, InventorySlot } from '../../core/types';

/**
 * A GameState for exercising the pure systems.
 *
 * It started minimal — only the fields the system under test read — and grew a
 * field at a time as tests hit `undefined`. That is the wrong shape: a fixture
 * missing `enemies` does not fail honestly, it throws inside the system and
 * looks like a bug in the code under test. Every collection a system might walk
 * is present and empty now, and the numbers a system might subtract are zero.
 */
export function makeState(slots: (InventorySlot | null)[] = []): GameState {
  const inventory: (InventorySlot | null)[] = Array.from(
    { length: INVENTORY_SLOTS },
    (_, i) => slots[i] ?? null,
  );
  return {
    width: 1280,
    height: 720,
    camera: { x: 0, y: 0 },
    player: {
      x: 0,
      y: 0,
      health: 100,
      hunger: 100,
      defense: 0,
      speedMultiplier: 1,
      facing: 'down',
      selectedSlot: 0,
      isSprinting: false,
      inventory,
      equipment: { head: null, torso: null, legs: null, feet: null, back: null },
    },
    isWorkbenchOpen: false,
    isInventoryOpen: false,
    openChestId: null,
    selectedResourceId: null,
    selectedAnimalId: null,
    resources: new Map(),
    generatedChunks: new Set(),
    items: [],
    animals: [],
    enemies: [],
    particles: [],
    floatingTexts: [],
    time: 8 * 60,
    shake: 0,
    message: null,
    lastEatTime: 0,
    level: { kind: 'surface' },
    questsDone: [],
    npcs: [],
    projectiles: [],
    lastShotAt: 0,
    villagesFound: [],
    talkingToId: null,
    hoveredPick: null,
    requestsDone: [],
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
      endingKind: null,
      settleArmed: false,
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
