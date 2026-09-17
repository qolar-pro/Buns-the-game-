/**
 * World generation and spawning.
 *
 * Moved out of the monolithic effect in components/Game.tsx. Pure TypeScript:
 * given state it mutates state and nothing else — no React, no DOM, no canvas —
 * which is what makes world generation testable without a browser.
 *
 * `getResourceDimensions` is injected rather than imported because draw sizes
 * come from the asset manifest, which is a rendering concern.
 */
import { CHUNK_SIZE } from '../core/config';
import { fbm, hash } from './noise';
import { MOBS } from '../systems/mobs';
import { hitsToBreak } from '../systems/harvesting';
import type { AnimalType, EnemyKind, EntityType, GameState, ItemType } from '../core/types';

/** Draw dimensions for an entity, supplied by the renderer. */
export type DimensionFn = (
  type: EntityType,
  scale: number,
  growthStage?: number,
  rockIndex?: number,
) => { w: number; h: number };

export interface WorldDeps {
  state: GameState;
  getResourceDimensions: DimensionFn;
}

/**
 * Build the world generation functions against a given state.
 *
 * A factory rather than free functions taking `state` as a first argument: the
 * bodies moved across unchanged that way, which keeps this a move rather than a
 * rewrite. They call each other, so they need to share one closure.
 */
export function createWorldgen({ state, getResourceDimensions }: WorldDeps) {
  const spawnResource = (forceType?: EntityType, forceX?: number, forceY?: number, chunkX?: number, chunkY?: number, rng?: () => number) => {
    const random = rng || Math.random;
    let type: EntityType;
    let growthStage = 2;
  
    if (forceType) {
      type = forceType;
      if (type === 'sapling') growthStage = 0;
      else if (type === 'tree') growthStage = 2;
    } else {
      const rand = random();
      if (rand < 0.12) {
        type = 'rock';
      } else if (rand < 0.17) {
        type = 'coal_ore';
      } else if (rand < 0.205) {
        type = 'copper_ore';
      } else if (rand < 0.225) {
        type = 'iron_ore';
      } else if (rand < 0.232) {
        // Collapsed shafts: rare, and the only way underground. Sealed with
        // rubble, so they are useless until the player has iron.
        type = 'dungeon_entrance';
      } else if (rand < 0.30) {
        type = 'sapling';
        growthStage = 0;
      } else if (rand < 0.38) {
        type = 'bush';
      } else {
        type = 'tree';
        growthStage = 2;
      }
    }

    const isPlant = type !== 'rock' && type !== 'trunk' && type !== 'coal_ore';
    const rockIndex = (type === 'rock' || type === 'coal_ore') ? Math.floor(random() * 9) : undefined;
    // Use fixed scale for forced spawns (placement) to ensure predictable size/position
    const scale = forceType ? 1.0 : (isPlant ? 0.8 + random() * 0.4 : 0.8 + random() * 0.2);
    const dims = getResourceDimensions(type, scale, growthStage, rockIndex);
    const sizeW = dims.w;
    const sizeH = dims.h;
  
    let x = forceX ?? 0;
    let y = forceY ?? 0;

    if (forceX === undefined || forceY === undefined) {
      if (chunkX !== undefined && chunkY !== undefined) {
        x = chunkX * CHUNK_SIZE + random() * (CHUNK_SIZE - sizeW);
        y = chunkY * CHUNK_SIZE + random() * (CHUNK_SIZE - sizeH);
      } else {
        x = random() * (state.width - sizeW);
        y = random() * (state.height - sizeH);
      }
    }

    // Avoid tight overlapping
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
  
    let tooClose = false;

    // Safe zone around spawn point (0, 0)
    const spawnSafeZone = 150;
    const distToSpawn = Math.sqrt(Math.pow(x + sizeW/2 - 64, 2) + Math.pow(y + sizeH/2 - 108, 2));
    if (distToSpawn < spawnSafeZone) {
      tooClose = true;
    }

    if (!tooClose) {
      // Only check current and adjacent chunks for overlapping
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
        const checkChunkId = `${cx + dx},${cy + dy}`;
        const chunkResources = state.resources.get(checkChunkId);
        if (chunkResources) {
          for (const res of chunkResources) {
            const resDims = getResourceDimensions(res.type, res.scale, res.growthStage, res.rockIndex);
            // Stricter distance check to prevent overlapping canopies and rocks
            const dist = Math.sqrt(Math.pow(x + sizeW/2 - (res.x + resDims.w/2), 2) + Math.pow(y + sizeH/2 - (res.y + resDims.h/2), 2));
            // Using 0.6 to ensure a safe buffer between objects (0.5 would be touching)
            const minSafeDist = (sizeW + resDims.w) * 0.6; 
            if (dist < minSafeDist) {
              tooClose = true;
              break;
            }
          }
        }
        if (tooClose) break;
      }
      if (tooClose) break;
    }
  }

    if (tooClose && !forceType) return false;

    const chunkId = `${cx},${cy}`;
    if (!state.resources.has(chunkId)) {
      state.resources.set(chunkId, []);
    }

    state.resources.get(chunkId)!.push({
      id: `${type}-${Date.now()}-${Math.random()}`,
      x,
      y,
      type,
      hits: 0,
      maxHits: hitsToBreak(type, growthStage),
      scale,
      opacity: forceType ? 1 : 0,
      rockIndex,
      growthStage: (type === 'sapling' || type === 'tree') ? growthStage : undefined,
      growthTimer: (type === 'sapling' || type === 'tree') ? 0 : undefined,
    });
    return true;
  };

  const spawnAnimal = (x: number, y: number, type: AnimalType) => {
    const id = `animal-${type}-${Date.now()}-${Math.random()}`;
    const maxHealth = type === 'cow' ? 15 : type === 'pig' ? 10 : type === 'sheep' ? 8 : 5;
    state.animals.push({
      id,
      type,
      x,
      y,
      health: maxHealth,
      maxHealth,
      state: 'idle',
      targetX: x,
      targetY: y,
      timer: Math.random() * 2000,
      facing: 'right',
      lastHitTime: 0,
      eggTimer: type === 'chicken' ? Math.random() * 10000 + 10000 : undefined,
      animFrame: 0,
      isMoving: false
    });
  };

  const dropLoot = (type: AnimalType, x: number, y: number) => {
    const items: { type: ItemType, count: number }[] = [];
    if (type === 'cow') {
      items.push({ type: 'raw_beef', count: Math.floor(Math.random() * 3) + 1 });
      if (Math.random() < 0.6) items.push({ type: 'leather', count: 1 });
    } else if (type === 'pig') {
      items.push({ type: 'raw_pork', count: Math.floor(Math.random() * 2) + 1 });
    } else if (type === 'sheep') {
      items.push({ type: 'mutton', count: 1 });
      if (Math.random() < 0.8) items.push({ type: 'wool', count: Math.floor(Math.random() * 2) + 1 });
    } else if (type === 'chicken') {
      items.push({ type: 'raw_chicken', count: 1 });
      if (Math.random() < 0.5) items.push({ type: 'feather', count: Math.floor(Math.random() * 3) + 1 });
    }

    items.forEach(loot => {
      for (let i = 0; i < loot.count; i++) {
        state.items.push({
          id: `loot-${Date.now()}-${Math.random()}`,
          x: x + (Math.random() - 0.5) * 40,
          y: y + (Math.random() - 0.5) * 40,
          type: loot.type
        });
      }
    });
  };

  const spawnChunkResources = (cx: number, cy: number) => {
    const chunkId = `${cx},${cy}`;
    if (state.generatedChunks.has(chunkId)) return;
    state.generatedChunks.add(chunkId);

    // Deterministic RNG for this chunk
    let seed = hash(cx, cy);
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Cohesive Biome Noise (matches terrain scale)
    const terrainVal = fbm(cx * CHUNK_SIZE * 0.0006, cy * CHUNK_SIZE * 0.0006, 3);
  
    // Helper to try spawning multiple times if it fails due to overlap
    const trySpawn = (type?: EntityType, fx?: number, fy?: number) => {
      // More attempts for better distribution without overlapping
      for (let attempt = 0; attempt < 15; attempt++) {
        if (spawnResource(type, fx, fy, cx, cy, random)) return true;
      }
      return false;
    };

    // 1. Lush Grass Biome (Drastically reduced)
    if (terrainVal < 0.52) {
      const forestVal = fbm(cx * 0.3 + 200, cy * 0.3 + 200, 2);
      if (forestVal > 0.85) { // Much higher threshold
        const count = 1 + Math.floor(random() * 2);
        for (let i = 0; i < count; i++) trySpawn('tree');
      } else if (forestVal > 0.7) {
        const count = 1;
        for (let i = 0; i < count; i++) trySpawn('tree');
      }
    }

    // 2. Dirt/Quarry Biome (Drastically reduced)
    if (terrainVal >= 0.45) {
      const rockVal = fbm(cx * 0.4 + 500, cy * 0.4 + 500, 2);
      if (rockVal > 0.85) {
        const count = 1 + Math.floor(random() * 2);
        for (let i = 0; i < count; i++) {
          const type = random() < 0.4 ? 'coal_ore' : 'rock';
          trySpawn(type);
        }
      }
    }

    // 3. General Vegetation (Bushes - Drastically reduced)
    const bushVal = fbm(cx * 0.5 + 1000, cy * 0.5 + 1000, 2);
    if (bushVal > 0.85) {
      const count = 1 + Math.floor(random() * 2);
      for (let i = 0; i < count; i++) trySpawn('bush');
    }

    // 4. Global Scattered Resources (Drastically reduced)
    const scatterCount = 1 + Math.floor(random() * 2);
    for (let i = 0; i < scatterCount; i++) {
      const r = random();
      if (r < 0.3) {
        trySpawn('tree');
      } else if (r < 0.6) {
        trySpawn('rock');
      } else if (r < 0.8) {
        trySpawn('coal_ore');
      } else {
        trySpawn('bush');
      }
    }

    // 5. Scattered Branches, Small Rocks, and Grass (Significantly reduced)
    const branchCount = 2 + Math.floor(random() * 3);
    for (let i = 0; i < branchCount; i++) trySpawn('branch');

    const smallRockCount = 2 + Math.floor(random() * 2);
    for (let i = 0; i < smallRockCount; i++) trySpawn('small_rock');

    const grassCount = 15 + Math.floor(random() * 10);
    for (let i = 0; i < grassCount; i++) trySpawn('grass');

    // 6. Spawn Animals (Rarely)
    if (random() < 0.3) { // 30% chance per chunk to spawn a group
      const animalCount = 1; // Changed from 1 + Math.floor(random() * 3) to avoid confusion
      const types: AnimalType[] = ['cow', 'pig', 'sheep', 'chicken'];
      const type = types[Math.floor(random() * types.length)];
      const groupX = cx * CHUNK_SIZE + random() * (CHUNK_SIZE - 100);
      const groupY = cy * CHUNK_SIZE + random() * (CHUNK_SIZE - 100);
    
      for (let i = 0; i < animalCount; i++) {
        spawnAnimal(groupX + (random() - 0.5) * 100, groupY + (random() - 0.5) * 100, type);
      }
    }
  };

  const spawnItem = (type: ItemType, x: number, y: number, count: number) => {
    for (let i = 0; i < count; i++) {
      state.items.push({
        id: `item-${Date.now()}-${Math.random()}`,
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 40,
        type,
      });
    }
  };

  const spawnEnemy = (type: EnemyKind, x: number, y: number, tier: number = 1) => {
    const profile = MOBS[type];
    // Shades scale with the hour via `tier`; everything else uses its profile.
    const health = type === 'static' ? profile.health * tier : profile.health;
    const damage = type === 'static' ? profile.damage * tier : profile.damage;

    state.enemies.push({
      id: `enemy-${Date.now()}-${Math.random()}`,
      type,
      x,
      y,
      health,
      maxHealth: health,
      damage,
      speed: profile.speed,
      targetX: x,
      targetY: y,
      state: 'idle',
      timer: 0,
      facing: 'left',
      lastHitTime: 0,
      tier,
    });
  };

  return { spawnResource, spawnAnimal, dropLoot, spawnChunkResources, spawnItem, spawnEnemy };
}

export type Worldgen = ReturnType<typeof createWorldgen>;
