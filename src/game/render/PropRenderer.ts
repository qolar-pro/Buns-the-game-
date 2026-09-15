/**
 * Drawing for world objects: trees, bushes, saplings, stumps, torches,
 * workbenches, campfires, beds, chests, furnaces, fences, antennas, and the
 * rock/ore/branch family.
 *
 * Split out of the draw pass to keep Renderer.ts under 500 lines. The bodies are
 * unchanged; they take the sprite set and helpers the draw loop used to close over.
 */
import { idForEntity } from '../assets/colliders';
import type { ColliderShape } from '../../../lib/SpriteCollider';
import { ROCK_COLOR } from '../core/config';
import { hash } from '../world/noise';
import type { EntityType, Resource } from '../core/types';

type Sprite = HTMLCanvasElement;

export interface PropRenderDeps {
  sprites: {
    tree: Sprite | null; smallTree: Sprite | null; sapling: Sprite | null;
    trunk: Sprite | null; bush: Sprite | null; torch: Sprite | null;
    workbench: Sprite | null; chest: Sprite | null; furnace: Sprite | null;
    campfire1: Sprite | null; campfire2: Sprite | null;
    antenna: Sprite | null; fence: Sprite | null;
    coalOre: Sprite | null; ironOre: Sprite | null;
    stick: Sprite | null; stoneItem: Sprite | null;
    rocks: (Sprite | null)[];
  };
  colliders: Map<string, ColliderShape>;
  anim: { value: number };
  debugColliders: () => boolean;
  getResourceDimensions: (
    type: EntityType, scale: number, growthStage?: number, rockIndex?: number,
  ) => { w: number; h: number };
}

/** Placed and grown objects. */
export const PROP_TYPES = new Set<string>([
  'tree', 'bush', 'sapling', 'trunk', 'torch', 'workbench',
  'campfire', 'bed', 'chest', 'furnace', 'antenna', 'fence',
]);

/** Gatherable rock, ore and branch nodes. */
export const ROCK_TYPES = new Set<string>([
  'rock', 'coal_ore', 'iron_ore', 'branch', 'small_rock',
]);

/** True when this entity is drawn here rather than by the main pass. */
export function isWorldObject(type: unknown): boolean {
  const t = String(type);
  return PROP_TYPES.has(t) || ROCK_TYPES.has(t);
}

export function drawWorldObject(
  ctx: CanvasRenderingContext2D,
  ent: Resource & { isTargeted?: boolean },
  { sprites, colliders, anim, debugColliders, getResourceDimensions }: PropRenderDeps,
): void {
  if (PROP_TYPES.has(String(ent.type))) {
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
  }
}
