'use client';

// Game component for the resource gathering and crafting game
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { ColliderShape } from '../lib/SpriteCollider';
import { debugError } from '@/lib/debug';
import { assets } from '@/src/game/assets/AssetRegistry';

/** The viewport the world is authored around; smaller screens zoom out to match. */
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Hud } from '@/components/ui/Hud';
import { InventoryOverlay } from '@/components/ui/InventoryOverlay';
import { applySave, serialize, toSaveFile } from '@/src/game/save/serialize';
import { readSlot as loadSlot, writeSlot } from '@/src/game/save/storage';
import { SaveError } from '@/src/game/save/schema';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { TouchControls } from '@/components/ui/TouchControls';
import { RotatePrompt } from '@/components/ui/RotatePrompt';
import { useIsPortrait, useIsTouch } from '@/hooks/use-touch';
import { buildColliders, idForEntity } from '@/src/game/assets/colliders';
import { metaFor } from '@/src/game/assets/manifest';
import { renderChunkTerrain as drawChunkTerrain, type TerrainTiles } from '@/src/game/render/TerrainRenderer';
import { createWorldgen } from '@/src/game/world/worldgen';
import { createEntityRenderer } from '@/src/game/render/EntityRenderer';
import { createInputHandlers } from '@/src/game/input/KeyboardMouse';
import { createGameplay } from '@/src/game/systems/gameplay';
import { createRenderer, type SpriteSet } from '@/src/game/render/Renderer';
import {
  ROCK_SIZE,
  CHUNK_SIZE, MAX_HUNGER,
} from '@/src/game/core/config';
import { reseedNoise } from '@/src/game/world/noise';
import {
  addToInventory as invAdd,
  removeFromInventory as invRemove,
} from '@/src/game/systems/inventory';
import type { EntityType, ItemType, GameState } from '@/src/game/core/types';


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
  /**
   * Sprites the renderer draws, filled in once the atlases decode. It is one
   * mutable object rather than a snapshot: the renderer is constructed before
   * loading finishes, so copying values here would capture nulls forever.
   */
  /** Animal sheets, read live by the entity renderer. */
  const animalSpritesRef = useRef({ cow: null, pig: null, sheep: null, chicken: null } as Record<string, HTMLCanvasElement | null>);
  /** Ground tiles, read live by the terrain renderer. */
  const terrainTilesRef = useRef<TerrainTiles>({ grass: null, grassVariant: null, dirt: null });
  const spriteSetRef = useRef<SpriteSet>({
    tree: null, smallTree: null, sapling: null, trunk: null, bush: null,
    coalOre: null, ironOre: null, stick: null, stoneItem: null, torch: null,
    workbench: null, chest: null, furnace: null, campfire1: null, campfire2: null,
    antenna: null, fence: null, player: null, rocks: [],
  });
  const chunkCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const keysRef = useRef<Set<string>>(new Set());
  
  // Tree Stage Refs
  const collidersRef = useRef<Map<string, ColliderShape>>(new Map());
  const debugCollidersRef = useRef(false);
  const [debugColliders, setDebugColliders] = useState(false);
  
  // Tool Image Refs
  
  // Animal Sprite Refs

  useEffect(() => {
    // Load Farmer Sprite
    // Load Tree Stage Sprites
    // Atlases replace the 32 individual image loads: five requests instead of
    // thirty-seven, and sprites are addressed by manifest id rather than by
    // filename. Colliders come from the authored manifest, so regenerating art
    // can no longer change physics.
    collidersRef.current = buildColliders();

    /** Resolve every manifest id into the sprite set the renderer reads. */
    const bindSprites = () => {
      const s = (id: string) => assets.sprite(id);
      Object.assign(spriteSetRef.current, {
        tree: s('world/tree'),
        smallTree: s('world/small_tree'),
        sapling: s('world/sapling'),
        trunk: s('world/trunk'),
        bush: s('world/bush'),
        coalOre: s('world/coal_ore'),
        ironOre: s('world/iron_ore'),
        stick: s('items/stick'),
        stoneItem: s('items/stone'),
        torch: s('world/torch'),
        workbench: s('world/workbench'),
        chest: s('world/chest'),
        furnace: s('world/furnace'),
        campfire1: s('world/campfire_1'),
        campfire2: s('world/campfire_2'),
        antenna: s('world/antenna'),
        fence: s('world/fence'),
        player: s('characters/player'),
        rocks: ['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c'].map((v) => s(`world/rock_${v}`)),
      });
      Object.assign(animalSpritesRef.current, {
        cow: s('characters/cow'),
        pig: s('characters/pig'),
        sheep: s('characters/sheep'),
        chicken: s('characters/chicken'),
      });
      Object.assign(terrainTilesRef.current, {
        grass: s('terrain/grass'),
        grassVariant: s('terrain/grass_variant'),
        dirt: s('terrain/dirt'),
      });
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
      const canvas = drawChunkTerrain(cx, cy, terrainTilesRef.current);
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
        cow: () => animalSpritesRef.current.cow,
        pig: () => animalSpritesRef.current.pig,
        sheep: () => animalSpritesRef.current.sheep,
        chicken: () => animalSpritesRef.current.chicken,
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



    // The draw pass lives in src/game/render/Renderer.ts.
    const { draw } = createRenderer({
      state,
      sprites: spriteSetRef.current,
      colliders: collidersRef.current,
      chunkCanvases: chunkCanvasesRef.current,
      anim: animCounterRef.current,
      keys: keysRef.current,
      canvas: () => canvasRef.current,
      view: () => viewRef.current,
      debugColliders: () => debugCollidersRef.current,
      renderChunkTerrain,
      getResourceDimensions,
      getAnimalSpriteInfo,
      drawAnimal,
      drawEnemy,
    });

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
