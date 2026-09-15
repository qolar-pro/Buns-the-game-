'use client';

/**
 * The game component.
 *
 * Deliberately thin: it owns the canvas element, bridges React to the engine,
 * and mounts the UI. Every system, the render pass and the loop live under
 * src/game/, and the engine runs outside React entirely.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';

import { createEngine, type Engine } from '@/src/game/core/Engine';
import { createGameState } from '@/src/game/core/GameState';
import type { GameState } from '@/src/game/core/types';

import { AdminPanel } from '@/components/ui/AdminPanel';
import { Hud } from '@/components/ui/Hud';
import { InventoryOverlay } from '@/components/ui/InventoryOverlay';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PauseMenu } from '@/components/ui/PauseMenu';
import { RotatePrompt } from '@/components/ui/RotatePrompt';
import { SaveIndicator } from '@/components/ui/SaveIndicator';
import { TouchControls } from '@/components/ui/TouchControls';
import { useIsPortrait, useIsTouch } from '@/hooks/use-touch';
import { useSave } from '@/hooks/use-save'


// Deterministic Noise Functions



interface GameProps {
  onExitToMenu?: () => void;
  loadedSaveId?: string | null;
}

export default function Game({ onExitToMenu, loadedSaveId }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isPausedUI, setIsPausedUI] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isTouch = useIsTouch();
  const isPortrait = useIsPortrait();
  const [assetProgress, setAssetProgress] = useState({ loaded: 0, total: 5 });
  const { saveState, save: handleSaveGame, exportToFile: handleExportSave, meta: saveMetaRef } =
    useSave({ state: () => stateRef.current, initialSlotId: loadedSaveId, enabled: assetsReady });
  const [_uiTick, setUiTick] = useState(0);
  const refreshUI = () => setUiTick(t => t + 1);
  const [pauseMenuState, setPauseMenuState] = useState<'main' | 'settings'>('main');
  const [volume, setVolume] = useState(50);
  const startNewGameRef = useRef<(() => void) | null>(null);
  
  /** Live game state. One object per session, owned by the engine. */
  const stateRef = useRef<GameState>(createGameState());

  
  // Tree Stage Refs
  /**
   * Hitbox overlay. The renderer reads the ref (it runs outside React), while
   * the admin panel drives the state; this setter keeps the two in step.
   */
  const [debugColliders, setDebugCollidersState] = useState(false);
  const setDebugColliders = React.useCallback((on: boolean) => {
    engineRef.current?.setDebugColliders(on);
    setDebugCollidersState(on);
  }, []);
  
  // Tool Image Refs
  
  // Animal Sprite Refs

  // One engine instance owns the game. React re-renders never drive the loop.
  useEffect(() => {
    const engine = createEngine(
      {
        canvas: () => canvasRef.current,
        loadedSaveId,
        refreshUI,
        startNewGameRef,
        saveMeta: saveMetaRef.current,
        setDimensions,
        setAssetsReady,
        setAssetProgress,
        setIsPausedUI,
        setPauseMenuState,
        setLoadError,
      },
      stateRef.current,
    );
    engineRef.current = engine;
    return () => {
      engine.stop();
      engineRef.current = null;
    };
    // The engine is created once per mount; loadedSaveId is read at creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const MenuButton = ({ onClick, children }: { onClick: () => void, children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`
        relative w-64 py-4 px-4 mb-6 font-mono text-xl font-bold tracking-widest uppercase
        transition-transform duration-100 hover:-translate-y-1 active:translate-y-1
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

  return (
    <div className="fixed inset-0 bg-neutral-900 overflow-hidden">
      {!assetsReady && (
        <LoadingScreen loaded={assetProgress.loaded} total={assetProgress.total} />
      )}

      {isTouch && isPortrait && <RotatePrompt />}

      {isTouch && assetsReady && engineRef.current && (
        <TouchControls
          keys={engineRef.current.keys}
          latched={engineRef.current.latched}
          onOpenInventory={() => {
            const st = stateRef.current;
            st.isInventoryOpen = !st.isInventoryOpen;
            if (!st.isInventoryOpen) {
              st.isWorkbenchOpen = false;
              st.openChestId = null;
            }
            refreshUI();
          }}
        />
      )}

      <SaveIndicator state={saveState} />

      {loadError && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 p-6">
          <div className="max-w-lg border-2 border-[#8e2020] bg-[#1e2629] p-6 font-mono text-sm text-white">
            <h2 className="mb-3 text-lg font-bold text-[#ff9c9c]">Could not load that save</h2>
            <p className="mb-4 text-white/80">{loadError}</p>
            <p className="mb-5 text-xs text-white/50">
              The world you are in now is a fresh one; your save file has not been overwritten.
            </p>
            <button
              type="button"
              onClick={() => setLoadError(null)}
              className="border-2 border-[#7c4d23] px-4 py-2 text-[#fed859] hover:bg-white/10"
            >
              Continue in a new world
            </button>
          </div>
        </div>
      )}

      {assetsReady && (
        <Hud
          compact={isTouch}
          onSelectSlot={(i) => {
            stateRef.current.player.selectedSlot = i;
          }}
        />
      )}

      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ imageRendering: 'pixelated', width: '100vw', height: '100vh' }}
        className="block"
      />
      
      {isPausedUI && (
        <PauseMenu
          view={pauseMenuState}
          setView={setPauseMenuState}
          onResume={() => { stateRef.current.isPaused = false; setIsPausedUI(false); }}
          onSave={handleSaveGame}
          onExport={handleExportSave}
          onExitToMenu={onExitToMenu}
          volume={volume}
          setVolume={setVolume}
          MenuButton={MenuButton}
        />
      )}

      <AdminPanel
        state={stateRef.current}
        startNewGame={startNewGameRef.current}
        debugColliders={debugColliders}
        setDebugColliders={setDebugColliders}
      />

      {/* Inventory Overlay */}
      <AnimatePresence>
        {stateRef.current.isInventoryOpen && (
          <InventoryOverlay 
            state={stateRef.current} 
            refreshUI={refreshUI} 
            onClose={() => {
              stateRef.current.isInventoryOpen = false;
              stateRef.current.isWorkbenchOpen = false;
              stateRef.current.openChestId = null;
              refreshUI();
            }}
          />
        )}
      </AnimatePresence>

      {!isTouch && (
        <div className="absolute bottom-4 right-4 text-neutral-400 text-xs font-mono bg-black/50 p-2 rounded pointer-events-none">
          WASD: Move | SPACE: Harvest | X: Sit | E: Inventory
        </div>
      )}
    </div>
  );
}
