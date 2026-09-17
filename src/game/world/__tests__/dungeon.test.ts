import { describe, expect, it } from 'vitest';
import { generateDungeon, toChunks, CELL } from '../dungeon';
import type { Depth } from '../../systems/loot';

/** Cell a world position falls in. */
const cellOf = (x: number, y: number) => ({
  cx: Math.round((x + 48 - CELL / 2) / CELL),
  cy: Math.round((y + 48 - CELL / 2) / CELL),
});

describe('generateDungeon', () => {
  it('is deterministic for a seed', () => {
    const a = generateDungeon(2, 1234);
    const b = generateDungeon(2, 1234);
    expect(a.resources.length).toBe(b.resources.length);
    expect([...a.floor].sort()).toEqual([...b.floor].sort());
  });

  it('produces different levels for different seeds', () => {
    const a = generateDungeon(2, 1);
    const b = generateDungeon(2, 2);
    expect([...a.floor].sort()).not.toEqual([...b.floor].sort());
  });

  it('always has a way back up', () => {
    for (let seed = 0; seed < 25; seed++) {
      for (const d of [1, 2, 3] as Depth[]) {
        const lvl = generateDungeon(d, seed);
        expect(lvl.resources.some((r) => r.type === 'dungeon_exit')).toBe(true);
      }
    }
  });

  it('has stairs down at every depth except the bottom', () => {
    for (let seed = 0; seed < 25; seed++) {
      expect(generateDungeon(1, seed).resources.some((r) => r.type === 'stairs_down')).toBe(true);
      expect(generateDungeon(2, seed).resources.some((r) => r.type === 'stairs_down')).toBe(true);
      // Depth 3 is the bottom: going deeper would strand the player.
      expect(generateDungeon(3, seed).resources.some((r) => r.type === 'stairs_down')).toBe(false);
    }
  });

  it('puts the Warden, and only the Warden, at the bottom', () => {
    for (let seed = 0; seed < 15; seed++) {
      expect(generateDungeon(1, seed).enemies.some((e) => e.type === 'warden')).toBe(false);
      expect(generateDungeon(2, seed).enemies.some((e) => e.type === 'warden')).toBe(false);
      const deep = generateDungeon(3, seed);
      expect(deep.enemies.filter((e) => e.type === 'warden')).toHaveLength(1);
    }
  });

  it('spawns the player on a floor cell', () => {
    for (let seed = 0; seed < 25; seed++) {
      const lvl = generateDungeon(1, seed);
      const { cx, cy } = cellOf(lvl.spawn.x + 16, lvl.spawn.y + 16);
      expect(lvl.floor.has(`${cx},${cy}`)).toBe(true);
    }
  });

  it('never spawns a hostile on top of the player', () => {
    for (let seed = 0; seed < 25; seed++) {
      const lvl = generateDungeon(2, seed);
      for (const e of lvl.enemies) {
        const d = Math.hypot(e.x - lvl.spawn.x, e.y - lvl.spawn.y);
        expect(d).toBeGreaterThan(CELL);
      }
    }
  });

  it('seals the level: every floor cell is surrounded by something', () => {
    const lvl = generateDungeon(1, 5);
    const solid = new Set(
      lvl.resources
        .filter((r) => r.type === 'rubble' || r.type.endsWith('_ore'))
        .map((r) => {
          const { cx, cy } = cellOf(r.x, r.y);
          return `${cx},${cy}`;
        }),
    );
    for (const k of lvl.floor) {
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = `${x + dx},${y + dy}`;
        // A neighbour is either walkable or solid — never nothing.
        expect(lvl.floor.has(n) || solid.has(n)).toBe(true);
      }
    }
  });

  it('gives deeper levels more to fight', () => {
    const count = (d: Depth) => {
      let n = 0;
      for (let s = 0; s < 20; s++) n += generateDungeon(d, s).enemies.length;
      return n;
    };
    expect(count(2)).toBeGreaterThan(count(1));
  });

  it('puts titanium only below the first depth', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(generateDungeon(1, seed).resources.some((r) => r.type === 'titanium_ore')).toBe(false);
    }
  });

  it('always has chests to loot', () => {
    for (let seed = 0; seed < 20; seed++) {
      const lvl = generateDungeon(2, seed);
      expect(lvl.resources.filter((r) => r.type === 'loot_chest').length).toBeGreaterThan(0);
    }
  });

  it('buckets into chunks without losing anything', () => {
    const lvl = generateDungeon(2, 11);
    const chunks = toChunks(lvl);
    const total = [...chunks.values()].reduce((n, l) => n + l.length, 0);
    expect(total).toBe(lvl.resources.length);
  });
});
