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
import { createInteraction } from './interaction';
import { updateCreatures } from './animals';
import { updateSurvival } from './survival';
import { soundManager } from '../../../lib/SoundManager';
import { CollisionLayer, SpriteColliderGenerator, type ColliderShape, type Point } from '../../../lib/SpriteCollider';
import type { AnimalType, EntityType, GameState, ItemType } from '../core/types';

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
  // Harvest, attack and use live in interaction.ts; update() calls interact()
  // when the action key is pressed.
  const { interact } = createInteraction({
    state, colliders, refreshUI, spawnItem, dropLoot,
    getResourceDimensions, getAnimalSpriteInfo,
  });

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

    // Hunger, eating, armour, the clock and furnaces live in survival.ts.
    updateSurvival(state, dt, now, { removeFromInventory });

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

    // Animals and enemies live in src/game/systems/animals.ts.
    updateCreatures(state, dt, now, { spawnEnemy, spawnItem });

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
