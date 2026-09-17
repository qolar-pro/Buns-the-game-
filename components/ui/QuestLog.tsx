'use client';

/**
 * The objective log.
 *
 * One line of "what to do next", always visible. This is the piece that turns a
 * sandbox into a game with an ending — a new player should never have to guess.
 * Only the active objective gets its hint; the rest is a progress count, so the
 * panel stays small enough to live on screen permanently.
 */
import { useSyncExternalStore } from 'react';
import {
  getHudServerSnapshot,
  getHudSnapshot,
  subscribeHud,
} from '@/src/game/core/HudStore';

export function QuestLog() {
  const hud = useSyncExternalStore(subscribeHud, getHudSnapshot, getHudServerSnapshot);

  if (!hud.questTitle && hud.questsTotal === 0) return null;

  const complete = !hud.questTitle;

  return (
    <div className="pointer-events-none absolute left-3 top-3 max-w-[min(20rem,60vw)] select-none font-mono">
      <div className="border-2 border-[#7c4d23] bg-black/60 px-3 py-2">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="text-[9px] uppercase tracking-[0.2em] text-[#b2a89a]">
            {complete ? 'Complete' : 'Objective'}
          </span>
          <span className="text-[9px] text-[#b2a89a]">
            {hud.questsDone}/{hud.questsTotal}
          </span>
        </div>

        <p className="text-[11px] font-bold leading-snug text-[#fed859]">
          {hud.questTitle ?? 'You made it out.'}
        </p>

        {hud.questHint && (
          <p className="mt-1 text-[10px] leading-snug text-white/60">{hud.questHint}</p>
        )}

        {hud.questProgress && (
          <div className="mt-2">
            <div className="h-[4px] w-full border border-[#3b4b52] bg-black/50">
              <div
                className="h-full bg-[#fed859]"
                style={{
                  width: `${Math.min(100, (hud.questProgress.have / hud.questProgress.need) * 100)}%`,
                }}
              />
            </div>
            <span className="mt-1 block text-[9px] text-white/50">
              {hud.questProgress.have} / {hud.questProgress.need}
            </span>
          </div>
        )}
      </div>

      {/* Depth readout. Only underground, where knowing how far down you are
          actually matters for what can hurt you. */}
      {hud.depth > 0 && (
        <div className="mt-2 inline-block border-2 border-[#8e2020] bg-black/60 px-2 py-1 text-[10px] text-[#ff9c9c]">
          DEPTH {hud.depth}
        </div>
      )}
    </div>
  );
}

export default QuestLog;
