'use client';

// Game component for the resource gathering and crafting game
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SpriteColliderGenerator, CollisionLayer, ColliderShape, Point } from '../lib/SpriteCollider';
import { soundManager } from '../lib/SoundManager';
import { debug, debugError } from '@/lib/debug';

const PLAYER_SIZE = 128;
const PLAYER_SPEED = 5.0;

// Colors
const TREE_TRUNK = '#3e2723';
const ROCK_COLOR = '#5a5a5a';
const ROCK_SIZE = 64;
const GLOBAL_ASSET_SCALE = 1.0;
const CHUNK_SIZE = 1024;
const INVENTORY_SLOTS = 36;
const HOTBAR_SLOTS = 9;
const MAIN_INV_ROWS = 3;
const MAIN_INV_COLS = 9;
const SLOT_SIZE = 50;
const SLOT_MARGIN = 10;
const MAX_HUNGER = 10;

const SMELT_RECIPES: Record<string, string> = {
  'raw_beef': 'cooked_beef',
  'raw_pork': 'cooked_pork',
  'mutton': 'cooked_mutton',
  'raw_chicken': 'cooked_chicken',
  'scrap_metal': 'copper_wiring',
  'iron_ore': 'iron_ingot',
};

const FUEL_VALUES: Record<string, number> = {
  'wood': 900, // 15 seconds at 60fps
  'coal': 3600, // 60 seconds
  'stick': 300 // 5 seconds
};

const SMELT_TIME = 600; // 10 seconds to smelt


// Deterministic Noise Functions
let currentWorldSeed = 42;

const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263 + currentWorldSeed * 123456789) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

// Optimized Noise with Permutation Table
const P = new Uint8Array(512);
const p = new Uint8Array(256);

const reseedNoise = (seed: number) => {
  currentWorldSeed = seed;
  for (let i = 0; i < 256; i++) p[i] = i;
  
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const r = (s - 1) % (i + 1);
    [p[i], p[r]] = [p[r], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
};

// Initial seed
reseedNoise(42);

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t: number, a: number, b: number) => a + t * (b - a);

const noise2D = (x: number, y: number) => {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  
  const a = P[X] + Y;
  const b = P[X + 1] + Y;
  
  const aa = P[a] / 255;
  const ba = P[b] / 255;
  const ab = P[a + 1] / 255;
  const bb = P[b + 1] / 255;

  return lerp(v, lerp(u, aa, ba), lerp(u, ab, bb));
};

const fbm = (x: number, y: number, octaves = 3) => {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += noise2D(x * freq, y * freq) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return val;
};

type EntityType = 'tree' | 'rock' | 'bush' | 'sapling' | 'trunk' | 'coal_ore' | 'torch' | 'workbench' | 'campfire' | 'branch' | 'small_rock' | 'grass' | 'bed' | 'chest' | 'furnace' | 'antenna' | 'fence' | 'iron_ore';
type ItemType = 'wood' | 'stone' | 'sapling' | 'coal' | 'stick' | 'workbench' | 'campfire' | 'torch' | 'wheat_seeds' | 'wooden_axe' | 'wooden_pickaxe' | 'stone_axe' | 'stone_pickaxe' | 'wooden_sword' | 'stone_sword' | 'raw_beef' | 'leather' | 'raw_pork' | 'mutton' | 'wool' | 'raw_chicken' | 'feather' | 'egg' | 'bed' | 'leather_cap' | 'leather_tunic' | 'leather_pants' | 'leather_boots' | 'leather_backpack' | 'chest' | 'furnace' | 'cooked_beef' | 'cooked_pork' | 'cooked_mutton' | 'cooked_chicken' | 'scrap_metal' | 'copper_wiring' | 'iron_ingot' | 'iron_axe' | 'iron_pickaxe' | 'iron_sword' | 'antenna' | 'fence' | 'bread' | 'meat_pie' | 'omelet' | 'wheat';

interface Ingredient {
  type: ItemType;
  count: number;
}

interface Recipe {
  id: string;
  output: ItemType;
  count: number;
  ingredients: Ingredient[];
  requiresWorkbench?: boolean;
}

const CRAFTING_RECIPES: Recipe[] = [
  { id: 'stick', output: 'stick', count: 4, ingredients: [{ type: 'wood', count: 1 }] },
  { id: 'workbench', output: 'workbench', count: 1, ingredients: [{ type: 'wood', count: 10 }] },
  { id: 'furnace', output: 'furnace', count: 1, ingredients: [{ type: 'stone', count: 15 }] },
  { id: 'chest', output: 'chest', count: 1, ingredients: [{ type: 'wood', count: 12 }] },
  { id: 'torch', output: 'torch', count: 4, ingredients: [{ type: 'stick', count: 1 }, { type: 'coal', count: 1 }] },
  { id: 'bed', output: 'bed', count: 1, ingredients: [{ type: 'wood', count: 10 }, { type: 'wool', count: 3 }] },
  { id: 'fence', output: 'fence', count: 4, ingredients: [{ type: 'wood', count: 4 }] },
  { id: 'antenna', output: 'antenna', count: 1, ingredients: [{ type: 'iron_ingot', count: 10 }, { type: 'copper_wiring', count: 5 }], requiresWorkbench: true },
  
  // Tools
  { id: 'wooden_axe', output: 'wooden_axe', count: 1, ingredients: [{ type: 'wood', count: 3 }, { type: 'stick', count: 2 }] },
  { id: 'wooden_pickaxe', output: 'wooden_pickaxe', count: 1, ingredients: [{ type: 'wood', count: 3 }, { type: 'stick', count: 2 }] },
  { id: 'wooden_sword', output: 'wooden_sword', count: 1, ingredients: [{ type: 'wood', count: 2 }, { type: 'stick', count: 1 }] },
  
  { id: 'stone_axe', output: 'stone_axe', count: 1, ingredients: [{ type: 'stone', count: 3 }, { type: 'stick', count: 2 }], requiresWorkbench: true },
  { id: 'stone_pickaxe', output: 'stone_pickaxe', count: 1, ingredients: [{ type: 'stone', count: 3 }, { type: 'stick', count: 2 }], requiresWorkbench: true },
  { id: 'stone_sword', output: 'stone_sword', count: 1, ingredients: [{ type: 'stone', count: 2 }, { type: 'stick', count: 1 }], requiresWorkbench: true },
  
  { id: 'iron_axe', output: 'iron_axe', count: 1, ingredients: [{ type: 'iron_ingot', count: 3 }, { type: 'stick', count: 2 }], requiresWorkbench: true },
  { id: 'iron_pickaxe', output: 'iron_pickaxe', count: 1, ingredients: [{ type: 'iron_ingot', count: 3 }, { type: 'stick', count: 2 }], requiresWorkbench: true },
  { id: 'iron_sword', output: 'iron_sword', count: 1, ingredients: [{ type: 'iron_ingot', count: 2 }, { type: 'stick', count: 1 }], requiresWorkbench: true },

  // Armor
  { id: 'leather_cap', output: 'leather_cap', count: 1, ingredients: [{ type: 'leather', count: 5 }], requiresWorkbench: true },
  { id: 'leather_tunic', output: 'leather_tunic', count: 1, ingredients: [{ type: 'leather', count: 8 }], requiresWorkbench: true },
  { id: 'leather_pants', output: 'leather_pants', count: 1, ingredients: [{ type: 'leather', count: 7 }], requiresWorkbench: true },
  { id: 'leather_boots', output: 'leather_boots', count: 1, ingredients: [{ type: 'leather', count: 4 }], requiresWorkbench: true },
  { id: 'leather_backpack', output: 'leather_backpack', count: 1, ingredients: [{ type: 'leather', count: 10 }, { type: 'wool', count: 2 }], requiresWorkbench: true },

  // Food
  { id: 'bread', output: 'bread', count: 1, ingredients: [{ type: 'wheat', count: 3 }] },
  { id: 'meat_pie', output: 'meat_pie', count: 1, ingredients: [{ type: 'cooked_beef', count: 1 }, { type: 'wheat', count: 2 }], requiresWorkbench: true },
  { id: 'omelet', output: 'omelet', count: 1, ingredients: [{ type: 'egg', count: 2 }], requiresWorkbench: true },
];

type EquipmentSlotName = 'head' | 'torso' | 'legs' | 'feet' | 'back';
type Equipment = Record<EquipmentSlotName, InventorySlot | null>;

type AnimalType = 'cow' | 'pig' | 'sheep' | 'chicken';

type AnimalState = 'idle' | 'wander' | 'panic';

interface Animal {
  id: string;
  type: AnimalType;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  state: AnimalState;
  targetX: number;
  targetY: number;
  timer: number;
  facing: 'left' | 'right' | 'up' | 'down';
  lastHitTime: number;
  eggTimer?: number;
  animFrame: number;
  isMoving: boolean;
}

interface InventorySlot {
  type: ItemType;
  count: number;
}

interface Resource {
  id: string;
  x: number;
  y: number;
  type: EntityType;
  hits: number;
  maxHits: number;
  scale: number;
  opacity: number;
  rockIndex?: number; // 0-8 for variety
  growthStage?: number; // 0: sapling, 1: small tree, 2: tree
  inventory?: (InventorySlot | null)[]; // For chests and furnaces
  smeltTimer?: number;
  fuelTimer?: number;
  maxFuelTimer?: number;
  growthTimer?: number;
  antennaProgress?: number; // 0 to 100
}

interface Enemy {
  id: string;
  type: 'static' | 'wolf';
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  targetX: number;
  targetY: number;
  state: 'idle' | 'chase' | 'attack';
  timer: number;
  facing: 'left' | 'right';
  lastHitTime: number;
  tier?: number; // For static enemies (1-5)
}

interface DroppedItem {
  id: string;
  x: number;
  y: number;
  type: ItemType;
}

/**
 * An entry in the z-sorted draw list. The list is heterogeneous — resources,
 * dropped items, animals, enemies, particles and the player all go through the
 * same sort — so this widens the members that genuinely differ between those
 * types and keeps the rest checked.
 */
type RenderEntity =
  Partial<Omit<Resource, 'type'>> &
  Partial<Omit<Animal, 'type' | 'facing' | 'state'>> &
  Partial<Omit<Enemy, 'type' | 'facing' | 'state'>> &
  Partial<Omit<DroppedItem, 'type'>> &
  Partial<Omit<Particle, 'type'>> & {
    x: number;
    y: number;
    sortY: number;
    type?: EntityType | ItemType | AnimalType | 'player' | 'static' | 'wolf';
    facing?: 'left' | 'right' | 'up' | 'down';
    state?: string;
    isResource?: boolean;
    isItem?: boolean;
    isAnimal?: boolean;
    isEnemy?: boolean;
    isParticle?: boolean;
    isTargeted?: boolean;
  };

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'swirl' | 'footstep' | 'dust';
  rotation?: number;
}

interface GameState {
  width: number;
  height: number;
  player: {
    x: number;
    y: number;
    isSprinting: boolean;
    health: number;
    hunger: number;
    defense: number;
    inventory: (InventorySlot | null)[];
    equipment: Equipment;
    selectedSlot: number;
    facing: 'up' | 'down' | 'left' | 'right';
    isMoving: boolean;
    isSitting: boolean;
    lastMoveTime: number;
    animFrame: number;
    lastStarveDamageTime: number;
    footstepTimer: number;
  };
  isPaused: boolean;
  resources: Map<string, Resource[]>; // Spatial partitioning: chunkId -> resources
  items: DroppedItem[];
  animals: Animal[];
  enemies: Enemy[];
  particles: Particle[];
  camera: {
    x: number;
    y: number;
  };
  generatedChunks: Set<string>;
  time: number; // 0 to 1440 (minutes in a day)
  shake: number;
  isInventoryOpen: boolean;
  isWorkbenchOpen: boolean;
  openChestId: string | null;
  selectedResourceId: string | null;
  selectedAnimalId: string | null;
  draggedItem: { slotIndex: number, item: InventorySlot, equipSlot?: 'head' | 'torso' | 'legs' | 'feet' | 'back', fromChest?: boolean } | null;
  mousePos: { x: number, y: number };
  message: { text: string, time: number } | null;
  isRightMouseDown: boolean;
  lastEatTime: number;
}

interface GameProps {
  onExitToMenu?: () => void;
  loadedSaveId?: string | null;
}

export default function Game({ onExitToMenu, loadedSaveId }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isPausedUI, setIsPausedUI] = useState(false);
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
  const spriteRef = useRef<HTMLImageElement | null>(null);
  
  // Tree Stage Refs
  const saplingImgRef = useRef<HTMLImageElement | null>(null);
  const smallTreeImgRef = useRef<HTMLImageElement | null>(null);
  const treeImgRef = useRef<HTMLImageElement | null>(null);
  const trunkImgRef = useRef<HTMLImageElement | null>(null);
  const bushImgRef = useRef<HTMLImageElement | null>(null);
  const grassTilesRef = useRef<HTMLImageElement | null>(null);
  const dirtTilesRef = useRef<HTMLImageElement | null>(null);
  const woodItemImgRef = useRef<HTMLImageElement | null>(null);
  const stoneItemImgRef = useRef<HTMLImageElement | null>(null);
  const coalImgRef = useRef<HTMLImageElement | null>(null);
  const coalOreImgRef = useRef<HTMLImageElement | null>(null);
  const stickImgRef = useRef<HTMLImageElement | null>(null);
  const torchImgRef = useRef<HTMLImageElement | null>(null);
  const workbenchImgRef = useRef<HTMLImageElement | null>(null);
  const chestImgRef = useRef<HTMLImageElement | null>(null);
  const furnaceImgRef = useRef<HTMLImageElement | null>(null);
  const antennaImgRef = useRef<HTMLImageElement | null>(null);
  const fenceImgRef = useRef<HTMLImageElement | null>(null);
  const ironOreImgRef = useRef<HTMLImageElement | null>(null);
  const campfire1ImgRef = useRef<HTMLImageElement | null>(null);
  const campfire2ImgRef = useRef<HTMLImageElement | null>(null);
  const woodenBoardImgRef = useRef<HTMLImageElement | null>(null);
  const rockImgRefs = useRef<HTMLImageElement[]>([]);
  const collidersRef = useRef<Map<string, ColliderShape>>(new Map());
  const debugCollidersRef = useRef(false);
  const [debugColliders, setDebugColliders] = useState(false);
  
  // Tool Image Refs
  const woodAxeImgRef = useRef<HTMLImageElement | null>(null);
  const woodPickaxeImgRef = useRef<HTMLImageElement | null>(null);
  const woodSwordImgRef = useRef<HTMLImageElement | null>(null);
  const stoneAxeImgRef = useRef<HTMLImageElement | null>(null);
  const stonePickaxeImgRef = useRef<HTMLImageElement | null>(null);
  const stoneSwordImgRef = useRef<HTMLImageElement | null>(null);
  
  // Animal Sprite Refs
  const chickenImgRef = useRef<HTMLImageElement | null>(null);
  const cowImgRef = useRef<HTMLImageElement | null>(null);
  const pigImgRef = useRef<HTMLImageElement | null>(null);
  const sheepImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    // Load Farmer Sprite
    const sprite = new Image();
    sprite.src = '/farmer_spritesheet.png';
    sprite.onload = () => {
      spriteRef.current = sprite;
    };

    // Load Tree Stage Sprites
    const loadImg = (src: string, ref: React.MutableRefObject<HTMLImageElement | null>) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Ensure we can read pixels
      img.src = src;
      img.onload = () => { 
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          ref.current = img; 
          // Automatically generate collider for the loaded image
          const isObstacle = src.includes('tree') || src.includes('rock') || src.includes('trunk') || src.includes('workbench') || src.includes('campfire') || src.includes('torch') || src.includes('coalore') || src.includes('chest') || src.includes('furnace');
          const isInteractable = src.includes('stick') || src.includes('sapling') || src.includes('bush') || src.includes('small_rock') || src.includes('coal') || src.includes('wooditem') || src.includes('stoneitem');
          const isAnimal = src.includes('sprite') || src.includes('animation');
          const type = isObstacle ? 'obstacle' : (isInteractable ? 'interactable' : 'animal');
          const layer = isObstacle || isAnimal ? CollisionLayer.SOLID : (isInteractable ? CollisionLayer.ITEM : CollisionLayer.ANIMAL);
          
          // Determine physics height percentage
          let physicsHeight = 1.0;
          if (src.includes('tree')) physicsHeight = 0.2; // Only trunk is solid
          else if (src.includes('stick') || src.includes('small_rock') || src.includes('sapling')) physicsHeight = 0.5;
          
          if (isAnimal) {
            // Smart Sprite Processor: Use 3x4 grid for animal spritesheets
            const cols = 3;
            const rows = 4;
            const cellWidth = img.naturalWidth / cols;
            const cellHeight = img.naturalHeight / rows;
            
            const _hasLabelRow = false;
            const _hasLabelCol = false;
            const labelHeight = 0;
            const _labelCols = 0;
            const _animCols = cols;

            // Use the Smart Collider Generator
            const startX = 0;
            const startY = 0;

            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = cellWidth;
            frameCanvas.height = cellHeight;
            const frameCtx = frameCanvas.getContext('2d');
            if (frameCtx) {
              frameCtx.drawImage(img, startX, startY, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
              const frameImg = new Image();
              frameImg.src = frameCanvas.toDataURL();
              frameImg.onload = () => {
                SpriteColliderGenerator.generateSmartCollider(frameImg, type, layer, {
                  cellWidth,
                  cellHeight,
                  labelHeight,
                  charWidth: cellWidth,
                  charHeight: cellHeight - labelHeight
                }).then(shape => {
                  collidersRef.current.set(src, shape);
                  debug(`Smart Collider generated for ${src}: ${shape.points.length} vertices (Labels Ignored)`);
                }).catch(err => {
                  debugError(`Smart Collider failed for ${src}:`, err);
                });
              };
            }
          } else {
            SpriteColliderGenerator.generateFromImage(img, type, layer, 1.0, physicsHeight).then(shape => {
              collidersRef.current.set(src, shape);
              debug(`Generated collider for ${src}: ${shape.points.length} points`);
            }).catch(err => {
              debugError(`Failed to generate collider for ${src}:`, err);
            });
          }
        }
      };
      img.onerror = () => {
        ref.current = null;
      };
    };

    loadImg('/sapling.png', saplingImgRef);
    loadImg('/small_tree.png', smallTreeImgRef);
    loadImg('/tree.png', treeImgRef);
    loadImg('/trunk.png', trunkImgRef);
    loadImg('/bush.png', bushImgRef);
    loadImg('/grass.png', grassTilesRef);
    loadImg('/dirt.png', dirtTilesRef);
    loadImg('/wooditem.png', woodItemImgRef);
    loadImg('/stoneitem.png', stoneItemImgRef);
    loadImg('/coal.png', coalImgRef);
    loadImg('/coalore.png', coalOreImgRef);
    loadImg('/stick.png', stickImgRef);
    loadImg('/torch.png', torchImgRef);
    loadImg('/workbench.png', workbenchImgRef);
    loadImg('/chest.png', chestImgRef);
    loadImg('/furnace.png', furnaceImgRef);
    loadImg('/campfire1.png', campfire1ImgRef);
    loadImg('/campfire2.png', campfire2ImgRef);
    loadImg('/woodenboard.png', woodenBoardImgRef);
    loadImg('/antenna.png', antennaImgRef);
    loadImg('/fence.png', fenceImgRef);
    loadImg('/ironore.png', ironOreImgRef);
    
    // Load Animal Sprites
    loadImg('/Rooster_animation_without_shadow.png', chickenImgRef);
    loadImg('/Calf_animation_without_shadow.png', cowImgRef);
    loadImg('/Piglet_animation_without_shadow.png', pigImgRef);
    loadImg('/Sheep_animation_without_shadow.png', sheepImgRef);

    // Load Tool Sprites
    loadImg('/woodaxe.png', woodAxeImgRef);
    loadImg('/woodepickaxe.png', woodPickaxeImgRef);
    loadImg('/woodsword.png', woodSwordImgRef);
    loadImg('/stoneaxe.png', stoneAxeImgRef);
    loadImg('/stonepickaxe.png', stonePickaxeImgRef);
    loadImg('/stonesword.png', stoneSwordImgRef);

    // Load Rock Variety
    for (let i = 1; i <= 9; i++) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = `/rock${i}.png`;
      img.onload = () => {
        rockImgRefs.current[i - 1] = img;
        // Rocks are 100% solid
        SpriteColliderGenerator.generateFromImage(img, 'obstacle', CollisionLayer.SOLID, 1.0, 1.0).then(shape => {
          collidersRef.current.set(`/rock${i}.png`, shape);
          debug(`Generated collider for /rock${i}.png: ${shape.points.length} points`);
        }).catch(err => {
          debugError(`Failed to generate collider for /rock${i}.png:`, err);
        });
      };
    }

    const state = stateRef.current;
    
    state.player.lastMoveTime = Date.now();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setDimensions({ width: w, height: h });
      state.width = w;
      state.height = h;
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Center player initially
    state.player.x = 0;
    state.player.y = 0;
    state.camera.x = -state.width / 2;
    state.camera.y = -state.height / 2;
    
    const getResourceDimensions = (type: EntityType, scale: number, growthStage?: number, rockIndex?: number) => {
      let img: HTMLImageElement | null = null;
      if (type === 'sapling') img = saplingImgRef.current;
      else if (type === 'bush') img = bushImgRef.current;
      else if (type === 'trunk') img = trunkImgRef.current;
      else if (type === 'tree') {
        img = growthStage === 1 ? smallTreeImgRef.current : treeImgRef.current;
      } else if (type === 'rock' || type === 'coal_ore') {
        img = rockImgRefs.current[rockIndex ?? 0] || null;
      } else if (type === 'torch') {
        img = torchImgRef.current;
      } else if (type === 'workbench') {
        img = workbenchImgRef.current;
      } else if (type === 'campfire') {
        img = (Math.floor(Date.now() / 200) % 2 === 0) ? campfire1ImgRef.current : campfire2ImgRef.current;
      } else if (type === 'chest') {
        img = chestImgRef.current;
      } else if (type === 'furnace') {
        img = furnaceImgRef.current;
      } else if (type === 'branch') {
        img = stickImgRef.current;
      } else if (type === 'small_rock') {
        img = stoneItemImgRef.current;
      } else if (type === 'grass') {
        // No image for grass yet, will draw manually or use a placeholder
      }

      if (img && img.complete && img.naturalWidth > 0) {
        let finalScale = GLOBAL_ASSET_SCALE * scale;
        if (type === 'torch' || type === 'workbench' || type === 'campfire' || type === 'sapling' || type === 'branch' || type === 'small_rock' || type === 'chest' || type === 'furnace') {
          finalScale = 0.4 * scale; // Adjusted for better matching with 128px player
        }
        return {
          w: img.naturalWidth * finalScale,
          h: img.naturalHeight * finalScale
        };
      }

      // Fallback
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
      const grassImg = grassTilesRef.current;
      const dirtImg = dirtTilesRef.current;
      
      if (!grassImg || !grassImg.complete || grassImg.naturalWidth === 0) return null;
      if (!dirtImg || !dirtImg.complete || dirtImg.naturalWidth === 0) return null;

      const canvas = document.createElement('canvas');
      canvas.width = CHUNK_SIZE;
      canvas.height = CHUNK_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const chunkX = cx * CHUNK_SIZE;
      const chunkY = cy * CHUNK_SIZE;

      const grassPattern = ctx.createPattern(grassImg, 'repeat');
      if (!grassPattern) return null;

      // 1. Draw Grass Base (Seamless World-Space Alignment)
      const gScale = 0.6;
      const gMatrix = new DOMMatrix()
        .translate(-chunkX, -chunkY)
        .scale(gScale, gScale)
        .rotate(15);
      grassPattern.setTransform(gMatrix);
      ctx.fillStyle = grassPattern;
      ctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);

      // 2. Create Dirt Mask on a temporary canvas (Low-res for smooth scaling)
      const maskCanvas = document.createElement('canvas');
      const maskRes = CHUNK_SIZE / 16; // 64x64 for a 1024x1024 chunk
      maskCanvas.width = maskRes;
      maskCanvas.height = maskRes;
      const mctx = maskCanvas.getContext('2d');
      if (!mctx) return null;

      const imageData = mctx.createImageData(maskRes, maskRes);
      const data = imageData.data;

      // Blighted Ground Logic
      const blightedVal = fbm(cx * CHUNK_SIZE * 0.001, cy * CHUNK_SIZE * 0.001, 2);
      const isBlighted = blightedVal > 0.6;

      for (let y = 0; y < maskRes; y++) {
        for (let x = 0; x < maskRes; x++) {
          const worldX = chunkX + x * 16;
          const worldY = chunkY + y * 16;
          // Use multiple octaves and larger scale for the mask
          const noise = fbm(worldX * 0.0005, worldY * 0.0005, 4);
          
          let alpha = 0;
          // Lower threshold to 0.35 to make dirt more common
          if (noise > 0.35) {
            alpha = Math.floor(Math.min(1, (noise - 0.35) / 0.1) * 255);
          }
          
          const idx = (y * maskRes + x) * 4;
          data[idx] = 255;     // R
          data[idx + 1] = 255; // G
          data[idx + 2] = 255; // B
          data[idx + 3] = alpha; // A
        }
      }
      mctx.putImageData(imageData, 0, 0);

      // 3. Draw Dirt using Dual-Texture Blending and the Mask
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = CHUNK_SIZE;
      tempCanvas.height = CHUNK_SIZE;
      const tctx = tempCanvas.getContext('2d');
      if (tctx) {
        const tDirtPattern = tctx.createPattern(dirtImg, 'repeat');
        if (tDirtPattern) {
          // Layer 1: Large Scale Dirt
          const dScale1 = 0.8;
          const dMatrix1 = new DOMMatrix()
            .translate(-chunkX, -chunkY)
            .scale(dScale1, dScale1)
            .rotate(-20);
          tDirtPattern.setTransform(dMatrix1);
          tctx.fillStyle = tDirtPattern;
          tctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);

          // Layer 2: Medium Scale Dirt (Blended to break repetition)
          const dScale2 = 0.5;
          const dMatrix2 = new DOMMatrix()
            .translate(-chunkX + 500, -chunkY + 500) // Offset to break alignment
            .scale(dScale2, dScale2)
            .rotate(45);
          tDirtPattern.setTransform(dMatrix2);
          tctx.globalAlpha = 0.4;
          tctx.fillStyle = tDirtPattern;
          tctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
          tctx.globalAlpha = 1.0;
        }
        
        // Apply the mask
        tctx.globalCompositeOperation = 'destination-in';
        tctx.imageSmoothingEnabled = true;
        tctx.drawImage(maskCanvas, 0, 0, maskRes, maskRes, 0, 0, CHUNK_SIZE, CHUNK_SIZE);
        
        // Draw the masked dirt onto the main canvas
        ctx.drawImage(tempCanvas, 0, 0);
      }

      // 4. Apply Blighted Overlay
      if (isBlighted) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(20, 10, 30, 0.6)'; // Dark purple/black tint
        ctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
        
        // Add some "static" noise to blighted ground
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.1;
        for (let i = 0; i < 100; i++) {
          ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
          ctx.fillRect(Math.random() * CHUNK_SIZE, Math.random() * CHUNK_SIZE, 2, 2);
        }
        ctx.restore();
      }

      const chunkId = `${cx},${cy}`;
      chunkCanvasesRef.current.set(chunkId, canvas);
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

    const addToInventory = (type: ItemType, count: number) => {
      const { inventory } = state.player;
      
      // Try to stack
      for (let i = 0; i < INVENTORY_SLOTS; i++) {
        if (inventory[i] && inventory[i]!.type === type) {
          inventory[i]!.count += count;
          return true;
        }
      }
      
      // Find empty slot
      for (let i = 0; i < INVENTORY_SLOTS; i++) {
        if (!inventory[i]) {
          inventory[i] = { type, count };
          return true;
        }
      }
      
      return false; // Inventory full
    };

    const removeFromInventory = (type: ItemType, count: number) => {
      const { inventory } = state.player;
      let remaining = count;
      
      // First pass: exact matches or stacks
      for (let i = 0; i < INVENTORY_SLOTS; i++) {
        if (inventory[i] && inventory[i]!.type === type) {
          const take = Math.min(inventory[i]!.count, remaining);
          inventory[i]!.count -= take;
          remaining -= take;
          if (inventory[i]!.count <= 0) inventory[i] = null;
          if (remaining <= 0) return true;
        }
      }
      return false;
    };

    const hasIngredients = (ingredients: { type: ItemType, count: number }[]) => {
      const { inventory } = state.player;
      const counts: Record<string, number> = {};
      
      for (const slot of inventory) {
        if (slot) {
          counts[slot.type] = (counts[slot.type] || 0) + slot.count;
        }
      }
      
      for (const ing of ingredients) {
        if ((counts[ing.type] || 0) < ing.count) return false;
      }
      return true;
    };

    const _craftItem = (recipeId: string) => {
      const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId);
      if (!recipe) return;
      
      // Check if workbench is required and if it's open
      if (recipe.requiresWorkbench && !state.isWorkbenchOpen) {
        state.message = { text: "Requires Workbench", time: Date.now() };
        return;
      }

      if (hasIngredients(recipe.ingredients)) {
        for (const ing of recipe.ingredients) {
          removeFromInventory(ing.type as ItemType, ing.count);
        }
        addToInventory(recipe.output as ItemType, recipe.count);
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
      const savedData = localStorage.getItem('save_' + loadedSaveId);
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          stateRef.current.player = parsed.player;
          if (!stateRef.current.player.equipment) {
            stateRef.current.player.equipment = { head: null, torso: null, legs: null, feet: null, back: null };
          }
          stateRef.current.resources = new Map(parsed.resources);
          stateRef.current.items = parsed.items;
          stateRef.current.animals = parsed.animals;
          stateRef.current.time = parsed.time;
        } catch (e) {
          debugError("Failed to load save", e);
          startNewGame();
        }
      } else {
        startNewGame();
      }
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
      state.resources.forEach(chunk => {
        chunk.forEach(res => {
          if (res.type === 'furnace' && res.inventory) {
            const input = res.inventory[0];
            const fuel = res.inventory[1];
            const output = res.inventory[2];

            if (res.fuelTimer && res.fuelTimer > 0) {
              res.fuelTimer -= dt;
            }

            if (input && SMELT_RECIPES[input.type]) {
              const outputType = SMELT_RECIPES[input.type];
              
              // Check if we can output
              if (!output || (output.type === outputType && output.count < 64)) {
                // Need fuel?
                if ((!res.fuelTimer || res.fuelTimer <= 0) && fuel && FUEL_VALUES[fuel.type]) {
                  res.fuelTimer = FUEL_VALUES[fuel.type];
                  res.maxFuelTimer = res.fuelTimer;
                  fuel.count--;
                  if (fuel.count <= 0) res.inventory[1] = null;
                }

                if (res.fuelTimer && res.fuelTimer > 0) {
                  res.smeltTimer = (res.smeltTimer || 0) + dt;
                  if (res.smeltTimer >= SMELT_TIME) {
                    res.smeltTimer = 0;
                    input.count--;
                    if (input.count <= 0) res.inventory[0] = null;
                    
                    if (output) {
                      output.count++;
                    } else {
                      res.inventory[2] = { type: outputType as ItemType, count: 1 };
                    }
                  }
                } else {
                  res.smeltTimer = 0;
                }
              } else {
                res.smeltTimer = 0;
              }
            } else {
              res.smeltTimer = 0;
            }
          }
        });
      });

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
                  let imgUrl = '';
                  const typeStr = res.type as string;
                  if (typeStr === 'tree') imgUrl = res.growthStage === 1 ? '/small_tree.png' : '/tree.png';
                  else if (typeStr === 'rock' || typeStr === 'coal_ore') imgUrl = `/rock${(res.rockIndex ?? 0) + 1}.png`;
                  else if (typeStr === 'trunk') imgUrl = '/trunk.png';
                  else if (typeStr === 'sapling') imgUrl = '/sapling.png';
                  else if (typeStr === 'bush') imgUrl = '/bush.png';
                  else if (typeStr === 'torch') imgUrl = '/torch.png';
                  else if (typeStr === 'workbench') imgUrl = '/workbench.png';
                  else if (typeStr === 'campfire') imgUrl = '/campfire1.png';
                  else if (typeStr === 'chest') imgUrl = '/chest.png';
                  else if (typeStr === 'furnace') imgUrl = '/furnace.png';
                  
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

    const drawItemIcon = (ctx: CanvasRenderingContext2D, type: ItemType, x: number, y: number, size: number) => {
      ctx.save();
      ctx.translate(x, y);

      const drawImageFit = (img: HTMLImageElement | null, scale = 1) => {
        if (!img || !img.complete) return false;
        const aspect = img.width / img.height;
        let dw = size * scale;
        let dh = size * scale;
        let dx = (size - dw) / 2;
        let dy = (size - dh) / 2;
        if (aspect > 1) {
          dh = (size / aspect) * scale;
          dy = (size - dh) / 2;
        } else {
          dw = (size * aspect) * scale;
          dx = (size - dw) / 2;
        }
        ctx.drawImage(img, dx, dy, dw, dh);
        return true;
      };
      
      if (type === 'wood') {
        const img = woodItemImgRef.current;
        if (!drawImageFit(img)) {
          ctx.fillStyle = TREE_TRUNK;
          ctx.fillRect(size * 0.1, size * 0.3, size * 0.8, size * 0.4);
          ctx.strokeStyle = 'black';
          ctx.strokeRect(size * 0.1, size * 0.3, size * 0.8, size * 0.4);
        }
      } else if (type === 'stone') {
        const img = stoneItemImgRef.current;
        if (!drawImageFit(img)) {
          ctx.fillStyle = ROCK_COLOR;
          ctx.beginPath();
          ctx.arc(size/2, size/2, size/2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (type === 'sapling') {
        const img = saplingImgRef.current;
        if (!drawImageFit(img, 2.5)) {
          // Draw a more visible sapling
          ctx.fillStyle = '#8b4513'; // Stem
          ctx.fillRect(size * 0.4, size * 0.2, size * 0.2, size * 0.7);
          ctx.fillStyle = '#4caf50'; // Leaves
          ctx.beginPath();
          ctx.arc(size * 0.5, size * 0.25, size * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(size * 0.2, size * 0.6, size * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(size * 0.8, size * 0.6, size * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (type === 'coal') {
        const img = coalImgRef.current;
        if (!drawImageFit(img)) {
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath();
          ctx.arc(size/2, size/2, size/3, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#333';
          ctx.stroke();
        }
      } else if (type === 'stick') {
        const img = stickImgRef.current;
        if (!drawImageFit(img)) {
          ctx.strokeStyle = '#8b4513';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(size * 0.2, size * 0.8);
          ctx.lineTo(size * 0.8, size * 0.2);
          ctx.stroke();
        }
      } else if (type === 'workbench') {
        const img = workbenchImgRef.current;
        if (!drawImageFit(img)) {
          ctx.fillStyle = '#8b4513';
          ctx.fillRect(size * 0.1, size * 0.2, size * 0.8, size * 0.6);
          ctx.strokeStyle = 'black';
          ctx.strokeRect(size * 0.1, size * 0.2, size * 0.8, size * 0.6);
          ctx.fillStyle = '#d2b48c';
          ctx.fillRect(size * 0.2, size * 0.3, size * 0.6, size * 0.1);
        }
      } else if (type === 'torch') {
        const img = torchImgRef.current;
        if (!drawImageFit(img)) {
          ctx.strokeStyle = '#8b4513';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(size/2, size * 0.8);
          ctx.lineTo(size/2, size * 0.3);
          ctx.stroke();
          ctx.fillStyle = '#ff4500';
          ctx.beginPath();
          ctx.arc(size/2, size * 0.2, size * 0.15, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (type === 'campfire') {
        const img = (Math.floor(animTimerRef.current * 4) % 2 === 0) ? campfire1ImgRef.current : campfire2ImgRef.current;
        if (!drawImageFit(img)) {
          ctx.fillStyle = '#8b4513';
          ctx.fillRect(size * 0.2, size * 0.6, size * 0.6, size * 0.2);
          ctx.fillStyle = '#ff4500';
          ctx.beginPath();
          ctx.moveTo(size * 0.3, size * 0.6);
          ctx.lineTo(size * 0.5, size * 0.2);
          ctx.lineTo(size * 0.7, size * 0.6);
          ctx.fill();
        }
      } else if (type === 'wooden_axe' || type === 'stone_axe') {
        const img = type === 'wooden_axe' ? woodAxeImgRef.current : stoneAxeImgRef.current;
        if (!drawImageFit(img)) {
          ctx.strokeStyle = type === 'wooden_axe' ? '#8b4513' : '#777';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(size * 0.3, size * 0.8);
          ctx.lineTo(size * 0.7, size * 0.2);
          ctx.stroke();
          ctx.fillStyle = type === 'wooden_axe' ? '#a0522d' : '#999';
          ctx.beginPath();
          ctx.moveTo(size * 0.5, size * 0.2);
          ctx.lineTo(size * 0.8, size * 0.1);
          ctx.lineTo(size * 0.9, size * 0.4);
          ctx.lineTo(size * 0.6, size * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (type === 'wooden_pickaxe' || type === 'stone_pickaxe') {
        const img = type === 'wooden_pickaxe' ? woodPickaxeImgRef.current : stonePickaxeImgRef.current;
        if (!drawImageFit(img)) {
          ctx.strokeStyle = type === 'wooden_pickaxe' ? '#8b4513' : '#777';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(size * 0.5, size * 0.9);
          ctx.lineTo(size * 0.5, size * 0.3);
          ctx.stroke();
          ctx.fillStyle = type === 'wooden_pickaxe' ? '#a0522d' : '#999';
          ctx.beginPath();
          ctx.moveTo(size * 0.1, size * 0.4);
          ctx.quadraticCurveTo(size * 0.5, size * 0.2, size * 0.9, size * 0.4);
          ctx.lineTo(size * 0.9, size * 0.5);
          ctx.quadraticCurveTo(size * 0.5, size * 0.3, size * 0.1, size * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (type === 'wooden_sword' || type === 'stone_sword') {
        const img = type === 'wooden_sword' ? woodSwordImgRef.current : stoneSwordImgRef.current;
        if (!drawImageFit(img)) {
          ctx.strokeStyle = type === 'wooden_sword' ? '#8b4513' : '#777';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(size * 0.2, size * 0.8);
          ctx.lineTo(size * 0.5, size * 0.5);
          ctx.stroke();
          ctx.fillStyle = type === 'wooden_sword' ? '#a0522d' : '#999';
          ctx.beginPath();
          ctx.moveTo(size * 0.4, size * 0.6);
          ctx.lineTo(size * 0.8, size * 0.2);
          ctx.lineTo(size * 0.9, size * 0.1);
          ctx.lineTo(size * 0.7, size * 0.3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (type === 'wheat_seeds') {
        const img = saplingImgRef.current; // Reusing sapling img for now if needed
        if (!drawImageFit(img, 2.5)) {
          ctx.fillStyle = '#f4a460';
          ctx.strokeStyle = '#d2b48c';
          ctx.lineWidth = 1;
          // Draw larger, more distinct seeds
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(size * (0.3 + i * 0.2), size * 0.5, size * 0.2, size * 0.25, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
      } else if (type === 'raw_beef') {
        ctx.fillStyle = '#b71c1c';
        ctx.beginPath();
        ctx.ellipse(size * 0.5, size * 0.5, size * 0.3, size * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#7f0000';
        ctx.stroke();
        ctx.fillStyle = '#ffcdd2';
        ctx.fillRect(size * 0.4, size * 0.4, size * 0.2, size * 0.05);
      } else if (type === 'raw_pork') {
        ctx.fillStyle = '#f48fb1';
        ctx.beginPath();
        ctx.ellipse(size * 0.5, size * 0.5, size * 0.3, size * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c2185b';
        ctx.stroke();
      } else if (type === 'mutton') {
        ctx.fillStyle = '#e57373';
        ctx.beginPath();
        ctx.ellipse(size * 0.5, size * 0.5, size * 0.25, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b71c1c';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(size * 0.2, size * 0.45, size * 0.15, size * 0.1);
      } else if (type === 'raw_chicken') {
        ctx.fillStyle = '#ffe0b2';
        ctx.beginPath();
        ctx.ellipse(size * 0.6, size * 0.5, size * 0.2, size * 0.3, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f57c00';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(size * 0.2, size * 0.6, size * 0.2, size * 0.1);
      } else if (type === 'leather') {
        ctx.fillStyle = '#8d6e63';
        ctx.beginPath();
        ctx.moveTo(size * 0.3, size * 0.2);
        ctx.lineTo(size * 0.7, size * 0.2);
        ctx.lineTo(size * 0.8, size * 0.8);
        ctx.lineTo(size * 0.2, size * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#5d4037';
        ctx.stroke();
      } else if (type === 'leather_cap') {
        ctx.fillStyle = '#8d6e63';
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/3, Math.PI, 0);
        ctx.lineTo(size*0.8, size*0.7);
        ctx.lineTo(size*0.2, size*0.7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#5d4037';
        ctx.stroke();
      } else if (type === 'leather_tunic') {
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6);
        ctx.strokeStyle = '#5d4037';
        ctx.strokeRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6);
      } else if (type === 'leather_pants') {
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(size * 0.3, size * 0.2, size * 0.4, size * 0.3);
        ctx.fillRect(size * 0.3, size * 0.5, size * 0.15, size * 0.4);
        ctx.fillRect(size * 0.55, size * 0.5, size * 0.15, size * 0.4);
        ctx.strokeStyle = '#5d4037';
        ctx.strokeRect(size * 0.3, size * 0.2, size * 0.4, size * 0.3);
      } else if (type === 'leather_boots') {
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(size * 0.2, size * 0.5, size * 0.25, size * 0.4);
        ctx.fillRect(size * 0.55, size * 0.5, size * 0.25, size * 0.4);
        ctx.strokeStyle = '#5d4037';
        ctx.strokeRect(size * 0.2, size * 0.5, size * 0.25, size * 0.4);
        ctx.strokeRect(size * 0.55, size * 0.5, size * 0.25, size * 0.4);
      } else if (type === 'leather_backpack') {
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(size * 0.2, size * 0.2, size * 0.6, size * 0.7);
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(size * 0.3, size * 0.3, size * 0.4, size * 0.4);
        ctx.strokeStyle = 'black';
        ctx.strokeRect(size * 0.2, size * 0.2, size * 0.6, size * 0.7);
      } else if (type === 'chest') {
        const img = chestImgRef.current;
        if (!drawImageFit(img)) {
          ctx.fillStyle = '#8b4513';
          ctx.fillRect(size * 0.1, size * 0.2, size * 0.8, size * 0.6);
          ctx.strokeStyle = 'black';
          ctx.strokeRect(size * 0.1, size * 0.2, size * 0.8, size * 0.6);
          ctx.fillStyle = 'gold';
          ctx.fillRect(size * 0.45, size * 0.45, size * 0.1, size * 0.1);
        }
      } else if (type === 'furnace') {
        const img = furnaceImgRef.current;
        if (!drawImageFit(img)) {
          ctx.fillStyle = 'gray';
          ctx.fillRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8);
          ctx.strokeStyle = 'black';
          ctx.strokeRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8);
          ctx.fillStyle = 'black';
          ctx.fillRect(size * 0.3, size * 0.5, size * 0.4, size * 0.3);
        }
      } else if (type === 'cooked_beef' || type === 'cooked_pork' || type === 'cooked_mutton') {
        ctx.fillStyle = '#5d4037';
        ctx.beginPath();
        ctx.ellipse(size/2, size/2, size/2.5, size/3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3e2723';
        ctx.stroke();
      } else if (type === 'cooked_chicken') {
        ctx.fillStyle = '#d7ccc8';
        ctx.beginPath();
        ctx.ellipse(size * 0.6, size * 0.5, size * 0.2, size * 0.3, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8d6e63';
        ctx.stroke();
      } else if (type === 'wool') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(size * 0.4, size * 0.4, size * 0.2, 0, Math.PI * 2);
        ctx.arc(size * 0.6, size * 0.4, size * 0.2, 0, Math.PI * 2);
        ctx.arc(size * 0.5, size * 0.6, size * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e0e0e0';
        ctx.stroke();
      } else if (type === 'feather') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(size * 0.5, size * 0.5, size * 0.1, size * 0.3, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#9e9e9e';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(size * 0.3, size * 0.7);
        ctx.lineTo(size * 0.7, size * 0.3);
        ctx.stroke();
      } else if (type === 'egg') {
        ctx.fillStyle = '#fff9c4';
        ctx.beginPath();
        ctx.ellipse(size * 0.5, size * 0.5, size * 0.2, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fbc02d';
        ctx.stroke();
      } else if (type === 'bed') {
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(size * 0.1, size * 0.3, size * 0.8, size * 0.4);
        ctx.fillStyle = '#e57373';
        ctx.fillRect(size * 0.3, size * 0.35, size * 0.55, size * 0.3);
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(size * 0.15, size * 0.35, size * 0.15, size * 0.3);
      }
      
      ctx.restore();
    };


    const drawHeartIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#ff4444';
      // Pixelated heart
      const s = size / 8;
      ctx.fillRect(s*2, 0, s*2, s);
      ctx.fillRect(s*5, 0, s*2, s);
      ctx.fillRect(s, s, s*7, s);
      ctx.fillRect(0, s*2, s*9, s*3);
      ctx.fillRect(s, s*5, s*7, s);
      ctx.fillRect(s*2, s*6, s*5, s);
      ctx.fillRect(s*3, s*7, s*3, s);
      ctx.fillRect(s*4, s*8, s, s);
      ctx.restore();
    };


    const drawHUD = (ctx: CanvasRenderingContext2D) => {
      const canvasW = ctx.canvas.width;
      const canvasH = ctx.canvas.height;

      // Clock at top middle
      const hours = Math.floor(state.time / 60);
      const mins = Math.floor(state.time % 60);
      const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
      
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      const clockW = 100;
      const clockH = 30;
      ctx.fillRect((canvasW - clockW) / 2, 10, clockW, clockH);
      ctx.strokeStyle = '#8b4513';
      ctx.lineWidth = 2;
      ctx.strokeRect((canvasW - clockW) / 2, 10, clockW, clockH);
      
      ctx.fillStyle = 'white';
      ctx.font = '12px "Press Start 2P", "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(timeStr, canvasW / 2, 10 + clockH / 2);
      ctx.restore();

      // Hotbar dimensions
      const hotbarW = HOTBAR_SLOTS * (SLOT_SIZE + SLOT_MARGIN);
      const hotbarX = (canvasW - hotbarW) / 2;
      const hotbarY = canvasH - SLOT_SIZE - 20;

      // Health and Stamina bars fill the hotbar width
      const barH = 12;
      const gap = 50; // Gap for icons in the middle
      const totalBarWidth = hotbarW;
      const individualBarW = (totalBarWidth - gap) / 2;
      const uiY = hotbarY - 35;
      const uiX = hotbarX;

      if (!state.isInventoryOpen) {
        // Health (Left side)
        drawHeartIcon(ctx, uiX, uiY - 4, 20);
        ctx.fillStyle = '#333';
        ctx.fillRect(uiX + 25, uiY, individualBarW - 25, barH);
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(uiX + 25, uiY, (state.player.health / 100) * (individualBarW - 25), barH);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.strokeRect(uiX + 25, uiY, individualBarW - 25, barH);

        // Hunger (Right side) - Segmented
        const hungerStartX = uiX + individualBarW + gap;
        const drumstickSize = 20;
        for (let i = 0; i < 10; i++) {
          const isEmpty = state.player.hunger < (i + 1);
          drawDrumstick(ctx, hungerStartX + i * (drumstickSize + 2), uiY - 4, drumstickSize, isEmpty);
        }
      }

      // Prompt text (Wooden Board) - Now on top of the bars
      if (state.selectedResourceId && !state.isInventoryOpen) {
        // Check if within reach
        let selectedRes: Resource | null = null;
        for (const [_chunkId, chunkResources] of state.resources.entries()) {
          const res = chunkResources.find(r => r.id === state.selectedResourceId);
          if (res) {
            selectedRes = res;
            break;
          }
        }

        if (selectedRes) {
          const px = state.player.x + PLAYER_SIZE / 2;
          const py = state.player.y + PLAYER_SIZE * 0.85; 
          const dims = getResourceDimensions(selectedRes.type, selectedRes.scale, selectedRes.growthStage, selectedRes.rockIndex);
          const tx = selectedRes.x + dims.w / 2;
          const ty = (selectedRes.type === 'rock' || selectedRes.type === 'coal_ore' || selectedRes.type === 'branch' || selectedRes.type === 'small_rock' || selectedRes.type === 'grass') 
            ? selectedRes.y + dims.h / 2 
            : selectedRes.y + dims.h * 0.85;
          const dist = Math.sqrt(Math.pow(px - tx, 2) + Math.pow(py - ty, 2));
          
          const inRange = dist < 200;
          const promptText = inRange ? "Press 'Space' to break" : "Move closer";
          
          ctx.save();
          const boardW = 500; // More compact width
          const boardH = 50;  // More compact height
          const bx = Math.floor((canvasW - boardW) / 2); // Perfectly centered
          const by = uiY - boardH - 15; // Positioned just above the bars

          // Procedural wooden board (Symmetrical)
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(bx, by, boardW, boardH);
          
          // Symmetrical border
          ctx.strokeStyle = '#5D2E0A';
          ctx.lineWidth = 3;
          ctx.strokeRect(bx, by, boardW, boardH);
          
          // Symmetrical wood grain lines
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 1;
          for(let i=1; i<3; i++) {
            ctx.beginPath();
            ctx.moveTo(bx + 15, by + (boardH/3)*i);
            ctx.lineTo(bx + boardW - 15, by + (boardH/3)*i);
            ctx.stroke();
          }

          // Symmetrical "bolts" in corners
          ctx.fillStyle = '#3D1F05';
          const boltSize = 4;
          const boltOffset = 6;
          ctx.fillRect(bx + boltOffset, by + boltOffset, boltSize, boltSize);
          ctx.fillRect(bx + boardW - boltOffset - boltSize, by + boltOffset, boltSize, boltSize);
          ctx.fillRect(bx + boltOffset, by + boardH - boltOffset - boltSize, boltSize, boltSize);
          ctx.fillRect(bx + boardW - boltOffset - boltSize, by + boardH - boltOffset - boltSize, boltSize, boltSize);

          // Engraved text effect
          ctx.font = '12px "Press Start 2P", "Courier New", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          const centerX = Math.floor(canvasW / 2); // Center text perfectly on screen
          const centerY = Math.floor(by + boardH / 2);

          // 1. Bottom-right highlight for depth
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.fillText(promptText, centerX + 2, centerY + 2);
          
          // 2. Top-left shadow for depth
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fillText(promptText, centerX - 1, centerY - 1);
          
          // 3. Main text (Deep Dark Brown)
          ctx.fillStyle = '#2D1B0A'; 
          ctx.fillText(promptText, centerX, centerY);
          
          ctx.restore();
        }
      }

      // Draw Message (e.g., "Tool ineffective")
      if (state.message && Date.now() - state.message.time < 2000) {
        ctx.save();
        ctx.font = 'bold 14px "Press Start 2P", "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        const msgW = ctx.measureText(state.message.text).width + 40;
        ctx.fillRect(canvasW / 2 - msgW / 2, 100, msgW, 50);
        ctx.fillStyle = '#ff4444';
        ctx.fillText(state.message.text, canvasW / 2, 135);
        ctx.restore();
      }

      if (!state.isInventoryOpen) {
        for (let i = 0; i < HOTBAR_SLOTS; i++) {
          const sx = hotbarX + i * (SLOT_SIZE + SLOT_MARGIN);
          
          // Engraved slot look for hotbar
          ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
          ctx.strokeStyle = i === state.player.selectedSlot ? 'white' : 'rgba(0, 0, 0, 0.4)';
          ctx.lineWidth = i === state.player.selectedSlot ? 3 : 2;
          ctx.fillRect(sx, hotbarY, SLOT_SIZE, SLOT_SIZE);
          ctx.strokeRect(sx, hotbarY, SLOT_SIZE, SLOT_SIZE);

          const item = state.player.inventory[i];
          if (item) {
            drawItemIcon(ctx, item.type, sx + 5, hotbarY + 5, SLOT_SIZE - 10);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(item.count.toString(), sx + SLOT_SIZE - 5, hotbarY + SLOT_SIZE - 5);
            ctx.textAlign = 'left';
          }
          
          // Slot number
          ctx.fillStyle = '#aaa';
          ctx.font = '10px sans-serif';
          ctx.fillText((i + 1).toString(), sx + 5, hotbarY + 12);
        }
      }

      // Main Inventory Screen
      if (state.isInventoryOpen) {
        // Handled by React UI
      }
    };


    const getAnimalSpriteInfo = (type: AnimalType) => {
      let img: HTMLImageElement | null = null;
      let w = 100, h = 100; // Default sizes
      let imgUrl = '';
      
      if (type === 'cow') { img = cowImgRef.current; imgUrl = '/Calf_animation_without_shadow.png'; w = 150; h = 150; }
      else if (type === 'pig') { img = pigImgRef.current; imgUrl = '/Piglet_animation_without_shadow.png'; w = 120; h = 120; }
      else if (type === 'sheep') { img = sheepImgRef.current; imgUrl = '/Sheep_animation_without_shadow.png'; w = 100; h = 100; }
      else if (type === 'chicken') { img = chickenImgRef.current; imgUrl = '/Rooster_animation_without_shadow.png'; w = 80; h = 80; }
      
      let rows = 8;
      let cols = 6;
      const hasLabelCol = false;
      const hasLabelRow = false;
      const labelHeight = 0;

      return { img, w, h, imgUrl, rows, cols, hasLabelCol, hasLabelRow, labelHeight };
    };

    const drawAnimal = (ctx: CanvasRenderingContext2D, animal: Animal) => {
      ctx.save();
      ctx.translate(animal.x, animal.y);
      
      const { img, w, h, rows, cols, hasLabelCol: _hasLabelCol, hasLabelRow: _hasLabelRow, labelHeight } = getAnimalSpriteInfo(animal.type);
      
      if (img && img.complete && img.naturalWidth > 0) {
        const sw = img.naturalWidth / cols;
        const sh = img.naturalHeight / rows;

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

        let frameY = 0;

        // The spritesheet has 8 rows:
        // 0: Walking Down
        // 1: Walking Up
        // 2: Walking Left
        // 3: Walking Right
        // 4: Standing Down
        // 5: Standing Up
        // 6: Standing Left
        // 7: Standing Right

        if (animal.isMoving) {
          if (animal.facing === 'down') frameY = 0;
          else if (animal.facing === 'up') frameY = 1;
          else if (animal.facing === 'left') frameY = 2;
          else if (animal.facing === 'right') frameY = 3;
        } else {
          if (animal.facing === 'down') frameY = 4;
          else if (animal.facing === 'up') frameY = 5;
          else if (animal.facing === 'left') frameY = 6;
          else if (animal.facing === 'right') frameY = 7;
        }

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

    const drawDrumstick = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, empty: boolean) => {
      ctx.save();
      ctx.translate(x + size / 2, y + size / 2);
      
      if (empty) {
        ctx.fillStyle = '#e0e0e0';
        ctx.strokeStyle = '#9e9e9e';
        ctx.lineWidth = 2;
        ctx.fillRect(-size * 0.1, -size * 0.3, size * 0.2, size * 0.6);
        ctx.strokeRect(-size * 0.1, -size * 0.3, size * 0.2, size * 0.6);
        const endSize = size * 0.15;
        ctx.beginPath();
        ctx.arc(-size * 0.1, -size * 0.3, endSize, 0, Math.PI * 2);
        ctx.arc(size * 0.1, -size * 0.3, endSize, 0, Math.PI * 2);
        ctx.arc(-size * 0.1, size * 0.3, endSize, 0, Math.PI * 2);
        ctx.arc(size * 0.1, size * 0.3, endSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = '#8d6e63';
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.1, size * 0.3, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f5f5f5';
        ctx.strokeStyle = '#bdbdbd';
        ctx.fillRect(-size * 0.05, size * 0.2, size * 0.1, size * 0.2);
        ctx.strokeRect(-size * 0.05, size * 0.2, size * 0.1, size * 0.2);
        ctx.beginPath();
        ctx.arc(-size * 0.05, size * 0.4, size * 0.08, 0, Math.PI * 2);
        ctx.arc(size * 0.05, size * 0.4, size * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
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
          drawItemIcon(ctx, e.type as ItemType, Math.round(e.x - 20), Math.round(e.y - 20 + hover), 40);
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
          
          let img: HTMLImageElement | null = null;
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

          if (img && img.complete && img.naturalWidth > 0) {
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
          
          let img: HTMLImageElement | null = null;
          let imgUrl = '';
          if (ent.type === 'coal_ore') { img = coalOreImgRef.current; imgUrl = '/coalore.png'; }
          else if (ent.type === 'iron_ore') { img = ironOreImgRef.current; imgUrl = '/ironore.png'; }
          else if (ent.type === 'branch') { img = stickImgRef.current; imgUrl = '/stick.png'; }
          else if (ent.type === 'small_rock') { img = stoneItemImgRef.current; imgUrl = '/stoneitem.png'; }
          else { img = rockImgRefs.current[e.rockIndex ?? 0]; imgUrl = `/rock${(e.rockIndex ?? 0) + 1}.png`; }
          
          if (img && img.complete && img.naturalWidth > 0) {
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
            if (img && img.complete) {
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
            if (img && img.complete) {
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
          if (spriteRef.current && spriteRef.current.complete && spriteRef.current.naturalWidth !== 0) {
            const frameX = Math.floor(p.animFrame);
            let finalFrameX = frameX;
            let frameY = 0; // Down
            
            if (p.facing === 'up') {
              frameY = 1;
              finalFrameX = frameX % 6;
            } else if (p.facing === 'down') {
              frameY = 0;
              finalFrameX = frameX % 6;
            } else if (p.facing === 'right') {
              frameY = 2;
              finalFrameX = (frameX % 3) + 3; // Last 3 frames are Right
            } else if (p.facing === 'left') {
              frameY = 2;
              finalFrameX = frameX % 3; // First 3 frames are Left
            }

            const spriteWidth = spriteRef.current.width / 6;
            const spriteHeight = spriteRef.current.height / 3;

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
              drawItemIcon(ctx, selectedItem.type, -toolSize/2, -toolSize/2, toolSize);
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

      drawHUD(ctx);
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
      const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
      const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
      
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
                        let imgUrl = '';
                        const typeStr = res.type as string;
                        if (typeStr === 'tree') imgUrl = res.growthStage === 1 ? '/small_tree.png' : '/tree.png';
                        else if (typeStr === 'rock' || typeStr === 'coal_ore') imgUrl = `/rock${(res.rockIndex ?? 0) + 1}.png`;
                        else if (typeStr === 'trunk') imgUrl = '/trunk.png';
                        else if (typeStr === 'sapling') imgUrl = '/sapling.png';
                        else if (typeStr === 'bush') imgUrl = '/bush.png';
                        else if (typeStr === 'torch') imgUrl = '/torch.png';
                        else if (typeStr === 'workbench') imgUrl = '/workbench.png';
                        else if (typeStr === 'campfire') imgUrl = '/campfire1.png';
                        else if (typeStr === 'chest') imgUrl = '/chest.png';
                        else if (typeStr === 'furnace') imgUrl = '/furnace.png';
                        else if (typeStr === 'branch') imgUrl = '/stick.png';
                        else if (typeStr === 'small_rock') imgUrl = '/stoneitem.png';

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
      const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
      const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
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

  const handleSaveGame = () => {
    const state = stateRef.current;
    const saveData = {
      player: state.player,
      resources: Array.from(state.resources.entries()),
      items: state.items,
      animals: state.animals,
      time: state.time
    };
    const saveName = `save_${new Date().toLocaleString().replace(/[/, :]/g, '-')}`;
    localStorage.setItem(saveName, JSON.stringify(saveData));
    alert('Game Saved! (' + saveName.replace('save_', '') + ')');
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
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ imageRendering: 'pixelated' }}
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

      {/* Batch Processing Explanation (Hidden) */}
      {/* 
        BATCH PROCESSING SYSTEM:
        To run this on a folder of assets:
        1. Use the `SpriteColliderGenerator.batchProcess(assets)` method.
        2. Pass an array of asset metadata:
           const assets = [
             { url: '/tree.png', type: 'obstacle', layer: CollisionLayer.SOLID },
             { url: '/stick.png', type: 'interactable', layer: CollisionLayer.ITEM },
             ...
           ];
        3. The system will iterate through all images, trace their alpha channels,
           simplify the polygons using RDP, and return a Map of optimized shapes.
        4. This can be run at build-time to generate a JSON manifest, or at runtime
           during the loading screen.
      */}

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

      <div className="absolute bottom-4 right-4 text-neutral-400 text-xs font-mono bg-black/50 p-2 rounded pointer-events-none">
        WASD: Move | SPACE: Harvest | X: Sit | E: Inventory
      </div>
    </div>
  );
}

// --- UI Components ---

const ITEM_IMAGES: Record<string, string> = {
  wood: '/wooditem.png',
  stone: '/stoneitem.png',
  sapling: '/sapling.png',
  coal: '/coal.png',
  stick: '/stick.png',
  workbench: '/workbench.png',
  campfire: '/campfire1.png',
  torch: '/torch.png',
  wheat_seeds: '/sapling.png',
  wooden_axe: '/woodaxe.png',
  wooden_pickaxe: '/woodepickaxe.png',
  stone_axe: '/stoneaxe.png',
  stone_pickaxe: '/stonepickaxe.png',
  wooden_sword: '/woodsword.png',
  stone_sword: '/stonesword.png',
  raw_beef: '/raw_beef.png',
  leather: '/leather.png',
  raw_pork: '/raw_pork.png',
  mutton: '/mutton.png',
  wool: '/wool.png',
  raw_chicken: '/raw_chicken.png',
  feather: '/feather.png',
  egg: '/egg.png',
  bed: '/bed.png',
  leather_cap: '/leather_cap.png',
  leather_tunic: '/leather_tunic.png',
  leather_pants: '/leather_pants.png',
  leather_boots: '/leather_boots.png',
  leather_backpack: '/leather_backpack.png',
  chest: '/chest.png',
  furnace: '/furnace.png',
  cooked_beef: '/cooked_beef.png',
  cooked_pork: '/cooked_pork.png',
  cooked_mutton: '/cooked_mutton.png',
  cooked_chicken: '/cooked_chicken.png',
  scrap_metal: '/scrap_metal.png',
  copper_wiring: '/copper_wiring.png',
  iron_ingot: '/iron_ingot.png',
  iron_axe: '/iron_axe.png',
  iron_pickaxe: '/iron_pickaxe.png',
  iron_sword: '/iron_sword.png',
  antenna: '/antenna.png',
  fence: '/fence.png',
  bread: '/bread.png',
  meat_pie: '/meat_pie.png',
  omelet: '/omelet.png',
  wheat: '/wheat.png',
};

const PlaceholderIcon = ({ type, size }: { type: string, size: number }) => {
  const getIcon = () => {
    switch (type) {
      case 'wood': return <rect width="80" height="40" x="10" y="30" fill="#3e2723" stroke="black" strokeWidth="4" />;
      case 'stone': return <circle cx="50" cy="50" r="40" fill="#5a5a5a" stroke="black" strokeWidth="4" />;
      case 'sapling': return (
        <g>
          <rect width="14" height="70" x="43" y="20" fill="#8b4513" />
          <circle cx="50" cy="25" r="35" fill="#4caf50" />
          <circle cx="20" cy="55" r="30" fill="#4caf50" />
          <circle cx="80" cy="55" r="30" fill="#4caf50" />
        </g>
      );
      case 'wheat_seeds': return (
        <g fill="#f4a460" stroke="#d2b48c" strokeWidth="2">
          <ellipse cx="30" cy="50" rx="18" ry="25" transform="rotate(45, 30, 50)" />
          <ellipse cx="50" cy="50" rx="18" ry="25" transform="rotate(45, 50, 50)" />
          <ellipse cx="70" cy="50" rx="18" ry="25" transform="rotate(45, 70, 50)" />
        </g>
      );
      case 'coal': return <circle cx="50" cy="50" r="30" fill="#1a1a1a" stroke="#333" strokeWidth="4" />;
      case 'stick': return <line x1="20" y1="80" x2="80" y2="20" stroke="#8b4513" strokeWidth="8" />;
      case 'workbench': return (
        <g>
          <rect width="80" height="60" x="10" y="20" fill="#8b4513" stroke="black" strokeWidth="4" />
          <rect width="60" height="10" x="20" y="30" fill="#d2b48c" />
        </g>
      );
      case 'furnace': return (
        <g>
          <rect width="80" height="80" x="10" y="10" fill="gray" stroke="black" strokeWidth="4" />
          <rect width="40" height="30" x="30" y="50" fill="black" />
        </g>
      );
      case 'chest': return (
        <g>
          <rect width="80" height="60" x="10" y="20" fill="#8b4513" stroke="black" strokeWidth="4" />
          <rect width="10" height="10" x="45" y="45" fill="gold" />
        </g>
      );
      case 'torch': return (
        <g>
          <line x1="50" y1="80" x2="50" y2="30" stroke="#8b4513" strokeWidth="8" />
          <circle cx="50" cy="20" r="15" fill="#ff4500" />
        </g>
      );
      case 'campfire': return (
        <g>
          <rect width="60" height="20" x="20" y="60" fill="#8b4513" />
          <path d="M 30 60 L 50 20 L 70 60 Z" fill="#ff4500" />
        </g>
      );
      case 'bed': return (
        <g>
          <rect width="80" height="40" x="10" y="30" fill="#5d4037" />
          <rect width="55" height="30" x="30" y="35" fill="#e57373" />
          <rect width="20" height="30" x="10" y="35" fill="#f5f5f5" />
        </g>
      );
      case 'wooden_axe':
      case 'stone_axe':
      {
        const axeColor = type.startsWith('wooden') ? '#a0522d' : '#999';
        const handleColor = type.startsWith('wooden') ? '#8b4513' : '#777';
        return (
          <g>
            <line x1="30" y1="80" x2="70" y2="20" stroke={handleColor} strokeWidth="8" />
            <path d="M 50 20 L 80 10 L 90 40 L 60 50 Z" fill={axeColor} stroke="black" strokeWidth="2" />
          </g>
        );
      }
      case 'wooden_pickaxe':
      case 'stone_pickaxe':
      {
        const pickColor = type.startsWith('wooden') ? '#a0522d' : '#999';
        const pickHandleColor = type.startsWith('wooden') ? '#8b4513' : '#777';
        return (
          <g>
            <line x1="50" y1="90" x2="50" y2="30" stroke={pickHandleColor} strokeWidth="8" />
            <path d="M 10 40 Q 50 20 90 40 L 90 50 Q 50 30 10 50 Z" fill={pickColor} stroke="black" strokeWidth="2" />
          </g>
        );
      }
      case 'wooden_sword':
      case 'stone_sword':
      {
        const swordColor = type.startsWith('wooden') ? '#a0522d' : '#999';
        const swordHandleColor = type.startsWith('wooden') ? '#8b4513' : '#777';
        return (
          <g>
            <line x1="20" y1="80" x2="50" y2="50" stroke={swordHandleColor} strokeWidth="8" />
            <path d="M 40 60 L 80 20 L 90 10 L 70 30 Z" fill={swordColor} stroke="black" strokeWidth="2" />
          </g>
        );
      }
      case 'leather_cap': return <path d="M 20 70 A 30 30 0 0 1 80 70 Z" fill="#8d6e63" stroke="#5d4037" strokeWidth="4" />;
      case 'leather_tunic': return <rect width="60" height="60" x="20" y="20" fill="#8d6e63" stroke="#5d4037" strokeWidth="4" />;
      case 'leather_pants': return (
        <g fill="#8d6e63" stroke="#5d4037" strokeWidth="4">
          <rect width="40" height="30" x="30" y="20" />
          <rect width="15" height="40" x="30" y="50" />
          <rect width="15" height="40" x="55" y="50" />
        </g>
      );
      case 'leather_boots': return (
        <g fill="#8d6e63" stroke="#5d4037" strokeWidth="4">
          <rect width="25" height="40" x="20" y="50" />
          <rect width="25" height="40" x="55" y="50" />
        </g>
      );
      case 'leather_backpack': return (
        <g>
          <rect width="60" height="70" x="20" y="20" fill="#8d6e63" stroke="black" strokeWidth="4" />
          <rect width="40" height="40" x="30" y="30" fill="#5d4037" />
        </g>
      );
      case 'raw_beef': return <ellipse cx="50" cy="50" rx="30" ry="20" fill="#b71c1c" stroke="#7f0000" strokeWidth="4" />;
      case 'cooked_beef': return <ellipse cx="50" cy="50" rx="30" ry="20" fill="#5d4037" stroke="#3e2723" strokeWidth="4" />;
      case 'raw_pork': return <ellipse cx="50" cy="50" rx="30" ry="20" fill="#f48fb1" stroke="#c2185b" strokeWidth="4" />;
      case 'cooked_pork': return <ellipse cx="50" cy="50" rx="30" ry="20" fill="#8d6e63" stroke="#5d4037" strokeWidth="4" />;
      case 'mutton': return <ellipse cx="50" cy="50" rx="25" ry="25" fill="#e57373" stroke="#b71c1c" strokeWidth="4" />;
      case 'cooked_mutton': return <ellipse cx="50" cy="50" rx="25" ry="25" fill="#5d4037" stroke="#3e2723" strokeWidth="4" />;
      case 'raw_chicken': return <ellipse cx="60" cy="50" rx="20" ry="30" fill="#ffe0b2" stroke="#f57c00" strokeWidth="4" transform="rotate(45, 60, 50)" />;
      case 'cooked_chicken': return <ellipse cx="60" cy="50" rx="20" ry="30" fill="#d7ccc8" stroke="#8d6e63" strokeWidth="4" transform="rotate(45, 60, 50)" />;
      case 'wool': return (
        <g fill="#ffffff" stroke="#e0e0e0" strokeWidth="2">
          <circle cx="40" cy="40" r="20" />
          <circle cx="60" cy="40" r="20" />
          <circle cx="50" cy="60" r="20" />
        </g>
      );
      case 'leather': return <path d="M 30 20 L 70 20 L 80 80 L 20 80 Z" fill="#8d6e63" stroke="#5d4037" strokeWidth="4" />;
      case 'feather': return (
        <g stroke="#9e9e9e" strokeWidth="2">
          <ellipse cx="50" cy="50" rx="10" ry="30" fill="#ffffff" transform="rotate(45, 50, 50)" />
          <line x1="30" y1="70" x2="70" y2="30" />
        </g>
      );
      case 'egg': return <ellipse cx="50" cy="50" rx="20" ry="25" fill="#fff9c4" stroke="#fbc02d" strokeWidth="4" />;
      case 'scrap_metal': return <rect width="60" height="40" x="20" y="30" fill="#78909c" stroke="#455a64" strokeWidth="4" />;
      case 'copper_wiring': return <path d="M 20 50 Q 50 20 80 50 T 20 50" fill="none" stroke="#d84315" strokeWidth="6" />;
      case 'iron_ingot': return <rect width="70" height="30" x="15" y="35" fill="#cfd8dc" stroke="#90a4ae" strokeWidth="4" />;
      case 'iron_axe': return (
        <g>
          <line x1="30" y1="80" x2="70" y2="20" stroke="#8b4513" strokeWidth="8" />
          <path d="M 50 20 L 80 10 L 90 40 L 60 50 Z" fill="#cfd8dc" stroke="black" strokeWidth="2" />
        </g>
      );
      case 'iron_pickaxe': return (
        <g>
          <line x1="50" y1="90" x2="50" y2="30" stroke="#8b4513" strokeWidth="8" />
          <path d="M 10 40 Q 50 20 90 40 L 90 50 Q 50 30 10 50 Z" fill="#cfd8dc" stroke="black" strokeWidth="2" />
        </g>
      );
      case 'iron_sword': return (
        <g>
          <line x1="20" y1="80" x2="50" y2="50" stroke="#8b4513" strokeWidth="8" />
          <path d="M 40 60 L 80 20 L 90 10 L 70 30 Z" fill="#cfd8dc" stroke="black" strokeWidth="2" />
        </g>
      );
      case 'antenna': return (
        <g>
          <rect width="10" height="80" x="45" y="10" fill="#90a4ae" />
          <circle cx="50" cy="20" r="10" fill="#d84315" />
          <line x1="30" y1="40" x2="70" y2="40" stroke="#90a4ae" strokeWidth="4" />
          <line x1="35" y1="60" x2="65" y2="60" stroke="#90a4ae" strokeWidth="4" />
        </g>
      );
      case 'fence': return (
        <g fill="#8b4513" stroke="black" strokeWidth="2">
          <rect width="10" height="80" x="20" y="10" />
          <rect width="10" height="80" x="70" y="10" />
          <rect width="60" height="10" x="20" y="30" />
          <rect width="60" height="10" x="20" y="60" />
        </g>
      );
      case 'bread': return <ellipse cx="50" cy="50" rx="40" ry="25" fill="#ffcc80" stroke="#ef6c00" strokeWidth="4" />;
      case 'meat_pie': return (
        <g>
          <ellipse cx="50" cy="55" rx="40" ry="20" fill="#d2b48c" stroke="#8b4513" strokeWidth="4" />
          <path d="M 20 50 Q 50 20 80 50" fill="#8b4513" />
        </g>
      );
      case 'omelet': return (
        <g>
          <circle cx="50" cy="50" r="40" fill="#fff9c4" stroke="#fbc02d" strokeWidth="4" />
          <circle cx="50" cy="50" r="15" fill="#fbc02d" />
        </g>
      );
      case 'wheat': return <path d="M 50 80 L 50 20 M 50 40 L 30 30 M 50 40 L 70 30 M 50 60 L 30 50 M 50 60 L 70 50" stroke="#fbc02d" strokeWidth="4" />;
      default: return <circle cx="50" cy="50" r="40" fill="#ccc" stroke="#999" strokeWidth="4" />;
    }
  };

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="pixelated pointer-events-none">
      {getIcon()}
    </svg>
  );
};

const ItemIcon = ({ type, size }: { type: string, size: number }) => {
  const [error, setError] = useState(false);
  const src = ITEM_IMAGES[type];

  if (error || !src) {
    return <PlaceholderIcon type={type} size={size} />;
  }

  const isSmallItem = type === 'sapling' || type === 'wheat_seeds';
  const scale = isSmallItem ? 2.5 : 1;

  return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
      <img
        src={src}
        alt={type}
        onError={() => setError(true)}
        className="pixelated pointer-events-none"
        style={{
          width: size * scale,
          height: size * scale,
          objectFit: 'contain',
          imageRendering: 'pixelated'
        }}
      />
    </div>
  );
};

const InventoryOverlay = ({ state, refreshUI, onClose }: { state: GameState, refreshUI: () => void, onClose: () => void }) => {
  const [draggedItem, setDraggedItem] = useState<{ index: number, from: 'inventory' | 'equipment' | 'chest' | 'furnace', slot?: string } | null>(null);

  const handleDrop = (toIndex: number, to: 'inventory' | 'equipment' | 'chest' | 'furnace', toSlot?: string) => {
    if (!draggedItem) return;

    const { index: fromIndex, from, slot: fromSlot } = draggedItem;
    
    let itemToMove: InventorySlot | null = null;
    
    // Get item from source
    if (from === 'inventory') {
      itemToMove = state.player.inventory[fromIndex];
    } else if (from === 'equipment' && fromSlot) {
      itemToMove = state.player.equipment[fromSlot as EquipmentSlotName];
    } else if (from === 'chest' || from === 'furnace') {
      const openChest = Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId);
      if (openChest && openChest.inventory) {
        itemToMove = openChest.inventory[fromIndex];
      }
    }

    if (!itemToMove) return;

    // Logic for moving item
    // This is a simplified version, you might want to handle stacking etc.
    
    // Remove from source
    if (from === 'inventory') {
      state.player.inventory[fromIndex] = null;
    } else if (from === 'equipment' && fromSlot) {
      state.player.equipment[fromSlot as EquipmentSlotName] = null;
    } else if (from === 'chest' || from === 'furnace') {
      const openChest = Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId);
      if (openChest && openChest.inventory) {
        openChest.inventory[fromIndex] = null;
      }
    }

    // Add to destination
    if (to === 'inventory') {
      const existing = state.player.inventory[toIndex];
      if (existing && existing.type === itemToMove.type) {
        existing.count += itemToMove.count;
      } else {
        state.player.inventory[toIndex] = itemToMove;
      }
    } else if (to === 'equipment' && toSlot) {
      // Check if item is armor/backpack
      const isArmor = itemToMove.type.includes('leather_') && !itemToMove.type.includes('backpack');
      const isBackpack = itemToMove.type === 'leather_backpack';
      
      if ((isArmor && toSlot !== 'back') || (isBackpack && toSlot === 'back')) {
         state.player.equipment[toSlot as EquipmentSlotName] = itemToMove;
      } else {
        // Return to inventory if invalid slot
        // For now just swap or something
      }
    } else if (to === 'chest' || to === 'furnace') {
      const openChest = Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId);
      if (openChest && openChest.inventory) {
        openChest.inventory[toIndex] = itemToMove;
      }
    }

    setDraggedItem(null);
    refreshUI();
  };

  const openChest = state.openChestId ? Array.from(state.resources.values()).flat().find(r => r.id === state.openChestId) : null;
  const currentInvRows = state.player.equipment.back ? MAIN_INV_ROWS + 2 : MAIN_INV_ROWS;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-8"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="flex flex-col gap-4 max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Crafting & Chest Panel */}
        <div className="bg-[#8b5a2b] p-6 relative flex flex-col gap-4"
             style={{
               boxShadow: 'inset -4px -4px 0px 0px rgba(0,0,0,0.4), inset 4px 4px 0px 0px rgba(255,255,255,0.2), 0 0 0 4px #3e2723, 12px 12px 0px 0px rgba(0,0,0,0.3)',
               minWidth: '800px'
             }}>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-mono font-bold text-[#2D1B0A] uppercase tracking-wider">
              {openChest ? (openChest.type === 'furnace' ? 'Inventory & Furnace' : 'Inventory & Chest') : (state.isWorkbenchOpen ? 'Inventory & Workbench' : 'Inventory & Crafting')}
            </h2>
            <button onClick={onClose} className="text-[#8B0000] text-2xl font-bold hover:scale-110 transition-transform">X</button>
          </div>

          <div className="h-64 overflow-y-auto pr-2 custom-scrollbar">
            {openChest ? (
              openChest.type === 'furnace' ? (
                <FurnaceUI 
                  furnace={openChest} 
                  handleDrop={handleDrop} 
                  setDraggedItem={setDraggedItem} 
                />
              ) : (
                <div className="grid grid-cols-9 gap-2">
                  {(openChest.inventory || Array(27).fill(null)).map((slot, i) => (
                    <SlotUI key={i} slot={slot} onDrop={() => handleDrop(i, 'chest')} onDragStart={() => setDraggedItem({ index: i, from: 'chest' })} />
                  ))}
                </div>
              )
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {CRAFTING_RECIPES.map((recipe) => (
                  <RecipeUI key={recipe.id} recipe={recipe} state={state} refreshUI={refreshUI} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          {/* Equipment Panel */}
          <div className="bg-[#8b5a2b] p-6 flex flex-col items-center gap-4 w-64"
               style={{
                 boxShadow: 'inset -4px -4px 0px 0px rgba(0,0,0,0.4), inset 4px 4px 0px 0px rgba(255,255,255,0.2), 0 0 0 4px #3e2723, 8px 8px 0px 0px rgba(0,0,0,0.3)'
               }}>
            <h2 className="text-lg font-mono font-bold text-[#2D1B0A] uppercase">Equipment</h2>
            <div className="relative w-full h-64 flex items-center justify-center">
               {/* Paper Doll */}
               <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                  <img src="/farmer_spritesheet.png" className="w-32 h-32 pixelated object-none" style={{ objectPosition: '0 0' }} />
               </div>
               
               {/* Slots around player */}
               <div className="absolute top-0 left-1/2 -translate-x-1/2">
                 <SlotUI slot={state.player.equipment.head} label="Head" onDrop={() => handleDrop(0, 'equipment', 'head')} onDragStart={() => setDraggedItem({ index: 0, from: 'equipment', slot: 'head' })} />
               </div>
               <div className="absolute top-1/2 left-0 -translate-y-1/2">
                 <SlotUI slot={state.player.equipment.torso} label="Torso" onDrop={() => handleDrop(0, 'equipment', 'torso')} onDragStart={() => setDraggedItem({ index: 0, from: 'equipment', slot: 'torso' })} />
               </div>
               <div className="absolute top-1/2 right-0 -translate-y-1/2">
                 <SlotUI slot={state.player.equipment.back} label="Back" onDrop={() => handleDrop(0, 'equipment', 'back')} onDragStart={() => setDraggedItem({ index: 0, from: 'equipment', slot: 'back' })} />
               </div>
               <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
                 <SlotUI slot={state.player.equipment.legs} label="Legs" onDrop={() => handleDrop(0, 'equipment', 'legs')} onDragStart={() => setDraggedItem({ index: 0, from: 'equipment', slot: 'legs' })} />
               </div>
               <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
                 <SlotUI slot={state.player.equipment.feet} label="Feet" onDrop={() => handleDrop(0, 'equipment', 'feet')} onDragStart={() => setDraggedItem({ index: 0, from: 'equipment', slot: 'feet' })} />
               </div>
            </div>
            <div className="text-[#2D1B0A] font-mono text-sm font-bold">Defense: {state.player.defense}</div>
          </div>

          {/* Inventory Panel */}
          <div className="bg-[#8b5a2b] p-6 flex-1"
               style={{
                 boxShadow: 'inset -4px -4px 0px 0px rgba(0,0,0,0.4), inset 4px 4px 0px 0px rgba(255,255,255,0.2), 0 0 0 4px #3e2723, 8px 8px 0px 0px rgba(0,0,0,0.3)'
               }}>
            <h2 className="text-lg font-mono font-bold text-[#2D1B0A] uppercase mb-4">Inventory</h2>
            <div className="grid grid-cols-9 gap-2">
              {state.player.inventory.slice(HOTBAR_SLOTS, HOTBAR_SLOTS + currentInvRows * 9).map((slot, i) => (
                <SlotUI key={i} slot={slot} onDrop={() => handleDrop(i + HOTBAR_SLOTS, 'inventory')} onDragStart={() => setDraggedItem({ index: i + HOTBAR_SLOTS, from: 'inventory' })} />
              ))}
            </div>
          </div>
        </div>

        {/* Hotbar Panel */}
        <div className="bg-[#8b5a2b] p-6"
             style={{
               boxShadow: 'inset -4px -4px 0px 0px rgba(0,0,0,0.4), inset 4px 4px 0px 0px rgba(255,255,255,0.2), 0 0 0 4px #3e2723, 8px 8px 0px 0px rgba(0,0,0,0.3)'
             }}>
          <h2 className="text-lg font-mono font-bold text-[#2D1B0A] uppercase mb-4">Hotbar</h2>
          <div className="flex gap-2 justify-center">
            {state.player.inventory.slice(0, HOTBAR_SLOTS).map((slot, i) => (
              <SlotUI key={i} slot={slot} isSelected={state.player.selectedSlot === i} onDrop={() => handleDrop(i, 'inventory')} onDragStart={() => setDraggedItem({ index: i, from: 'inventory' })} />
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const SlotUI = ({ slot, label, onDrop, onDragStart, isSelected }: {
  slot: InventorySlot | null | undefined;
  label?: string;
  onDrop?: () => void;
  onDragStart?: () => void;
  isSelected?: boolean;
}) => {
  return (
    <div 
      className={`w-16 h-16 bg-black/20 border-2 border-black/40 flex items-center justify-center relative ${isSelected ? 'border-white/60 bg-white/10' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {label && !slot && <span className="text-white/30 text-[10px] uppercase font-mono">{label}</span>}
      {slot && (
        <motion.div
          draggable
          onDragStart={onDragStart}
          className="w-14 h-14 flex items-center justify-center cursor-grab active:cursor-grabbing"
        >
          <ItemIcon type={slot.type} size={56} />
          <span className="absolute bottom-1 right-1 text-white text-xs font-bold pointer-events-none" style={{ textShadow: '1px 1px 2px black' }}>
            {slot.count}
          </span>
        </motion.div>
      )}
    </div>
  );
};

const RecipeUI = ({ recipe, state, refreshUI }: {
  recipe: Recipe;
  state: GameState;
  refreshUI: () => void;
}) => {
  const hasIngredients = (ingredients: { type: string, count: number }[]) => {
    return ingredients.every(ing => {
      const count = state.player.inventory.reduce((acc: number, slot: InventorySlot | null) => acc + (slot?.type === ing.type ? slot.count : 0), 0);
      return count >= ing.count;
    });
  };

  const canCraft = hasIngredients(recipe.ingredients) && (!recipe.requiresWorkbench || state.isWorkbenchOpen);

  const handleCraft = () => {
    if (!canCraft) return;

    // Remove ingredients
    recipe.ingredients.forEach((ing: Ingredient) => {
      let remaining = ing.count;
      for (let i = 0; i < state.player.inventory.length; i++) {
        const slot = state.player.inventory[i];
        if (slot?.type === ing.type) {
          const take = Math.min(remaining, slot.count);
          slot.count -= take;
          remaining -= take;
          if (slot.count <= 0) state.player.inventory[i] = null;
          if (remaining <= 0) break;
        }
      }
    });

    // Add output
    let remainingOutput = recipe.count;
    for (let i = 0; i < state.player.inventory.length; i++) {
      const slot = state.player.inventory[i];
      if (slot?.type === recipe.output && slot.count < 64) {
        const add = Math.min(remainingOutput, 64 - slot.count);
        slot.count += add;
        remainingOutput -= add;
        if (remainingOutput <= 0) break;
      } else if (!slot) {
        state.player.inventory[i] = { type: recipe.output, count: Math.min(remainingOutput, 64) };
        remainingOutput -= state.player.inventory[i]!.count;
        if (remainingOutput <= 0) break;
      }
    }

    refreshUI();
  };

  return (
    <div 
      onClick={handleCraft}
      className={`p-2 flex gap-3 items-center border-2 border-black/40 cursor-pointer transition-colors ${canCraft ? 'bg-black/10 hover:bg-black/20' : 'bg-black/30 opacity-60 cursor-not-allowed'}`}
    >
      <ItemIcon type={recipe.output} size={40} />
      <div className="flex flex-col">
        <span className="text-[#2D1B0A] font-mono font-bold text-xs uppercase">{recipe.id.replace('_', ' ')}</span>
        <span className="text-[#2D1B0A] font-mono text-[9px] opacity-70">
          {recipe.ingredients.map((ing: Ingredient) => `${ing.count} ${ing.type}`).join(', ')}
        </span>
      </div>
    </div>
  );
};

const FurnaceUI = ({ furnace, handleDrop, setDraggedItem }: {
  furnace: Resource;
  handleDrop: (index: number, target: 'furnace') => void;
  setDraggedItem: (v: { index: number; from: 'furnace' }) => void;
}) => {
  return (
    <div className="flex flex-col items-center gap-8 py-4">
      <div className="flex items-center gap-12">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col items-center gap-1">
            <span className="text-white/50 text-[10px] uppercase font-mono">Input</span>
            <SlotUI 
              slot={furnace.inventory?.[0]} 
              onDrop={() => handleDrop(0, 'furnace')} 
              onDragStart={() => setDraggedItem({ index: 0, from: 'furnace' })} 
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-white/50 text-[10px] uppercase font-mono">Fuel</span>
            <SlotUI 
              slot={furnace.inventory?.[1]} 
              onDrop={() => handleDrop(1, 'furnace')} 
              onDragStart={() => setDraggedItem({ index: 1, from: 'furnace' })} 
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="w-32 h-6 bg-black/40 border-2 border-black/60 relative overflow-hidden">
            {(furnace.smeltTimer ?? 0) > 0 && (
              <motion.div 
                className="absolute inset-y-0 left-0 bg-orange-500"
                initial={{ width: 0 }}
                animate={{ width: `${((furnace.smeltTimer ?? 0) / 600) * 100}%` }}
                transition={{ type: 'spring', stiffness: 50, damping: 20 }}
              />
            )}
          </div>
          <div className="text-orange-500 text-[10px] font-mono font-bold uppercase animate-pulse">Smelting...</div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-white/50 text-[10px] uppercase font-mono">Output</span>
          <SlotUI 
            slot={furnace.inventory?.[2]} 
            onDrop={() => handleDrop(2, 'furnace')} 
            onDragStart={() => setDraggedItem({ index: 2, from: 'furnace' })} 
          />
        </div>
      </div>

      {(furnace.fuelTimer ?? 0) > 0 && (
        <div className="flex flex-col items-center gap-1">
          <div className="w-16 h-2 bg-black/40 border border-black/60 relative overflow-hidden">
            <motion.div 
              className="absolute inset-y-0 left-0 bg-red-600"
              initial={{ width: 0 }}
              animate={{ width: `${((furnace.fuelTimer ?? 0) / (furnace.maxFuelTimer || 1)) * 100}%` }}
              transition={{ type: 'spring', stiffness: 50, damping: 20 }}
            />
          </div>
          <span className="text-red-500 text-[8px] font-mono font-bold uppercase">Fuel</span>
        </div>
      )}
    </div>
  );
};
