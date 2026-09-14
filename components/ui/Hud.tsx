'use client';

/**
 * The heads-up display.
 *
 * Replaces the canvas HUD (drawHUD, drawItemIcon, drawHeartIcon, drawDrumstick
 * and friends) — roughly 700 lines of imperative canvas drawing that duplicated
 * what the React overlays already did in a different visual language. One set of
 * components now, keyboard and touch accessible, and restyleable from the shared
 * palette.
 *
 * Re-renders only when the engine publishes a genuinely different snapshot.
 */
import { useSyncExternalStore } from 'react';
import { HOTBAR_SLOTS } from '@/src/game/core/config';
import {
  getHudServerSnapshot,
  getHudSnapshot,
  subscribeHud,
} from '@/src/game/core/HudStore';
import { ItemIcon } from './ItemIcon';

function Pips({
  value, max, filled, empty, label,
}: { value: number; max: number; filled: string; empty: string; label: string }) {
  const shown = Math.min(max, 10);
  const perPip = max / shown;
  return (
    <div className="flex gap-[2px]" aria-label={`${label}: ${Math.ceil(value)} of ${max}`}>
      {Array.from({ length: shown }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="text-[15px] leading-none"
          style={{ filter: 'drop-shadow(1px 1px 0 rgba(0,0,0,0.6))' }}
        >
          {value >= (i + 1) * perPip ? filled : empty}
        </span>
      ))}
    </div>
  );
}

export function Hud({ onSelectSlot }: { onSelectSlot?: (i: number) => void }) {
  const hud = useSyncExternalStore(subscribeHud, getHudSnapshot, getHudServerSnapshot);

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono">
      {/* Clock */}
      <div className="absolute left-1/2 top-2 -translate-x-1/2 border-2 border-[#7c4d23] bg-black/50 px-4 py-1 text-xs text-white">
        {hud.timeLabel}
      </div>

      {/* Transient message */}
      {hud.message && (
        <div className="absolute left-1/2 top-24 -translate-x-1/2 border-2 border-[#7c4d23] bg-black/70 px-5 py-2 text-xs text-[#fed859]">
          {hud.message}
        </div>
      )}

      {/* Vitals + hotbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="mb-2 flex items-end justify-between gap-6 px-1">
          {/* Health is a 0-100 bar, matching what the engine tracks. */}
          <div
            className="h-[14px] flex-1 border-2 border-[#3b4b52] bg-black/50"
            aria-label={`Health: ${Math.round(hud.health)} of 100`}
          >
            <div
              className="h-full transition-[width] duration-150"
              style={{
                width: `${Math.max(0, Math.min(100, hud.health))}%`,
                background: hud.health > 30 ? '#e34b4b' : '#8e2020',
              }}
            />
          </div>
          <Pips value={hud.hunger} max={hud.maxHunger} filled="🍗" empty="🦴" label="Hunger" />
        </div>

        <div className="pointer-events-auto flex gap-1">
          {Array.from({ length: HOTBAR_SLOTS }, (_, i) => {
            const item = hud.hotbar[i];
            const selected = hud.selectedSlot === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectSlot?.(i)}
                aria-label={item ? `Slot ${i + 1}: ${item.type} x${item.count}` : `Slot ${i + 1}: empty`}
                aria-pressed={selected}
                className="relative flex h-14 w-14 items-center justify-center border-2 transition-colors"
                style={{
                  borderColor: selected ? '#fed859' : '#7c4d23',
                  background: selected ? 'rgba(254,216,89,0.14)' : 'rgba(0,0,0,0.45)',
                }}
              >
                <span className="absolute left-1 top-0 text-[9px] text-white/50">{i + 1}</span>
                {item && <ItemIcon type={item.type} size={34} />}
                {item && item.count > 1 && (
                  <span className="absolute bottom-0 right-1 text-[10px] font-bold text-white">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Hud;
