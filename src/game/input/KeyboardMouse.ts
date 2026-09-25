/**
 * Keyboard and mouse input.
 *
 * Moved out of components/Game.tsx. These write into the same key set the touch
 * layer synthesises into, so both input paths feed one set of systems.
 */
import { type ColliderShape } from '../../../lib/SpriteCollider';
import { soundManager } from '../../../lib/SoundManager';
import { CHUNK_SIZE, PLAYER_SIZE } from '../core/config';
import { applyPick, pickAt } from '../systems/picking';
import { placeHeld } from '../systems/building';
import type { AnimalType, EntityType, GameState, ItemType, Resource } from '../core/types';

export interface InputDeps {
  state: GameState;
  /** Held keys, by KeyboardEvent.code. Shared with the touch layer. */
  keys: Set<string>;
  /** One-shot presses awaiting consumption by the update tick. */
  latched: Set<string>;
  colliders: Map<string, ColliderShape>;
  canvas: () => HTMLCanvasElement | null;
  refreshUI: () => void;
  removeFromInventory: (type: ItemType, count: number) => boolean;
  /** True when the resource was placed; false when the spot was refused. */
  spawnResource: (
    forceType: EntityType, forceX?: number, forceY?: number,
    chunkX?: number, chunkY?: number, rng?: () => number,
  ) => boolean;
  getResourceDimensions: (
    type: EntityType, scale: number, growthStage?: number, rockIndex?: number,
  ) => { w: number; h: number };
  setPaused: (paused: boolean) => void;
  setPauseMenuState: (view: 'main' | 'settings') => void;
  /** Sheet metrics for hit-testing animals; supplied by the renderer. */
  getAnimalSpriteInfo: (type: AnimalType) => {
    w: number; h: number; imgUrl: string; rows: number; cols: number;
    hasLabelCol: boolean; hasLabelRow: boolean; labelHeight: number;
  };
}

/**
 * Bind the handlers to a state and its helpers.
 *
 * A factory so the handler bodies moved across unchanged rather than being
 * rewritten around a new argument shape.
 */
/** Keys the update tick consumes once per press rather than reading as held. */
const LATCHED_KEYS = new Set(['Space', 'KeyE', 'KeyR', 'KeyN', 'KeyF']);

/** How far from the player a click can select something, in world units. */
const CLICK_REACH = 600;

export function createInputHandlers({
  state, keys, latched, colliders, canvas, refreshUI,
  removeFromInventory, spawnResource, getResourceDimensions, setPaused, setPauseMenuState,
  getAnimalSpriteInfo,
}: InputDeps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    soundManager.resume();
  
    if (e.code === 'Escape') {
      state.isPaused = !state.isPaused;
      setPaused(state.isPaused);
      setPauseMenuState('main');
      return;
    }

    keys.add(e.code);
    // One-shot actions are consumed by the update tick, which runs at most once
    // per frame. A tap shorter than a frame would otherwise be added and removed
    // by keyup before the tick ever saw it — dropped input, and the faster the
    // machine the more often it happens.
    if (LATCHED_KEYS.has(e.code)) latched.add(e.code);

    if (e.shiftKey || e.key === 'Shift') {
      keys.add('Shift');
      keys.add('ShiftLeft');
      keys.add('ShiftRight');
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    // A latched key stays readable until the tick consumes it.
    if (!latched.has(e.code)) keys.delete(e.code);
    if (e.key === 'Shift') {
      keys.delete('Shift');
      keys.delete('ShiftLeft');
      keys.delete('ShiftRight');
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    soundManager.resume();
    const el = canvas();
    if (!el) return;
    if (!canvas) return;
    const rect = el.getBoundingClientRect();
    // Use Math.floor for pixel-perfect alignment with the canvas grid
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * state.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * state.height);
  
    if (e.button === 0) {
      if (state.isInventoryOpen) {
        // Handled by React UI
      } else {
        // Everything clickable goes through one hit test: bounding box, then
        // the sprite's own collider polygon, topmost first. It used to be
        // written out here for resources and again for animals, with animals
        // getting a different anchor convention and resources getting whichever
        // one the chunk map yielded first.
        const worldX = x + state.camera.x;
        const worldY = y + state.camera.y;
        applyPick(state, pickAt(state, worldX, worldY, {
          colliders, getResourceDimensions, getAnimalSpriteInfo,
        }, CLICK_REACH));
      }
    } else if (e.button === 2) {
      state.isRightMouseDown = true;
      // Right click interaction
      const worldX = x + state.camera.x;
      const worldY = y + state.camera.y;

      // Check if right-clicking on a workbench, chest, or furnace
      const pcx = Math.floor(worldX / CHUNK_SIZE);
      const pcy = Math.floor(worldY / CHUNK_SIZE);
      let clickedWorkbench: Resource | null = null;

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const chunkId = `${pcx + dx},${pcy + dy}`;
          const chunkResources = state.resources.get(chunkId);
          if (chunkResources) {
            for (const res of chunkResources) {
              if (res.type === 'workbench' || res.type === 'chest' || res.type === 'furnace') {
                const dims = getResourceDimensions(res.type, res.scale, res.growthStage, res.rockIndex);
                if (worldX >= res.x && worldX <= res.x + dims.w && worldY >= res.y && worldY <= res.y + dims.h) {
                  clickedWorkbench = res;
                  break;
                }
              }
            }
          }
          if (clickedWorkbench) break;
        }
        if (clickedWorkbench) break;
      }

      if (clickedWorkbench) {
        // Check reach
        const px = state.player.x + PLAYER_SIZE / 2;
        const py = state.player.y + PLAYER_SIZE * 0.85;
        const dims = getResourceDimensions(clickedWorkbench.type, clickedWorkbench.scale, clickedWorkbench.growthStage, clickedWorkbench.rockIndex);
        const tx = clickedWorkbench.x + dims.w / 2;
        const ty = clickedWorkbench.y + dims.h / 2;
        const dist = Math.sqrt(Math.pow(px - tx, 2) + Math.pow(py - ty, 2));

        if (dist < 200) {
          if (clickedWorkbench.type === 'workbench') {
            state.isInventoryOpen = true;
            state.isWorkbenchOpen = true;
            state.message = { text: "Workbench opened", time: Date.now() };
            refreshUI();
          } else if (clickedWorkbench.type === 'chest') {
            if (!clickedWorkbench.inventory) {
              clickedWorkbench.inventory = Array(27).fill(null);
            }
            state.isInventoryOpen = true;
            state.openChestId = clickedWorkbench.id;
            state.message = { text: "Chest opened", time: Date.now() };
            refreshUI();
          } else if (clickedWorkbench.type === 'furnace') {
            if (!clickedWorkbench.inventory) {
              clickedWorkbench.inventory = Array(3).fill(null); // input, fuel, output
            }
            state.isInventoryOpen = true;
            state.openChestId = clickedWorkbench.id; // Reuse openChestId for furnace
            state.message = { text: "Furnace opened", time: Date.now() };
            refreshUI();
          }
          return;
        } else {
          state.message = { text: "Too far", time: Date.now() };
        }
      }

      // Right click placement - places in front of the player.
      if (!state.isInventoryOpen) {
        placeHeld(state, {
          getResourceDimensions,
          spawnResource,
          removeFromInventory,
          onPlaced: () => soundManager.playPlace(),
        });
      }
    }
  };

  const handleContextMenu = (e: MouseEvent) => e.preventDefault();

  const handleMouseMove = (e: MouseEvent) => {
    const el = canvas();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * state.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * state.height);
    state.mousePos = { x, y };

    // Hover highlights what a click would act on. Selection used to happen only
    // on click, so the player found out what they had aimed at by swinging at
    // it — and the renderer's targeted-object highlight had almost nothing to
    // draw.
    if (state.isInventoryOpen || state.talkingToId) return;
    state.hoveredPick = pickAt(state, x + state.camera.x, y + state.camera.y, {
      colliders, getResourceDimensions, getAnimalSpriteInfo,
    }, CLICK_REACH);
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (e.button === 2) {
      state.isRightMouseDown = false;
    }
  };

  return {
    handleKeyDown, handleKeyUp, handleMouseDown,
    handleContextMenu, handleMouseMove, handleMouseUp,
  };
}

export type InputHandlers = ReturnType<typeof createInputHandlers>;
