/**
 * Transient player feedback: floating labels and hit flashes.
 *
 * Small enough to live anywhere, but kept together so the rule for how long a
 * label lasts and what colour it is sits in one place rather than being repeated
 * at every call site.
 */
import { HIGHLIGHT } from '../render/palette';
import type { FloatingText, GameState, ItemType } from '../core/types';

/** Ticks a label lives for, at 60fps. */
const LIFE = 70;

/** How long a struck object stays washed out, in milliseconds. */
export const HIT_FLASH_MS = 90;

/**
 * Label colour by item family.
 *
 * Drawn from the shared palette so the labels sit in the same colour space as
 * the sprites rather than being arbitrary CSS colours.
 */
function colourFor(type: string): string {
  // Deliberately the bright end of each family: these are read at a glance over
  // whatever ground the player happens to be standing on, and a mid-tone brown
  // label on dirt is invisible.
  if (type.includes('wood') || type === 'stick' || type === 'sapling') return '#e9b57c';
  if (type.includes('stone') || type === 'coal') return '#d0c7b8';
  if (type.includes('iron') || type === 'scrap_metal') return '#bcd3de';
  if (type.includes('beef') || type.includes('pork') || type.includes('chicken') || type.includes('mutton')) {
    return '#f5a08a';
  }
  return HIGHLIGHT;
}

/** Spawn a "+N item" label above a world position. */
export function addFloatingText(
  state: GameState,
  x: number,
  y: number,
  type: ItemType,
  count: number,
): void {
  // Cap the list: a player standing in a pile of drops should not accumulate
  // hundreds of labels waiting to expire.
  if (state.floatingTexts.length > 24) state.floatingTexts.shift();

  state.floatingTexts.push({
    x,
    y,
    text: `+${count} ${type.replace(/_/g, ' ')}`,
    colour: colourFor(type),
    life: LIFE,
  });
}

/** Age labels and drop the expired ones. */
export function updateFloatingTexts(state: GameState, dt: number): void {
  const texts = state.floatingTexts;
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt;
    t.y -= 0.6 * dt; // drift upward
    if (t.life <= 0) texts.splice(i, 1);
  }
}

/** Draw the labels. Called from the render pass in world space. */
export function drawFloatingTexts(
  ctx: CanvasRenderingContext2D,
  texts: FloatingText[],
): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px "Press Start 2P", monospace';
  for (const t of texts) {
    // Fade over the last third of the life, so they leave rather than vanish.
    ctx.globalAlpha = Math.min(1, t.life / (LIFE * 0.35));
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20,18,24,0.85)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.colour;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
}
