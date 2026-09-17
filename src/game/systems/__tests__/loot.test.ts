import { describe, expect, it } from 'vitest';
import { possibleLoot, rollChest, type Depth } from '../loot';
import type { ItemType } from '../../core/types';

/** Deterministic generator, so a weighted roll can be asserted exactly. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('rollChest', () => {
  it('yields something at every depth', () => {
    for (const d of [1, 2, 3] as Depth[]) {
      const loot = rollChest(d, new Set(), seeded(d * 77));
      expect(loot.length).toBeGreaterThan(0);
    }
  });

  it('only yields items from that depth’s table', () => {
    for (const d of [1, 2, 3] as Depth[]) {
      const allowed = new Set(possibleLoot(d));
      for (let i = 0; i < 50; i++) {
        for (const l of rollChest(d, new Set(), seeded(i))) {
          expect(allowed.has(l.type)).toBe(true);
        }
      }
    }
  });

  it('never rolls a unique twice in a run', () => {
    const taken = new Set<ItemType>();
    const seen: Record<string, number> = {};
    const rng = seeded(1234);
    for (let i = 0; i < 300; i++) {
      for (const l of rollChest(3, taken, rng)) {
        seen[l.type] = (seen[l.type] ?? 0) + 1;
      }
    }
    // relic_blade, prospectors_pick and wardens_key are unique at depth 3.
    expect(seen.relic_blade ?? 0).toBeLessThanOrEqual(1);
    expect(seen.prospectors_pick ?? 0).toBeLessThanOrEqual(1);
    expect(seen.wardens_key ?? 0).toBeLessThanOrEqual(1);
  });

  it('respects uniques already taken elsewhere in the run', () => {
    const taken = new Set<ItemType>(['relic_blade', 'prospectors_pick', 'wardens_key']);
    const rng = seeded(99);
    for (let i = 0; i < 200; i++) {
      for (const l of rollChest(3, taken, rng)) {
        expect(['relic_blade', 'prospectors_pick']).not.toContain(l.type);
      }
    }
  });

  it('gives counts inside each entry’s range', () => {
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) {
      for (const l of rollChest(2, new Set(), rng)) {
        expect(l.count).toBeGreaterThanOrEqual(1);
        expect(l.count).toBeLessThanOrEqual(8);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const a = rollChest(2, new Set(), seeded(42));
    const b = rollChest(2, new Set(), seeded(42));
    expect(a).toEqual(b);
  });

  it('rolls deeper chests fuller than shallow ones on average', () => {
    const count = (d: Depth) => {
      let n = 0;
      const rng = seeded(5);
      for (let i = 0; i < 200; i++) n += rollChest(d, new Set(), rng).length;
      return n;
    };
    expect(count(3)).toBeGreaterThan(count(1));
  });

  it('only titanium and the uniques appear deep, never at depth 1', () => {
    const shallow = new Set(possibleLoot(1));
    expect(shallow.has('titanium_ingot')).toBe(false);
    expect(shallow.has('relic_blade')).toBe(false);
    expect(shallow.has('wardens_key')).toBe(false);
  });
});
