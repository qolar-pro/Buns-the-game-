/**
 * Dungeon generation.
 *
 * Rooms on a coarse grid, joined by corridors, with everything outside the
 * carved area left solid so the player is confined to the level. Pure: given a
 * seed it returns the level's contents and nothing else, so a layout can be
 * asserted in a unit test without a browser.
 *
 * Levels are finite, unlike the surface. That is deliberate — a dungeon you can
 * walk out of the side of is not a dungeon, and a bounded level is what lets the
 * stairs-down always be reachable.
 */
import { CHUNK_SIZE } from '../core/config';
import type { Animal, Enemy, EntityType, Resource } from '../core/types';
import type { Depth } from '../systems/loot';

/** Cell size in world units. Two cells fit a chunk, so rooms align to terrain. */
export const CELL = CHUNK_SIZE / 2;

/** Level extent in cells. */
const GRID = 9;

export interface DungeonLevel {
  depth: Depth;
  seed: number;
  resources: Resource[];
  enemies: Enemy[];
  /** Where the player arrives. */
  spawn: { x: number; y: number };
  /** Walkable cells, for spawn placement and tests. */
  floor: Set<string>;
  /** World-space bounds, used to keep the camera and culling honest. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

interface Room {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Deterministic generator: the same seed must rebuild the same level. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const key = (cx: number, cy: number) => `${cx},${cy}`;

let nextId = 0;
function makeResource(type: EntityType, cx: number, cy: number, extra: Partial<Resource> = {}): Resource {
  nextId += 1;
  return {
    id: `dun-${type}-${nextId}`,
    x: cx * CELL + CELL / 2 - 48,
    y: cy * CELL + CELL / 2 - 48,
    type,
    hits: 0,
    maxHits: 6,
    scale: 1,
    opacity: 1,
    ...extra,
  } as Resource;
}

/** Hostiles per depth, and how many. */
const SPAWNS: Record<Depth, { kind: Enemy['type']; count: number; health: number; damage: number; speed: number }[]> = {
  1: [{ kind: 'crawler' as Enemy['type'], count: 6, health: 14, damage: 4, speed: 2.6 }],
  2: [
    { kind: 'crawler' as Enemy['type'], count: 7, health: 16, damage: 5, speed: 2.8 },
    { kind: 'sentinel' as Enemy['type'], count: 3, health: 40, damage: 9, speed: 1.1 },
  ],
  3: [
    { kind: 'crawler' as Enemy['type'], count: 6, health: 18, damage: 6, speed: 3.0 },
    { kind: 'sentinel' as Enemy['type'], count: 5, health: 48, damage: 11, speed: 1.2 },
  ],
};

/** Ore that can appear in the walls, by depth. */
const ORES: Record<Depth, EntityType[]> = {
  1: ['coal_ore', 'copper_ore'],
  2: ['copper_ore', 'iron_ore', 'titanium_ore'],
  3: ['iron_ore', 'titanium_ore', 'titanium_ore'],
};

/**
 * Generate one level.
 *
 * Rooms are carved first, then joined in sequence so every room is reachable
 * from the entrance — a corridor-per-pair would sometimes strand one, and a
 * stranded stairs-down is an unfinishable run.
 */
export function generateDungeon(depth: Depth, seed: number): DungeonLevel {
  const random = rng(seed + depth * 7919);
  const floor = new Set<string>();
  const rooms: Room[] = [];

  const roomCount = 5 + Math.floor(random() * 3);
  for (let i = 0; i < roomCount; i++) {
    const w = 2 + Math.floor(random() * 3);
    const h = 2 + Math.floor(random() * 3);
    const cx = 1 + Math.floor(random() * (GRID - w - 1));
    const cy = 1 + Math.floor(random() * (GRID - h - 1));
    rooms.push({ cx, cy, w, h });
    for (let x = cx; x < cx + w; x++) {
      for (let y = cy; y < cy + h; y++) floor.add(key(x, y));
    }
  }

  // Join each room to the previous one with an L-shaped corridor.
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    const ax = a.cx + (a.w >> 1);
    const ay = a.cy + (a.h >> 1);
    const bx = b.cx + (b.w >> 1);
    const by = b.cy + (b.h >> 1);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) floor.add(key(x, ay));
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) floor.add(key(bx, y));
  }

  const resources: Resource[] = [];

  // Solid rock everywhere the level is not carved, so the player is confined.
  // A ring one cell wide beyond the grid seals the edges.
  for (let x = -1; x <= GRID; x++) {
    for (let y = -1; y <= GRID; y++) {
      if (floor.has(key(x, y))) continue;
      // Only wall cells adjacent to floor need to exist; the rest is never seen
      // and would be thousands of wasted entities.
      const touchesFloor =
        floor.has(key(x + 1, y)) || floor.has(key(x - 1, y)) ||
        floor.has(key(x, y + 1)) || floor.has(key(x, y - 1)) ||
        floor.has(key(x + 1, y + 1)) || floor.has(key(x - 1, y - 1)) ||
        floor.has(key(x + 1, y - 1)) || floor.has(key(x - 1, y + 1));
      if (!touchesFloor) continue;

      // Some wall cells are ore instead of plain rock.
      const oreRoll = random();
      const pool = ORES[depth];
      const type: EntityType = oreRoll < 0.16 ? pool[Math.floor(random() * pool.length)] : 'rubble';
      resources.push(makeResource(type, x, y, { maxHits: type === 'rubble' ? 4 : 8 }));
    }
  }

  const first = rooms[0];
  const last = rooms[rooms.length - 1];
  const spawnCell = { x: first.cx + (first.w >> 1), y: first.cy + (first.h >> 1) };

  // The way back up, at the entrance.
  resources.push(makeResource('dungeon_exit', spawnCell.x, spawnCell.y));

  // The way down, in the furthest room. Depth 3 has no stairs: it is the bottom.
  if (depth < 3) {
    resources.push(makeResource('stairs_down', last.cx + (last.w >> 1), last.cy + (last.h >> 1)));
  }

  // Chests, one per room after the first, plus an extra deep down.
  const chestCells: { x: number; y: number }[] = [];
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    chestCells.push({ x: r.cx + Math.floor(random() * r.w), y: r.cy + Math.floor(random() * r.h) });
  }
  if (depth === 3) chestCells.push({ x: last.cx, y: last.cy });
  for (const c of chestCells) {
    if (!floor.has(key(c.x, c.y))) continue;
    resources.push(makeResource('loot_chest', c.x, c.y, { maxHits: 1 }));
  }

  // Braziers light the rooms a little, so a player without a lantern can still
  // make progress — slowly, and only along the lit path.
  for (const r of rooms) {
    resources.push(makeResource('brazier', r.cx, r.cy));
  }

  // Hostiles, placed on floor cells away from the entrance.
  const enemies: Enemy[] = [];
  const floorCells = [...floor].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });
  let enemyId = 0;
  for (const group of SPAWNS[depth]) {
    for (let i = 0; i < group.count; i++) {
      const cell = floorCells[Math.floor(random() * floorCells.length)];
      const dist = Math.abs(cell.x - spawnCell.x) + Math.abs(cell.y - spawnCell.y);
      if (dist < 3) continue; // never right on top of the player
      enemyId += 1;
      enemies.push({
        id: `dun-e-${depth}-${enemyId}`,
        type: group.kind,
        x: cell.x * CELL + CELL / 2,
        y: cell.y * CELL + CELL / 2,
        health: group.health,
        maxHealth: group.health,
        speed: group.speed,
        damage: group.damage,
        targetX: cell.x * CELL,
        targetY: cell.y * CELL,
        state: 'idle',
        timer: 0,
        facing: 'left',
        lastHitTime: 0,
      });
    }
  }

  // The Warden guards the bottom.
  if (depth === 3) {
    enemies.push({
      id: 'warden',
      type: 'warden' as Enemy['type'],
      x: last.cx * CELL + CELL / 2,
      y: last.cy * CELL + CELL / 2,
      health: 260,
      maxHealth: 260,
      speed: 1.5,
      damage: 18,
      targetX: last.cx * CELL,
      targetY: last.cy * CELL,
      state: 'idle',
      timer: 0,
      facing: 'left',
      lastHitTime: 0,
    });
  }

  return {
    depth,
    seed,
    resources,
    enemies,
    spawn: { x: spawnCell.x * CELL + CELL / 2 - 64, y: spawnCell.y * CELL + CELL / 2 - 64 },
    floor,
    bounds: { minX: -CELL, minY: -CELL, maxX: (GRID + 1) * CELL, maxY: (GRID + 1) * CELL },
  };
}

/** Bucket a level's resources into the chunk map the engine already uses. */
export function toChunks(level: DungeonLevel): Map<string, Resource[]> {
  const chunks = new Map<string, Resource[]>();
  for (const res of level.resources) {
    const cx = Math.floor(res.x / CHUNK_SIZE);
    const cy = Math.floor(res.y / CHUNK_SIZE);
    const k = `${cx},${cy}`;
    const list = chunks.get(k);
    if (list) list.push(res);
    else chunks.set(k, [res]);
  }
  return chunks;
}

/** Animals never appear underground. */
export const DUNGEON_ANIMALS: Animal[] = [];
