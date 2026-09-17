/**
 * Save migrations.
 *
 * One function per step, applied in order, so a save from any released version
 * can be brought forward. Migrations must never throw on data they have already
 * validated: if a field cannot be recovered, fill a sensible default and carry on.
 */
import {
  CURRENT_VERSION, DEFAULT_SEED, SaveError,
  type AnySave, type Save, type SaveV0, type SaveV1,
} from './schema';

/**
 * v0 -> v1.
 *
 * v0 stored five bare fields and no metadata at all. The world data itself is
 * unchanged, so it moves across as-is; everything else is reconstructed.
 * v0 never recorded the world seed, so migrated saves adopt the default: the
 * chunks already generated are preserved exactly, but chunks streamed in after
 * loading will differ from the original world.
 */
function v0ToV1(save: SaveV0): SaveV1 {
  const now = Date.now();
  return {
    version: 1,
    name: 'Imported save',
    createdAt: now,
    updatedAt: now,
    playtimeMs: 0,
    seed: DEFAULT_SEED,
    world: {
      player: save.player,
      resources: save.resources,
      items: save.items ?? [],
      animals: save.animals ?? [],
      time: typeof save.time === 'number' ? save.time : 0,
    },
  };
}

/** Version of a validated save; v0 is the one with no marker. */
function versionOf(save: AnySave): number {
  return 'version' in save && typeof save.version === 'number' ? save.version : 0;
}

/** Bring any understood save up to the current version. */
export function migrate(save: AnySave): Save {
  let current: AnySave = save;
  let version = versionOf(current);
  let guard = 0;

  while (version < CURRENT_VERSION) {
    if (guard++ > 32) {
      throw new SaveError('Could not upgrade this save.', 'migration chain did not terminate');
    }
    switch (version) {
      case 0:
        current = v0ToV1(current as SaveV0);
        break;
      default:
        throw new SaveError('Could not upgrade this save.', `no migration from version ${version}`);
    }
    version = versionOf(current);
  }

  return current as Save;
}

/** True when loading this save would change its stored version. */
export function needsMigration(save: AnySave): boolean {
  return versionOf(save) < CURRENT_VERSION;
}
