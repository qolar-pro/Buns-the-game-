/**
 * The gameplay tick and the interact action.
 *
 * Moved out of the monolithic effect in components/Game.tsx. These two are kept
 * together because update() calls interact() — splitting them would have meant
 * rewriting the call, and the brief is to move logic, not reinvent it.
 *
 * No React and no canvas: given state, input and dt, these mutate state and
 * nothing else.
 */
import { CHUNK_SIZE, MAX_HUNGER, PLAYER_SIZE, PLAYER_SPEED } from '../core/config';
import { idForEntity } from '../assets/colliders';
import { updateSmelting } from './smelting';
import { soundManager } from '../../../lib/SoundManager';
import { CollisionLayer, SpriteColliderGenerator, type ColliderShape, type Point } from '../../../lib/SpriteCollider';
import type {
  Animal, AnimalType, Enemy, EntityType, GameState, ItemType, Resource,
} from '../core/types';

/** A mutable counter shared with the renderer for sprite animation phase. */
export interface AnimCounter { value: number }

export interface GameplayDeps {
  state: GameState;
  keys: Set<string>;
  colliders: Map<string, ColliderShape>;
  anim: AnimCounter;
  refreshUI: () => void;
  startNewGame: () => void;
  addToInventory: (type: ItemType, count: number) => boolean;
  removeFromInventory: (type: ItemType, count: number) => boolean;
  spawnItem: (type: ItemType, x: number, y: number, count: number) => void;
  spawnEnemy: (type: 'static' | 'wolf', x: number, y: number, tier?: number) => void;
  spawnChunkResources: (cx: number, cy: number) => void;
  dropLoot: (type: AnimalType, x: number, y: number) => void;
  getResourceDimensions: (
    type: EntityType, scale: number, growthStage?: number, rockIndex?: number,
  ) => { w: number; h: number };
  getAnimalSpriteInfo: (type: AnimalType) => {
    w: number; h: number; imgUrl: string; rows: number; cols: number;
    hasLabelCol: boolean; hasLabelRow: boolean; labelHeight: number;
  };
}

/** Bind the tick to a state and its helpers. */
export function createGameplay({
  state, keys, colliders, anim, refreshUI, startNewGame,
  addToInventory, removeFromInventory, spawnItem, spawnEnemy, spawnChunkResources,
  dropLoot, getResourceDimensions, getAnimalSpriteInfo,
}: GameplayDeps) {
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
      state.shake = 8;
    
      if (res.type === 'tree' || res.type === 'bush' || res.type === 'sapling' || res.type === 'trunk' || res.type === 'branch') {
        soundManager.playChop();
      } else if (res.type === 'rock' || res.type === 'coal_ore' || res.type === 'small_rock') {
        soundManager.playMine();
      }

      if (res.hits >= res.maxHits) {
        if (res.type === 'tree' && res.growthStage === 2) {
          // Tree is broken
          const _oldX = res.x;
          const _oldY = res.y;

          // Drop wood
          const dropCount = Math.floor(8 * res.scale);
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

  const update = (dt: number) => {
    const { player } = state;
  
    // Check backpack unequip
    if (!player.equipment.back) {
      for (let i = 36; i < 54; i++) {
        if (player.inventory[i]) {
          spawnItem(player.inventory[i]!.type, player.x, player.y, player.inventory[i]!.count);
          player.inventory[i] = null;
        }
      }
    }

    const now = Date.now();

    // Update defense
    let defense = 0;
    if (state.player.equipment.head?.type === 'leather_cap') defense += 1;
    if (state.player.equipment.torso?.type === 'leather_tunic') defense += 3;
    if (state.player.equipment.legs?.type === 'leather_pants') defense += 2;
    if (state.player.equipment.feet?.type === 'leather_boots') defense += 1;
    state.player.defense = defense;

    // Update Furnaces
    updateSmelting(state, dt);

    // Time progression
    state.time = (state.time + 0.08 * dt) % 1440;

    // Hunger decay
    const SPRINT_HUNGER_DECAY = 0.5 / 60; // 1 point every 2 seconds
    const NORMAL_HUNGER_DECAY = 0.01 / 60; // 1 point every 100 seconds
    const hungerDecay = player.isSprinting ? SPRINT_HUNGER_DECAY : NORMAL_HUNGER_DECAY;
    player.hunger = Math.max(0, player.hunger - hungerDecay * dt);
  
    // Eating logic
    if (state.isRightMouseDown && now - state.lastEatTime > 1000) {
      const selectedItem = player.inventory[player.selectedSlot];
      if (selectedItem) {
        const foodItems = ['raw_beef', 'raw_pork', 'mutton', 'raw_chicken', 'egg', 'wheat_seeds'];
        if (foodItems.includes(selectedItem.type)) {
          let healthRestore = 5;
          let hungerRestore = 10;
          if (selectedItem.type === 'wheat_seeds') {
            healthRestore = 1;
            hungerRestore = 2;
          } else if (selectedItem.type === 'egg') {
            healthRestore = 2;
            hungerRestore = 5;
          }
        
          player.health = Math.min(100, player.health + healthRestore);
          player.hunger = Math.min(100, player.hunger + hungerRestore);
          removeFromInventory(selectedItem.type, 1);
          state.message = { text: `Ate ${selectedItem.type.replace('_', ' ')}`, time: now };
          state.lastEatTime = now;
        
          // Eating particles
          for (let i = 0; i < 5; i++) {
            state.particles.push({
              x: player.x + PLAYER_SIZE / 2 + (Math.random() - 0.5) * 20,
              y: player.y + PLAYER_SIZE / 2 + (Math.random() - 0.5) * 20,
              vx: (Math.random() - 0.5) * 2,
              vy: (Math.random() - 0.5) * 2 - 1,
              life: 1.0,
              maxLife: 1.0,
              size: 4 + Math.random() * 4,
              color: '#ffffff',
              type: 'dust'
            });
          }
        }
      }
    }

    // Update particles
    state.particles = state.particles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= 0.01 * dt; // Lasts 100 frames (~1.6s)
      return p.life > 0;
    });

    // Calculate player defense
    let playerDefense = 0;
    if (player.equipment.head?.type === 'leather_cap') playerDefense += 1;
    if (player.equipment.torso?.type === 'leather_tunic') playerDefense += 3;
    if (player.equipment.legs?.type === 'leather_pants') playerDefense += 2;
    if (player.equipment.feet?.type === 'leather_boots') playerDefense += 1;

    const takeDamage = (raw_damage: number) => {
      const actual_damage = Math.max(1, raw_damage - playerDefense);
      player.health = Math.max(0, player.health - actual_damage);
      state.shake = 5;
    };

    // Starvation damage
    if (player.hunger <= 0) {
      if (now - player.lastStarveDamageTime > 2000) {
        takeDamage(5);
        player.lastStarveDamageTime = now;
      }
    }

    // Movement
    let dx = 0;
    let dy = 0;
    if (keys.has('KeyW')) dy -= 1;
    if (keys.has('KeyS')) dy += 1;
    if (keys.has('KeyA')) dx -= 1;
    if (keys.has('KeyD')) dx += 1;

    const isMoving = dx !== 0 || dy !== 0;
    player.isMoving = isMoving;

    // Sprinting system with both Shift keys
    const isSprinting = (keys.has('ShiftRight') || keys.has('ShiftLeft') || keys.has('Shift')) && isMoving && player.hunger > 6;
    player.isSprinting = isSprinting;

    if (isMoving) {
      player.isSitting = false;
      player.lastMoveTime = now;
    
      // Footstep sounds
      player.footstepTimer += dt;
      const footstepInterval = isSprinting ? 15 : 25;
      if (player.footstepTimer >= footstepInterval) {
        soundManager.playFootstep();
        player.footstepTimer = 0;
      }
    
      if (isSprinting && Math.random() > 0.05) { // Spawn more frequently
        const angle = Math.atan2(dy, dx);
        state.particles.push({
          x: player.x + PLAYER_SIZE / 2 + (Math.random() - 0.5) * 20,
          y: player.y + PLAYER_SIZE * 0.9 + (Math.random() - 0.5) * 10,
          vx: 0,
          vy: 0,
          life: 1.0,
          maxLife: 1.0,
          size: 14 + Math.random() * 10,
          color: 'rgba(0, 0, 0, 0.6)', // Darker base color
          type: 'footstep',
          rotation: angle
        });
      }

      if (Math.abs(dx) > Math.abs(dy)) {
        player.facing = dx > 0 ? 'right' : 'left';
      } else {
        player.facing = dy > 0 ? 'down' : 'up';
      }

      const SPRINT_SPEED = 10.5;
      const speed = (isSprinting ? SPRINT_SPEED : PLAYER_SPEED) * dt;
      const length = Math.sqrt(dx * dx + dy * dy);
      const moveX = (dx / length) * speed;
      const moveY = (dy / length) * speed;

      // Collision Check
      let canMoveX = true;
      let canMoveY = true;
      const nextX = player.x + moveX;
      const nextY = player.y + moveY;
      const pRadius = 15;
      const pCenterX = player.x + PLAYER_SIZE / 2;
      const pCenterY = player.y + PLAYER_SIZE * 0.85; // Collision at feet

      const pcx = Math.floor(player.x / CHUNK_SIZE);
      const pcy = Math.floor(player.y / CHUNK_SIZE);

      // Only check resources in current and adjacent chunks for collision
      for (let cdx = -1; cdx <= 1; cdx++) {
        for (let cdy = -1; cdy <= 1; cdy++) {
          const chunkId = `${pcx + cdx},${pcy + cdy}`;
          const chunkResources = state.resources.get(chunkId);
          if (chunkResources) {
            chunkResources.forEach(res => {
              // Skip collision for non-blocking objects
              if (res.type === 'bush' || res.type === 'grass' || res.type === 'sapling' || 
                  res.type === 'branch' || res.type === 'small_rock' || res.type === 'torch') {
                return;
              }

              const dims = getResourceDimensions(res.type, res.scale, res.growthStage, res.rockIndex);
            
                // Use generated collider if available
                let imgUrl = idForEntity(res.type as string, { growthStage: res.growthStage, rockIndex: res.rockIndex });
              
                const shape = colliders.get(imgUrl);
                if (shape && shape.layer === CollisionLayer.SOLID) {
                  const scaleX = dims.w / shape.originalWidth;
                  const scaleY = dims.h / shape.originalHeight;
                
                  const localPX: Point = {
                    x: (pCenterX + moveX - res.x) / scaleX,
                    y: (pCenterY - res.y) / scaleY
                  };
                  if (SpriteColliderGenerator.isPointInPolygon(localPX, shape.physicsPoints)) canMoveX = false;

                  const localPY: Point = {
                    x: (pCenterX - res.x) / scaleX,
                    y: (pCenterY + moveY - res.y) / scaleY
                  };
                  if (SpriteColliderGenerator.isPointInPolygon(localPY, shape.physicsPoints)) canMoveY = false;
                } else if (res.type === 'rock' || res.type === 'coal_ore') {
                  // Tighter box collision for rocks fallback
                  const hW = dims.w * 0.7;
                  const hH = dims.h * 0.6;
                  const rx1 = res.x + (dims.w - hW) / 2;
                  const ry1 = res.y + (dims.h - hH) / 2;
                  const rx2 = rx1 + hW;
                  const ry2 = ry1 + hH;

                  const pW = 8; 
                  const pH = 6; 
                
                  const px1 = nextX + PLAYER_SIZE / 2 - pW;
                  const py1 = player.y + PLAYER_SIZE * 0.85 - pH;
                  const px2 = nextX + PLAYER_SIZE / 2 + pW;
                  const py2 = player.y + PLAYER_SIZE * 0.85 + pH;
                
                  if (px1 < rx2 && px2 > rx1 && py1 < ry2 && py2 > ry1) canMoveX = false;

                  const pyx1 = player.x + PLAYER_SIZE / 2 - pW;
                  const pyy1 = nextY + PLAYER_SIZE * 0.85 - pH;
                  const pyx2 = player.x + PLAYER_SIZE / 2 + pW;
                  const pyy2 = nextY + PLAYER_SIZE * 0.85 + pH;

                  if (pyx1 < rx2 && pyx2 > rx1 && pyy1 < ry2 && pyy2 > ry1) canMoveY = false;
                } else {
                  // Circle collision for trees/bushes (trunk based) fallback
                  const tx = res.x + dims.w / 2;
                  const ty = res.y + dims.h * 0.85;
                  const tRadius = (res.type === 'trunk' ? 20 : 25) * res.scale;

                  const distX = Math.sqrt(Math.pow(nextX + PLAYER_SIZE/2 - tx, 2) + Math.pow(pCenterY - ty, 2));
                  if (distX < pRadius + tRadius) canMoveX = false;

                  const distY = Math.sqrt(Math.pow(pCenterX - tx, 2) + Math.pow(nextY + PLAYER_SIZE * 0.85 - ty, 2));
                  if (distY < pRadius + tRadius) canMoveY = false;
                }
            });
          }
        }
      }

      // Check animals for collision
      state.animals.forEach(animal => {
        const { w, h, imgUrl, rows, cols: _cols, hasLabelCol: _hasLabelCol, hasLabelRow } = getAnimalSpriteInfo(animal.type);

        const shape = colliders.get(imgUrl);
        if (shape) {
          const scaleX = w / shape.originalWidth;
          const scaleY = h / shape.originalHeight;
        
          // Animal collision is bottom-center based
          const ax = animal.x - w / 2;
          const ay = animal.y - h;

          const checkCollision = (px: number, py: number) => {
            let relX = px - ax;
            let relY = py - ay;
          
            const animRows = Math.max(1, hasLabelRow ? rows - 1 : rows);
            if (animRows < 3 && animal.facing === 'left') {
              relX = w - relX;
            }

            const localP: Point = {
              x: relX / scaleX,
              y: relY / scaleY
            };
            return SpriteColliderGenerator.isPointInPolygon(localP, shape.physicsPoints);
          };

          if (checkCollision(pCenterX + moveX, pCenterY)) canMoveX = false;
          if (checkCollision(pCenterX, pCenterY + moveY)) canMoveY = false;
        } else {
          // Fallback circle collision
          const dist = Math.sqrt(Math.pow(nextX + PLAYER_SIZE/2 - animal.x, 2) + Math.pow(nextY + PLAYER_SIZE * 0.85 - animal.y, 2));
          if (dist < pRadius + 20) {
            canMoveX = false;
            canMoveY = false;
          }
        }
      });

      if (canMoveX) player.x = nextX;
      if (canMoveY) player.y = nextY;

      // Update animation frame
      const animSpeed = isSprinting ? 0.25 : 0.15;
      player.animFrame = (player.animFrame + animSpeed * dt) % 6;
    } else {
      player.animFrame = 0; // Idle frame
      if (keys.has('KeyX')) {
        player.isSitting = true;
      }
    }

    // Camera follow
    const lerpVal = 0.1;
    state.camera.x += (player.x - state.width / 2 - state.camera.x) * lerpVal * dt;
    state.camera.y += (player.y - state.height / 2 - state.camera.y) * lerpVal * dt;

    // Generate new chunks around player
    const curChunkX = Math.floor(player.x / CHUNK_SIZE);
    const curChunkY = Math.floor(player.y / CHUNK_SIZE);
    for (let x = curChunkX - 1; x <= curChunkX + 1; x++) {
      for (let y = curChunkY - 1; y <= curChunkY + 1; y++) {
        spawnChunkResources(x, y);
      }
    }

    if (keys.has('Space')) {
      keys.delete('Space');
      interact();
    }

    if (keys.has('KeyR')) {
      keys.delete('KeyR');
      player.x = 0;
      player.y = 0;
      state.camera.x = player.x - state.width / 2;
      state.camera.y = player.y - state.height / 2;
      state.message = { text: "Respawned at world spawn", time: Date.now() };
    }

    if (keys.has('KeyN')) {
      keys.delete('KeyN');
      startNewGame();
    }

    // Toggle Inventory
    if (keys.has('KeyE')) {
      keys.delete('KeyE');
      state.isInventoryOpen = !state.isInventoryOpen;
      if (!state.isInventoryOpen) {
        state.isWorkbenchOpen = false;
        state.openChestId = null;
      }
      refreshUI();
    }

    // Hotbar Selection
    for (let i = 1; i <= 9; i++) {
      if (keys.has(`Digit${i}`)) {
        player.selectedSlot = i - 1;
      }
    }

    // Workbench distance check
    if (state.isWorkbenchOpen) {
      // We don't have the specific workbench resource here easily, 
      // but we can check if there's ANY workbench nearby.
      // Alternatively, we could store the workbench ID when opening.
      // For simplicity, let's just check if ANY workbench is within reach.
      let workbenchNearby = false;
      const pcx = Math.floor(player.x / CHUNK_SIZE);
      const pcy = Math.floor(player.y / CHUNK_SIZE);
      const px = player.x + PLAYER_SIZE / 2;
      const py = player.y + PLAYER_SIZE * 0.85;

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const chunkId = `${pcx + dx},${pcy + dy}`;
          const chunkResources = state.resources.get(chunkId);
          if (chunkResources) {
            for (const res of chunkResources) {
              if (res.type === 'workbench') {
                const dims = getResourceDimensions(res.type, res.scale, res.growthStage, res.rockIndex);
                const tx = res.x + dims.w / 2;
                const ty = res.y + dims.h / 2;
                const dist = Math.sqrt(Math.pow(px - tx, 2) + Math.pow(py - ty, 2));
                if (dist < 250) { // Slightly larger radius for closing
                  workbenchNearby = true;
                  break;
                }
              }
            }
          }
          if (workbenchNearby) break;
        }
        if (workbenchNearby) break;
      }

      if (!workbenchNearby) {
        state.isWorkbenchOpen = false;
        // If inventory was only open because of workbench, maybe close it?
        // Usually, players expect the inventory to stay open but the workbench menu to disappear.
        // However, the user said "to open the workbench u have to right click it".
        // If they move away, it's safer to just close the workbench state.
      }
    }

    if (state.shake > 0) state.shake *= Math.pow(0.9, dt);
    anim.value = (anim.value + 0.05 * dt) % (Math.PI * 2);

    // Update opacity for smooth fade-in and handle growth
    state.resources.forEach((chunkResources) => {
      chunkResources.forEach(res => {
        if (res.opacity < 1) res.opacity += 0.02 * dt;

        // Growth logic
        if ((res.type === 'sapling' || res.type === 'tree') && res.growthStage !== undefined && res.growthStage < 2) {
          res.growthTimer = (res.growthTimer || 0) + 1 * dt;
          // Grow every ~20-40 seconds
          const growthThreshold = 1200 + Math.random() * 1200;
          if (res.growthTimer > growthThreshold) {
            const oldDims = getResourceDimensions(res.type, res.scale, res.growthStage, res.rockIndex);
            res.growthStage++;
          
            // Update type BEFORE calculating new dimensions so we get the correct size
            if (res.growthStage === 1) res.type = 'tree';
            if (res.growthStage === 2) res.type = 'tree';
          
            const newDims = getResourceDimensions(res.type, res.scale, res.growthStage, res.rockIndex);
          
            // Adjust x, y to keep the base (bottom-center) in the same spot
            res.x -= (newDims.w - oldDims.w) / 2;
            res.y -= (newDims.h - oldDims.h);
          
            res.growthTimer = 0;
            res.maxHits = (res.growthStage + 1) * 3;
          }
        }
      });
    });

    // Item collection
    state.items = state.items.filter(item => {
      const dist = Math.sqrt(Math.pow(player.x + PLAYER_SIZE/2 - item.x, 2) + Math.pow(player.y + PLAYER_SIZE/2 - item.y, 2));
      if (dist < 60) {
        if (addToInventory(item.type, 1)) {
          return false;
        }
      }
      return true;
    });

    // Update animals
    state.animals.forEach(animal => {
      animal.timer -= 16 * dt;
    
      if (animal.type === 'chicken' && animal.eggTimer !== undefined) {
        animal.eggTimer -= 16 * dt;
        if (animal.eggTimer <= 0 && (animal.state === 'idle' || animal.state === 'wander')) {
          state.items.push({
            id: `egg-${Date.now()}-${Math.random()}`,
            x: animal.x,
            y: animal.y,
            type: 'egg'
          });
          animal.eggTimer = Math.random() * 20000 + 20000; // Lay egg every 20-40s
        }
      }

      if (animal.timer <= 0) {
        if (animal.state === 'panic') {
          animal.state = 'idle';
          animal.timer = Math.random() * 2000 + 1000;
        } else {
          const rand = Math.random();
        
          // Play animal sound occasionally
          if (Math.random() < 0.1) {
            soundManager.playAnimal(animal.type);
          }

          if (rand < 0.3) {
            animal.state = 'idle';
            animal.timer = Math.random() * 2000 + 1000;
          } else {
            animal.state = 'wander';
            animal.timer = Math.random() * 3000 + 2000;
            animal.targetX = animal.x + (Math.random() - 0.5) * 400;
            animal.targetY = animal.y + (Math.random() - 0.5) * 400;
          }
        }
      }

      const speed = animal.state === 'panic' ? 8 : animal.state === 'wander' ? 2 : 0;
      animal.isMoving = false;
      if (speed > 0) {
        const dx = animal.targetX - animal.x;
        const dy = animal.targetY - animal.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          animal.x += (dx / dist) * speed * dt;
          animal.y += (dy / dist) * speed * dt;
          // Set direction based on movement vector
          if (Math.abs(dx) > Math.abs(dy)) {
            animal.facing = dx > 0 ? 'right' : 'left';
          } else {
            animal.facing = dy > 0 ? 'down' : 'up';
          }
          animal.isMoving = true;
        } else if (animal.state === 'wander') {
          animal.state = 'idle';
          animal.timer = Math.random() * 2000 + 1000;
        }
      }

      // Update animation frame
      if (animal.isMoving) {
        animal.animFrame += 0.15 * dt;
        if (animal.animFrame >= 4) animal.animFrame = 0;
      } else {
        animal.animFrame = 0;
      }
    });

    // Update Enemies
    const hour = state.time / 60;
    const isNight = hour >= 18 || hour < 6;

    // Nocturnal Spawning
    if (isNight && Math.random() < 0.005 * dt) {
      const spawnDist = 600;
      const angle = Math.random() * Math.PI * 2;
      const sx = player.x + Math.cos(angle) * spawnDist;
      const sy = player.y + Math.sin(angle) * spawnDist;
    
      if (hour >= 22 || hour < 4) {
        spawnEnemy('wolf', sx, sy);
      } else {
        const tier = Math.min(5, 1 + Math.floor(Math.random() * (hour > 20 ? 3 : 1)));
        spawnEnemy('static', sx, sy, tier);
      }
    }

    state.enemies.forEach((enemy, index) => {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Light avoidance for static enemies
      let lightLevel = 0;
      if (enemy.type === 'static') {
        state.resources.forEach(chunk => {
          chunk.forEach(res => {
            if (res.type === 'torch' || res.type === 'campfire') {
              const rDist = Math.sqrt(Math.pow(enemy.x - res.x, 2) + Math.pow(enemy.y - res.y, 2));
              const radius = res.type === 'campfire' ? 250 : 150;
              if (rDist < radius) lightLevel += (1 - rDist / radius);
            }
          });
        });
      
        if (lightLevel > 0.5) {
          enemy.health -= 0.5 * dt; // Light damages static enemies
          enemy.state = 'idle';
          enemy.targetX = enemy.x - dx; // Run away from player if player is near light
          enemy.targetY = enemy.y - dy;
        }
      }

      if (dist < 500 && lightLevel < 0.5) {
        enemy.state = 'chase';
        enemy.targetX = player.x;
        enemy.targetY = player.y;
      } else if (enemy.state === 'chase' && dist > 700) {
        enemy.state = 'idle';
      }

      if (enemy.state === 'chase') {
        const moveX = (dx / dist) * enemy.speed * dt;
        const moveY = (dy / dist) * enemy.speed * dt;
        enemy.x += moveX;
        enemy.y += moveY;
        enemy.facing = dx > 0 ? 'right' : 'left';

        if (dist < 60 && now - enemy.lastHitTime > 1000) {
          // Attack player
          const actualDamage = Math.max(1, enemy.damage - player.defense);
          player.health -= actualDamage;
          enemy.lastHitTime = now;
          state.shake = 10;
          soundManager.playHit();
        }
      } else if (enemy.state === 'idle') {
        enemy.timer -= dt;
        if (enemy.timer <= 0) {
          enemy.targetX = enemy.x + (Math.random() - 0.5) * 200;
          enemy.targetY = enemy.y + (Math.random() - 0.5) * 200;
          enemy.timer = 100 + Math.random() * 200;
        }
        const edx = enemy.targetX - enemy.x;
        const edy = enemy.targetY - enemy.y;
        const eDist = Math.sqrt(edx * edx + edy * edy);
        if (eDist > 5) {
          enemy.x += (edx / eDist) * (enemy.speed * 0.5) * dt;
          enemy.y += (edy / eDist) * (enemy.speed * 0.5) * dt;
        }
      }

      if (enemy.health <= 0) {
        state.enemies.splice(index, 1);
        // Drop loot?
        if (enemy.type === 'wolf') {
          spawnItem('leather', enemy.x, enemy.y, 1);
        }
      }
    });

    // Death logic
    if (player.health <= 0) {
      player.health = 100;
      player.hunger = MAX_HUNGER;
      player.x = 0;
      player.y = 0;
      state.camera.x = player.x - state.width / 2;
      state.camera.y = player.y - state.height / 2;
      state.message = { text: "You died! Respawned at world spawn.", time: now };
      soundManager.playClick(); // Use click as a placeholder for death sound
    }

    // Clear message after 2 seconds
    if (state.message && Date.now() - state.message.time > 2000) {
      state.message = null;
    }
  };

  return { interact, update };
}

export type Gameplay = ReturnType<typeof createGameplay>;
