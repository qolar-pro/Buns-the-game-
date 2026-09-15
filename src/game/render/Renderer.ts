/**
 * The draw orchestrator.
 *
 * Moved out of components/Game.tsx. Owns z-sorting and the per-entity draw
 * calls; terrain and character rendering live in their own modules alongside.
 *
 * The 25 image refs the original captured from its enclosing effect are supplied
 * as one sprite set, so the body moved across essentially unchanged.
 */
import { CHUNK_SIZE, PLAYER_SIZE, ROCK_COLOR } from '../core/config';
import { assets } from '../assets/AssetRegistry';
import { hash } from '../world/noise';
import { FRAMES } from '../assets/frames';
import { idForEntity } from '../assets/colliders';
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
      } else if (e.type === 'tree' || e.type === 'bush' || e.type === 'sapling' || e.type === 'trunk' || e.type === 'torch' || e.type === 'workbench' || e.type === 'campfire' || e.type === 'bed' || e.type === 'chest' || e.type === 'furnace' || e.type === 'antenna' || e.type === 'fence') {
        const e = ent as Resource & { isTargeted?: boolean };
        ctx.globalAlpha = e.opacity ?? 1;
        const dims = getResourceDimensions(e.type, e.scale, e.growthStage);
      
        let img: Sprite | null = null;
        if (e.type === 'sapling') img = sprites.sapling;
        else if (e.type === 'bush') img = sprites.bush;
        else if (e.type === 'trunk') img = sprites.trunk;
        else if (e.type === 'tree') {
          img = e.growthStage === 1 ? sprites.smallTree : sprites.tree;
        } else if (e.type === 'torch') img = sprites.torch;
        else if (e.type === 'workbench') img = sprites.workbench;
        else if (e.type === 'campfire') img = (Math.floor(Date.now() / 200) % 2 === 0) ? sprites.campfire1 : sprites.campfire2;
        else if (e.type === 'chest') img = sprites.chest;
        else if (e.type === 'furnace') img = sprites.furnace;
        else if (e.type === 'antenna') img = sprites.antenna;
        else if (e.type === 'fence') img = sprites.fence;

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
            const sway = Math.sin(anim.value + e.x) * 0.03;
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
        if (ent.type === 'coal_ore') img = sprites.coalOre;
        else if (ent.type === 'iron_ore') img = sprites.ironOre;
        else if (ent.type === 'branch') img = sprites.stick;
        else if (ent.type === 'small_rock') img = sprites.stoneItem;
        else img = sprites.rocks[e.rockIndex ?? 0];
      
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
          if (debugColliders()) {
            const shape = colliders.get(imgUrl);
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
          const img = sprites.stick;
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
          const img = sprites.stoneItem;
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
            const sway = Math.sin(anim.value + e.x + b) * 5;
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

  return { draw };
}

export type Renderer = ReturnType<typeof createRenderer>;
