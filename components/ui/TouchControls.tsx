'use client';

/**
 * Touch input layer.
 *
 * The game previously had no touch handling at all — no touchstart, no
 * pointerdown — so it was unplayable on a phone despite shipping a mobile hook.
 *
 * Rather than add a parallel input path, this synthesises the same key codes the
 * keyboard handler already produces and writes them into the engine's key set.
 * Every system downstream (movement, sprint, interact, inventory) therefore runs
 * the exact code it runs on desktop.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface TouchControlsProps {
  /** The engine's live key set, written to directly. */
  keys: Set<string>;
  /** One-shot presses, so a tap shorter than a frame is not dropped. */
  latched: Set<string>;
  /** Picks what the action button acts on, since touch has no hover. */
  selectNearestTarget: () => boolean;
  onOpenInventory: () => void;
}

/** Below this fraction of the stick radius, treat input as neutral. */
const DEAD_ZONE = 0.22;

export function TouchControls({ keys, latched, selectNearestTarget, onOpenInventory }: TouchControlsProps) {
  const stickRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [sprinting, setSprinting] = useState(false);

  const DIRECTIONS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'] as const;

  const clearMovement = useCallback(() => {
    for (const k of DIRECTIONS) keys.delete(k);
  }, [keys]);

  /** Map a stick offset to the direction keys the engine already understands. */
  const applyVector = useCallback(
    (dx: number, dy: number, radius: number) => {
      const mag = Math.hypot(dx, dy) / radius;
      clearMovement();
      if (mag < DEAD_ZONE) return;

      // A generous threshold on each axis allows diagonals, matching what
      // holding two keys at once does.
      const nx = dx / radius;
      const ny = dy / radius;
      if (ny < -DEAD_ZONE) keys.add('KeyW');
      if (ny > DEAD_ZONE) keys.add('KeyS');
      if (nx < -DEAD_ZONE) keys.add('KeyA');
      if (nx > DEAD_ZONE) keys.add('KeyD');
    },
    [clearMovement, keys],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = stickRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    pointerIdRef.current = e.pointerId;
    el.setPointerCapture(e.pointerId);
    onPointerMove(e);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const origin = originRef.current;
    const el = stickRef.current;
    if (!origin || !el || pointerIdRef.current !== e.pointerId) return;

    const radius = el.getBoundingClientRect().width / 2;
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      dx = (dx / dist) * radius;
      dy = (dy / dist) * radius;
    }
    setKnob({ x: dx, y: dy });
    applyVector(dx, dy, radius);
  };

  const endStick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    originRef.current = null;
    setKnob({ x: 0, y: 0 });
    clearMovement();
  };

  // Never leave a key stuck down if the component unmounts mid-drag.
  useEffect(() => clearMovement, [clearMovement]);

  const toggleSprint = () => {
    setSprinting((on) => {
      const next = !on;
      if (next) {
        keys.add('Shift');
        keys.add('ShiftLeft');
      } else {
        keys.delete('Shift');
        keys.delete('ShiftLeft');
      }
      return next;
    });
  };

  /**
   * The tick consumes Space once. Latching it too means a tap that lands
   * between frames still registers, exactly as for the keyboard.
   */
  const doAction = () => {
    // Desktop selects by hovering; touch has nothing hovered, so choose the
    // nearest valid target first or the action would do nothing at all.
    selectNearestTarget();
    keys.add('Space');
    latched.add('Space');
  };

  const buttonStyle =
    'flex items-center justify-center rounded-full border-2 border-[#7c4d23] bg-black/55 font-mono text-white active:bg-white/20 select-none';

  return (
    <div className="pointer-events-none absolute inset-0 z-30 touch-none">
      {/* Movement stick, bottom left */}
      <div
        ref={stickRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStick}
        onPointerCancel={endStick}
        role="application"
        aria-label="Movement stick"
        className="pointer-events-auto absolute bottom-6 left-6 h-36 w-36 touch-none rounded-full border-2 border-[#7c4d23] bg-black/35"
      >
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border-2 border-[#fed859] bg-black/50"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>

      {/* Actions, bottom right */}
      <div className="pointer-events-auto absolute bottom-6 right-6 flex flex-col items-end gap-3">
        <div className="flex gap-3">
          <button type="button" onClick={onOpenInventory} aria-label="Open inventory" className={`${buttonStyle} h-14 w-14 text-xs`}>
            BAG
          </button>
          <button
            type="button"
            onClick={toggleSprint}
            aria-label="Toggle sprint"
            aria-pressed={sprinting}
            className={`${buttonStyle} h-14 w-14 text-xs`}
            style={sprinting ? { borderColor: '#fed859', background: 'rgba(254,216,89,0.25)' } : undefined}
          >
            RUN
          </button>
        </div>
        <button
          type="button"
          onPointerDown={doAction}
          aria-label="Use or harvest"
          className={`${buttonStyle} h-24 w-24 text-sm`}
          style={{ borderColor: '#fed859' }}
        >
          USE
        </button>
      </div>
    </div>
  );
}

export default TouchControls;
