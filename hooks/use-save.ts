'use client';

/**
 * Saving: manual, autosave and export.
 *
 * Kept out of the game component because all three go through one serialisation
 * path, and the component should not have to know that saving is asynchronous
 * or that playtime accumulates across writes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { serialize, toSaveFile } from '@/src/game/save/serialize';
import { writeSlot } from '@/src/game/save/storage';
import { debugError } from '@/lib/debug';
import type { GameState } from '@/src/game/core/types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** How often the world is written without being asked. */
const AUTOSAVE_MS = 60_000;

export interface UseSaveOptions {
  state: () => GameState;
  /** Slot to write to; a loaded save keeps its own id. */
  initialSlotId?: string | null;
  /** Autosave only once the world is actually running. */
  enabled: boolean;
}

export function useSave({ state, initialSlotId, enabled }: UseSaveOptions) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const meta = useRef({
    id: initialSlotId ?? 'slot-1',
    name: 'Slot 1',
    createdAt: Date.now(),
    playtimeMs: 0,
  });
  const sessionStart = useRef(Date.now());

  /** The one serialisation path, shared by manual saves and autosave. */
  const persist = useCallback(
    async (slotId?: string) => {
      const id = slotId ?? meta.current.id;
      const save = serialize(state(), {
        name: meta.current.name,
        createdAt: meta.current.createdAt,
        playtimeMs: meta.current.playtimeMs + (Date.now() - sessionStart.current),
      });
      await writeSlot(id, save);
      meta.current = { ...meta.current, id, playtimeMs: save.playtimeMs };
      sessionStart.current = Date.now();
      return save;
    },
    [state],
  );

  const save = useCallback(() => {
    setSaveState('saving');
    persist()
      .then(() => {
        setSaveState('saved');
        window.setTimeout(() => setSaveState('idle'), 1800);
      })
      .catch((err: unknown) => {
        debugError('Save failed', err);
        setSaveState('error');
      });
  }, [persist]);

  // Autosave, so a closed tab does not cost an hour of play.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(save, AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [enabled, save]);

  /** Download the world, so a save survives cleared browser storage. */
  const exportToFile = useCallback(() => {
    const snapshot = serialize(state(), {
      name: meta.current.name,
      createdAt: meta.current.createdAt,
      playtimeMs: meta.current.playtimeMs,
    });
    const blob = new Blob([toSaveFile(snapshot)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buns-${meta.current.id}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  return { saveState, save, exportToFile, meta };
}
