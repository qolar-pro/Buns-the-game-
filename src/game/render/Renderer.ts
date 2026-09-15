/**
 * The draw orchestrator.
 *
 * Moved out of components/Game.tsx. Owns z-sorting and the per-entity draw
 * calls; terrain and character rendering live in their own modules alongside.
 *
 * The 25 image refs the original captured from its enclosing effect are supplied
 * as one sprite set, so the body moved across essentially unchanged.
 */
import { CHUNK_SIZE, PLAYER_SIZE } from '../core/config';
import { assets } from '../assets/AssetRegistry';
import { drawLighting } from './LightingRenderer';
import { drawWorldObject, isWorldObject } from './PropRenderer';
import { FRAMES } from '../assets/frames';
import { publishHud, toHotbar } from '../core/HudStore';
import { HOTBAR_SLOTS, MAX_HUNGER } from '../core/config';
import type { ColliderShape } from '../../../lib/SpriteCollider';
import type {
  Animal, AnimalType, Enemy, EntityType, GameState, Particle,
  RenderEntity, Resource,
} from '../core/types';

type Sprite = HTMLCanvasElement;

/** Every sprite the draw pass reaches for, resolved once at load. */
export interface SpriteSet {
  antenna: Sprite | null;
  bush: Sprite | null;
  campfire1: Sprite | null;
  campfire2: Sprite | null;
  chest: Sprite | null;
  coalOre: Sprite | null;
  fence: Sprite | null;
  furnace: Sprite | null;
  ironOre: Sprite | null;
  sapling: Sprite | null;
  smallTree: Sprite | null;
  stick: Sprite | null;
  stoneItem: Sprite | null;
  torch: Sprite | null;
  tree: Sprite | null;
  trunk: Sprite | null;
  workbench: Sprite | null;
  player: Sprite | null;
  rocks: (Sprite | null)[];
}

export interface RendererDeps {
  state: GameState;
  sprites: SpriteSet;
  colliders: Map<string, ColliderShape>;
  chunkCanvases: Map<string, HTMLCanvasElement>;
  anim: { value: number };
  keys: Set<string>;
  canvas: () => HTMLCanvasElement | null;
  view: () => { zoom: number; dpr: number };
  debugColliders: () => boolean;
  renderChunkTerrain: (cx: number, cy: number) => HTMLCanvasElement | null;
  getResourceDimensions: (
    type: EntityType, scale: number, growthStage?: number, rockIndex?: number,
  ) => { w: number; h: number };
  getAnimalSpriteInfo: (type: AnimalType) => {
    w: number; h: number; imgUrl: string; rows: number; cols: number;
    hasLabelCol: boolean; hasLabelRow: boolean; labelHeight: number;
  };
  drawAnimal: (ctx: CanvasRenderingContext2D, animal: Animal) => void;
  drawEnemy: (ctx: CanvasRenderingContext2D, enemy: Enemy) => void;
}

/** Bind the draw pass to a state and its sprite set. */
/** First cell of the player sheet, for the held-tool overlay. */
const PLAYER_FRAME = FRAMES['characters/player'];

export function createRenderer({
  state, sprites, colliders, chunkCanvases, anim, keys, canvas, view,
  debugColliders, renderChunkTerrain, getResourceDimensions, getAnimalSpriteInfo,
  drawAnimal, drawEnemy,
}: RendererDeps) {
  const draw = () => {
    const el = canvas();
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    // Map world units onto the DPR-scaled backing store. Everything below
    // continues to draw in world units, unchanged.
    const { zoom, dpr } = view();
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
        let chunkCanvas = chunkCanvases.get(chunkId);
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
        const hover = Math.sin(anim.value * 2 + e.x) * 3;
        assets.draw(ctx, `items/${e.type}`, e.x - 20, e.y - 20 + hover, 40, 40);
      } else if (e.isEnemy) {
        drawEnemy(ctx, ent as Enemy);
      } else if (e.isAnimal) {
        drawAnimal(ctx, ent as Animal);
      
          // Debug: Draw collider shape for animals
          if (debugColliders()) {
            const { w, h, imgUrl, rows, cols: _cols, hasLabelCol: _hasLabelCol, hasLabelRow } = getAnimalSpriteInfo((ent as Animal).type);

            const shape = colliders.get(imgUrl);
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
      } else if (isWorldObject(e.type)) {
        // World objects are drawn in src/game/render/PropRenderer.ts.
        drawWorldObject(ctx, ent as Resource & { isTargeted?: boolean }, {
          sprites, colliders, anim, debugColliders, getResourceDimensions,
        });
      } else if (ent.type === 'player') {
        const p = ent as GameState['player'];
        if (sprites.player && sprites.player) {
          // Rows are authored as down, left, right, up.
          const grid = PLAYER_FRAME.grid ?? { cols: 8, rows: 4, cellW: 64, cellH: 96 };
          const ROW_FOR_FACING = { down: 0, left: 1, right: 2, up: 3 } as const;
          const frameY = ROW_FOR_FACING[p.facing ?? 'down'];
          const finalFrameX = Math.floor(p.animFrame) % grid.cols;

          const spriteWidth = sprites.player.width / grid.cols;
          const spriteHeight = sprites.player.height / grid.rows;

          ctx.save();
          ctx.drawImage(
            sprites.player,
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
            if (keys.size > 0) {
              rotation += Math.sin(anim.value * 10) * 0.2;
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

    // Night lighting lives in src/game/render/LightingRenderer.ts.
    drawLighting(ctx, state, visibleResources);

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

  return { draw };
}

export type Renderer = ReturnType<typeof createRenderer>;
