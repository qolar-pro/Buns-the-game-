/**
 * Turning game state into a save and back.
 *
 * Kept separate from storage so it can be tested without a browser, and so
 * export-to-file and slot saving share exactly one code path.
 */
import { getWorldSeed } from '../world/noise';
import { migrate } from './migrate';
import { CURRENT_VERSION, SaveError, validate, type Save } from './schema';
import type { GameState } from '../core/types';

export interface SaveMeta {
  name: string;
  createdAt?: number;
  playtimeMs: number;
}

/** Snapshot the live state into the current save format. */
export function serialize(state: GameState, meta: SaveMeta): Save {
  const now = Date.now();
  return {
    version: CURRENT_VERSION,
    name: meta.name,
    createdAt: meta.createdAt ?? now,
    updatedAt: now,
    playtimeMs: meta.playtimeMs,
    seed: getWorldSeed(),
    world: {
      player: state.player,
      resources: Array.from(state.resources.entries()),
      items: state.items,
      animals: state.animals,
      time: state.time,
    },
  };
}

/**
 * Validate, migrate and apply a save onto live state.
 *
 * Mutates `state` in place, because the engine holds it behind a ref and
 * replacing the object would detach every system from it.
 */
export function applySave(state: GameState, raw: unknown): Save {
  const save = migrate(validate(raw));
  const { world } = save;

  state.player = world.player;
  // Older saves predate the equipment slots.
  if (!state.player.equipment) {
    state.player.equipment = { head: null, torso: null, legs: null, feet: null, back: null };
  }
  state.resources = new Map(world.resources);
  state.items = world.items ?? [];
  state.animals = world.animals ?? [];
  state.time = world.time ?? 0;

  return save;
}

/** Parse a save exported to a file. */
export function parseSaveFile(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new SaveError('That file is not a save file.', 'it does not contain valid JSON');
  }
}

/** Serialise for download. */
export function toSaveFile(save: Save): string {
  return JSON.stringify(save, null, 2);
}
