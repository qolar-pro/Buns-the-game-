'use client';

/**
 * Developer panel: time control, hitbox overlay, respawn, regenerate.
 *
 * Moved out of components/Game.tsx. It reads and writes engine state directly
 * rather than going through the HUD store — these are debug affordances, not
 * gameplay, and should not cost a render budget.
 */
import { useState } from 'react';
import type { GameState } from '@/src/game/core/types';

export interface AdminPanelProps {
  state: GameState;
  startNewGame: (() => void) | null;
  debugColliders: boolean;
  setDebugColliders: (on: boolean) => void;
}

export function AdminPanel({ state, startNewGame, debugColliders, setDebugColliders }: AdminPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end">
        <button 
          onClick={() => setOpen(!open)}
          className="bg-black/60 text-white px-3 py-1 rounded text-xs hover:bg-black/80 transition-colors font-mono mb-2"
        >
          ADMIN
        </button>
    
        {open && (
          <div className="bg-[#8b5a2b] p-3 flex flex-col gap-2"
               style={{
                 boxShadow: `
                   inset -2px -2px 0px 0px rgba(0,0,0,0.4),
                   inset 2px 2px 0px 0px rgba(255,255,255,0.2),
                   0 0 0 2px #3e2723,
                   4px 4px 0px 0px rgba(0,0,0,0.3)
                 `
               }}>
            <button 
              onClick={() => {
                state.player.x = 0;
                state.player.y = 0;
                state.camera.x = state.player.x - state.width / 2;
                state.camera.y = state.player.y - state.height / 2;
                state.message = { text: "Respawned at world spawn", time: Date.now() };
                setOpen(false);
              }}
              className="bg-[#6b421c] hover:bg-[#a06b35] text-white px-3 py-2 text-xs font-mono transition-colors text-left"
              style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2)' }}
            >
              RESPAWN (R)
            </button>
            <button 
              onClick={() => {
                if (startNewGame) startNewGame();
                setOpen(false);
              }}
              className="bg-[#6b421c] hover:bg-[#a06b35] text-white px-3 py-2 text-xs font-mono transition-colors text-left"
              style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2)' }}
            >
              NEW WORLD (N)
            </button>
            <button 
              onClick={() => {
                setDebugColliders(!debugColliders);
              }}
              className="bg-[#6b421c] hover:bg-[#a06b35] text-white px-3 py-2 text-xs font-mono transition-colors text-left"
              style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2)' }}
            >
              {debugColliders ? 'Hide Hitboxes' : 'Show Hitboxes'}
            </button>
            <button 
              onClick={() => {
                state.time = 480; // 08:00
              }}
              className="bg-[#6b421c] hover:bg-[#a06b35] text-white px-3 py-2 text-xs font-mono transition-colors text-left"
              style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2)' }}
            >
              Set Day
            </button>
            <button 
              onClick={() => {
                state.time = 1200; // 20:00
              }}
              className="bg-[#6b421c] hover:bg-[#a06b35] text-white px-3 py-2 text-xs font-mono transition-colors text-left"
              style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2)' }}
            >
              Set Night
            </button>
          </div>
        )}
    </div>
  );
}

export default AdminPanel;
