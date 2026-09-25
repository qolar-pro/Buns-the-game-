/**
 * The placement preview.
 *
 * Before a block goes down, the player gets a transparent copy of it standing
 * exactly where it will land, inside the grid cell it will occupy. Without one,
 * building is guesswork: the piece appears a hundred units in front of you in
 * whichever direction you last faced, and the only way to find out whether that
 * was the cell you meant is to place it and break it again.
 *
 * The position is not computed here. `ghostTarget` in systems/building.ts owns
 * that arithmetic and `placeHeld` uses the same function, so the preview cannot
 * disagree with the placement — which is the one thing a preview must never do.
 */
import { assets } from '../assets/AssetRegistry';
import { ghostTarget } from '../systems/building';
import type { EntityType, GameState } from '../core/types';

/** Green when the spot is free, red when something is already there. */
const VALID = { fill: 'rgba(150, 210, 120, 0.20)', line: 'rgba(180, 235, 150, 0.85)' };
const BLOCKED = { fill: 'rgba(210, 90, 70, 0.22)', line: 'rgba(240, 130, 110, 0.9)' };

/** Alpha of the ghost sprite itself. Enough to identify, not enough to mistake. */
const SPRITE_ALPHA = 0.45;

export function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  getResourceDimensions: (t: EntityType, scale: number, stage: number) => { w: number; h: number },
): void {
  // Nothing to preview while a menu is up or the player is talking.
  if (state.isInventoryOpen || state.talkingToId) return;

  const target = ghostTarget(state, getResourceDimensions, (x, y, w, h) =>
    isOccupied(state, x, y, w, h, getResourceDimensions));
  if (!target) return;

  const colours = target.valid ? VALID : BLOCKED;

  ctx.save();

  // The cell. Structural pieces snap to it, so showing it is showing the rule.
  if (target.snapped) {
    ctx.fillStyle = colours.fill;
    ctx.fillRect(target.cellX, target.cellY, target.cellSize, target.cellSize);
    ctx.strokeStyle = colours.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(target.cellX + 1, target.cellY + 1,
                   target.cellSize - 2, target.cellSize - 2);
  } else {
    // Free-placed props get a footprint ellipse rather than a grid square:
    // there is no cell, and drawing one would promise a snap that never comes.
    ctx.fillStyle = colours.fill;
    ctx.beginPath();
    ctx.ellipse(target.x + target.w / 2, target.y + target.h * 0.92,
                target.w * 0.45, target.h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colours.line;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // The thing itself, ghosted.
  ctx.globalAlpha = SPRITE_ALPHA;
  assets.draw(ctx, spriteIdFor(target.entity), target.x, target.y, target.w, target.h);

  ctx.restore();
}

/** Atlas id for a previewed entity. Mirrors `idForEntity` for the placeables. */
function spriteIdFor(entity: EntityType): string {
  if (entity === 'wheat_crop') return 'world/crop_seedling';
  return `world/${entity}`;
}

/**
 * Is something already standing here?
 *
 * Both footprints come from the entities' own drawn sizes. An earlier version
 * hardcoded the corners of a 128-pixel sprite, which was every object's size
 * when it was written and is now almost nothing's: a torch is 60x110 and a tree
 * is 170x255, so the test was checking a rectangle unrelated to either.
 *
 * Only the lower part of each sprite counts. A tree's canopy overhangs the
 * ground it does not stand on, and a player should be able to lay a floor tile
 * under the branches.
 */
function isOccupied(
  state: GameState,
  x: number,
  y: number,
  w: number,
  h: number,
  getResourceDimensions: (t: EntityType, scale: number, stage: number) => { w: number; h: number },
): boolean {
  const left = x + w * 0.2;
  const right = x + w * 0.8;
  const top = y + h * 0.7;
  const bottom = y + h;

  for (const [, chunk] of state.resources) {
    for (const res of chunk) {
      // Cheap reject before measuring anything.
      if (Math.abs(res.x - x) > 400 || Math.abs(res.y - y) > 400) continue;
      const dims = getResourceDimensions(res.type, res.scale ?? 1, res.growthStage ?? 2);
      const rl = res.x + dims.w * 0.2;
      const rr = res.x + dims.w * 0.8;
      const rt = res.y + dims.h * 0.7;
      const rb = res.y + dims.h;
      if (left < rr && right > rl && top < rb && bottom > rt) return true;
    }
  }
  return false;
}
