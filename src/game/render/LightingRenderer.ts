/**
 * Night lighting.
 *
 * Composites a darkness mask over the world, punched through by radial light
 * around the player, torches, campfires and lit furnaces. Split out of the draw
 * pass to keep Renderer.ts under 500 lines.
 *
 * Dawn and dusk ramp over two hours rather than switching, so the transition
 * reads as a gradient.
 */
import { PLAYER_SIZE } from '../core/config';
import type { GameState, RenderEntity } from '../core/types';

/** 0 at full day, 1 at full night. */
export function nightStrength(timeMinutes: number): number {
  const hour = timeMinutes / 60;
  if (hour >= 18 && hour < 20) return (hour - 18) / 2;
  if (hour >= 20 || hour < 4) return 1.0;
  if (hour >= 4 && hour < 6) return (6 - hour) / 2;
  return 0;
}

/**
 * Draw the night overlay, if it is dark enough to matter.
 *
 * `lightSources` is the already-culled list of on-screen resources, so this does
 * not walk the whole world again to find the torches.
 */
export function drawLighting(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  lightSources: RenderEntity[],
): void {
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
      lightSources.forEach((res) => {
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
}
