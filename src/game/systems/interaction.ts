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
import { attackDamage, checkHarvest, rollDrop } from './harvesting';
import { rollChest } from './loot';
import { enemyDrops } from './mobs';
import { SpriteColliderGenerator, type ColliderShape, type Point } from '../../../lib/SpriteCollider';
import type { Animal, AnimalType, Enemy, EntityType, GameState, ItemType, Resource } from '../core/types';

export interface InteractionDeps {
  state: GameState;
  /** Level transitions, owned by systems/levels.ts. */
  onEnterDungeon: (depth: 1 | 2 | 3) => void;
  onDescend: () => void;
  onAscend: () => void;
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
  onEnterDungeon, onDescend, onAscend,
}: InteractionDeps) {
  /** Drop a resource out of the world by id. */
  const removeResource = (id: string) => {
    for (const [chunkId, chunk] of state.resources) {
      const i = chunk.findIndex((r) => r.id === id);
      if (i !== -1) {
        chunk.splice(i, 1);
        if (!chunk.length) state.resources.delete(chunkId);
        return;
      }
    }
  };

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
      // Damage comes from the tier table, so a titanium sword and the relic
      // blade actually hit harder than iron — listed by name here, they did the
      // same 2 damage as a bare hand, which made the Warden unkillable.
      const damage = attackDamage(selectedItem?.type ?? null);
    
      targetEnemy.health -= damage;
      state.shake = 10;
      soundManager.playHit();
    
      if (targetEnemy.health <= 0) {
        for (const drop of enemyDrops(targetEnemy.type)) {
          spawnItem(drop.type, targetEnemy.x, targetEnemy.y, drop.count);
        }
        if (targetEnemy.type === 'warden') {
          // The one source of the signal core. Without this the run cannot end.
          state.progress.wardenDefeated = true;
          state.message = { text: 'THE WARDEN FALLS. IT WAS CARRYING A SIGNAL CORE.', time: Date.now() + 4000 };
        }
        state.progress.mobsDefeated += 1;
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
      // Damage comes from the tier table, so a titanium sword and the relic
      // blade actually hit harder than iron — listed by name here, they did the
      // same 2 damage as a bare hand, which made the Warden unkillable.
      const damage = attackDamage(selectedItem?.type ?? null);
    
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

      // Tool gating comes from the table in systems/harvesting.ts.
      const gate = checkHarvest(res.type, selectedItem?.type ?? null);
      canBreak = gate.canBreak;
      damage = gate.damage;
      message = gate.message;

      if (res.type === 'loot_chest') {
        // Looting is an interaction, not a harvest: one press empties it.
        const depth = state.level.kind === 'dungeon' ? state.level.depth : 1;
        const taken = new Set(state.progress.uniquesTaken);
        for (const roll of rollChest(depth, taken)) {
          spawnItem(roll.type, res.x + 48, res.y + 64, roll.count);
        }
        state.progress.uniquesTaken = [...taken];
        state.progress.chestsLooted += 1;
        soundManager.playOpenContainer();
        state.message = { text: 'Chest looted', time: Date.now() };
        removeResource(res.id);
        refreshUI();
        return;
      }

      if (res.type === 'dungeon_entrance' && res.hits >= res.maxHits - 0.01) {
        // Already cleared: this is a doorway now.
        onEnterDungeon(1);
        return;
      }

      if (res.type === 'stairs_down') {
        onDescend();
        return;
      }

      if (res.type === 'dungeon_exit') {
        onAscend();
        return;
      }

      if (res.type === 'antenna') {
        const progress = res.antennaProgress ?? 0;

        // Stage 1 — restore the structure with wiring.
        if (progress < 100) {
          if (selectedItem && selectedItem.type === 'copper_wiring') {
            res.antennaProgress = progress + 5;
            selectedItem.count--;
            if (selectedItem.count <= 0) player.inventory[player.selectedSlot] = null;
            soundManager.playPlace();
            state.message = {
              text: `Antenna restored: ${Math.min(100, res.antennaProgress)}%`,
              time: Date.now(),
            };
            if (res.antennaProgress >= 100) {
              state.message = {
                text: 'Structure complete. It needs a power source.',
                time: Date.now() + 3000,
              };
            }
            refreshUI();
          } else {
            state.message = {
              text: `Needs copper wiring — ${Math.ceil((100 - progress) / 5)} more`,
              time: Date.now(),
            };
          }
          return;
        }

        // Stage 2 — install the core the Warden was carrying.
        if (!res.coreInstalled) {
          if (selectedItem && selectedItem.type === 'signal_core') {
            selectedItem.count--;
            if (selectedItem.count <= 0) player.inventory[player.selectedSlot] = null;
            res.coreInstalled = true;
            soundManager.playCraft();
            state.message = { text: 'Signal core installed. Interact to broadcast.', time: Date.now() + 3000 };
            refreshUI();
          } else {
            state.message = { text: 'Needs a signal core. The Warden has one.', time: Date.now() };
          }
          return;
        }

        // Stage 3 — broadcast. This ends the run.
        state.progress.broadcast = true;
        state.message = { text: 'TRANSMISSION SENT. SOMEONE IS COMING.', time: Date.now() + 8000 };
        refreshUI();
        return;
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

      // A cleared shaft is a doorway, not debris. Without this it fell through
      // to the generic "break and remove" path below, which deleted the only
      // entrance to the dungeon on the hit that opened it — and the dungeon is
      // the only source of the signal core, so the run could not be finished.
      if (res.type === 'dungeon_entrance' && res.hits >= res.maxHits) {
        res.hits = res.maxHits;
        const rubble = rollDrop('rubble', 1);
        if (rubble) spawnItem(rubble.type, res.x + dims.w / 2, res.y + dims.h * 0.8, rubble.count);
        soundManager.playHarvest('stone');
        state.message = { text: 'The shaft is open. Interact again to descend.', time: Date.now() };
        refreshUI();
        return;
      }
    
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
          // Remove resource. What it leaves behind is a row in HARVEST_DROPS,
          // so adding a material is a row rather than another branch here.
          const rolled = rollDrop(res.type, res.scale, res.growthStage);
          const dropType: ItemType = rolled?.type ?? 'wood';
          const dropCount = rolled?.count ?? 0;
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
