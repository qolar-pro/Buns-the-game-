'use client';

// Game component for the resource gathering and crafting game
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { SpriteColliderGenerator, CollisionLayer, ColliderShape, Point } from '../lib/SpriteCollider';
import { soundManager } from '../lib/SoundManager';
import { debugError } from '@/lib/debug';
import { assets } from '@/src/game/assets/AssetRegistry';

/** The viewport the world is authored around; smaller screens zoom out to match. */
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Hud } from '@/components/ui/Hud';
import { InventoryOverlay } from '@/components/ui/InventoryOverlay';
import { publishHud, toHotbar } from '@/src/game/core/HudStore';
import { applySave, serialize, toSaveFile } from '@/src/game/save/serialize';
import { readSlot as loadSlot, writeSlot } from '@/src/game/save/storage';
import { SaveError } from '@/src/game/save/schema';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { TouchControls } from '@/components/ui/TouchControls';
import { RotatePrompt } from '@/components/ui/RotatePrompt';
import { useIsPortrait, useIsTouch } from '@/hooks/use-touch';
import { FRAMES } from '@/src/game/assets/frames';

/** First cell of the player sheet, used for the equipment paper doll. */
const PLAYER_FRAME = FRAMES['characters/player'];
/** Sprites are atlas-backed canvases now, not <img> elements. */
type Sprite = HTMLCanvasElement;
import { buildColliders, idForEntity } from '@/src/game/assets/colliders';
import { metaFor } from '@/src/game/assets/manifest';
import { renderChunkTerrain as drawChunkTerrain } from '@/src/game/render/TerrainRenderer';
import {
  PLAYER_SIZE, PLAYER_SPEED, ROCK_COLOR, ROCK_SIZE,
  CHUNK_SIZE, HOTBAR_SLOTS, MAIN_INV_ROWS, MAIN_INV_COLS,
  SLOT_SIZE, SLOT_MARGIN, MAX_HUNGER,
} from '@/src/game/core/config';
import { reseedNoise, fbm, hash } from '@/src/game/world/noise';
import {
  addToInventory as invAdd,
  removeFromInventory as invRemove,
} from '@/src/game/systems/inventory';
import { craftItem as craft } from '@/src/game/systems/crafting';
import { updateSmelting } from '@/src/game/systems/smelting';
import type {
  EntityType, ItemType,
  AnimalType, Animal, Resource, Enemy,
  RenderEntity, Particle, GameState,
} from '@/src/game/core/types';


// Deterministic Noise Functions



interface GameProps {
  onExitToMenu?: () => void;
  loadedSaveId?: string | null;
}

export default function Game({ onExitToMenu, loadedSaveId }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isPausedUI, setIsPausedUI] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Slot identity and accumulated playtime, carried across autosaves. */
  const saveMetaRef = useRef({ id: loadedSaveId ?? 'slot-1', name: 'Slot 1', createdAt: Date.now(), playtimeMs: 0 });
  const sessionStartRef = useRef(Date.now());
  /** Canvas scaling: world->CSS zoom, and the device pixel ratio. */
  const viewRef = useRef({ zoom: 1, dpr: 1 });
  const isTouch = useIsTouch();
  const isPortrait = useIsPortrait();
  const [assetProgress, setAssetProgress] = useState({ loaded: 0, total: 5 });
  const [_uiTick, setUiTick] = useState(0);
  const refreshUI = () => setUiTick(t => t + 1);
  const [pauseMenuState, setPauseMenuState] = useState<'main' | 'settings'>('main');
  const [volume, setVolume] = useState(50);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const startNewGameRef = useRef<(() => void) | null>(null);
  
  const stateRef = useRef<GameState>({
    width: 800,
    height: 600,
    player: {
      x: 0,
      y: 0,
      isSprinting: false,
      health: 100,
      hunger: MAX_HUNGER,
      defense: 0,
      inventory: Array(54).fill(null),
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
    camera: {
      x: 0,
      y: 0,
    },
    generatedChunks: new Set(),
    time: 480, // Start at 08:00
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
  });

  const lastTimeRef = useRef<number>(0);
  const animTimerRef = useRef(0);
  const chunkCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const keysRef = useRef<Set<string>>(new Set());
  const spriteRef = useRef<Sprite | null>(null);
  
  // Tree Stage Refs
  const saplingImgRef = useRef<Sprite | null>(null);
  const smallTreeImgRef = useRef<Sprite | null>(null);
  const treeImgRef = useRef<Sprite | null>(null);
  const trunkImgRef = useRef<Sprite | null>(null);
  const bushImgRef = useRef<Sprite | null>(null);
  const grassTilesRef = useRef<Sprite | null>(null);
  const dirtTilesRef = useRef<Sprite | null>(null);
  const grassVariantTilesRef = useRef<Sprite | null>(null);
  const woodItemImgRef = useRef<Sprite | null>(null);
  const stoneItemImgRef = useRef<Sprite | null>(null);
  const coalImgRef = useRef<Sprite | null>(null);
  const coalOreImgRef = useRef<Sprite | null>(null);
  const stickImgRef = useRef<Sprite | null>(null);
  const torchImgRef = useRef<Sprite | null>(null);
  const workbenchImgRef = useRef<Sprite | null>(null);
  const chestImgRef = useRef<Sprite | null>(null);
  const furnaceImgRef = useRef<Sprite | null>(null);
  const antennaImgRef = useRef<Sprite | null>(null);
  const fenceImgRef = useRef<Sprite | null>(null);
  const ironOreImgRef = useRef<Sprite | null>(null);
  const campfire1ImgRef = useRef<Sprite | null>(null);
  const campfire2ImgRef = useRef<Sprite | null>(null);
  const woodenBoardImgRef = useRef<Sprite | null>(null);
  const rockImgRefs = useRef<(Sprite | null)[]>([]);
  const collidersRef = useRef<Map<string, ColliderShape>>(new Map());
  const debugCollidersRef = useRef(false);
  const [debugColliders, setDebugColliders] = useState(false);
  
  // Tool Image Refs
  const woodAxeImgRef = useRef<Sprite | null>(null);
  const woodPickaxeImgRef = useRef<Sprite | null>(null);
  const woodSwordImgRef = useRef<Sprite | null>(null);
  const stoneAxeImgRef = useRef<Sprite | null>(null);
  const stonePickaxeImgRef = useRef<Sprite | null>(null);
  const stoneSwordImgRef = useRef<Sprite | null>(null);
  
  // Animal Sprite Refs
  const chickenImgRef = useRef<Sprite | null>(null);
  const cowImgRef = useRef<Sprite | null>(null);
  const pigImgRef = useRef<Sprite | null>(null);
  const sheepImgRef = useRef<Sprite | null>(null);

  useEffect(() => {
    // Load Farmer Sprite
    // Load Tree Stage Sprites
    // Atlases replace the 32 individual image loads: five requests instead of
    // thirty-seven, and sprites are addressed by manifest id rather than by
    // filename. Colliders come from the authored manifest, so regenerating art
    // can no longer change physics.
    collidersRef.current = buildColliders();

    const bindSprites = () => {
      const s = (id: string) => assets.sprite(id);
      saplingImgRef.current = s('world/sapling');
      smallTreeImgRef.current = s('world/small_tree');
      treeImgRef.current = s('world/tree');
      trunkImgRef.current = s('world/trunk');
      bushImgRef.current = s('world/bush');
      grassTilesRef.current = s('terrain/grass');
      grassVariantTilesRef.current = s('terrain/grass_variant');
      dirtTilesRef.current = s('terrain/dirt');
      woodItemImgRef.current = s('items/wood');
      stoneItemImgRef.current = s('items/stone');
      coalImgRef.current = s('items/coal');
      coalOreImgRef.current = s('world/coal_ore');
      stickImgRef.current = s('items/stick');
      torchImgRef.current = s('world/torch');
      workbenchImgRef.current = s('world/workbench');
      chestImgRef.current = s('world/chest');
      furnaceImgRef.current = s('world/furnace');
      campfire1ImgRef.current = s('world/campfire_1');
      campfire2ImgRef.current = s('world/campfire_2');
      woodenBoardImgRef.current = s('terrain/wood_floor');
      antennaImgRef.current = s('world/antenna');
      fenceImgRef.current = s('world/fence');
      ironOreImgRef.current = s('world/iron_ore');
      woodAxeImgRef.current = s('items/wooden_axe');
      woodPickaxeImgRef.current = s('items/wooden_pickaxe');
      woodSwordImgRef.current = s('items/wooden_sword');
      stoneAxeImgRef.current = s('items/stone_axe');
      stonePickaxeImgRef.current = s('items/stone_pickaxe');
      stoneSwordImgRef.current = s('items/stone_sword');
      spriteRef.current = s('characters/player');
      cowImgRef.current = s('characters/cow');
      pigImgRef.current = s('characters/pig');
      sheepImgRef.current = s('characters/sheep');
      chickenImgRef.current = s('characters/chicken');
      for (let i = 1; i <= 9; i++) {
        rockImgRefs.current[i - 1] = s(`world/rock_${'abc'[(i - 1) % 3]}`);
      }
    };

    assets
      .load((p) => setAssetProgress(p))
      .then(() => {
        bindSprites();
        setAssetsReady(true);
      })
      .catch((err) => debugError('Failed to load sprite atlases', err));

    
    // Load Animal Sprites

    const state = stateRef.current;
    
    state.player.lastMoveTime = Date.now();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /**
     * Size the canvas, accounting for device pixel ratio and viewport size.
     *
     * Two separate concerns:
     *  - The backing store is DPR-scaled, so sprites are not resampled by the
     *    browser on a high-density screen.
     *  - Small viewports zoom out. The world is authored around a ~1280x720
     *    view; on a 851x393 phone the player would otherwise fill a third of the
     *    screen and almost nothing else would be visible. `state.width/height`
     *    stay in world units so the camera and culling are unaffected.
     */
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      // Never zoom in past 1:1; zoom out only as far as legibility allows.
      const zoom = Math.max(0.5, Math.min(1, Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT)));

      viewRef.current = { zoom, dpr };
      setDimensions({ width: Math.round(w * dpr), height: Math.round(h * dpr) });

      state.width = w / zoom;
      state.height = h / zoom;
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Center player initially
    state.player.x = 0;
    state.player.y = 0;
    state.camera.x = -state.width / 2;
    state.camera.y = -state.height / 2;
    
    /**
     * Draw size for a world entity.
     *
     * Read from the manifest's authored worldSize, never from the sprite's
     * pixel dimensions. Deriving size from pixels meant regenerating art at a
     * different resolution silently resized everything in the world.
     */
    const getResourceDimensions = (type: EntityType, scale: number, growthStage?: number, rockIndex?: number) => {
      const meta = metaFor(idForEntity(type as string, { growthStage, rockIndex }));
      if (meta) {
        return { w: meta.worldSize.w * scale, h: meta.worldSize.h * scale };
      }

      // Fallback for entities with no sprite (e.g. procedural grass tufts).
      let base = 128;
      if (type === 'rock') base = ROCK_SIZE;
      else if (type === 'sapling') base = 48;
      else if (type === 'branch' || type === 'small_rock') base = 32;
      else if (type === 'grass') base = 64;
      else if (type === 'bed') return { w: 120, h: 60 };

      return { w: base * scale, h: base * scale };
    };

    // Smooth Spawning Logic
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
        } else if (rand < 0.18) {
          type = 'coal_ore';
        } else if (rand < 0.28) {
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
        maxHits: (type === 'rock' || type === 'trunk' || type === 'coal_ore') ? 3 : (type === 'bush' ? 2 : (type === 'torch' || type === 'workbench' || type === 'campfire' || type === 'branch' || type === 'small_rock' || type === 'grass' || type === 'chest' || type === 'furnace' ? 1 : (growthStage + 1) * 3)),
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
      stateRef.current.animals.push({
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
          stateRef.current.items.push({
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

    const renderChunkTerrain = (cx: number, cy: number) => {
      const canvas = drawChunkTerrain(cx, cy, {
        grass: grassTilesRef.current,
        grassVariant: grassVariantTilesRef.current,
        dirt: dirtTilesRef.current,
      });
      if (canvas) chunkCanvasesRef.current.set(`${cx},${cy}`, canvas);
      return canvas;
    };

    // Initial map generation
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        spawnChunkResources(x, y);
      }
    }
    
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

    const spawnEnemy = (type: 'static' | 'wolf', x: number, y: number, tier: number = 1) => {
      const id = `enemy-${Date.now()}-${Math.random()}`;
      const health = type === 'wolf' ? 100 : 50 * tier;
      const damage = type === 'wolf' ? 15 : 5 * tier;
      const speed = type === 'wolf' ? 3.5 : 2.0;

      state.enemies.push({
        id,
        type,
        x,
        y,
        health,
        maxHealth: health,
        damage,
        speed,
        targetX: x,
        targetY: y,
        state: 'idle',
        timer: 0,
        facing: 'left',
        lastHitTime: 0,
        tier
      });
    };

    // Thin adapters over the pure systems in src/game/systems, so the call
    // sites below stay as they were.
    const addToInventory = (type: ItemType, count: number) => invAdd(state, type, count);
    const removeFromInventory = (type: ItemType, count: number) => invRemove(state, type, count);

    const _craftItem = (recipeId: string) => {
      const result = craft(state, recipeId);
      if (result === 'requires-workbench') {
        state.message = { text: "Requires Workbench", time: Date.now() };
      } else if (result === 'ok') {
        soundManager.playCraft();
      }
    };

    const _handleInventoryDrop = (x: number, y: number) => {
      const { player, draggedItem } = state;
      if (!draggedItem) return;
      
      const PANEL_WIDTH = 800;
      const PANEL_X = (state.width - PANEL_WIDTH) / 2;
      const CRAFT_Y = 50;
      const CRAFT_H = 350;
      const currentInvRows = state.player.equipment.back ? MAIN_INV_ROWS + 2 : MAIN_INV_ROWS;
      const INV_Y = CRAFT_Y + CRAFT_H + 20;
      const INV_H = 80 + currentInvRows * 60;
      const HOT_Y = INV_Y + INV_H + 20;

      // Check Chest Slots
      const openChest = state.openChestId ? Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId) : null;
      if (openChest) {
        if (openChest.type === 'furnace') {
          const furnaceInv = openChest.inventory || Array(3).fill(null);
          const craftGridX = PANEL_X + 20;
          const craftGridY = CRAFT_Y + 60;
          
          const slots = [
            { i: 0, x: craftGridX + 100, y: craftGridY + 20 }, // Input
            { i: 1, x: craftGridX + 100, y: craftGridY + 20 + SLOT_SIZE + 20 }, // Fuel
            { i: 2, x: craftGridX + 300, y: craftGridY + 20 + SLOT_SIZE / 2 + 10 } // Output
          ];

          for (const slot of slots) {
            if (x >= slot.x && x <= slot.x + SLOT_SIZE && y >= slot.y && y <= slot.y + SLOT_SIZE) {
              const targetItem = furnaceInv[slot.i];
              
              if (targetItem && targetItem.type === draggedItem.item.type) {
                // Stack items
                targetItem.count += draggedItem.item.count;
              } else {
                // Swap items
                furnaceInv[slot.i] = draggedItem.item;
                if (draggedItem.equipSlot) {
                  state.player.equipment[draggedItem.equipSlot] = targetItem;
                } else if (draggedItem.fromChest) {
                  furnaceInv[draggedItem.slotIndex] = targetItem;
                } else {
                  player.inventory[draggedItem.slotIndex] = targetItem;
                }
              }
              state.draggedItem = null;
              return;
            }
          }
        } else {
          const chestInv = openChest.inventory || Array(27).fill(null);
          const chestCols = 9;
          const chestGridX = PANEL_X + 20;
          const chestGridY = CRAFT_Y + 60;
          
          for (let i = 0; i < chestInv.length; i++) {
            const col = i % chestCols;
            const row = Math.floor(i / chestCols);
            const slotX = chestGridX + col * (SLOT_SIZE + SLOT_MARGIN);
            const slotY = chestGridY + row * (SLOT_SIZE + SLOT_MARGIN);
            
            if (x >= slotX && x <= slotX + SLOT_SIZE && y >= slotY && y <= slotY + SLOT_SIZE) {
              const targetItem = chestInv[i];
              
              if (targetItem && targetItem.type === draggedItem.item.type) {
                // Stack items
                targetItem.count += draggedItem.item.count;
              } else {
                // Swap items
                chestInv[i] = draggedItem.item;
                if (draggedItem.equipSlot) {
                  state.player.equipment[draggedItem.equipSlot] = targetItem;
                } else if (draggedItem.fromChest) {
                  chestInv[draggedItem.slotIndex] = targetItem;
                } else {
                  player.inventory[draggedItem.slotIndex] = targetItem;
                }
              }
              state.draggedItem = null;
              return;
            }
          }
        }
      }

      // Check Equipment Slots
      const EQUIP_PANEL_WIDTH = 220;
      const EQUIP_PANEL_X = PANEL_X - EQUIP_PANEL_WIDTH - 20;
      const EQUIP_PANEL_Y = INV_Y;
      
      const equipX = EQUIP_PANEL_X + 20;
      const equipY = EQUIP_PANEL_Y + 60;
      const equipSlots: { name: keyof typeof state.player.equipment, x: number, y: number, validTypes: ItemType[] }[] = [
        { name: 'head', x: equipX, y: equipY, validTypes: ['leather_cap'] },
        { name: 'torso', x: equipX, y: equipY + 60, validTypes: ['leather_tunic'] },
        { name: 'legs', x: equipX, y: equipY + 120, validTypes: ['leather_pants'] },
        { name: 'feet', x: equipX, y: equipY + 180, validTypes: ['leather_boots'] },
        { name: 'back', x: equipX + 130, y: equipY + 60, validTypes: ['leather_backpack'] }
      ];

      for (const slot of equipSlots) {
        if (x >= slot.x && x <= slot.x + SLOT_SIZE && y >= slot.y && y <= slot.y + SLOT_SIZE) {
          if (slot.validTypes.includes(draggedItem.item.type)) {
            const targetItem = state.player.equipment[slot.name];
            state.player.equipment[slot.name] = draggedItem.item;
            
            if (draggedItem.equipSlot) {
              state.player.equipment[draggedItem.equipSlot] = targetItem;
            } else if (draggedItem.fromChest) {
              const openChest = state.openChestId ? Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId) : null;
              if (openChest && openChest.inventory) {
                openChest.inventory[draggedItem.slotIndex] = targetItem;
              }
            } else {
              player.inventory[draggedItem.slotIndex] = targetItem;
            }
            state.draggedItem = null;
            return;
          }
        }
      }

      // Check Hotbar
      const hotbarX = PANEL_X + 130;
      const hotbarY = HOT_Y + 40;
      
      for (let i = 0; i < HOTBAR_SLOTS; i++) {
        const sx = hotbarX + i * (SLOT_SIZE + SLOT_MARGIN);
        if (x >= sx && x <= sx + SLOT_SIZE && y >= hotbarY && y <= hotbarY + SLOT_SIZE) {
          const targetItem = player.inventory[i];
          
          if (draggedItem.equipSlot) {
            if (targetItem) {
              // Can't swap an item into an equip slot unless it's valid, so just cancel
              state.player.equipment[draggedItem.equipSlot] = draggedItem.item;
            } else {
              player.inventory[i] = draggedItem.item;
            }
          } else if (draggedItem.fromChest) {
            player.inventory[i] = draggedItem.item;
            if (targetItem) {
              const openChest = state.openChestId ? Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId) : null;
              if (openChest && openChest.inventory) {
                openChest.inventory[draggedItem.slotIndex] = targetItem;
              }
            }
          } else {
            player.inventory[i] = draggedItem.item;
            if (targetItem) {
              player.inventory[draggedItem.slotIndex] = targetItem;
            }
          }
          state.draggedItem = null;
          return;
        }
      }
      
      // Check Main Inventory
      const invX = PANEL_X + 130;
      const invY = INV_Y + 60;
      
      for (let row = 0; row < currentInvRows; row++) {
        for (let col = 0; col < MAIN_INV_COLS; col++) {
          const i = HOTBAR_SLOTS + row * MAIN_INV_COLS + col;
          const sx = invX + col * (SLOT_SIZE + SLOT_MARGIN);
          const sy = invY + row * (SLOT_SIZE + SLOT_MARGIN);
          
          if (x >= sx && x <= sx + SLOT_SIZE && y >= sy && y <= sy + SLOT_SIZE) {
            const targetItem = player.inventory[i];
            
            if (draggedItem.equipSlot) {
              if (targetItem) {
                // Can't swap an item into an equip slot unless it's valid, so just cancel
                state.player.equipment[draggedItem.equipSlot] = draggedItem.item;
              } else {
                player.inventory[i] = draggedItem.item;
              }
            } else if (draggedItem.fromChest) {
              player.inventory[i] = draggedItem.item;
              if (targetItem) {
                const openChest = state.openChestId ? Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId) : null;
                if (openChest && openChest.inventory) {
                  openChest.inventory[draggedItem.slotIndex] = targetItem;
                }
              }
            } else {
              player.inventory[i] = draggedItem.item;
              if (targetItem) {
                player.inventory[draggedItem.slotIndex] = targetItem;
              }
            }
            state.draggedItem = null;
            return;
          }
        }
      }
      
      // Drop item if outside UI
      const isInsideMain = x >= PANEL_X && x <= PANEL_X + PANEL_WIDTH && y >= CRAFT_Y && y <= HOT_Y + 100;
      const isInsideEquip = x >= EQUIP_PANEL_X && x <= EQUIP_PANEL_X + EQUIP_PANEL_WIDTH && y >= INV_Y && y <= INV_Y + INV_H;
      
      if (!isInsideMain && !isInsideEquip) {
        spawnItem(draggedItem.item.type, player.x, player.y, draggedItem.item.count);
        state.draggedItem = null;
      } else {
        // Return to original slot
        if (draggedItem.equipSlot) {
          state.player.equipment[draggedItem.equipSlot] = draggedItem.item;
        } else if (draggedItem.fromChest) {
          const openChest = state.openChestId ? Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId) : null;
          if (openChest && openChest.inventory) {
            openChest.inventory[draggedItem.slotIndex] = draggedItem.item;
          }
        } else {
          player.inventory[draggedItem.slotIndex] = draggedItem.item;
        }
        state.draggedItem = null;
      }
    };

    const startNewGame = () => {
      const state = stateRef.current;
      const newSeed = Math.floor(Math.random() * 2147483647);
      reseedNoise(newSeed);
      
      // Reset world data
      state.resources.clear();
      state.generatedChunks.clear();
      state.items = [];
      chunkCanvasesRef.current.clear();
      
      // Reset player
      state.player.x = 0;
      state.player.y = 0;
      state.player.isSprinting = false;
      state.player.health = 100;
      state.player.hunger = MAX_HUNGER;
      state.player.inventory = Array(54).fill(null);
      state.player.equipment = {
        head: null,
        torso: null,
        legs: null,
        feet: null,
        back: null
      };
      state.player.selectedSlot = 0;
      
      // Reset camera
      state.camera.x = state.player.x - state.width / 2;
      state.camera.y = state.player.y - state.height / 2;
      
      state.message = { text: "New world generated!", time: Date.now() };
      
      // Force immediate chunk generation around spawn
      const startCX = Math.floor(0 / CHUNK_SIZE);
      const startCY = Math.floor(0 / CHUNK_SIZE);
      for (let x = startCX - 1; x <= startCX + 1; x++) {
        for (let y = startCY - 1; y <= startCY + 1; y++) {
          spawnChunkResources(x, y);
        }
      }
    };
    
    startNewGameRef.current = startNewGame;

    if (loadedSaveId) {
      // Loading is async now (IndexedDB), so start a world immediately and let
      // the save overwrite it once read. That keeps the first frame drawable.
      startNewGame();
      loadSlot(loadedSaveId)
        .then((raw) => {
          if (!raw) throw new SaveError('That save could not be found.');
          const save = applySave(stateRef.current, raw);
          reseedNoise(save.seed);
          saveMetaRef.current = {
            id: loadedSaveId,
            name: save.name,
            createdAt: save.createdAt,
            playtimeMs: save.playtimeMs,
          };
        })
        .catch((err: unknown) => {
          const message = err instanceof SaveError ? err.message : 'That save could not be loaded.';
          const detail = err instanceof SaveError ? err.detail : String(err);
          debugError('Failed to load save', err);
          setLoadError(detail ? `${message} (${detail})` : message);
        });
    } else {
      startNewGame();
    }

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

            const shape = collidersRef.current.get(imgUrl);
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

      const keys = keysRef.current;
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
                  
                  const shape = collidersRef.current.get(imgUrl);
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

          const shape = collidersRef.current.get(imgUrl);
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
      animTimerRef.current = (animTimerRef.current + 0.05 * dt) % (Math.PI * 2);

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







    const getAnimalSpriteInfo = (type: AnimalType) => {
      let img: Sprite | null = null;
      let w = 100, h = 100; // Default sizes
      let imgUrl = '';
      
      if (type === 'cow') { img = cowImgRef.current; imgUrl = 'characters/cow'; w = 150; h = 150; }
      else if (type === 'pig') { img = pigImgRef.current; imgUrl = 'characters/pig'; w = 120; h = 120; }
      else if (type === 'sheep') { img = sheepImgRef.current; imgUrl = 'characters/sheep'; w = 100; h = 100; }
      else if (type === 'chicken') { img = chickenImgRef.current; imgUrl = 'characters/chicken'; w = 80; h = 80; }
      
      // Grid comes from the manifest, not from a hardcoded guess.
      const sheet = (FRAMES as Record<string, { grid?: { cols: number; rows: number } }>)[imgUrl];
      const rows = sheet?.grid?.rows ?? 4;
      const cols = sheet?.grid?.cols ?? 3;
      const hasLabelCol = false;
      const hasLabelRow = false;
      const labelHeight = 0;

      return { img, w, h, imgUrl, rows, cols, hasLabelCol, hasLabelRow, labelHeight };
    };

    const drawAnimal = (ctx: CanvasRenderingContext2D, animal: Animal) => {
      ctx.save();
      ctx.translate(animal.x, animal.y);
      
      const { img, w, h, rows, cols, hasLabelCol: _hasLabelCol, hasLabelRow: _hasLabelRow, labelHeight } = getAnimalSpriteInfo(animal.type);
      
      if (img && img) {
        const sw = img.width / cols;
        const sh = img.height / rows;

        // The animal spritesheets are 6x8 grids containing 4 different 3x4 characters.
        // We will just use the top-left character (columns 0-2, rows 0-3).
        const animCols = 3;
        const _animRows = 4;

        let frameX = 0;
        if (animCols === 3) {
          // RPG Maker style 3-frame animation: Stand(1), Step1(0), Stand(1), Step2(2)
          const cycle = [1, 0, 1, 2];
          if (animal.isMoving) {
            frameX = cycle[Math.floor(animal.animFrame % 4)];
          } else {
            frameX = 1; // Standing frame is usually the middle one
          }
        } else {
          frameX = Math.floor(animal.animFrame % animCols);
        }

        // Sheets are four rows, one per facing direction: down, left, right, up.
        // Standing reuses the same row and simply holds the first frame, rather
        // than the separate stand rows the old eight-row sheets had.
        const ROW_FOR_FACING = { down: 0, left: 1, right: 2, up: 3 } as const;
        const frameY = ROW_FOR_FACING[animal.facing ?? 'down'];
        if (!animal.isMoving) frameX = 0;

        // Selection highlight
        if (stateRef.current.selectedAnimalId === animal.id) {
          ctx.save();
          ctx.shadowBlur = 15;
          ctx.shadowColor = 'yellow';
          ctx.globalAlpha = 0.8;
          // Pivot at bottom-center: draw at (-w/2, -h)
          ctx.drawImage(img, frameX * sw, frameY * sh + labelHeight, sw, sh - labelHeight, -w / 2, -h, w, h);
          ctx.restore();
        }

        // Pivot at bottom-center: draw at (-w/2, -h)
        ctx.drawImage(img, frameX * sw, frameY * sh + labelHeight, sw, sh - labelHeight, -w / 2, -h, w, h);
      } else {
        if (animal.facing === 'left') ctx.scale(-1, 1);
        // Fallback to manual drawing
        if (animal.type === 'cow') {
          ctx.fillStyle = '#5d4037';
          ctx.fillRect(-30, -20, 60, 40);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-25, -15, 15, 15);
          ctx.fillRect(10, 5, 10, 10);
        } else if (animal.type === 'pig') {
          ctx.fillStyle = '#f48fb1';
          ctx.fillRect(-25, -15, 50, 30);
          ctx.fillStyle = '#f06292';
          ctx.fillRect(15, -5, 10, 10);
        } else if (animal.type === 'sheep') {
          ctx.fillStyle = '#f5f5f5';
          ctx.beginPath();
          ctx.arc(0, 0, 25, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#424242';
          ctx.fillRect(15, -10, 15, 15);
        } else if (animal.type === 'chicken') {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffca28';
          ctx.fillRect(12, -2, 8, 4);
          ctx.fillStyle = '#f44336';
          ctx.fillRect(5, -12, 5, 5);
        }
      }
      
      ctx.restore();
    };


    const drawEnemy = (ctx: CanvasRenderingContext2D, enemy: Enemy) => {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);

        if (enemy.type === 'static') {
          // Phantasmal 'Static' effect
          const pulse = Math.sin(Date.now() / 200) * 0.2 + 0.8;
          ctx.globalAlpha = 0.6 * pulse;
          
          // Glitchy shadow body
          ctx.fillStyle = '#000';
          for (let i = 0; i < 5; i++) {
            const ox = (Math.random() - 0.5) * 10;
            const oy = (Math.random() - 0.5) * 10;
            ctx.fillRect(-20 + ox, -60 + oy, 40, 60);
          }

          // Glowing eyes
          ctx.fillStyle = '#f00';
          ctx.beginPath();
          ctx.arc(-8, -45, 3, 0, Math.PI * 2);
          ctx.arc(8, -45, 3, 0, Math.PI * 2);
          ctx.fill();

          // Static particles
          ctx.fillStyle = '#fff';
          for (let i = 0; i < 10; i++) {
            ctx.fillRect((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 80 - 30, 2, 2);
          }
        } else if (enemy.type === 'wolf') {
          // Wolf drawing
          ctx.scale(enemy.facing === 'left' ? -1 : 1, 1);
          
          // Body
          ctx.fillStyle = '#333';
          ctx.beginPath();
          ctx.ellipse(0, -20, 25, 15, 0, 0, Math.PI * 2);
          ctx.fill();
          
          // Head
          ctx.beginPath();
          ctx.ellipse(20, -35, 12, 10, -0.3, 0, Math.PI * 2);
          ctx.fill();
          
          // Ears
          ctx.beginPath();
          ctx.moveTo(15, -42);
          ctx.lineTo(18, -55);
          ctx.lineTo(25, -45);
          ctx.fill();

          // Tail
          ctx.beginPath();
          ctx.moveTo(-25, -20);
          ctx.quadraticCurveTo(-40, -40, -35, -10);
          ctx.lineWidth = 6;
          ctx.strokeStyle = '#333';
          ctx.stroke();

          // Eyes
          ctx.fillStyle = '#ff0';
          ctx.beginPath();
          ctx.arc(25, -38, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Health bar
        if (enemy.health < enemy.maxHealth) {
          const bw = 40;
          const bh = 4;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(-bw/2, -80, bw, bh);
          ctx.fillStyle = '#f00';
          ctx.fillRect(-bw/2, -80, bw * (enemy.health / enemy.maxHealth), bh);
        }

        ctx.restore();
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Map world units onto the DPR-scaled backing store. Everything below
      // continues to draw in world units, unchanged.
      const { zoom, dpr } = viewRef.current;
      ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      ctx.save();
      // Use Math.floor consistently for camera translation
      ctx.translate(-Math.floor(state.camera.x), -Math.floor(state.camera.y));
      
      if (state.shake > 0) {
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
      }

      // Draw Ground (Cached Chunks)
      ctx.imageSmoothingEnabled = false;
      
      const startCX = Math.floor(state.camera.x / CHUNK_SIZE);
      const endCX = Math.ceil((state.camera.x + state.width) / CHUNK_SIZE);
      const startCY = Math.floor(state.camera.y / CHUNK_SIZE);
      const endCY = Math.ceil((state.camera.y + state.height) / CHUNK_SIZE);

      for (let cx = startCX; cx < endCX; cx++) {
        for (let cy = startCY; cy < endCY; cy++) {
          const chunkId = `${cx},${cy}`;
          let chunkCanvas = chunkCanvasesRef.current.get(chunkId);
          if (!chunkCanvas) {
            chunkCanvas = renderChunkTerrain(cx, cy) || undefined;
          }
          if (chunkCanvas) {
            ctx.drawImage(chunkCanvas, cx * CHUNK_SIZE, cy * CHUNK_SIZE);
          }
        }
      }

      const visibleResources: RenderEntity[] = [];
      for (let cx = startCX; cx < endCX; cx++) {
        for (let cy = startCY; cy < endCY; cy++) {
          const chunkId = `${cx},${cy}`;
          const chunkResources = state.resources.get(chunkId);
          if (chunkResources) {
            chunkResources.forEach(r => {
              const dims = getResourceDimensions(r.type, r.scale, r.growthStage, r.rockIndex);
              if (r.x + dims.w > state.camera.x && 
                  r.x < state.camera.x + state.width &&
                  r.y + dims.h > state.camera.y && 
                  r.y < state.camera.y + state.height) {
                visibleResources.push({ ...r, sortY: r.y + dims.h * 0.95 });
              }
            });
          }
        }
      }

      const visibleItems = state.items.filter(i => {
        return i.x + 32 > state.camera.x && 
               i.x - 32 < state.camera.x + state.width &&
               i.y + 32 > state.camera.y && 
               i.y - 32 < state.camera.y + state.height;
      });

      const visibleAnimals = state.animals.filter(a => {
        return a.x + 60 > state.camera.x && 
               a.x - 60 < state.camera.x + state.width &&
               a.y + 40 > state.camera.y && 
               a.y - 40 < state.camera.y + state.height;
      });

      const visibleParticles = state.particles.filter(p => {
        return p.x + 50 > state.camera.x && 
               p.x - 50 < state.camera.x + state.width &&
               p.y + 50 > state.camera.y && 
               p.y - 50 < state.camera.y + state.height;
      });

      const visibleEnemies = state.enemies.filter(e => {
        return e.x + 100 > state.camera.x && 
               e.x - 100 < state.camera.x + state.width &&
               e.y + 100 > state.camera.y && 
               e.y - 100 < state.camera.y + state.height;
      });

      // Find targeted resource for interaction/highlighting
      const { player: _player } = state;
      let targetedResource: Resource | null = null;
      
      // If we have a selected resource, that's our target
      if (state.selectedResourceId) {
        for (const [_chunkId, chunkResources] of state.resources.entries()) {
          const res = chunkResources.find(r => r.id === state.selectedResourceId);
          if (res) {
            targetedResource = res;
            break;
          }
        }
      }

      const entities = [
        ...visibleResources.map(r => ({ ...r, isResource: true, isTargeted: targetedResource && r.id === targetedResource.id })),
        ...visibleItems.map(i => ({ ...i, sortY: i.y + 16, isItem: true })),
        ...visibleAnimals.map(a => ({ ...a, sortY: a.y + 20, isAnimal: true })),
        ...visibleEnemies.map(e => ({ ...e, sortY: e.y + 20, isEnemy: true })),
        ...visibleParticles.map(p => ({ ...p, isParticle: true, sortY: p.y })),
        { ...state.player, type: 'player', sortY: state.player.y + PLAYER_SIZE * 0.9 }
      ];
      entities.sort((a, b) => a.sortY - b.sortY);

      entities.forEach(ent => {
        const e = ent as RenderEntity;
        if (e.isParticle) {
          // Narrow to the concrete type this branch is guaranteed to hold, so
          // the particle fields are checked rather than optional.
          const pe = ent as Particle & { sortY: number };
          ctx.save();
          ctx.globalAlpha = pe.life * 0.8; // Much higher overall alpha
          ctx.translate(pe.x, pe.y);
          
          if (pe.type === 'footstep') {
            ctx.rotate(pe.rotation || 0);
            
            // Create a dark radial gradient for the footprint
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, pe.size / 2);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)'); // Much darker center
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');   // Fades out
            
            ctx.fillStyle = gradient;
            // Draw a small footprint (oval)
            ctx.beginPath();
            ctx.ellipse(0, 0, pe.size / 2, pe.size / 4, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (pe.type === 'dust') {
            ctx.fillStyle = pe.color;
            ctx.beginPath();
            ctx.arc(0, 0, pe.size / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.rotate(pe.life * Math.PI * 4); // Swirl effect
            ctx.strokeStyle = pe.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, pe.size * (1 - pe.life), 0, Math.PI * 1.5);
            ctx.stroke();
          }
          ctx.restore();
        } else if (e.isItem) {
          // Item on ground
          const hover = Math.sin(animTimerRef.current * 2 + e.x) * 3;
          assets.draw(ctx, `items/${e.type}`, e.x - 20, e.y - 20 + hover, 40, 40);
        } else if (e.isEnemy) {
          drawEnemy(ctx, ent as Enemy);
        } else if (e.isAnimal) {
          drawAnimal(ctx, ent as Animal);
          
            // Debug: Draw collider shape for animals
            if (debugCollidersRef.current) {
              const { w, h, imgUrl, rows, cols: _cols, hasLabelCol: _hasLabelCol, hasLabelRow } = getAnimalSpriteInfo((ent as Animal).type);

              const shape = collidersRef.current.get(imgUrl);
              if (shape) {
                ctx.save();
                ctx.translate(e.x, e.y);
                
                const animRows = Math.max(1, hasLabelRow ? rows - 1 : rows);
                if (animRows < 3 && e.facing === 'left') ctx.scale(-1, 1);
                
                const scaleX = w / shape.originalWidth;
                const scaleY = h / shape.originalHeight;
                ctx.scale(scaleX, scaleY);
                // Align the collider to the bottom-center pivot
                ctx.translate(-shape.originalWidth / 2, -shape.originalHeight);
                
                // Draw Interaction Shape (Yellow)
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 1 / scaleX;
                ctx.beginPath();
                shape.points.forEach((p, i) => {
                  if (i === 0) ctx.moveTo(p.x, p.y);
                  else ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
                ctx.stroke();

                // Draw Physics Shape (Red)
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2 / scaleX;
                ctx.beginPath();
                shape.physicsPoints.forEach((p, i) => {
                  if (i === 0) ctx.moveTo(p.x, p.y);
                  else ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
                ctx.stroke();

                ctx.restore();
              }
            }
        } else if (e.type === 'tree' || e.type === 'bush' || e.type === 'sapling' || e.type === 'trunk' || e.type === 'torch' || e.type === 'workbench' || e.type === 'campfire' || e.type === 'bed' || e.type === 'chest' || e.type === 'furnace' || e.type === 'antenna' || e.type === 'fence') {
          const e = ent as Resource & { isTargeted?: boolean };
          ctx.globalAlpha = e.opacity ?? 1;
          const dims = getResourceDimensions(e.type, e.scale, e.growthStage);
          
          let img: Sprite | null = null;
          if (e.type === 'sapling') img = saplingImgRef.current;
          else if (e.type === 'bush') img = bushImgRef.current;
          else if (e.type === 'trunk') img = trunkImgRef.current;
          else if (e.type === 'tree') {
            img = e.growthStage === 1 ? smallTreeImgRef.current : treeImgRef.current;
          } else if (e.type === 'torch') img = torchImgRef.current;
          else if (e.type === 'workbench') img = workbenchImgRef.current;
          else if (e.type === 'campfire') img = (Math.floor(Date.now() / 200) % 2 === 0) ? campfire1ImgRef.current : campfire2ImgRef.current;
          else if (e.type === 'chest') img = chestImgRef.current;
          else if (e.type === 'furnace') img = furnaceImgRef.current;
          else if (e.type === 'antenna') img = antennaImgRef.current;
          else if (e.type === 'fence') img = fenceImgRef.current;

          if (img && img) {
            ctx.save();
            
            // Draw highlight if targeted
            if (e.isTargeted) {
              ctx.save();
              ctx.shadowBlur = 15;
              ctx.shadowColor = 'yellow';
              ctx.globalAlpha = 0.8;
              ctx.drawImage(img, Math.round(e.x), Math.round(e.y), dims.w, dims.h);
              ctx.restore();
            }

            // Swaying animation for living plants
            if (e.type !== 'trunk' && e.type !== 'torch' && e.type !== 'workbench' && e.type !== 'campfire' && e.type !== 'bed' && e.type !== 'chest' && e.type !== 'furnace' && e.type !== 'antenna' && e.type !== 'fence') {
              const sway = Math.sin(animTimerRef.current + e.x) * 0.03;
              ctx.translate(Math.round(e.x + dims.w/2), Math.round(e.y + dims.h));
              ctx.rotate(sway);
              ctx.translate(-Math.round(e.x + dims.w/2), -Math.round(e.y + dims.h));
            }
            
            ctx.drawImage(img, Math.round(e.x), Math.round(e.y), dims.w, dims.h);

            // Antenna Progress Bar
            if (e.type === 'antenna' && e.antennaProgress !== undefined) {
              const bw = 100;
              const bh = 10;
              ctx.fillStyle = 'rgba(0,0,0,0.5)';
              ctx.fillRect(e.x + dims.w/2 - bw/2, e.y - 20, bw, bh);
              ctx.fillStyle = '#4caf50';
              ctx.fillRect(e.x + dims.w/2 - bw/2, e.y - 20, bw * (e.antennaProgress / 100), bh);
              
              // Glowing effect if progress > 0
              if (e.antennaProgress > 0) {
                ctx.save();
                ctx.globalAlpha = (Math.sin(Date.now() / 500) * 0.5 + 0.5) * (e.antennaProgress / 100);
                ctx.shadowBlur = 20;
                ctx.shadowColor = '#00ff00';
                ctx.fillStyle = '#00ff00';
                ctx.beginPath();
                ctx.arc(e.x + dims.w/2, e.y + dims.h * 0.2, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
              }
            }

            ctx.restore();
          } else {
            // Manual fallbacks for resources
            ctx.save();
            ctx.translate(e.x + dims.w/2, e.y + dims.h/2);
            
            if (e.type === 'workbench') {
              ctx.fillStyle = '#8b4513';
              ctx.fillRect(-dims.w/2, -dims.h/2, dims.w, dims.h);
              ctx.strokeStyle = 'black';
              ctx.strokeRect(-dims.w/2, -dims.h/2, dims.w, dims.h);
              ctx.fillStyle = '#d2b48c';
              ctx.fillRect(-dims.w/2 + 5, -dims.h/2 + 5, dims.w - 10, 5);
            } else if (e.type === 'antenna') {
              ctx.fillStyle = '#555';
              ctx.fillRect(-5, -dims.h/2, 10, dims.h);
              ctx.fillRect(-dims.w/2, -dims.h/2, dims.w, 5);
              ctx.fillRect(-dims.w/3, -dims.h/2 + 15, dims.w * 0.6, 5);
            } else if (e.type === 'fence') {
              ctx.fillStyle = '#8b4513';
              ctx.fillRect(-dims.w/2, -dims.h/2, dims.w, 10);
              ctx.fillRect(-dims.w/2, dims.h/2 - 10, dims.w, 10);
              ctx.fillRect(-dims.w/2, -dims.h/2, 10, dims.h);
              ctx.fillRect(dims.w/2 - 10, -dims.h/2, 10, dims.h);
            } else if (e.type === 'furnace') {
              ctx.fillStyle = 'gray';
              ctx.fillRect(-dims.w/2, -dims.h/2, dims.w, dims.h);
              ctx.strokeStyle = 'black';
              ctx.strokeRect(-dims.w/2, -dims.h/2, dims.w, dims.h);
              ctx.fillStyle = 'black';
              ctx.fillRect(-dims.w/4, dims.h/4, dims.w/2, dims.h/4);
            } else if (e.type === 'chest') {
              ctx.fillStyle = '#8b4513';
              ctx.fillRect(-dims.w/2, -dims.h/2, dims.w, dims.h);
              ctx.strokeStyle = 'black';
              ctx.strokeRect(-dims.w/2, -dims.h/2, dims.w, dims.h);
              ctx.fillStyle = 'gold';
              ctx.fillRect(-2, -2, 4, 4);
            } else if (e.type === 'campfire') {
              ctx.fillStyle = '#8b4513';
              ctx.fillRect(-dims.w/2, dims.h/4, dims.w, dims.h/4);
              ctx.fillStyle = '#ff4500';
              ctx.beginPath();
              ctx.moveTo(-dims.w/4, dims.h/4);
              ctx.lineTo(0, -dims.h/2);
              ctx.lineTo(dims.w/4, dims.h/4);
              ctx.fill();
            } else if (e.type === 'torch') {
              ctx.strokeStyle = '#8b4513';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.moveTo(0, dims.h/2);
              ctx.lineTo(0, -dims.h/4);
              ctx.stroke();
              ctx.fillStyle = '#ff4500';
              ctx.beginPath();
              ctx.arc(0, -dims.h/2, 5, 0, Math.PI * 2);
              ctx.fill();
            } else if (e.type === 'bed') {
              ctx.fillStyle = '#5d4037';
              ctx.fillRect(-dims.w/2, -dims.h/2, dims.w, dims.h);
              ctx.fillStyle = '#e57373';
              ctx.fillRect(-dims.w/2 + 10, -dims.h/2 + 5, dims.w - 20, dims.h - 10);
              ctx.fillStyle = '#f5f5f5';
              ctx.fillRect(-dims.w/2 + 10, -dims.h/2 + 5, 20, dims.h - 10);
            } else if (e.type === 'sapling') {
              ctx.fillStyle = '#4caf50';
              ctx.fillRect(-2, -dims.h/2, 4, dims.h);
            } else if (e.type === 'bush') {
              ctx.fillStyle = '#1b5e20';
              ctx.beginPath();
              ctx.arc(0, 0, dims.w/2, 0, Math.PI * 2);
              ctx.fill();
            } else if (e.type === 'tree') {
              ctx.fillStyle = '#3e2723';
              ctx.fillRect(-5, 0, 10, dims.h);
              ctx.fillStyle = '#1b5e20';
              ctx.beginPath();
              ctx.arc(0, -dims.h/4, dims.w/2, 0, Math.PI * 2);
              ctx.fill();
            }
            
            ctx.restore();
          }
        } else if (ent.type === 'rock' || ent.type === 'coal_ore' || ent.type === 'iron_ore' || ent.type === 'branch' || ent.type === 'small_rock') {
          const e = ent as Resource & { isTargeted?: boolean };
          ctx.globalAlpha = e.opacity ?? 1;
          const dims = getResourceDimensions(e.type, e.scale, undefined, e.rockIndex);
          
          let img: Sprite | null = null;
          let imgUrl = '';
          imgUrl = idForEntity(ent.type as string, { rockIndex: e.rockIndex });
          if (ent.type === 'coal_ore') img = coalOreImgRef.current;
          else if (ent.type === 'iron_ore') img = ironOreImgRef.current;
          else if (ent.type === 'branch') img = stickImgRef.current;
          else if (ent.type === 'small_rock') img = stoneItemImgRef.current;
          else img = rockImgRefs.current[e.rockIndex ?? 0];
          
          if (img && img) {
            // Draw highlight if targeted
            if (e.isTargeted) {
              ctx.save();
              ctx.shadowBlur = 15;
              ctx.shadowColor = 'yellow';
              ctx.globalAlpha = 0.8;
              ctx.drawImage(img, Math.round(e.x), Math.round(e.y), dims.w, dims.h);
              ctx.restore();
            }
            ctx.drawImage(img, Math.round(e.x), Math.round(e.y), dims.w, dims.h);

            // Add black spots for coal ore if using rock image
            if (ent.type === 'coal_ore' && !imgUrl.includes('coalore')) {
              ctx.fillStyle = '#1a1a1a';
              const spotCount = 5;
              for (let s = 0; s < spotCount; s++) {
                const sx = e.x + (hash(e.x, s) % 100) / 100 * dims.w;
                const sy = e.y + (hash(e.y, s) % 100) / 100 * dims.h;
                ctx.beginPath();
                ctx.arc(sx, sy, 3, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            
            // Add orange spots for iron ore if using rock image
            if (ent.type === 'iron_ore' && !imgUrl.includes('ironore')) {
              ctx.fillStyle = '#d35400';
              const spotCount = 6;
              for (let s = 0; s < spotCount; s++) {
                const sx = e.x + (hash(e.x, s + 10) % 100) / 100 * dims.w;
                const sy = e.y + (hash(e.y, s + 10) % 100) / 100 * dims.h;
                ctx.beginPath();
                ctx.arc(sx, sy, 4, 0, Math.PI * 2);
                ctx.fill();
              }
            }

          // Debug drawing for colliders
            if (debugCollidersRef.current) {
              const shape = collidersRef.current.get(imgUrl);
              if (shape) {
                ctx.save();
                ctx.translate(Math.round(e.x), Math.round(e.y));
                const scaleX = dims.w / shape.originalWidth;
                const scaleY = dims.h / shape.originalHeight;
                ctx.scale(scaleX, scaleY);

                // Draw Interaction Shape (Yellow)
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 2 / scaleX;
                ctx.beginPath();
                shape.points.forEach((p, i) => {
                  if (i === 0) ctx.moveTo(p.x, p.y);
                  else ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
                ctx.stroke();

                // Draw Physics Shape (Red)
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2 / scaleX;
                ctx.beginPath();
                shape.physicsPoints.forEach((p, i) => {
                  if (i === 0) ctx.moveTo(p.x, p.y);
                  else ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
                ctx.stroke();

                ctx.restore();
              }
            }
          } else {
            // Fallback manual drawing
            if (e.isTargeted) {
              ctx.save();
              ctx.shadowBlur = 15;
              ctx.shadowColor = 'yellow';
              ctx.globalAlpha = 0.8;
              ctx.fillStyle = ent.type === 'coal_ore' ? '#444' : ROCK_COLOR;
              ctx.beginPath();
              ctx.moveTo(Math.round(e.x + dims.w/2), Math.round(e.y));
              ctx.lineTo(Math.round(e.x + dims.w), Math.round(e.y + dims.h/2));
              ctx.lineTo(Math.round(e.x + dims.w*0.75), Math.round(e.y + dims.h));
              ctx.lineTo(Math.round(e.x + dims.w*0.25), Math.round(e.y + dims.h));
              ctx.lineTo(Math.round(e.x), Math.round(e.y + dims.h/2));
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            }
            
            ctx.fillStyle = ent.type === 'coal_ore' ? '#444' : ROCK_COLOR;
            ctx.beginPath();
            ctx.moveTo(Math.round(e.x + dims.w/2), Math.round(e.y));
            ctx.lineTo(Math.round(e.x + dims.w), Math.round(e.y + dims.h/2));
            ctx.lineTo(Math.round(e.x + dims.w*0.75), Math.round(e.y + dims.h));
            ctx.lineTo(Math.round(e.x + dims.w*0.25), Math.round(e.y + dims.h));
            ctx.lineTo(Math.round(e.x), Math.round(e.y + dims.h/2));
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        } else if (ent.type === 'grass') {
          const e = ent as Resource & { isTargeted?: boolean };
          ctx.globalAlpha = e.opacity ?? 1;
          const dims = getResourceDimensions(e.type, e.scale);
          
          ctx.save();
          if (e.isTargeted) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'yellow';
          }

          if (e.type === 'branch') {
            const img = stickImgRef.current;
            if (img && img) {
              ctx.drawImage(img, Math.round(e.x), Math.round(e.y), dims.w, dims.h);
            } else {
              ctx.strokeStyle = '#8b4513';
              ctx.lineWidth = 4 * e.scale;
              ctx.beginPath();
              ctx.moveTo(e.x + dims.w * 0.2, e.y + dims.h * 0.8);
              ctx.lineTo(e.x + dims.w * 0.8, e.y + dims.h * 0.2);
              ctx.stroke();
            }
          } else if (e.type === 'small_rock') {
            const img = stoneItemImgRef.current;
            if (img && img) {
              ctx.drawImage(img, Math.round(e.x), Math.round(e.y), dims.w, dims.h);
            } else {
              ctx.fillStyle = ROCK_COLOR;
              ctx.beginPath();
              ctx.arc(e.x + dims.w/2, e.y + dims.h/2, dims.w/2.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
          } else if (e.type === 'grass') {
            // Draw grass blades
            ctx.strokeStyle = '#4caf50';
            ctx.lineWidth = 2 * e.scale;
            const bladeCount = 5;
            for (let b = 0; b < bladeCount; b++) {
              const bx = e.x + (b / bladeCount) * dims.w;
              const bh = dims.h * (0.4 + (Math.sin(e.x + b) * 0.2 + 0.2));
              const sway = Math.sin(animTimerRef.current + e.x + b) * 5;
              ctx.beginPath();
              ctx.moveTo(bx, e.y + dims.h);
              ctx.quadraticCurveTo(bx + sway, e.y + dims.h - bh/2, bx + sway * 1.5, e.y + dims.h - bh);
              ctx.stroke();
            }
          }
          ctx.restore();
          ctx.globalAlpha = 1;
        } else if (ent.type === 'player') {
          const p = ent as GameState['player'];
          if (spriteRef.current && spriteRef.current) {
            // Rows are authored as down, left, right, up.
            const grid = PLAYER_FRAME.grid ?? { cols: 8, rows: 4, cellW: 64, cellH: 96 };
            const ROW_FOR_FACING = { down: 0, left: 1, right: 2, up: 3 } as const;
            const frameY = ROW_FOR_FACING[p.facing ?? 'down'];
            const finalFrameX = Math.floor(p.animFrame) % grid.cols;

            const spriteWidth = spriteRef.current.width / grid.cols;
            const spriteHeight = spriteRef.current.height / grid.rows;

            ctx.save();
            ctx.drawImage(
              spriteRef.current,
              finalFrameX * spriteWidth, frameY * spriteHeight, spriteWidth, spriteHeight,
              Math.round(p.x), Math.round(p.y), PLAYER_SIZE, PLAYER_SIZE
            );
            
            // Draw Armor Overlays on Player
            const pScale = PLAYER_SIZE / 32; // Assuming base sprite is 32x32 logically
            if (state.player.equipment.head) {
              ctx.fillStyle = 'rgba(139, 69, 19, 0.8)';
              ctx.fillRect(Math.round(p.x) + 10 * pScale, Math.round(p.y) + 2 * pScale, 12 * pScale, 8 * pScale);
            }
            if (state.player.equipment.torso) {
              ctx.fillStyle = 'rgba(160, 82, 45, 0.8)';
              ctx.fillRect(Math.round(p.x) + 8 * pScale, Math.round(p.y) + 10 * pScale, 16 * pScale, 12 * pScale);
            }
            if (state.player.equipment.legs) {
              ctx.fillStyle = 'rgba(139, 69, 19, 0.8)';
              ctx.fillRect(Math.round(p.x) + 10 * pScale, Math.round(p.y) + 22 * pScale, 12 * pScale, 8 * pScale);
            }
            if (state.player.equipment.feet) {
              ctx.fillStyle = 'rgba(101, 67, 33, 0.8)';
              ctx.fillRect(Math.round(p.x) + 8 * pScale, Math.round(p.y) + 28 * pScale, 16 * pScale, 4 * pScale);
            }
            if (state.player.equipment.back) {
              ctx.fillStyle = 'rgba(139, 69, 19, 0.9)';
              // Draw backpack based on facing direction
              if (p.facing === 'up') {
                ctx.fillRect(Math.round(p.x) + 8 * pScale, Math.round(p.y) + 10 * pScale, 16 * pScale, 14 * pScale);
              } else if (p.facing === 'left') {
                ctx.fillRect(Math.round(p.x) + 18 * pScale, Math.round(p.y) + 10 * pScale, 6 * pScale, 14 * pScale);
              } else if (p.facing === 'right') {
                ctx.fillRect(Math.round(p.x) + 8 * pScale, Math.round(p.y) + 10 * pScale, 6 * pScale, 14 * pScale);
              }
            }

            // Draw held tool
            const selectedItem = p.inventory[p.selectedSlot];
            if (selectedItem) {
              const isTool = selectedItem.type.includes('axe') || selectedItem.type.includes('pickaxe') || selectedItem.type.includes('sword');
              const toolSize = isTool ? 100 : 50;
              let toolX = p.x + PLAYER_SIZE / 2;
              let toolY = p.y + PLAYER_SIZE / 2 + 10;
              let rotation = 0;
              let scaleX = 1;

              if (p.facing === 'down') {
                toolX += isTool ? 25 : 15;
                toolY += isTool ? 25 : 15;
                rotation = Math.PI / 4;
              } else if (p.facing === 'up') {
                toolX -= isTool ? 25 : 15;
                toolY -= isTool ? 15 : 5;
                rotation = -Math.PI / 4;
              } else if (p.facing === 'right') {
                toolX += isTool ? 35 : 25;
                toolY += isTool ? 20 : 10;
                rotation = Math.PI / 4;
              } else if (p.facing === 'left') {
                toolX -= isTool ? 35 : 25;
                toolY += isTool ? 20 : 10;
                rotation = Math.PI / 4;
                scaleX = -1;
              }

              // Add swing animation if moving or clicking
              if (keysRef.current.size > 0) {
                rotation += Math.sin(animTimerRef.current * 10) * 0.2;
              }

              ctx.save();
              ctx.translate(toolX, toolY);
              if (scaleX === -1) {
                ctx.scale(-1, 1);
              }
              ctx.rotate(rotation);
              assets.draw(ctx, `items/${selectedItem.type}`, -toolSize / 2, -toolSize / 2, toolSize, toolSize);
              ctx.restore();
            }

            ctx.restore();
          }
        }
      });

      ctx.restore();

      const hour = state.time / 60;
      let night_strength = 0;
      if (hour >= 18 && hour < 20) night_strength = (hour - 18) / 2;
      else if (hour >= 20 || hour < 4) night_strength = 1.0;
      else if (hour >= 4 && hour < 6) night_strength = (6 - hour) / 2;

      if (night_strength > 0) {
        // Create a temporary canvas for the darkness mask
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = state.width;
        maskCanvas.height = state.height;
        const mctx = maskCanvas.getContext('2d');
        if (mctx) {
          const selectedItem = state.player.inventory[state.player.selectedSlot];
          const hasTorch = selectedItem && selectedItem.type === 'torch';

          // 1. The Ambient Filter: Deep Navy (#1a1a3a)
          // We use night_strength to control opacity so it transitions from Sunset to Midnight
          // Make it darker (0.95 opacity) when holding nothing, and slightly lighter (0.85) with a torch
          const maxOpacity = hasTorch ? 0.85 : 0.95;
          mctx.fillStyle = `rgba(26, 26, 58, ${night_strength * maxOpacity})`;
          mctx.fillRect(0, 0, state.width, state.height);

          // Draw light sources by punching holes in the darkness
          mctx.globalCompositeOperation = 'destination-out';
          
          // 2. The Player Light: Circular 'Vision Mask' centered on the player
          // 3. Interaction: Centered on Farmer sprite
          const playerCenterX = Math.round(state.player.x + PLAYER_SIZE/2 - state.camera.x);
          const playerCenterY = Math.round(state.player.y + PLAYER_SIZE/2 - state.camera.y);
          
          // Keep the circle size consistent (100-250)
          const innerRadius = 100;
          const outerRadius = 250;
          
          const pGrad = mctx.createRadialGradient(
            playerCenterX, playerCenterY, innerRadius,
            playerCenterX, playerCenterY, outerRadius
          );
          
          // If holding a torch, erase 100% of the darkness (alpha 1). 
          // If not, only erase a portion of it (alpha 0.3) so the center isn't fully bright.
          const centerAlpha = hasTorch ? 1 : 0.3;
          pGrad.addColorStop(0, `rgba(255, 255, 255, ${centerAlpha})`);
          // Outer Radius: Smoothly fade into Ambient Navy color -> Erase 0% of the navy tint
          pGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          
          mctx.fillStyle = pGrad;
          mctx.beginPath();
          mctx.arc(playerCenterX, playerCenterY, outerRadius, 0, Math.PI * 2);
          mctx.fill();

          // Torch and Campfire lights
          visibleResources.forEach(res => {
            if (res.type === 'torch' || res.type === 'campfire') {
              const radius = res.type === 'campfire' ? 250 : 150;
              const innerRad = res.type === 'campfire' ? 100 : 50;
              const tGrad = mctx.createRadialGradient(
                Math.round(res.x + 16 - state.camera.x),
                Math.round(res.y + 16 - state.camera.y),
                innerRad,
                Math.round(res.x + 16 - state.camera.x),
                Math.round(res.y + 16 - state.camera.y),
                radius
              );
              tGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
              tGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
              mctx.fillStyle = tGrad;
              mctx.beginPath();
              mctx.arc(
                Math.round(res.x + 16 - state.camera.x),
                Math.round(res.y + 16 - state.camera.y),
                radius, 0, Math.PI * 2
              );
              mctx.fill();
            }
          });

          // Draw the darkness mask over the game
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(maskCanvas, 0, 0);
        }
      }

      // HUD moved to React; publish a snapshot instead of drawing it here.
      // publishHud compares before notifying, so this is cheap every frame.
      publishHud({
        health: state.player.health,
        hunger: state.player.hunger,
        maxHunger: MAX_HUNGER,
        canSprint: state.player.hunger > 6,
        defense: state.player.defense,
        selectedSlot: state.player.selectedSlot,
        hotbar: toHotbar(state.player.inventory, HOTBAR_SLOTS),
        timeLabel: `${Math.floor(state.time / 60).toString().padStart(2, '0')}:${Math.floor(state.time % 60).toString().padStart(2, '0')}`,
        message: state.message && Date.now() - state.message.time < 2000 ? state.message.text : null,
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      soundManager.resume();
      
      if (e.code === 'Escape') {
        stateRef.current.isPaused = !stateRef.current.isPaused;
        setIsPausedUI(stateRef.current.isPaused);
        setPauseMenuState('main');
        return;
      }

      keysRef.current.add(e.code);
      if (e.shiftKey || e.key === 'Shift') {
        keysRef.current.add('Shift');
        keysRef.current.add('ShiftLeft');
        keysRef.current.add('ShiftRight');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      if (e.key === 'Shift') {
        keysRef.current.delete('Shift');
        keysRef.current.delete('ShiftLeft');
        keysRef.current.delete('ShiftRight');
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      soundManager.resume();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
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

              const shape = collidersRef.current.get(imgUrl);
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

                        const shape = collidersRef.current.get(imgUrl);
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
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * state.width);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * state.height);
      state.mousePos = { x, y };
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        stateRef.current.isRightMouseDown = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('contextmenu', handleContextMenu);

    let animationFrameId: number;

    const loop = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const dt = Math.min(2.0, (time - lastTimeRef.current) / (1000 / 60)); // Normalize to 60fps, cap at 2.0 to prevent huge jumps
      lastTimeRef.current = time;

      if (stateRef.current.isPaused) {
        draw(); // Keep rendering the background
        animationFrameId = requestAnimationFrame(loop);
        return;
      }

      update(dt);
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  /**
   * Write the current world to a slot. Shared by the pause menu and autosave so
   * there is only one serialisation path.
   */
  const persist = React.useCallback(async (slotId?: string) => {
    const meta = saveMetaRef.current;
    const id = slotId ?? meta.id;
    const save = serialize(stateRef.current, {
      name: meta.name,
      createdAt: meta.createdAt,
      playtimeMs: meta.playtimeMs + (Date.now() - sessionStartRef.current),
    });
    await writeSlot(id, save);
    saveMetaRef.current = { ...meta, id, playtimeMs: save.playtimeMs };
    sessionStartRef.current = Date.now();
    return save;
  }, []);

  // Autosave, so a closed tab does not cost an hour of play.
  React.useEffect(() => {
    if (!assetsReady) return;
    const id = window.setInterval(() => {
      setSaveState('saving');
      persist()
        .then(() => {
          setSaveState('saved');
          window.setTimeout(() => setSaveState('idle'), 1500);
        })
        .catch((err: unknown) => {
          debugError('Autosave failed', err);
          setSaveState('error');
        });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [assetsReady, persist]);

  const handleSaveGame = () => {
    setSaveState('saving');
    persist()
      .then(() => {
        setSaveState('saved');
        window.setTimeout(() => setSaveState('idle'), 1800);
      })
      .catch((err: unknown) => {
        debugError('Save failed', err);
        setSaveState('error');
      });
  };

  /** Download the current world, so a save can survive a cleared browser. */
  const handleExportSave = () => {
    const save = serialize(stateRef.current, {
      name: saveMetaRef.current.name,
      createdAt: saveMetaRef.current.createdAt,
      playtimeMs: saveMetaRef.current.playtimeMs,
    });
    const blob = new Blob([toSaveFile(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buns-${saveMetaRef.current.id}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const MenuButton = ({ onClick, children }: { onClick: () => void, children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`
        relative w-64 py-4 px-4 mb-6 font-mono text-xl font-bold tracking-widest uppercase
        transition-transform duration-100 hover:-translate-y-1 active:translate-y-1
      `}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Pixel Art Border & Background using Box Shadow */}
      <div className="absolute inset-0 bg-[#8b5a2b] -z-10" 
           style={{
             boxShadow: `
               inset -4px -4px 0px 0px rgba(0,0,0,0.4),
               inset 4px 4px 0px 0px rgba(255,255,255,0.2),
               0 0 0 4px #3e2723,
               8px 8px 0px 0px rgba(0,0,0,0.3)
             `
           }}>
        {/* Wood grain lines */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 4px, #000 4px, #000 8px)',
          backgroundSize: '100% 8px'
        }}></div>
      </div>
      <span style={{ textShadow: '2px 2px 0 #3e2723, -2px -2px 0 #3e2723, 2px -2px 0 #3e2723, -2px 2px 0 #3e2723' }} className="text-white">
        {children}
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-neutral-900 overflow-hidden">
      {!assetsReady && (
        <LoadingScreen loaded={assetProgress.loaded} total={assetProgress.total} />
      )}

      {isTouch && isPortrait && <RotatePrompt />}

      {isTouch && assetsReady && (
        <TouchControls
          keys={keysRef}
          onOpenInventory={() => {
            const st = stateRef.current;
            st.isInventoryOpen = !st.isInventoryOpen;
            if (!st.isInventoryOpen) {
              st.isWorkbenchOpen = false;
              st.openChestId = null;
            }
            refreshUI();
          }}
        />
      )}

      <SaveIndicator state={saveState} />

      {loadError && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 p-6">
          <div className="max-w-lg border-2 border-[#8e2020] bg-[#1e2629] p-6 font-mono text-sm text-white">
            <h2 className="mb-3 text-lg font-bold text-[#ff9c9c]">Could not load that save</h2>
            <p className="mb-4 text-white/80">{loadError}</p>
            <p className="mb-5 text-xs text-white/50">
              The world you are in now is a fresh one; your save file has not been overwritten.
            </p>
            <button
              type="button"
              onClick={() => setLoadError(null)}
              className="border-2 border-[#7c4d23] px-4 py-2 text-[#fed859] hover:bg-white/10"
            >
              Continue in a new world
            </button>
          </div>
        </div>
      )}

      {assetsReady && (
        <Hud
          compact={isTouch}
          onSelectSlot={(i) => {
            stateRef.current.player.selectedSlot = i;
          }}
        />
      )}

      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ imageRendering: 'pixelated', width: '100vw', height: '100vh' }}
        className="block"
      />
      
      {isPausedUI && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50" style={{ backdropFilter: 'blur(4px)' }}>
          {pauseMenuState === 'main' && (
            <div className="flex flex-col items-center bg-[#8b5a2b] p-8"
                 style={{
                   boxShadow: `
                     inset -4px -4px 0px 0px rgba(0,0,0,0.4),
                     inset 4px 4px 0px 0px rgba(255,255,255,0.2),
                     0 0 0 4px #3e2723,
                     12px 12px 0px 0px rgba(0,0,0,0.3)
                   `
                 }}>
              <h2 className="text-5xl font-mono font-black text-white mb-10 tracking-tighter" 
                  style={{ 
                    textShadow: '4px 4px 0 #3e2723, 8px 8px 0 rgba(0,0,0,0.5)',
                    WebkitTextStroke: '2px #3e2723'
                  }}>
                PAUSED
              </h2>
              <MenuButton onClick={() => { stateRef.current.isPaused = false; setIsPausedUI(false); }}>Resume</MenuButton>
              <MenuButton onClick={handleSaveGame}>Save Game</MenuButton>
              <MenuButton onClick={handleExportSave}>Export Save</MenuButton>
              <MenuButton onClick={() => setPauseMenuState('settings')}>Settings</MenuButton>
              <MenuButton onClick={() => { if(onExitToMenu) onExitToMenu(); }}>Main Menu</MenuButton>
            </div>
          )}
          {pauseMenuState === 'settings' && (
            <div className="flex flex-col items-center bg-[#8b5a2b] p-8 w-96"
                 style={{
                   boxShadow: `
                     inset -4px -4px 0px 0px rgba(0,0,0,0.4),
                     inset 4px 4px 0px 0px rgba(255,255,255,0.2),
                     0 0 0 4px #3e2723,
                     12px 12px 0px 0px rgba(0,0,0,0.3)
                   `
                 }}>
              <h2 className="text-3xl font-mono text-white mb-8" style={{ textShadow: '2px 2px 0 #3e2723' }}>Settings</h2>
              <div className="w-full mb-6">
                <label className="block text-white font-mono mb-2" style={{ textShadow: '1px 1px 0 #3e2723' }}>Master Volume: {volume}%</label>
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={volume}
                  onChange={(e) => setVolume(parseInt(e.target.value))}
                  className="w-full accent-[#3e2723]" 
                />
              </div>
              <MenuButton onClick={() => setPauseMenuState('main')}>Back</MenuButton>
            </div>
          )}
        </div>
      )}

      {/* Admin Menu */}
      <div className="fixed top-4 right-4 z-50 flex flex-col items-end">
        <button 
          onClick={() => setIsAdminMenuOpen(!isAdminMenuOpen)}
          className="bg-black/60 text-white px-3 py-1 rounded text-xs hover:bg-black/80 transition-colors font-mono mb-2"
        >
          ADMIN
        </button>
        
        {isAdminMenuOpen && (
          <div className="bg-[#8b5a2b] p-3 flex flex-col gap-2"
               style={{
                 boxShadow: `
                   inset -2px -2px 0px 0px rgba(0,0,0,0.4),
                   inset 2px 2px 0px 0px rgba(255,255,255,0.2),
                   0 0 0 2px #3e2723,
                   4px 4px 0px 0px rgba(0,0,0,0.3)
                 `
               }}>
            <button 
              onClick={() => {
                stateRef.current.player.x = 0;
                stateRef.current.player.y = 0;
                stateRef.current.camera.x = stateRef.current.player.x - stateRef.current.width / 2;
                stateRef.current.camera.y = stateRef.current.player.y - stateRef.current.height / 2;
                stateRef.current.message = { text: "Respawned at world spawn", time: Date.now() };
                setIsAdminMenuOpen(false);
              }}
              className="bg-[#6b421c] hover:bg-[#a06b35] text-white px-3 py-2 text-xs font-mono transition-colors text-left"
              style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2)' }}
            >
              RESPAWN (R)
            </button>
            <button 
              onClick={() => {
                if (startNewGameRef.current) startNewGameRef.current();
                setIsAdminMenuOpen(false);
              }}
              className="bg-[#6b421c] hover:bg-[#a06b35] text-white px-3 py-2 text-xs font-mono transition-colors text-left"
              style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2)' }}
            >
              NEW WORLD (N)
            </button>
            <button 
              onClick={() => {
                debugCollidersRef.current = !debugCollidersRef.current;
                setDebugColliders(debugCollidersRef.current);
              }}
              className="bg-[#6b421c] hover:bg-[#a06b35] text-white px-3 py-2 text-xs font-mono transition-colors text-left"
              style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2)' }}
            >
              {debugColliders ? 'Hide Hitboxes' : 'Show Hitboxes'}
            </button>
            <button 
              onClick={() => {
                stateRef.current.time = 480; // 08:00
              }}
              className="bg-[#6b421c] hover:bg-[#a06b35] text-white px-3 py-2 text-xs font-mono transition-colors text-left"
              style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2)' }}
            >
              Set Day
            </button>
            <button 
              onClick={() => {
                stateRef.current.time = 1200; // 20:00
              }}
              className="bg-[#6b421c] hover:bg-[#a06b35] text-white px-3 py-2 text-xs font-mono transition-colors text-left"
              style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2)' }}
            >
              Set Night
            </button>
          </div>
        )}
      </div>

      {/* Inventory Overlay */}
      <AnimatePresence>
        {stateRef.current.isInventoryOpen && (
          <InventoryOverlay 
            state={stateRef.current} 
            refreshUI={refreshUI} 
            onClose={() => {
              stateRef.current.isInventoryOpen = false;
              stateRef.current.isWorkbenchOpen = false;
              stateRef.current.openChestId = null;
              refreshUI();
            }}
          />
        )}
      </AnimatePresence>

      {!isTouch && (
        <div className="absolute bottom-4 right-4 text-neutral-400 text-xs font-mono bg-black/50 p-2 rounded pointer-events-none">
          WASD: Move | SPACE: Harvest | X: Sit | E: Inventory
        </div>
      )}
    </div>
  );
}

// --- UI Components ---
