'use client';

import { useState } from 'react';
import Game from '../components/Game';
import MainMenu from '../components/MainMenu';

export default function Page() {
  const [gameState, setGameState] = useState<'menu' | 'playing'>('menu');
  const [loadedSaveId, setLoadedSaveId] = useState<string | null>(null);

  const handleStartGame = () => {
    setLoadedSaveId(null);
    setGameState('playing');
  };

  const handleLoadGame = (saveId: string) => {
    setLoadedSaveId(saveId);
    setGameState('playing');
  };

  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
      {gameState === 'menu' ? (
        <MainMenu onStartGame={handleStartGame} onLoadGame={handleLoadGame} />
      ) : (
        <Game onExitToMenu={() => setGameState('menu')} loadedSaveId={loadedSaveId} />
      )}
    </main>
  );
}
