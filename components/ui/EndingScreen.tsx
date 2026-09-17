'use client';

/**
 * The ending.
 *
 * Shown once the broadcast fires. A run that ends deserves a summary — without
 * one, finishing feels identical to quitting.
 */
import { useSyncExternalStore } from 'react';
import {
  getHudServerSnapshot,
  getHudSnapshot,
  subscribeHud,
} from '@/src/game/core/HudStore';

/**
 * The two endings.
 *
 * Deliberately not a winner and a consolation prize. One of them ends with you
 * leaving and one of them ends with you staying, and the summary underneath is
 * identical, because the run was.
 */
const ENDINGS: Record<'rescued' | 'settled', { kicker: string; title: string; body: string }> = {
  rescued: {
    kicker: 'Transmission sent',
    title: 'RESCUED',
    body:
      'The antenna holds. Somewhere beyond the treeline the signal is heard, and for '
      + 'the first time since you woke up here, you are not the only one who knows '
      + 'where you are. You are going home, and the fen and the waste and the thing '
      + 'in the Vault will be somebody else\u2019s problem.',
  },
  settled: {
    kicker: 'The generator turns over',
    title: 'SETTLED',
    body:
      'The hall lights come on and stay on. Nobody is coming for you \u2014 you spent '
      + 'the core on the people who were already here. The antenna stands on the '
      + 'ridge with nothing in it, and by spring there are forty of you.',
  },
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/10 py-2">
      <span className="text-[11px] uppercase tracking-widest text-white/50">{label}</span>
      <span className="text-lg font-bold text-[#fed859]">{value}</span>
    </div>
  );
}

export function EndingScreen({ onReturn }: { onReturn: () => void }) {
  const hud = useSyncExternalStore(subscribeHud, getHudSnapshot, getHudServerSnapshot);
  if (!hud.ending) return null;

  const e = hud.ending;
  const copy = ENDINGS[e.kind];

  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center bg-[#0d1214]/95 p-6 font-mono">
      <div className="w-full max-w-md">
        <p className="mb-2 text-[11px] uppercase tracking-[0.3em] text-[#b2a89a]">
          {copy.kicker}
        </p>
        <h1
          className="mb-5 text-4xl font-black tracking-tighter text-[#fed859]"
          style={{ textShadow: '3px 3px 0 #1e2629' }}
        >
          {copy.title}
        </h1>

        <p className="mb-6 text-sm leading-relaxed text-white/70">{copy.body}</p>

        <div className="mb-7">
          <Stat label="Days survived" value={e.daysSurvived} />
          <Stat label="Deepest level" value={e.deepestDepth === 0 ? '—' : e.deepestDepth} />
          <Stat label="Chests looted" value={e.chestsLooted} />
          <Stat label="Hostiles defeated" value={e.mobsDefeated} />
          <Stat label="Things crafted" value={e.itemsCrafted} />
        </div>

        <button
          type="button"
          onClick={onReturn}
          className="w-full border-2 border-[#7c4d23] py-3 text-sm uppercase tracking-widest text-[#fed859] transition-colors hover:bg-white/10"
        >
          Return to menu
        </button>
      </div>
    </div>
  );
}

export default EndingScreen;
