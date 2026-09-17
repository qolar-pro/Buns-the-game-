/**
 * Night and underground lighting.
 *
 * Composites a darkness mask over the world, punched through by radial light
 * around the player, torches, campfires, braziers and lit furnaces. Split out of
 * the draw pass to keep Renderer.ts under 500 lines.
 *
 * Dawn and dusk ramp over two hours rather than switching, so the transition
 * reads as a gradient. Underground there is no sun at all: darkness is a
 * constant set by depth, which is what makes a light source worth carrying.
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

/** How dark each depth is, before any light. */
const DEPTH_DARKNESS = [0, 0.82, 0.9, 0.97];

/** Radius and falloff of each static light, in world units. */
const SOURCE_LIGHTS: Record<string, { outer: number; inner: number }> = {
  campfire: { outer: 250, inner: 100 },
  torch: { outer: 150, inner: 50 },
  brazier: { outer: 200, inner: 70 },
};

/**
 * How far the player sees, and how completely, from what they are carrying.
 *
 * The lantern counts from anywhere in the pack rather than only the held slot:
 * it is a one-off dungeon find, and a reward that stops working the moment you
 * swap to a pickaxe is not a reward. A torch still has to be held.
 */
function carriedLight(state: GameState): { outer: number; inner: number; alpha: number } {
  const held = state.player.inventory[state.player.selectedSlot];
  const hasLantern = state.player.inventory.some((slot) => slot?.type === 'lantern');
  if (hasLantern) return { outer: 380, inner: 170, alpha: 1 };
  if (held?.type === 'torch') return { outer: 250, inner: 100, alpha: 1 };
  return { outer: 250, inner: 100, alpha: 0.3 };
}

/**
 * Draw the darkness overlay, if it is dark enough to matter.
 *
 * `lightSources` is the already-culled list of on-screen resources, so this does
 * not walk the whole world again to find the torches.
 */
export function drawLighting(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  lightSources: RenderEntity[],
): void {
  const level = state.level;
  const underground = level.kind === 'dungeon';
  const darkness = level.kind === 'dungeon'
    ? DEPTH_DARKNESS[Math.min(level.depth, DEPTH_DARKNESS.length - 1)]
    : nightStrength(state.time);

  if (darkness <= 0) return;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = state.width;
  maskCanvas.height = state.height;
  const mctx = maskCanvas.getContext('2d');
  if (!mctx) return;

  const light = carriedLight(state);

  // The ambient filter. Navy at night; near-black rock underground, where a
  // blue night sky would look like a hole in the ceiling.
  const tint = underground ? '10, 8, 16' : '26, 26, 58';
  const maxOpacity = light.alpha === 1 ? 0.85 : 0.95;
  mctx.fillStyle = `rgba(${tint}, ${darkness * maxOpacity})`;
  mctx.fillRect(0, 0, state.width, state.height);

  // Light sources punch holes in the darkness.
  mctx.globalCompositeOperation = 'destination-out';

  const playerCenterX = Math.round(state.player.x + PLAYER_SIZE / 2 - state.camera.x);
  const playerCenterY = Math.round(state.player.y + PLAYER_SIZE / 2 - state.camera.y);

  const pGrad = mctx.createRadialGradient(
    playerCenterX, playerCenterY, light.inner,
    playerCenterX, playerCenterY, light.outer,
  );
  pGrad.addColorStop(0, `rgba(255, 255, 255, ${light.alpha})`);
  pGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  mctx.fillStyle = pGrad;
  mctx.beginPath();
  mctx.arc(playerCenterX, playerCenterY, light.outer, 0, Math.PI * 2);
  mctx.fill();

  lightSources.forEach((res) => {
    const spec = SOURCE_LIGHTS[res.type as string];
    if (!spec) return;
    const sx = Math.round(res.x + 16 - state.camera.x);
    const sy = Math.round(res.y + 16 - state.camera.y);
    const tGrad = mctx.createRadialGradient(sx, sy, spec.inner, sx, sy, spec.outer);
    tGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    tGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    mctx.fillStyle = tGrad;
    mctx.beginPath();
    mctx.arc(sx, sy, spec.outer, 0, Math.PI * 2);
    mctx.fill();
  });

  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(maskCanvas, 0, 0);
}
