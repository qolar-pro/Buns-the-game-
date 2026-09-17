'use client';

import React, { useState, useEffect } from 'react';
import { listSlots } from '@/src/game/save/storage';
import type { SlotSummary } from '@/src/game/save/schema';
import { debugError } from '@/lib/debug';

interface MainMenuProps {
  onStartGame: () => void;
  onLoadGame: (saveId: string) => void;
}

export default function MainMenu({ onStartGame, onLoadGame }: MainMenuProps) {
  const [activeMenu, setActiveMenu] = useState<'main' | 'load' | 'options'>('main');
  const [saves, setSaves] = useState<SlotSummary[]>([]);
  const [volume, setVolume] = useState(50);
  const [resolution, setResolution] = useState('100%');

  useEffect(() => {
    if (activeMenu !== 'load') return;
    // Saves live in IndexedDB now; listSlots also surfaces any pre-overhaul
    // localStorage saves so nothing appears to have been lost.
    let cancelled = false;
    listSlots()
      .then((found) => {
        if (!cancelled) setSaves(found);
      })
      .catch((err: unknown) => {
        debugError('Could not list saves', err);
        if (!cancelled) setSaves([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeMenu]);

  // Reusable Button Component for consistent pixel-art styling
  const MenuButton = ({ onClick, children, disabled = false }: { onClick: () => void, children: React.ReactNode, disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative w-64 py-4 px-4 mb-6 font-mono text-xl font-bold tracking-widest uppercase
        transition-transform duration-100
        ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:-translate-y-1 active:translate-y-1'}
      `}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Pixel Art Border & Background using Box Shadow */}
      <div className="absolute inset-0 bg-[#8b5a2b] -z-10" 
           style={{
             boxShadow: `
               inset -4px -4px 0px 0px rgba(0,0,0,0.4),
               inset 4px 4px 0px 0px rgba(255,255,255,0.2),
               0 0 0 4px #3e2723,
               8px 8px 0px 0px rgba(0,0,0,0.3)
             `
           }}>
        {/* Wood grain lines */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 4px, #000 4px, #000 8px)',
          backgroundSize: '100% 8px'
        }}></div>
      </div>
      <span style={{ textShadow: '2px 2px 0 #3e2723, -2px -2px 0 #3e2723, 2px -2px 0 #3e2723, -2px 2px 0 #3e2723' }} className="text-white">
        {children}
      </span>
    </button>
  );

  const grassTexture = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="%234a7c2c"/><rect x="8" y="8" width="8" height="8" fill="%235c9636"/><rect x="40" y="24" width="8" height="8" fill="%235c9636"/><rect x="16" y="48" width="8" height="8" fill="%235c9636"/><rect x="48" y="56" width="8" height="8" fill="%233a6323"/><rect x="24" y="16" width="8" height="8" fill="%233a6323"/></svg>`;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden" 
         style={{ 
           backgroundImage: `url('${grassTexture}')`,
           backgroundSize: '64px 64px',
           imageRendering: 'pixelated'
         }}>
      
      {/* Dark overlay to make menu readable */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>

      {/* Title */}
      <h1 className="text-5xl md:text-7xl font-mono font-black text-white mb-16 tracking-tighter z-10 text-center" 
          style={{ 
            textShadow: '4px 4px 0 #3e2723, 8px 8px 0 rgba(0,0,0,0.5)',
            WebkitTextStroke: '2px #3e2723'
          }}>
        SURVIVORS<br/>JUICY BUNS
      </h1>

      {/* Main Menu State */}
      {activeMenu === 'main' && (
        <div className="flex flex-col items-center z-10">
          <MenuButton onClick={onStartGame}>Create World</MenuButton>
          <MenuButton onClick={() => setActiveMenu('load')}>Load World</MenuButton>
          <MenuButton onClick={() => setActiveMenu('options')}>Options</MenuButton>
        </div>
      )}

      {/* Load World State */}
      {activeMenu === 'load' && (
        <div className="flex flex-col items-center z-10 bg-[#8b5a2b] p-8"
             style={{
               boxShadow: `
                 inset -4px -4px 0px 0px rgba(0,0,0,0.4),
                 inset 4px 4px 0px 0px rgba(255,255,255,0.2),
                 0 0 0 4px #3e2723,
                 12px 12px 0px 0px rgba(0,0,0,0.3)
               `
             }}>
          <h2 className="text-3xl font-mono text-white mb-8" style={{ textShadow: '2px 2px 0 #3e2723' }}>Select Save</h2>
          <div className="w-full max-h-64 overflow-y-auto mb-8 space-y-4 pr-4">
            {saves.length === 0 ? (
              <p className="text-white/70 font-mono text-center py-4">No save files found.</p>
            ) : (
              saves.map(save => (
                <button 
                  key={save.id}
                  onClick={() => onLoadGame(save.id)}
                  className="w-full py-3 px-4 bg-[#6b421c] hover:bg-[#a06b35] text-white font-mono text-left transition-colors"
                  style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2), 0 0 0 2px #3e2723' }}
                >
                  <span className="block">{save.name}</span>
                  <span className="block text-xs text-white/60">
                    {save.updatedAt ? new Date(save.updatedAt).toLocaleString() : 'older save'}
                    {save.playtimeMs > 0 && ` · ${Math.round(save.playtimeMs / 60000)} min played`}
                    {save.version === 0 && ' · will be upgraded on load'}
                  </span>
                </button>
              ))
            )}
          </div>
          <MenuButton onClick={() => setActiveMenu('main')}>Back</MenuButton>
        </div>
      )}

      {/* Options State */}
      {activeMenu === 'options' && (
        <div className="flex flex-col items-center z-10 bg-[#8b5a2b] p-8 w-96"
             style={{
               boxShadow: `
                 inset -4px -4px 0px 0px rgba(0,0,0,0.4),
                 inset 4px 4px 0px 0px rgba(255,255,255,0.2),
                 0 0 0 4px #3e2723,
                 12px 12px 0px 0px rgba(0,0,0,0.3)
               `
             }}>
          <h2 className="text-3xl font-mono text-white mb-8" style={{ textShadow: '2px 2px 0 #3e2723' }}>Options</h2>
          
          <div className="w-full mb-6">
            <label className="block text-white font-mono mb-2" style={{ textShadow: '1px 1px 0 #3e2723' }}>Master Volume: {volume}%</label>
            <input 
              type="range" 
              min="0" max="100" 
              value={volume} 
              onChange={(e) => setVolume(parseInt(e.target.value))}
              className="w-full accent-[#3e2723]"
            />
          </div>

          <div className="w-full mb-12">
            <label className="block text-white font-mono mb-2" style={{ textShadow: '1px 1px 0 #3e2723' }}>Resolution Scale</label>
            <select 
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full p-2 bg-[#6b421c] text-white font-mono outline-none"
              style={{ boxShadow: 'inset -2px -2px 0px rgba(0,0,0,0.5), inset 2px 2px 0px rgba(255,255,255,0.2), 0 0 0 2px #3e2723' }}
            >
              <option value="50%">50% (Performance)</option>
              <option value="100%">100% (Native)</option>
              <option value="200%">200% (Crisp Pixel)</option>
            </select>
          </div>

          <MenuButton onClick={() => setActiveMenu('main')}>Back</MenuButton>
        </div>
      )}
    </div>
  );
}
