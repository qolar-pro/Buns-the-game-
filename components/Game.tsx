'use client';

// Game component for the resource gathering and crafting game
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { ColliderShape } from '../lib/SpriteCollider';
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
import { createWorldgen } from '@/src/game/world/worldgen';
import { createEntityRenderer } from '@/src/game/render/EntityRenderer';
import { createInputHandlers } from '@/src/game/input/KeyboardMouse';
import { createGameplay } from '@/src/game/systems/gameplay';
import {
  PLAYER_SIZE, ROCK_COLOR, ROCK_SIZE,
  CHUNK_SIZE, HOTBAR_SLOTS, MAIN_INV_ROWS, MAIN_INV_COLS,
  SLOT_SIZE, SLOT_MARGIN, MAX_HUNGER,
} from '@/src/game/core/config';
import { reseedNoise, hash } from '@/src/game/world/noise';
import {
  addToInventory as invAdd,
  removeFromInventory as invRemove,
} from '@/src/game/systems/inventory';
import { craftItem as craft } from '@/src/game/systems/crafting';
import type {
  EntityType, ItemType,
  Animal, Resource, Enemy,
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
  /** Shared animation phase: advanced by the gameplay tick, read by the renderer. */
  const animCounterRef = useRef({ value: 0 });
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
    // World generation lives in src/game/world/worldgen.ts now; the bodies moved
    // across unchanged and are bound to this state here.
    const {
      spawnResource, dropLoot, spawnChunkResources, spawnItem, spawnEnemy,
    } = createWorldgen({ state, getResourceDimensions });

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










    // Animal and enemy drawing lives in src/game/render/EntityRenderer.ts.
    const { getAnimalSpriteInfo, drawAnimal, drawEnemy } = createEntityRenderer({
      state,
      sprites: {
        cow: () => cowImgRef.current,
        pig: () => pigImgRef.current,
        sheep: () => sheepImgRef.current,
        chicken: () => chickenImgRef.current,
      },
    });

    // The gameplay tick lives in src/game/systems/gameplay.ts.
    const { update } = createGameplay({
      state,
      keys: keysRef.current,
      colliders: collidersRef.current,
      anim: animCounterRef.current,
      refreshUI,
      startNewGame,
      addToInventory,
      removeFromInventory,
      spawnItem,
      spawnEnemy,
      spawnChunkResources,
      dropLoot,
      getResourceDimensions,
      getAnimalSpriteInfo,
    });

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
          const hover = Math.sin(animCounterRef.current.value * 2 + e.x) * 3;
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
              const sway = Math.sin(animCounterRef.current.value + e.x) * 0.03;
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
              const sway = Math.sin(animCounterRef.current.value + e.x + b) * 5;
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
                rotation += Math.sin(animCounterRef.current.value * 10) * 0.2;
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


    // Keyboard and mouse handlers live in src/game/input/KeyboardMouse.ts.
    const {
      handleKeyDown, handleKeyUp, handleMouseDown,
      handleContextMenu, handleMouseMove, handleMouseUp,
    } = createInputHandlers({
      state,
      keys: keysRef.current,
      colliders: collidersRef.current,
      canvas: () => canvasRef.current,
      refreshUI,
      removeFromInventory,
      spawnResource,
      getResourceDimensions,
      setPaused: setIsPausedUI,
      setPauseMenuState,
      getAnimalSpriteInfo,
    });

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
