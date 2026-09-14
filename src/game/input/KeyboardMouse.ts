/**
 * Keyboard and mouse input.
 *
 * Moved out of components/Game.tsx. These write into the same key set the touch
 * layer synthesises into, so both input paths feed one set of systems.
 */
import { SpriteColliderGenerator, type ColliderShape, type Point } from '../../../lib/SpriteCollider';
import { soundManager } from '../../../lib/SoundManager';
import { CHUNK_SIZE, PLAYER_SIZE } from '../core/config';
import { idForEntity } from '../assets/colliders';
import type { AnimalType, EntityType, GameState, ItemType, Resource } from '../core/types';

export interface InputDeps {
  state: GameState;
  /** Held keys, by KeyboardEvent.code. Shared with the touch layer. */
  keys: Set<string>;
  colliders: Map<string, ColliderShape>;
  canvas: () => HTMLCanvasElement | null;
  refreshUI: () => void;
  removeFromInventory: (type: ItemType, count: number) => boolean;
  /** True when the resource was placed; false when the spot was refused. */
  spawnResource: (
    forceType?: EntityType, forceX?: number, forceY?: number,
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
export function createInputHandlers({
  state, keys, colliders, canvas, refreshUI,
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
    if (e.shiftKey || e.key === 'Shift') {
      keys.add('Shift');
      keys.add('ShiftLeft');
      keys.add('ShiftRight');
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
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
        // Select resource in the world
        const worldX = x + state.camera.x;
        const worldY = y + state.camera.y;

        // Check clickable reach
        const px = state.player.x + PLAYER_SIZE / 2;
        const py = state.player.y + PLAYER_SIZE / 2;
        const distToPlayer = Math.sqrt(Math.pow(worldX - px, 2) + Math.pow(worldY - py, 2));
        const clickableReach = 600;

        if (distToPlayer < clickableReach) {
          const pcx = Math.floor(worldX / CHUNK_SIZE);
          const pcy = Math.floor(worldY / CHUNK_SIZE);
        
          let clickedResId: string | null = null;
          let clickedAnimalId: string | null = null;

          // Check animals first (they are usually on top)
          for (const animal of state.animals) {
            const { w, h, imgUrl, rows, cols: _cols, hasLabelCol: _hasLabelCol, hasLabelRow } = getAnimalSpriteInfo(animal.type);

            const shape = colliders.get(imgUrl);
            if (shape) {
              const scaleX = w / shape.originalWidth;
              const scaleY = h / shape.originalHeight;
              const ax = animal.x - w / 2;
              const ay = animal.y - h;

              let relX = worldX - ax;
              let relY = worldY - ay;
            
              const animRows = Math.max(1, hasLabelRow ? rows - 1 : rows);
              if (animRows < 3 && animal.facing === 'left') relX = w - relX;

              const localP: Point = {
                x: relX / scaleX,
                y: relY / scaleY
              };
            
              if (SpriteColliderGenerator.isPointInPolygon(localP, shape.points)) {
                clickedAnimalId = animal.id;
                break;
              }
            } else {
              // Fallback box
              if (worldX >= animal.x - 20 && worldX <= animal.x + 20 && worldY >= animal.y - 20 && worldY <= animal.y + 20) {
                clickedAnimalId = animal.id;
                break;
              }
            }
          }

          if (!clickedAnimalId) {
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                const chunkId = `${pcx + dx},${pcy + dy}`;
                const chunkResources = state.resources.get(chunkId);
                if (chunkResources) {
                  for (const res of chunkResources) {
                    const dims = getResourceDimensions(res.type, res.scale, res.growthStage, res.rockIndex);
                  
                    // Check if within bounding box first
                    if (worldX >= res.x && worldX <= res.x + dims.w && worldY >= res.y && worldY <= res.y + dims.h) {
                      // Use sprite collider for precision if available
                      let imgUrl = idForEntity(res.type as string, { growthStage: res.growthStage, rockIndex: res.rockIndex });

                      const shape = colliders.get(imgUrl);
                      if (shape) {
                        const localP: Point = {
                          x: (worldX - res.x) / (dims.w / shape.originalWidth),
                          y: (worldY - res.y) / (dims.h / shape.originalHeight)
                        };
                        if (SpriteColliderGenerator.isPointInPolygon(localP, shape.points)) {
                          clickedResId = res.id;
                          break;
                        }
                      } else {
                        // Fallback to box
                        clickedResId = res.id;
                        break;
                      }
                    }
                  }
                }
                if (clickedResId) break;
              }
              if (clickedResId) break;
            }
          }
          state.selectedResourceId = clickedResId;
          state.selectedAnimalId = clickedAnimalId;
        } else {
          // Deselect if clicking too far
          state.selectedResourceId = null;
          state.selectedAnimalId = null;
        }
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

      // Right click placement - Now places in front of player
      if (!state.isInventoryOpen) {
        const { player } = state;
        const selectedItem = player.inventory[player.selectedSlot];
        if (selectedItem && (selectedItem.type === 'torch' || selectedItem.type === 'workbench' || selectedItem.type === 'campfire' || selectedItem.type === 'sapling' || selectedItem.type === 'bed' || selectedItem.type === 'chest' || selectedItem.type === 'furnace')) {
          // Calculate position in front of player
          const offset = 130; // Increased offset to be clearly in front of the 128px player
          let targetX = player.x + PLAYER_SIZE / 2;
          let targetY = player.y + PLAYER_SIZE / 2;

          if (player.facing === 'up') targetY -= offset;
          else if (player.facing === 'down') targetY += offset;
          else if (player.facing === 'left') targetX -= offset;
          else if (player.facing === 'right') targetX += offset;
        
          // Center the item on the target position
          const dims = getResourceDimensions(selectedItem.type as EntityType, 1, selectedItem.type === 'sapling' ? 0 : 2);
          const placeX = targetX - dims.w / 2;
          const placeY = targetY - dims.h / 2;

          if (spawnResource(selectedItem.type as EntityType, placeX, placeY)) {
            removeFromInventory(selectedItem.type, 1);
          }
        }
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
