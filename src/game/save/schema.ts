/**
 * Save file shapes, one interface per version.
 *
 * Every version is kept so migrations can be written against the real thing
 * rather than a guess. v0 is the pre-overhaul shape: a bare JSON.stringify of
 * five state fields with no version marker at all, which is why any schema
 * change used to break every existing save silently.
 */
import type { Animal, DroppedItem, GameState, Resource } from '../core/types';

/** The current save version. Bump this and add a migration when the shape changes. */
export const CURRENT_VERSION = 1;

/** Pre-overhaul format. No version field; identified by its absence. */
export interface SaveV0 {
  player: GameState['player'];
  /** Map entries, as produced by Array.from(state.resources.entries()). */
  resources: [string, Resource[]][];
  items: DroppedItem[];
  animals: Animal[];
  time: number;
}

export interface SaveV1 {
  version: 1;
  /** Player-facing name for the slot. */
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Milliseconds of play, for the slot list. */
  playtimeMs: number;
  /**
   * World seed. v0 never stored one, so migrated saves keep their already
   * generated chunks but any newly streamed chunk comes from the default seed.
   */
  seed: number;
  world: {
    player: GameState['player'];
    resources: [string, Resource[]][];
    items: DroppedItem[];
    animals: Animal[];
    time: number;
  };
}

/** The shape the game loads. Always the newest version. */
export type Save = SaveV1;

/** Any version that can appear on disk. */
export type AnySave = SaveV0 | SaveV1;

export interface SlotSummary {
  id: string;
  name: string;
  updatedAt: number;
  playtimeMs: number;
  version: number;
}

/** Number of save slots offered in the UI. */
export const SLOT_COUNT = 3;

export const DEFAULT_SEED = 42;

// --- validation -------------------------------------------------------------

export class SaveError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'SaveError';
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Check that a parsed blob is something we can migrate and load.
 *
 * Deliberately specific: a corrupt save used to take the whole game down with a
 * white screen, so failures name what is wrong.
 */
export function validate(raw: unknown): AnySave {
  if (!isObject(raw)) throw new SaveError('Save file is not an object.');

  const version = (raw as { version?: unknown }).version;

  if (version === undefined) {
    // v0: no version marker, so validate its five required fields.
    for (const key of ['player', 'resources', 'items', 'animals', 'time'] as const) {
      if (!(key in raw)) {
        throw new SaveError('Save file is missing data.', `expected a "${key}" field (v0 format)`);
      }
    }
    if (!Array.isArray(raw.resources)) {
      throw new SaveError('Save file is corrupt.', '"resources" should be an array of chunk entries');
    }
    if (!isObject(raw.player)) {
      throw new SaveError('Save file is corrupt.', '"player" should be an object');
    }
    return raw as unknown as SaveV0;
  }

  if (version === 1) {
    const world = (raw as { world?: unknown }).world;
    if (!isObject(world)) throw new SaveError('Save file is corrupt.', 'v1 save has no "world"');
    for (const key of ['player', 'resources', 'items', 'animals', 'time'] as const) {
      if (!(key in world)) {
        throw new SaveError('Save file is missing data.', `world."${key}" is absent`);
      }
    }
    return raw as unknown as SaveV1;
  }

  if (typeof version === 'number' && version > CURRENT_VERSION) {
    throw new SaveError(
      'This save was made by a newer version of the game.',
      `save version ${version}, this build understands up to ${CURRENT_VERSION}`,
    );
  }

  throw new SaveError('Unrecognised save format.', `version: ${String(version)}`);
}
