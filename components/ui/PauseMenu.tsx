'use client';

/**
 * The in-game pause menu: resume, save, export, settings and return to the
 * main menu.
 *
 * Moved out of components/Game.tsx.
 */

export interface PauseMenuProps {
  view: 'main' | 'settings';
  setView: (v: 'main' | 'settings') => void;
  onResume: () => void;
  onSave: () => void;
  onExport: () => void;
  onExitToMenu?: () => void;
  volume: number;
  setVolume: (v: number) => void;
  MenuButton: React.ComponentType<{ onClick: () => void; children: React.ReactNode }>;
}

export function PauseMenu({
  view, setView, onResume, onSave, onExport, onExitToMenu,
  volume, setVolume, MenuButton,
}: PauseMenuProps) {
  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50" style={{ backdropFilter: 'blur(4px)' }}>
          {view === 'main' && (
            <div className="flex flex-col items-center bg-[#8b5a2b] p-8"
                 style={{
                   boxShadow: `
                     inset -4px -4px 0px 0px rgba(0,0,0,0.4),
                     inset 4px 4px 0px 0px rgba(255,255,255,0.2),
                     0 0 0 4px #3e2723,
                     12px 12px 0px 0px rgba(0,0,0,0.3)
                   `
                 }}>
              <h2 className="text-5xl font-mono font-black text-white mb-10 tracking-tighter" 
                  style={{ 
                    textShadow: '4px 4px 0 #3e2723, 8px 8px 0 rgba(0,0,0,0.5)',
                    WebkitTextStroke: '2px #3e2723'
                  }}>
                PAUSED
              </h2>
              <MenuButton onClick={onResume}>Resume</MenuButton>
              <MenuButton onClick={onSave}>Save Game</MenuButton>
              <MenuButton onClick={onExport}>Export Save</MenuButton>
              <MenuButton onClick={() => setView('settings')}>Settings</MenuButton>
              <MenuButton onClick={() => { if(onExitToMenu) onExitToMenu(); }}>Main Menu</MenuButton>
            </div>
          )}
          {view === 'settings' && (
            <div className="flex flex-col items-center bg-[#8b5a2b] p-8 w-96"
                 style={{
                   boxShadow: `
                     inset -4px -4px 0px 0px rgba(0,0,0,0.4),
                     inset 4px 4px 0px 0px rgba(255,255,255,0.2),
                     0 0 0 4px #3e2723,
                     12px 12px 0px 0px rgba(0,0,0,0.3)
                   `
                 }}>
              <h2 className="text-3xl font-mono text-white mb-8" style={{ textShadow: '2px 2px 0 #3e2723' }}>Settings</h2>
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
              <MenuButton onClick={() => setView('main')}>Back</MenuButton>
            </div>
          )}
    </div>
  );
}

export default PauseMenu;
