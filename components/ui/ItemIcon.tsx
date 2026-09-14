'use client';

/**
 * An item icon, drawn from the packed atlas.
 *
 * Replaces the old ITEM_IMAGES table plus ~195 lines of hand-written SVG
 * fallbacks. Those fallbacks existed only because 33 of the referenced PNGs did
 * not exist; every item now has real art, so an icon that cannot be resolved is
 * a manifest bug and should be visible as one rather than quietly substituted.
 *
 * The frame is positioned with CSS background offsets, so all icons share the
 * one already-loaded atlas image instead of issuing a request each.
 */
import { FRAMES, type Frame } from '@/src/game/assets/frames';

/** Items whose art reads too small at icon size get a deliberate boost. */
const SCALE_UP = new Set(['sapling', 'wheat_seeds']);

export function ItemIcon({ type, size = 32 }: { type: string; size?: number }) {
  const frame = (FRAMES as Record<string, Frame>)[`items/${type}`];

  if (!frame) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[ItemIcon] no atlas frame for item "${type}"`);
    }
    return (
      <div
        title={`missing icon: ${type}`}
        style={{
          width: size,
          height: size,
          border: '1px dashed rgba(255,255,255,0.35)',
          borderRadius: 4,
        }}
      />
    );
  }

  const scale = (size / frame.w) * (SCALE_UP.has(type) ? 1.35 : 1);

  return (
    <div
      style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      aria-label={type}
      role="img"
    >
      <div
        style={{
          width: frame.w,
          height: frame.h,
          backgroundImage: `url(/sprites/${frame.atlas}.png)`,
          backgroundPosition: `-${frame.x}px -${frame.y}px`,
          backgroundRepeat: 'no-repeat',
          transform: `scale(${scale})`,
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

export default ItemIcon;
