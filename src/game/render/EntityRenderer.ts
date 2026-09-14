/**
 * Animal and enemy rendering.
 *
 * Moved out of the draw loop in components/Game.tsx. Sheet grids are read from
 * the asset manifest rather than hardcoded: the previous code assumed a 6x8 grid
 * that did not match the art, so standing animals sampled off the end of the
 * sheet and drew nothing.
 */
import { FRAMES } from '../assets/frames';
import type { Animal, AnimalType, Enemy, GameState } from '../core/types';

type Sprite = HTMLCanvasElement;

export interface EntityRenderDeps {
  state: GameState;
  sprites: {
    cow: () => Sprite | null;
    pig: () => Sprite | null;
    sheep: () => Sprite | null;
    chicken: () => Sprite | null;
  };
}

/**
 * Bind the entity draw routines to a given state and sprite set.
 *
 * A factory so the bodies could move across unchanged — they read a handful of
 * refs that are now supplied here instead of captured from an enclosing effect.
 */
export function createEntityRenderer({ state, sprites }: EntityRenderDeps) {
  const getAnimalSpriteInfo = (type: AnimalType) => {
    let img: Sprite | null = null;
    let w = 100, h = 100; // Default sizes
    let imgUrl = '';
  
    if (type === 'cow') { img = sprites.cow(); imgUrl = 'characters/cow'; w = 150; h = 150; }
    else if (type === 'pig') { img = sprites.pig(); imgUrl = 'characters/pig'; w = 120; h = 120; }
    else if (type === 'sheep') { img = sprites.sheep(); imgUrl = 'characters/sheep'; w = 100; h = 100; }
    else if (type === 'chicken') { img = sprites.chicken(); imgUrl = 'characters/chicken'; w = 80; h = 80; }
  
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
      if (state.selectedAnimalId === animal.id) {
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

  return { getAnimalSpriteInfo, drawAnimal, drawEnemy };
}

export type EntityRenderer = ReturnType<typeof createEntityRenderer>;
