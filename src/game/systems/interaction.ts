/**
 * The interact action: harvesting, attacking, and using placed objects.
 *
 * Split out of the gameplay tick so neither file runs past 500 lines. It is
 * still called from update() — one keypress drives it — so it is a factory
 * bound to the same state rather than a free function.
 */
import { PLAYER_SIZE } from '../core/config';
import { soundManager } from '../../../lib/SoundManager';
import { addFloatingText } from './feedback';
import { SpriteColliderGenerator, type ColliderShape, type Point } from '../../../lib/SpriteCollider';
import type { Animal, AnimalType, Enemy, EntityType, GameState, ItemType, Resource } from '../core/types';

export interface InteractionDeps {
  state: GameState;
  colliders: Map<string, ColliderShape>;
  refreshUI: () => void;
  spawnItem: (type: ItemType, x: number, y: number, count: number) => void;
  dropLoot: (type: AnimalType, x: number, y: number) => void;
  getResourceDimensions: (
    type: EntityType, scale: number, growthStage?: number, rockIndex?: number,
  ) => { w: number; h: number };
  getAnimalSpriteInfo: (type: AnimalType) => {
    w: number; h: number; imgUrl: string; rows: number; cols: number;
    hasLabelCol: boolean; hasLabelRow: boolean; labelHeight: number;
  };
}

export function createInteraction({
  state, colliders, refreshUI, spawnItem, dropLoot,
  getResourceDimensions, getAnimalSpriteInfo,
}: InteractionDeps) {
  const interact = () => {
    const { player } = state;
    const px = player.x + PLAYER_SIZE / 2;
    const py = player.y + PLAYER_SIZE * 0.85;

    // Check for enemies first
    let targetEnemy: Enemy | null = null;
    let enemyIndex = -1;

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      const dist = Math.sqrt(Math.pow(px - e.x, 2) + Math.pow(py - e.y, 2));
      if (dist < 100) {
        targetEnemy = e;
        enemyIndex = i;
        break;
      }
    }

    if (targetEnemy) {
      const selectedItem = player.inventory[player.selectedSlot];
      let damage = 2;
      if (selectedItem) {
        if (selectedItem.type === 'iron_sword') damage = 15;
        else if (selectedItem.type === 'stone_sword') damage = 10;
        else if (selectedItem.type === 'wooden_sword') damage = 6;
        else if (selectedItem.type.includes('axe') || selectedItem.type.includes('pickaxe')) damage = 4;
      }
    
      targetEnemy.health -= damage;
      state.shake = 10;
      soundManager.playHit();
    
      if (targetEnemy.health <= 0) {
        if (targetEnemy.type === 'wolf') spawnItem('leather', targetEnemy.x, targetEnemy.y, 1);
        state.enemies.splice(enemyIndex, 1);
      }
      return;
    }

    // Check for animals
    let targetAnimal: Animal | null = null;
    let animalIndex = -1;

    // Prioritize selected animal if it's within range
    if (state.selectedAnimalId) {
      const idx = state.animals.findIndex(a => a.id === state.selectedAnimalId);
      if (idx !== -1) {
        const a = state.animals[idx];
        const dist = Math.sqrt(Math.pow(px - a.x, 2) + Math.pow(py - a.y, 2));
        if (dist < 150) { // Slightly larger range for selected animal
          targetAnimal = a;
          animalIndex = idx;
        }
      }
    }

    if (!targetAnimal) {
      for (let i = 0; i < state.animals.length; i++) {
        const a = state.animals[i];
        const dist = Math.sqrt(Math.pow(px - a.x, 2) + Math.pow(py - a.y, 2));
      
        if (dist < 120) {
          // Precise collider check
          const { w, h, imgUrl, rows, cols: _cols, hasLabelCol: _hasLabelCol, hasLabelRow } = getAnimalSpriteInfo(a.type);

          const shape = colliders.get(imgUrl);
          if (shape) {
            const scaleX = w / shape.originalWidth;
            const scaleY = h / shape.originalHeight;
            const ax = a.x - w / 2;
            const ay = a.y - h;

            // Check if player center is hitting the animal
            let relX = px - ax;
            let relY = py - ay;
          
            const animRows = Math.max(1, hasLabelRow ? rows - 1 : rows);
            if (animRows < 3 && a.facing === 'left') relX = w - relX;

            const localP: Point = {
              x: relX / scaleX,
              y: relY / scaleY
            };
          
            if (SpriteColliderGenerator.isPointInPolygon(localP, shape.points)) {
              targetAnimal = a;
              animalIndex = i;
              break;
            }
          } else if (dist < 60) {
            // Fallback distance
            targetAnimal = a;
            animalIndex = i;
            break;
          }
        }
      }
    }

    if (targetAnimal) {
      const selectedItem = player.inventory[player.selectedSlot];
      let damage = 2;
      if (selectedItem) {
        if (selectedItem.type === 'iron_sword') damage = 15;
        else if (selectedItem.type === 'stone_sword') damage = 10;
        else if (selectedItem.type === 'wooden_sword') damage = 6;
        else if (selectedItem.type.includes('axe') || selectedItem.type.includes('pickaxe')) damage = 4;
      }
    
      targetAnimal.health -= damage;
      soundManager.playAnimal(targetAnimal.type);
      targetAnimal.state = 'panic';
      targetAnimal.timer = 3000;
      targetAnimal.targetX = targetAnimal.x + (targetAnimal.x - px) * 2;
      targetAnimal.targetY = targetAnimal.y + (targetAnimal.y - py) * 2;
      state.shake = 5;
    
      if (targetAnimal.health <= 0) {
        dropLoot(targetAnimal.type, targetAnimal.x, targetAnimal.y);
        state.animals.splice(animalIndex, 1);
      }
      return;
    }

    if (!state.selectedResourceId) return;

    // Find the selected resource
    let selectedRes: Resource | null = null;
    let selectedChunkId: string | null = null;
    let selectedIndex: number = -1;

    for (const [chunkId, chunkResources] of state.resources.entries()) {
      const idx = chunkResources.findIndex(r => r.id === state.selectedResourceId);
      if (idx !== -1) {
        selectedRes = chunkResources[idx];
        selectedChunkId = chunkId;
        selectedIndex = idx;
        break;
      }
    }

    if (!selectedRes || !selectedChunkId) return;

    const dims = getResourceDimensions(selectedRes.type, selectedRes.scale, selectedRes.growthStage, selectedRes.rockIndex);
    const tx = selectedRes.x + dims.w / 2;
    const ty = (selectedRes.type === 'rock' || selectedRes.type === 'coal_ore' || selectedRes.type === 'branch' || selectedRes.type === 'small_rock' || selectedRes.type === 'grass') 
      ? selectedRes.y + dims.h / 2 
      : selectedRes.y + dims.h * 0.85;

    const dist = Math.sqrt(Math.pow(px - tx, 2) + Math.pow(py - ty, 2));
    const reach = 200; // Increased break reach

    if (dist < reach) {
      const res = selectedRes;
      const chunkId = selectedChunkId;
      const index = selectedIndex;
      const chunkResources = state.resources.get(chunkId)!;
    
      // Apply hits
      const selectedItem = player.inventory[player.selectedSlot];
      let damage = 1;
      let canBreak = true;
      let message = "";

      // Tool Gating Logic
      if (res.type === 'tree') {
        if (!selectedItem || (selectedItem.type !== 'wooden_axe' && selectedItem.type !== 'stone_axe' && selectedItem.type !== 'iron_axe')) {
          canBreak = false;
          message = "Requires Axe";
        } else {
          damage = selectedItem.type === 'iron_axe' ? 8 : (selectedItem.type === 'stone_axe' ? 4.5 : 3);
        }
      } else if (res.type === 'rock') {
        if (!selectedItem || (selectedItem.type !== 'wooden_pickaxe' && selectedItem.type !== 'stone_pickaxe' && selectedItem.type !== 'iron_pickaxe')) {
          canBreak = false;
          message = "Requires Pickaxe";
        } else {
          damage = selectedItem.type === 'iron_pickaxe' ? 8 : (selectedItem.type === 'stone_pickaxe' ? 4.5 : 3);
        }
      } else if (res.type === 'iron_ore') {
        if (!selectedItem || (selectedItem.type !== 'stone_pickaxe' && selectedItem.type !== 'iron_pickaxe')) {
          canBreak = false;
          message = "Requires Stone Pickaxe or higher";
        } else {
          damage = selectedItem.type === 'iron_pickaxe' ? 6 : 3;
        }
      } else if (res.type === 'coal_ore') {
        if (!selectedItem || (selectedItem.type !== 'stone_pickaxe' && selectedItem.type !== 'iron_pickaxe')) {
          canBreak = false;
          message = "Requires Stone Pickaxe or higher";
        } else {
          damage = selectedItem.type === 'iron_pickaxe' ? 8 : 4.5;
        }
      } else if (res.type === 'antenna') {
        // Antenna interaction: Contribute copper wiring
        if (selectedItem && selectedItem.type === 'copper_wiring') {
          res.antennaProgress = (res.antennaProgress || 0) + 5;
          selectedItem.count--;
          if (selectedItem.count <= 0) player.inventory[player.selectedSlot] = null;
          state.message = { text: `Antenna Restored: ${Math.min(100, res.antennaProgress)}%`, time: Date.now() };
          if (res.antennaProgress >= 100) {
            state.message = { text: "TRANSMISSION RESTORED. YOU ARE NOT ALONE.", time: Date.now() + 5000 };
          }
          refreshUI();
          return;
        } else {
          state.message = { text: "Requires Copper Wiring to restore", time: Date.now() };
          return;
        }
      } else if (res.type === 'branch' || res.type === 'small_rock' || res.type === 'grass' || res.type === 'bush' || res.type === 'sapling' || res.type === 'bed' || res.type === 'fence') {
        // Breakable by hand or any tool
        damage = 1;
        if (selectedItem) {
          if (selectedItem.type === 'wooden_axe' || selectedItem.type === 'stone_axe') {
            if (res.type === 'bush' || res.type === 'bed') damage = selectedItem.type === 'stone_axe' ? 3 : 2;
          }
        }
      }

      if (!canBreak) {
        state.message = { text: message || "Tool ineffective", time: Date.now() };
        return;
      }

      res.hits += damage;
      res.lastHitAt = Date.now();
      state.shake = 8;
    
      // Distinct per material: one sound for everything made wood and stone
      // indistinguishable by ear, which matters when harvesting off-screen.
      if (res.type === 'tree' || res.type === 'trunk' || res.type === 'branch') {
        soundManager.playHarvest('wood');
      } else if (res.type === 'bush' || res.type === 'sapling' || res.type === 'grass') {
        soundManager.playHarvest('plant');
      } else if (res.type === 'coal_ore' || res.type === 'iron_ore') {
        soundManager.playHarvest('ore');
      } else if (res.type === 'rock' || res.type === 'small_rock') {
        soundManager.playHarvest('stone');
      }

      if (res.hits >= res.maxHits) {
        if (res.type === 'tree' && res.growthStage === 2) {
          // Tree is broken
          const _oldX = res.x;
          const _oldY = res.y;

          // Drop wood
          const dropCount = Math.floor(8 * res.scale);
          if (dropCount > 0) {
            addFloatingText(state, res.x + dims.w / 2, res.y + dims.h * 0.3, 'wood', dropCount);
          }

          for (let d = 0; d < dropCount; d++) {
            state.items.push({
              id: `item-${Date.now()}-${Math.random()}`,
              x: res.x + (dims.w / 2) + (Math.random() - 0.5) * (dims.w * 0.4),
              y: res.y + (dims.h * 0.8) + (Math.random() - 0.5) * (dims.h * 0.2),
              type: 'wood',
            });
          }

          // Drop saplings (chance to drop 1-2 saplings)
          const saplingDropCount = Math.random() < 0.4 ? 2 : 1;
          for (let d = 0; d < saplingDropCount; d++) {
            state.items.push({
              id: `item-sapling-${Date.now()}-${Math.random()}`,
              x: res.x + (dims.w / 2) + (Math.random() - 0.5) * (dims.w * 0.4),
              y: res.y + (dims.h * 0.8) + (Math.random() - 0.5) * (dims.h * 0.2),
              type: 'sapling',
            });
          }

          chunkResources.splice(index, 1);
        } else {
          // Remove resource
          let dropType: ItemType = 'wood';
          let dropCount = 0;

          if (res.type === 'rock') {
            dropType = 'stone';
            dropCount = Math.floor(3 * res.scale);
          } else if (res.type === 'coal_ore') {
            dropType = 'coal';
            dropCount = 1 + Math.floor(Math.random() * 3);
          } else if (res.type === 'iron_ore') {
            dropType = 'iron_ore';
            dropCount = 1 + Math.floor(Math.random() * 2);
          } else if (res.type === 'sapling') {
            dropType = 'sapling';
            dropCount = 1;
          } else if (res.type === 'bush') {
            dropType = 'wood';
            dropCount = 2;
          } else if (res.type === 'branch') {
            dropType = 'wood';
            dropCount = 1;
          } else if (res.type === 'small_rock') {
            dropType = 'stone';
            dropCount = 1;
          } else if (res.type === 'grass') {
            // 20% chance to drop wheat seeds
            if (Math.random() < 0.2) {
              dropType = 'wheat_seeds';
              dropCount = 1;
            } else {
              dropCount = 0; // Grass usually drops nothing or fiber (not implemented)
            }
          } else if (res.type === 'torch') {
            dropType = 'torch';
            dropCount = 1;
          } else if (res.type === 'workbench') {
            dropType = 'workbench';
            dropCount = 1;
          } else if (res.type === 'campfire') {
            dropType = 'campfire';
            dropCount = 1;
          } else if (res.type === 'bed') {
            dropType = 'bed';
            dropCount = 1;
          } else if (res.type === 'chest') {
            dropType = 'chest';
            dropCount = 1;
          } else if (res.type === 'furnace') {
            dropType = 'furnace';
            dropCount = 1;
          } else if (res.type === 'trunk') {
            dropType = 'wood';
            dropCount = Math.floor(4 * res.scale);
          }
        
          if (dropCount > 0) {
            addFloatingText(state, res.x + dims.w / 2, res.y + dims.h * 0.3, dropType, dropCount);
          }

          for (let d = 0; d < dropCount; d++) {
            state.items.push({
              id: `item-${Date.now()}-${Math.random()}`,
              x: res.x + (dims.w / 2) + (Math.random() - 0.5) * (dims.w * 0.4),
              y: res.y + (dims.h * 0.8) + (Math.random() - 0.5) * (dims.h * 0.2),
              type: dropType,
            });
          }

          // Drop inventory items
          if (res.inventory) {
            for (const item of res.inventory) {
              if (item) {
                for (let c = 0; c < item.count; c++) {
                  state.items.push({
                    id: `item-${Date.now()}-${Math.random()}`,
                    x: res.x + (dims.w / 2) + (Math.random() - 0.5) * (dims.w * 0.4),
                    y: res.y + (dims.h * 0.8) + (Math.random() - 0.5) * (dims.h * 0.2),
                    type: item.type,
                  });
                }
              }
            }
          }

          chunkResources.splice(index, 1);
        }
        state.selectedResourceId = null; // Deselect after breaking
      }
    }
  };

  return { interact };
}

export type Interaction = ReturnType<typeof createInteraction>;
