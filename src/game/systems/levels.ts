/**
 * Moving between the surface and the dungeon levels.
 *
 * The engine keeps one world in `state.resources` / `animals` / `enemies`.
 * Rather than teach every system about two worlds, a transition swaps the
 * contents and stashes what was there — so movement, collision, rendering and
 * saving all keep working on "the current level" without knowing which it is.
 *
 * The surface is stashed by reference and restored intact, which means a base
 * you built is exactly where you left it when you climb back out.
 */
import { DUNGEON_ANIMALS, generateDungeon, toChunks } from '../world/dungeon';
import { reseedNoise, getWorldSeed } from '../world/noise';
import type { Animal, DroppedItem, Enemy, GameState, Resource } from '../core/types';
import type { Depth } from './loot';

interface Stash {
  resources: Map<string, Resource[]>;
  animals: Animal[];
  enemies: Enemy[];
  items: DroppedItem[];
  generatedChunks: Set<string>;
  playerX: number;
  playerY: number;
  seed: number;
}

/**
 * The surface, held while the player is underground.
 *
 * Module-level rather than on state because it must not be written to a save:
 * a save taken underground restores you underground, and the surface is
 * regenerated from its seed, which is cheaper and cannot desynchronise.
 */
let surfaceStash: Stash | null = null;

/** Levels already generated this run, so backtracking is stable. */
const levelCache = new Map<string, { resources: Map<string, Resource[]>; enemies: Enemy[]; items: DroppedItem[]; spawn: { x: number; y: number } }>();

const cacheKey = (seed: number, depth: Depth) => `${seed}:${depth}`;

/** Wipe per-run caches. Called when a new world starts. */
export function resetLevels(): void {
  surfaceStash = null;
  levelCache.clear();
}

function stashCurrent(state: GameState): Stash {
  return {
    resources: state.resources,
    animals: state.animals,
    enemies: state.enemies,
    items: state.items,
    generatedChunks: state.generatedChunks,
    playerX: state.player.x,
    playerY: state.player.y,
    seed: getWorldSeed(),
  };
}

/**
 * Descend to `depth`.
 *
 * Returns false when already as deep as the game goes, so the caller can say so
 * rather than silently doing nothing.
 */
export function enterDungeon(state: GameState, depth: Depth): boolean {
  if (depth < 1 || depth > 3) return false;

  if (state.level.kind === 'surface') {
    surfaceStash = stashCurrent(state);
  }

  const seed = surfaceStash?.seed ?? getWorldSeed();
  const key = cacheKey(seed, depth);
  let cached = levelCache.get(key);

  if (!cached) {
    const level = generateDungeon(depth, seed);
    cached = {
      resources: toChunks(level),
      enemies: level.enemies,
      items: [],
      spawn: level.spawn,
    };
    levelCache.set(key, cached);
  }

  state.resources = cached.resources;
  state.enemies = cached.enemies;
  state.items = cached.items;
  state.animals = DUNGEON_ANIMALS.slice();
  // Every chunk is pre-generated: a dungeon is finite, so the streaming
  // spawner must not add surface trees to it.
  state.generatedChunks = new Set(cached.resources.keys());

  state.player.x = cached.spawn.x;
  state.player.y = cached.spawn.y;
  state.camera.x = state.player.x - state.width / 2;
  state.camera.y = state.player.y - state.height / 2;

  state.level = { kind: 'dungeon', depth, seed };
  state.progress.deepestDepth = Math.max(state.progress.deepestDepth, depth);
  state.selectedResourceId = null;
  state.selectedAnimalId = null;
  return true;
}

/** Climb back to the surface, restoring it exactly as it was left. */
export function exitToSurface(state: GameState): boolean {
  if (state.level.kind !== 'dungeon' || !surfaceStash) return false;

  // Remember this level's state so backtracking finds the same rooms, the same
  // cleared rubble and the same emptied chests.
  const key = cacheKey(state.level.seed, state.level.depth);
  const cached = levelCache.get(key);
  if (cached) {
    cached.resources = state.resources;
    cached.enemies = state.enemies;
    cached.items = state.items;
  }

  reseedNoise(surfaceStash.seed);
  state.resources = surfaceStash.resources;
  state.animals = surfaceStash.animals;
  state.enemies = surfaceStash.enemies;
  state.items = surfaceStash.items;
  state.generatedChunks = surfaceStash.generatedChunks;
  state.player.x = surfaceStash.playerX;
  state.player.y = surfaceStash.playerY;
  state.camera.x = state.player.x - state.width / 2;
  state.camera.y = state.player.y - state.height / 2;

  state.level = { kind: 'surface' };
  state.selectedResourceId = null;
  state.selectedAnimalId = null;
  return true;
}

/** Depth below the current one, or null at the bottom. */
export function nextDepth(state: GameState): Depth | null {
  if (state.level.kind !== 'dungeon') return 1;
  const d = state.level.depth;
  return d < 3 ? ((d + 1) as Depth) : null;
}

/** True while underground; used by lighting and by the spawner. */
export function isUnderground(state: GameState): boolean {
  return state.level.kind === 'dungeon';
}
