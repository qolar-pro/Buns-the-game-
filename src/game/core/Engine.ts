/**
 * The engine.
 *
 * Owns every piece of live game state that used to sit in ~40 useRefs inside a
 * 3,870-line useEffect in components/Game.tsx. The component now creates one of
 * these, starts it, and stops it on unmount; React re-renders never drive the
 * game loop.
 *
 * Everything here is deliberately outside React: the loop mutates plain objects
 * at 60fps and publishes a snapshot to the HUD store when something the player
 * can see has actually changed.
 */
import { CHUNK_SIZE, MAX_HUNGER, ROCK_SIZE } from '../core/config';
import { reseedNoise } from '../world/noise';
import { assets } from '../assets/AssetRegistry';
import { buildColliders, idForEntity } from '../assets/colliders';
import { metaFor } from '../assets/manifest';
import { renderChunkTerrain as drawChunkTerrain, type TerrainTiles } from '../render/TerrainRenderer';
import { createWorldgen } from '../world/worldgen';
import { createEntityRenderer } from '../render/EntityRenderer';
import { createRenderer, type SpriteSet } from '../render/Renderer';
import { createInputHandlers } from '../input/KeyboardMouse';
import { createGameplay } from '../systems/gameplay';
import { selectNearestTarget } from '../systems/targeting';
import { addToInventory as invAdd, removeFromInventory as invRemove } from '../systems/inventory';
import { applySave } from '../save/serialize';
import { readSlot as loadSlot } from '../save/storage';
import { SaveError } from '../save/schema';
import { debugError } from '../../../lib/debug';
import type { ColliderShape } from '../../../lib/SpriteCollider';
import type { EntityType, GameState, ItemType } from '../core/types';

/** The viewport the world is authored around; smaller screens zoom out to match. */
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

type Sprite = HTMLCanvasElement;

/** What the engine needs from the React component hosting it. */
export interface EngineHost {
  canvas: () => HTMLCanvasElement | null;
  loadedSaveId?: string | null;
  refreshUI: () => void;
  startNewGameRef: { current: (() => void) | null };
  saveMeta: { id: string; name: string; createdAt: number; playtimeMs: number };
  setDimensions: (d: { width: number; height: number }) => void;
  setAssetsReady: (ready: boolean) => void;
  setAssetProgress: (p: { loaded: number; total: number }) => void;
  setIsPausedUI: (paused: boolean) => void;
  setPauseMenuState: (v: 'main' | 'settings') => void;
  setLoadError: (message: string | null) => void;
}

/**
 * Create the engine for a fresh session.
 *
 * Returns a `stop()` that tears down listeners and cancels the loop; the
 * component calls it from its effect cleanup.
 */
export function createEngine(host: EngineHost, state: GameState): Engine {
  // --- engine-owned state (was ~40 useRefs) --------------------------------
  const animCounter = { value: 0 };
  let lastTime = 0;
  const keys = new Set<string>();
  /** One-shot presses awaiting the next tick; see KeyboardMouse.LATCHED_KEYS. */
  const latched = new Set<string>();
  let colliders: Map<string, ColliderShape> = new Map();
  const chunkCanvases = new Map<string, HTMLCanvasElement>();
  let view = { zoom: 1, dpr: 1 };
  const debugColliders = { current: false };
  const terrainTiles: TerrainTiles = { grass: null, grassVariant: null, dirt: null };
  const animalSprites: Record<string, Sprite | null> = {
    cow: null, pig: null, sheep: null, chicken: null,
  };
  const spriteSet: SpriteSet = {
    tree: null, smallTree: null, sapling: null, trunk: null, bush: null,
    coalOre: null, ironOre: null, stick: null, stoneItem: null, torch: null,
    workbench: null, chest: null, furnace: null, campfire1: null, campfire2: null,
    antenna: null, fence: null, player: null, rocks: [],
  };

  /** Teardown, assigned once the loop and listeners are running. */
  let stop: () => void = () => {};


      // Load Farmer Sprite
      // Load Tree Stage Sprites
      // Atlases replace the 32 individual image loads: five requests instead of
      // thirty-seven, and sprites are addressed by manifest id rather than by
      // filename. Colliders come from the authored manifest, so regenerating art
      // can no longer change physics.
      colliders = buildColliders();

      /** Resolve every manifest id into the sprite set the renderer reads. */
      const bindSprites = () => {
        const s = (id: string) => assets.sprite(id);
        Object.assign(spriteSet, {
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
        Object.assign(animalSprites, {
          cow: s('characters/cow'),
          pig: s('characters/pig'),
          sheep: s('characters/sheep'),
          chicken: s('characters/chicken'),
        });
        Object.assign(terrainTiles, {
          grass: s('terrain/grass'),
          grassVariant: s('terrain/grass_variant'),
          dirt: s('terrain/dirt'),
        });
      };

      assets
        .load((p) => host.setAssetProgress(p))
        .then(() => {
          bindSprites();
          host.setAssetsReady(true);
        })
        .catch((err) => debugError('Failed to load sprite atlases', err));

  
      // Load Animal Sprites

  /**
   * Wire up the canvas, listeners and loop.
   *
   * Separated so the engine object is always returned: the canvas may not be
   * mounted yet, and bailing out of the factory would hand back undefined.
   */
  const start = () => {
        state.player.lastMoveTime = Date.now();
        const canvas = host.canvas();
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

          view = { zoom, dpr };
          host.setDimensions({ width: Math.round(w * dpr), height: Math.round(h * dpr) });

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
          const canvas = drawChunkTerrain(cx, cy, terrainTiles);
          if (canvas) chunkCanvases.set(`${cx},${cy}`, canvas);
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

          const newSeed = Math.floor(Math.random() * 2147483647);
          reseedNoise(newSeed);
    
          // Reset world data
          state.resources.clear();
          state.generatedChunks.clear();
          state.items = [];
          chunkCanvases.clear();
    
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
  
        host.startNewGameRef.current = startNewGame;

        if (host.loadedSaveId) {
          // Loading is async now (IndexedDB), so start a world immediately and let
          // the save overwrite it once read. That keeps the first frame drawable.
          startNewGame();
          loadSlot(host.loadedSaveId)
            .then((raw) => {
              if (!raw) throw new SaveError('That save could not be found.');
              const save = applySave(state, raw);
              reseedNoise(save.seed);
              host.saveMeta = {
                id: host.loadedSaveId ?? host.saveMeta.id,
                name: save.name,
                createdAt: save.createdAt,
                playtimeMs: save.playtimeMs,
              };
            })
            .catch((err: unknown) => {
              const message = err instanceof SaveError ? err.message : 'That save could not be loaded.';
              const detail = err instanceof SaveError ? err.detail : String(err);
              debugError('Failed to load save', err);
              host.setLoadError(detail ? `${message} (${detail})` : message);
            });
        } else {
          startNewGame();
        }










        // Animal and enemy drawing lives in src/game/render/EntityRenderer.ts.
        const { getAnimalSpriteInfo, drawAnimal, drawEnemy } = createEntityRenderer({
          state,
          sprites: {
            cow: () => animalSprites.cow,
            pig: () => animalSprites.pig,
            sheep: () => animalSprites.sheep,
            chicken: () => animalSprites.chicken,
          },
        });

        // The gameplay tick lives in src/game/systems/gameplay.ts.
        const { update } = createGameplay({
          state,
          keys: keys,
          latched,
          colliders: colliders,
          anim: animCounter,
          refreshUI: host.refreshUI,
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
          sprites: spriteSet,
          colliders: colliders,
          chunkCanvases: chunkCanvases,
          anim: animCounter,
          keys: keys,
          canvas: () => host.canvas(),
          view: () => view,
          debugColliders: () => debugColliders.current,
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
          keys: keys,
          latched,
          colliders: colliders,
          canvas: () => host.canvas(),
          refreshUI: host.refreshUI,
          removeFromInventory,
          spawnResource,
          getResourceDimensions,
          setPaused: host.setIsPausedUI,
          setPauseMenuState: host.setPauseMenuState,
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
          if (!lastTime) lastTime = time;
          const dt = Math.min(2.0, (time - lastTime) / (1000 / 60)); // Normalize to 60fps, cap at 2.0 to prevent huge jumps
          lastTime = time;

          if (state.isPaused) {
            draw(); // Keep rendering the background
            animationFrameId = requestAnimationFrame(loop);
            return;
          }

          update(dt);
          draw();
          animationFrameId = requestAnimationFrame(loop);
        };

        animationFrameId = requestAnimationFrame(loop);

        stop = () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
          window.removeEventListener('resize', handleResize);
          canvas.removeEventListener('mousedown', handleMouseDown);
          canvas.removeEventListener('mousemove', handleMouseMove);
          canvas.removeEventListener('mouseup', handleMouseUp);
          canvas.removeEventListener('contextmenu', handleContextMenu);
          cancelAnimationFrame(animationFrameId);
        };
  };

  start();

  // Dev-only handle, so the running world can be inspected from the console or
  // a test without threading state through React.
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    (window as unknown as { __buns?: unknown }).__buns = {
      state,
      keys,
      latched,
      selectNearestTarget: () => selectNearestTarget(state),
    };
  }

  return {
    /** Live state, for the React layer to read (never to drive rendering). */
    state,
    keys,
    latched,
    /** Touch has no hover, so the action button picks a target itself. */
    selectNearestTarget: () => selectNearestTarget(state),
    setDebugColliders: (on: boolean) => { debugColliders.current = on; },
    stop,
  };
}

export interface Engine {
  /** Live state, for the React layer to read (never to drive rendering). */
  state: GameState;
  /** Held keys; the touch layer writes into this same set. */
  keys: Set<string>;
  /** One-shot presses awaiting the next tick. */
  latched: Set<string>;
  /** Select the nearest resource or animal in reach; used by touch. */
  selectNearestTarget: () => boolean;
  setDebugColliders: (on: boolean) => void;
  stop: () => void;
}
