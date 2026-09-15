/**
 * The initial game state.
 *
 * Moved out of the useRef literal it used to live in inside components/Game.tsx.
 * A factory rather than a shared constant: every new session needs its own Map,
 * Set and arrays, and a module-level object would have leaked one world's
 * resources into the next.
 */
import { INVENTORY_SLOTS, MAX_HUNGER } from './config';
import type { GameState } from './types';

/** The hour the world starts at, in minutes since midnight. */
export const START_TIME = 480; // 08:00

export function createGameState(): GameState {
  return {
    width: 800,
    height: 600,
    player: {
      x: 0,
      y: 0,
      isSprinting: false,
      health: 100,
      hunger: MAX_HUNGER,
      defense: 0,
      inventory: Array(INVENTORY_SLOTS).fill(null),
      equipment: {
        head: null,
        torso: null,
        legs: null,
        feet: null,
        back: null
      },
      selectedSlot: 0,
      facing: 'down',
      isMoving: false,
      isSitting: false,
      lastMoveTime: 0,
      animFrame: 0,
      lastStarveDamageTime: 0,
      footstepTimer: 0,
    },
    isPaused: false,
    resources: new Map(),
    items: [],
    animals: [],
    enemies: [],
    particles: [],
    floatingTexts: [],
    camera: {
      x: 0,
      y: 0,
    },
    generatedChunks: new Set(),
    time: START_TIME,
    shake: 0,
    isInventoryOpen: false,
    isWorkbenchOpen: false,
    openChestId: null,
    selectedResourceId: null,
    selectedAnimalId: null,
    draggedItem: null,
    mousePos: { x: 0, y: 0 },
    message: null,
    isRightMouseDown: false,
    lastEatTime: 0,
  };
}
